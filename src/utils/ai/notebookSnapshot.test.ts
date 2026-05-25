import { describe, it, expect, beforeEach } from "vitest"
import {
  buildSnapshot,
  formatDigest,
  formatNotebookContextPrefix,
  formatSnapshot,
  type NotebookContextSnapshot,
} from "./notebookSnapshot"
import {
  __resetNotebookAIBridgeForTests,
  registerController,
  type NotebookController,
  type NotebookWorkspaceController,
} from "../notebookAIBridge"
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
  addCell: () => "c",
  updateCell: () => undefined,
  deleteCell: () => undefined,
  moveCellUp: () => undefined,
  moveCellDown: () => undefined,
  duplicateCell: () => "c",
  runCell: () =>
    Promise.resolve({ success: true, queryCount: 1, results: ["success"] }),
  setLayoutMode: () => undefined,
  setVariables: () => undefined,
  setCellLayout: () => undefined,
  setCellMode: () => undefined,
  setCellChartConfig: () => undefined,
  setCellAutoRefresh: () => undefined,
  setCellChartMaximized: () => undefined,
  setCellMaximized: () => undefined,
  applyNotebookState: () => ({
    applied: { added: [], updated: [], deleted: [] },
  }),
  getCellsSnapshot: () => cells,
  getSettings: () => settings,
  getMaximizedCellId: () => maximizedCellId,
})

const makeWorkspace = (
  stateByBuffer: Map<number, NotebookViewState>,
  archivedSet = new Set<number>(),
  deletedSet = new Set<number>(),
): NotebookWorkspaceController => ({
  createNotebook: () => Promise.resolve({ bufferId: 0, label: "x" }),
  activateNotebook: () => Promise.resolve(true),
  getBufferMeta(bufferId) {
    if (deletedSet.has(bufferId)) return { kind: "deleted" }
    if (archivedSet.has(bufferId))
      return { kind: "archived", label: `nb-${bufferId}` }
    const state = stateByBuffer.get(bufferId)
    if (!state) return null
    return {
      kind: "inactive",
      label: `nb-${bufferId}`,
      notebookViewState: state,
    }
  },
  listNotebookBuffers: () => [],
})

beforeEach(() => {
  __resetNotebookAIBridgeForTests()
})

describe("buildSnapshot", () => {
  it("returns null when no workspace is provided", () => {
    expect(buildSnapshot(undefined, 1)).toBeNull()
  })

  it("returns { status: deleted } for a deleted buffer", () => {
    const ws = makeWorkspace(new Map(), new Set(), new Set([1]))
    const snap = buildSnapshot(ws, 1)
    expect(snap?.status).toBe("deleted")
  })

  it("returns { status: archived, label } for an archived buffer", () => {
    const ws = makeWorkspace(new Map(), new Set([1]))
    const snap = buildSnapshot(ws, 1)
    expect(snap).toEqual({ status: "archived", buffer_id: 1, label: "nb-1" })
  })

  it("prefers the mounted controller over persisted state", () => {
    const ws = makeWorkspace(new Map([[1, { cells: [sql("a", "old")] }]]))
    registerController(makeController(1, [sql("b", "new")]))
    const snap = buildSnapshot(ws, 1)
    expect(snap?.status).toBe("ok")
    if (snap?.status === "ok") {
      expect(snap.cells.map((c) => c.id)).toEqual(["b"])
    }
  })

  it("falls back to persisted state when the controller is not mounted", () => {
    const ws = makeWorkspace(new Map([[1, { cells: [sql("a", "persisted")] }]]))
    const snap = buildSnapshot(ws, 1)
    expect(snap?.status).toBe("ok")
    if (snap?.status === "ok") {
      expect(snap.cells[0].preview).toBe("persisted")
    }
  })

  it("truncates previews to 120 chars and escapes newlines", () => {
    const long = "a".repeat(200)
    const withNewline = `line1\nline2`
    const ws = makeWorkspace(
      new Map([
        [
          1,
          {
            cells: [sql("a", long), sql("b", withNewline)],
          },
        ],
      ]),
    )
    const snap = buildSnapshot(ws, 1)
    if (snap?.status === "ok") {
      expect(snap.cells[0].preview.length).toBeLessThanOrEqual(120)
      expect(snap.cells[0].preview.endsWith("...")).toBe(true)
      expect(snap.cells[1].preview).toBe("line1\\nline2")
    } else {
      throw new Error("expected ok snapshot")
    }
  })

  it("trims last_run_error_summary to 200 chars and never leaks dataset/columns", () => {
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
    const ws = makeWorkspace(new Map([[1, { cells: [cell] }]]))
    const snap = buildSnapshot(ws, 1)
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

  it("includes grid positions only when layout_mode is 'grid'", () => {
    const cells = [sql("a"), sql("b")]
    const layout = [
      { i: "a", x: 0, y: 0, w: 6, h: 4 },
      { i: "b", x: 6, y: 0, w: 6, h: 4 },
    ]
    const listWs = makeWorkspace(
      new Map([[1, { cells, settings: { layoutMode: "list", layout } }]]),
    )
    const gridWs = makeWorkspace(
      new Map([[1, { cells, settings: { layoutMode: "grid", layout } }]]),
    )
    const listSnap = buildSnapshot(listWs, 1)
    const gridSnap = buildSnapshot(gridWs, 1)
    if (listSnap?.status === "ok" && gridSnap?.status === "ok") {
      expect(listSnap.cells[0].grid).toBeUndefined()
      expect(gridSnap.cells[0].grid).toEqual({ x: 0, y: 0, w: 6, h: 4 })
    } else {
      throw new Error("expected ok snapshots")
    }
  })

  it("includes settings.variables when non-empty and omits when missing", () => {
    const cells = [sql("a", "SELECT @x FROM trades")]
    const withVars = makeWorkspace(
      new Map([
        [
          1,
          {
            cells,
            settings: {
              variables: [
                { name: "x", value: "10" },
                { name: "sym", value: "'BTC'" },
              ],
            },
          },
        ],
      ]),
    )
    const withoutVars = makeWorkspace(new Map([[2, { cells }]]))
    const a = buildSnapshot(withVars, 1)
    const b = buildSnapshot(withoutVars, 2)
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

  it("surfaces chart summary without leaking series data", () => {
    const cell = sql("a", "SELECT 1", {
      mode: "draw",
      autoRefresh: true,
      isChartMaximized: false,
      chartConfig: {
        name: "Trades",
        type: "line",
        xColumn: "ts",
        yColumns: ["price", "volume"],
      },
    })
    const ws = makeWorkspace(new Map([[1, { cells: [cell] }]]))
    const snap = buildSnapshot(ws, 1)
    if (snap?.status === "ok") {
      expect(snap.cells[0].chart).toEqual({ name: "Trades", type: "line" })
      expect(snap.cells[0].mode).toBe("draw")
      expect(snap.cells[0].auto_refresh).toBe(true)
    } else {
      throw new Error("expected ok snapshot")
    }
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

  it("serialises ok snapshots with cells and grid positions", () => {
    const ws = makeWorkspace(
      new Map([
        [
          1,
          {
            cells: [sql("a", "SELECT 1")],
            settings: {
              layoutMode: "grid",
              layout: [{ i: "a", x: 0, y: 0, w: 12, h: 4 }],
            },
          },
        ],
      ]),
    )
    const snap = buildSnapshot(ws, 1)!
    const out = formatSnapshot(snap)
    expect(out).toContain("buffer_id: 1")
    expect(out).toContain("layout_mode: grid")
    expect(out).toContain("- id: a")
    expect(out).toContain("grid: { x: 0, y: 0, w: 12, h: 4 }")
  })

  it("emits a variables block when present, omits when empty", () => {
    const withVars = makeWorkspace(
      new Map([
        [
          1,
          {
            cells: [sql("a", "SELECT @x")],
            settings: {
              variables: [
                { name: "x", value: "10" },
                { name: "sym", value: "'BTC'" },
              ],
            },
          },
        ],
      ]),
    )
    const out = formatSnapshot(buildSnapshot(withVars, 1)!)
    expect(out).toContain("variables:")
    expect(out).toMatch(/x: "10"/)
    expect(out).toMatch(/sym: "'BTC'"/)

    const noVars = makeWorkspace(
      new Map([[2, { cells: [sql("a", "SELECT 1")] }]]),
    )
    const out2 = formatSnapshot(buildSnapshot(noVars, 2)!)
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
