import "../../test/stubBrowserGlobals"
import { describe, it, expect, beforeEach } from "vitest"

import {
  buildSnapshot,
  formatDigest,
  formatNotebookContextPrefix,
  formatSnapshot,
  summarizeCells,
  type NotebookContextSnapshot,
} from "./notebookSnapshot"
import { __resetNotebookAIBridgeForTests } from "../notebooks/notebookAIBridge"
import {
  __resetNotebookControllerForTests,
  registerController,
  unregisterController,
  type NotebookController,
} from "../notebooks/notebookController"
import { __resetNotebookBufferQueuesForTests } from "../notebooks/notebookBufferQueue"
import { db } from "../../store/db"
import type {
  NotebookCell,
  NotebookSettings,
  NotebookViewState,
} from "../../store/notebook"
import { createEmptyDigest } from "../../providers/AIConversationProvider/userActionDigest"

const sql = (
  id: string,
  value = "",
  overrides: Partial<NotebookCell> = {},
): NotebookCell => ({
  id,
  position: 0,
  value,
  ...overrides,
})

const makeController = (
  bufferId: number,
  cells: NotebookCell[],
  settings: NotebookSettings = {},
  maximizedCellId: string | null = null,
): NotebookController => ({
  bufferId,
  kind: "live",
  mutate: (transition) =>
    Promise.resolve(
      transition({ cells, settings, maximizedCellId, focusedCellId: null })
        .result,
    ),
  readView: () =>
    Promise.resolve({
      cells,
      settings,
      maximizedCellId: maximizedCellId ?? undefined,
    }),
  runCell: () =>
    Promise.resolve({ success: true, queryCount: 1, results: ["success"] }),
})

const seedNotebook = async (
  view: NotebookViewState,
  opts: { archived?: boolean; label?: string } = {},
): Promise<number> => {
  const id = await db.buffers.add({
    label: opts.label ?? "nb",
    value: "",
    position: 0,
    ...(opts.archived ? { archived: true } : {}),
    notebookViewState: view,
  })
  return id
}

beforeEach(async () => {
  __resetNotebookControllerForTests()
  __resetNotebookAIBridgeForTests()
  __resetNotebookBufferQueuesForTests()
  await db.buffers.clear()
})

describe("buildSnapshot", () => {
  it("returns null for a buffer that is not a notebook", async () => {
    const id = await db.buffers.add({
      label: "sql tab",
      value: "SELECT 1",
      position: 0,
    })
    expect(await buildSnapshot(id)).toBeNull()
  })

  it("returns { status: deleted } for a missing buffer", async () => {
    const snap = await buildSnapshot(999)
    expect(snap?.status).toBe("deleted")
  })

  it("returns { status: archived, label } for an archived buffer", async () => {
    const id = await seedNotebook(
      { cells: [] },
      { archived: true, label: "nb-1" },
    )
    const snap = await buildSnapshot(id)
    expect(snap).toEqual({ status: "archived", buffer_id: id, label: "nb-1" })
  })

  it("prefers the mounted controller over persisted state", async () => {
    const id = await seedNotebook({ cells: [sql("a", "old")] })
    registerController(makeController(id, [sql("b", "new")]))
    const snap = await buildSnapshot(id)
    expect(snap?.status).toBe("ok")
    if (snap?.status === "ok") {
      expect(snap.cells.map((c) => c.id)).toEqual(["b"])
    }
  })

  it("serves the live snapshot when the controller unregisters mid-read", async () => {
    // Given a mounted notebook whose Dexie copy lags the live cells
    const id = await seedNotebook({ cells: [sql("a", "persisted")] })
    registerController(makeController(id, [sql("b", "live")]))
    // When the tab unmounts while the snapshot's queued read is in flight
    const pending = buildSnapshot(id)
    unregisterController(id)
    const snap = await pending
    // Then the snapshot reflects the live cells its freshness baseline covers
    expect(snap?.status).toBe("ok")
    if (snap?.status === "ok") {
      expect(snap.cells.map((c) => c.id)).toEqual(["b"])
    }
  })

  it("falls back to persisted state when the controller is not mounted", async () => {
    const id = await seedNotebook({ cells: [sql("a", "persisted")] })
    const snap = await buildSnapshot(id)
    expect(snap?.status).toBe("ok")
    if (snap?.status === "ok") {
      expect(snap.cells[0].preview).toBe("persisted")
    }
  })

  it("truncates previews to 120 chars and escapes newlines", async () => {
    const long = "a".repeat(200)
    const withNewline = `line1\nline2`
    const id = await seedNotebook({
      cells: [sql("a", long), sql("b", withNewline)],
    })
    const snap = await buildSnapshot(id)
    if (snap?.status === "ok") {
      expect(snap.cells[0].preview.length).toBeLessThanOrEqual(120)
      expect(snap.cells[0].preview.endsWith("...")).toBe(true)
      expect(snap.cells[1].preview).toBe("line1\\nline2")
    } else {
      throw new Error("expected ok snapshot")
    }
  })

  it("trims last_run_error_summary to 200 chars and never leaks dataset/columns", async () => {
    const longErr = "x".repeat(300)
    const cell = sql("a", "SELECT 1", {
      result: {
        results: [
          {
            type: "error",
            query: "SELECT 1",
            error: longErr,
          },
        ],
        activeResultIndex: 0,
        timestamp: 0,
      },
    })
    const id = await seedNotebook({ cells: [cell] })
    const snap = await buildSnapshot(id)
    const json = JSON.stringify(snap)
    expect(json).not.toContain("dataset")
    expect(json).not.toContain("columns")
    expect(json).not.toContain("count")
    if (snap?.status === "ok") {
      const c = snap.cells[0]
      expect(c.last_run_status).toBe("error")
      expect(c.last_run_error_summary?.length).toBeLessThanOrEqual(200)
      expect(c.last_run_error_summary?.endsWith("...")).toBe(true)
    } else {
      throw new Error("expected ok snapshot")
    }
  })

  it("includes grid positions only when layout_mode is 'grid'", async () => {
    const cells = [sql("a"), sql("b")]
    const layout = [
      { i: "a", x: 0, y: 0, w: 6, h: 4 },
      { i: "b", x: 6, y: 0, w: 6, h: 4 },
    ]
    const listId = await seedNotebook({
      cells,
      settings: { layoutMode: "list", layout },
    })
    const gridId = await seedNotebook({
      cells,
      settings: { layoutMode: "grid", layout },
    })
    const listSnap = await buildSnapshot(listId)
    const gridSnap = await buildSnapshot(gridId)
    if (listSnap?.status === "ok" && gridSnap?.status === "ok") {
      expect(listSnap.cells[0].grid).toBeUndefined()
      // h is derived from the cell's content, not the stored layout h (4) —
      // a fresh run cell resolves to 5 rows regardless of the persisted shadow.
      expect(gridSnap.cells[0].grid).toEqual({ x: 0, y: 0, w: 6, h: 5 })
    } else {
      throw new Error("expected ok snapshots")
    }
  })

  it("includes settings.variables when non-empty and omits when missing", async () => {
    const cells = [sql("a", "SELECT @x FROM trades")]
    const withVarsId = await seedNotebook({
      cells,
      settings: {
        variables: [
          { name: "x", value: "10" },
          { name: "sym", value: "'BTC'" },
        ],
      },
    })
    const withoutVarsId = await seedNotebook({ cells })
    const a = await buildSnapshot(withVarsId)
    const b = await buildSnapshot(withoutVarsId)
    if (a?.status === "ok" && b?.status === "ok") {
      expect(a.variables).toEqual([
        { name: "x", value: "10" },
        { name: "sym", value: "'BTC'" },
      ])
      expect(b.variables).toBeUndefined()
    } else {
      throw new Error("expected ok snapshots")
    }
  })

  it("surfaces the full chart config in wire shape (for PUT round-trip) without leaking series data", async () => {
    const cell = sql("a", "SELECT 1", {
      mode: "draw",
      autoRefresh: "5s",
      isViewMaximized: false,
      name: "Trades",
      chartConfig: {
        xColumn: "ts",
        queries: [{ type: "line", yColumns: ["price", "volume"] }],
      },
    })
    const id = await seedNotebook({ cells: [cell] })
    const snap = await buildSnapshot(id)
    if (snap?.status === "ok") {
      // Snake-case wire shape the model can copy straight back into apply_notebook_state.
      expect(snap.cells[0].chart_config).toEqual({
        x_column: "ts",
        queries: [{ type: "line", y_columns: ["price", "volume"] }],
      })
      expect(snap.cells[0].name).toBe("Trades")
      expect(snap.cells[0].mode).toBe("draw")
      // Stored verbatim as the wire value — no conversion.
      expect(snap.cells[0].auto_refresh).toBe("5s")
    } else {
      throw new Error("expected ok snapshot")
    }
  })
})

describe("summarizeCells", () => {
  it("includes the cell name when the cell has one", () => {
    // Given a named cell and an unnamed one
    const cells = [
      sql("a", "select 1", { name: "Recent Trades" }),
      sql("b", "select 2"),
    ]

    // When summarizing for list_cells
    const [named, unnamed] = summarizeCells(cells)

    // Then the name is surfaced for the named cell and omitted otherwise
    expect(named.name).toBe("Recent Trades")
    expect(unnamed.name).toBeUndefined()
  })
})

describe("formatSnapshot", () => {
  it("emits a warning-variant block for archived status", () => {
    const snap: NotebookContextSnapshot = {
      status: "archived",
      buffer_id: 7,
      label: "Trades",
    }
    const out = formatSnapshot(snap)
    expect(out).toContain("status: archived")
    expect(out).toContain("buffer_id: 7")
    expect(out).toContain("Trades")
    expect(out).toContain("create_notebook")
  })

  it("emits a warning block for deleted status without label", () => {
    const out = formatSnapshot({ status: "deleted", buffer_id: 9 })
    expect(out).toContain("status: deleted")
    expect(out).not.toMatch(/label:/)
  })

  it("serialises ok snapshots with cells and grid positions", async () => {
    const id = await seedNotebook({
      cells: [sql("a", "SELECT 1")],
      settings: {
        layoutMode: "grid",
        layout: [{ i: "a", x: 0, y: 0, w: 12, h: 4 }],
      },
    })
    const snap = (await buildSnapshot(id))!
    const out = formatSnapshot(snap)
    expect(out).toContain(`buffer_id: ${id}`)
    expect(out).toContain("layout_mode: grid")
    expect(out).toContain("- id: a")
    expect(out).toContain("grid: { x: 0, y: 0, w: 12, h: 5 }")
  })

  it("renders chart_config as one-line wire JSON the model can copy back", async () => {
    const cell = sql("a", "SELECT 1", {
      mode: "draw",
      chartConfig: {
        xColumn: "ts",
        queries: [{ type: "line", yColumns: ["price"] }],
      },
    })
    const id = await seedNotebook({ cells: [cell] })
    const out = formatSnapshot((await buildSnapshot(id))!)
    expect(out).toContain(
      'chart_config: {"x_column":"ts","queries":[{"type":"line","y_columns":["price"]}]}',
    )
  })

  it("emits a variables block when present, omits when empty", async () => {
    const withVarsId = await seedNotebook({
      cells: [sql("a", "SELECT @x")],
      settings: {
        variables: [
          { name: "x", value: "10" },
          { name: "sym", value: "'BTC'" },
        ],
      },
    })
    const out = formatSnapshot((await buildSnapshot(withVarsId))!)
    expect(out).toContain("variables:")
    expect(out).toMatch(/x: "10"/)
    expect(out).toMatch(/sym: "'BTC'"/)

    const noVarsId = await seedNotebook({ cells: [sql("a", "SELECT 1")] })
    const out2 = formatSnapshot((await buildSnapshot(noVarsId))!)
    expect(out2).not.toContain("variables:")
  })
})

describe("formatDigest", () => {
  it("returns empty string for an empty digest", () => {
    expect(formatDigest(createEmptyDigest())).toBe("")
  })

  it("emits a block listing added/deleted/edited/ran/layout/status", () => {
    const d = createEmptyDigest()
    d.added.add("a1")
    d.deleted.add("d1")
    d.edited.add("e1")
    d.ran.set("r1", "error")
    d.layoutModeTo = "grid"
    d.notebookStatusChange = "archived"
    const out = formatDigest(d)
    expect(out).toContain("added: [a1]")
    expect(out).toContain("deleted: [d1]")
    expect(out).toContain("edited: [e1]")
    expect(out).toContain("ran: { r1: error }")
    expect(out).toContain("layout_mode: grid")
    expect(out).toContain("notebook_status: archived")
  })
})

describe("formatNotebookContextPrefix", () => {
  it("returns empty string when all inputs are empty", () => {
    expect(formatNotebookContextPrefix(null, undefined)).toBe("")
    expect(formatNotebookContextPrefix(null, createEmptyDigest())).toBe("")
  })

  it("combines snapshot + digest blocks with trailing newline", () => {
    const snap: NotebookContextSnapshot = {
      status: "ok",
      buffer_id: 1,
      label: "x",
      layout_mode: "list",
      maximized_cell_id: null,
      cells: [],
    }
    const digest = createEmptyDigest()
    digest.added.add("a")
    const prefix = formatNotebookContextPrefix(snap, digest)
    expect(prefix.endsWith("\n\n")).toBe(true)
    expect(prefix).toContain("<notebook_context>")
    expect(prefix).toContain("<user_events")
  })

  it("emits <workspace> first, then <notebook_context>, then <user_events>", () => {
    const snap: NotebookContextSnapshot = {
      status: "ok",
      buffer_id: 2,
      label: "Notebook 1",
      layout_mode: "list",
      maximized_cell_id: null,
      cells: [],
    }
    const digest = createEmptyDigest()
    digest.added.add("a")
    const prefix = formatNotebookContextPrefix(snap, digest, {
      notebooks: [
        {
          buffer_id: 2,
          label: "Notebook 1",
          archived: false,
          bound_to_this_chat: true,
        },
      ],
      active: { buffer_id: 2, label: "Notebook 1", kind: "notebook" },
    })
    const wsIdx = prefix.indexOf("<workspace>")
    const ctxIdx = prefix.indexOf("<notebook_context>")
    const evtIdx = prefix.indexOf("<user_events")
    expect(wsIdx).toBeGreaterThan(-1)
    expect(ctxIdx).toBeGreaterThan(wsIdx)
    expect(evtIdx).toBeGreaterThan(ctxIdx)
  })

  it("emits <workspace> alone for unbound chats with notebook tabs", () => {
    const prefix = formatNotebookContextPrefix(null, undefined, {
      notebooks: [
        { buffer_id: 5, label: "Sales", archived: false },
        { buffer_id: 9, label: "Old", archived: true },
      ],
      active: { buffer_id: 5, label: "Sales", kind: "notebook" },
    })
    expect(prefix).toContain("<workspace>")
    expect(prefix).not.toContain("<notebook_context>")
    expect(prefix).not.toContain("<user_events")
    expect(prefix).toContain('label: "Sales"')
    expect(prefix).toContain("archived: true")
    expect(prefix).toContain("kind: notebook")
  })

  it("workspace block quotes labels and exposes buffer_id / kind", () => {
    const prefix = formatNotebookContextPrefix(null, undefined, {
      notebooks: [{ buffer_id: 42, label: "Trades", archived: false }],
      active: { buffer_id: 3, label: "Query 1", kind: "sql" },
    })
    expect(prefix).toContain(
      'active: { buffer_id: 3, label: "Query 1", kind: sql }',
    )
    expect(prefix).toContain("buffer_id: 42")
    expect(prefix).toContain('label: "Trades"')
  })
})
