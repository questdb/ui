import "../../../src/test/stubBrowserGlobals"
import { describe, it, expect, beforeEach } from "vitest"

import {
  buildSnapshot,
  formatSnapshot,
  serializeCell,
} from "../../../src/utils/ai/notebookSnapshot"
import { __resetNotebookAIBridgeForTests } from "../../../src/utils/notebooks/notebookAIBridge"
import {
  __resetNotebookControllerForTests,
  registerController,
  unregisterController,
  type NotebookController,
} from "../../../src/utils/notebooks/notebookController"
import { __resetNotebookBufferQueuesForTests } from "../../../src/utils/notebooks/notebookBufferQueue"
import { db } from "../../../src/store/db"
import { saveCellSnapshot } from "../../../src/store/notebookResults"
import type {
  NotebookCell,
  NotebookSettings,
  NotebookViewState,
} from "../../../src/store/notebook"

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
  readResultStatus?: NonNullable<NotebookController["readResultStatus"]>,
): NotebookController => ({
  bufferId,
  kind: "live",
  mutate: (transition) =>
    Promise.resolve(
      transition({ cells, settings, maximizedCellId, focusedCellId: null })
        .result,
    ),
  mutateWithResultStatus: (transition) =>
    Promise.resolve(
      transition(
        { cells, settings, maximizedCellId, focusedCellId: null },
        readResultStatus ?? (() => "unrequested"),
      ).result,
    ),
  readView: () =>
    Promise.resolve({
      cells,
      settings,
      maximizedCellId: maximizedCellId ?? undefined,
    }),
  runCell: () =>
    Promise.resolve({ success: true, queryCount: 1, results: ["success"] }),
  ...(readResultStatus ? { readResultStatus } : {}),
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
  await db.notebook_results.clear()
})

describe("buildSnapshot", () => {
  it("reports a run-marked cell's stored view when the snapshot index is unavailable", async () => {
    // Given a background notebook whose run-marked cell has no snapshot row,
    // and an index that rejects every read
    const id = await db.buffers.add({
      label: "nb",
      value: "",
      position: 0,
      notebookViewState: {
        cells: [
          { id: "a", position: 0, value: "SELECT 1", lastRunStatus: "success" },
        ],
      },
    })
    const where = vi
      .spyOn(db.notebook_results, "where")
      .mockImplementation(() => {
        throw new Error("index down")
      })
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    // When the snapshot is built
    const snap = await buildSnapshot(id)

    // Then the read succeeds and the cell keeps its stored arrangement
    expect(snap?.status).toBe("ok")
    expect(snap?.status === "ok" && snap.cells[0].view).toBe("editor_result")
    expect(warn).toHaveBeenCalledOnce()
    where.mockRestore()
    warn.mockRestore()
  })

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

  it("reports editor when the mounted cell's saved result is known missing", async () => {
    // Given a mounted cell that ran before but whose saved result is known missing
    const released = sql("a", "SELECT 1", {
      mode: undefined,
      lastRunStatus: "success",
      paneView: "result",
    })
    const id = await seedNotebook({ cells: [released] })
    registerController(
      makeController(id, [released], {}, null, () => "missing"),
    )

    // When the snapshot is built
    const snap = await buildSnapshot(id)

    // Then the cell reports editor with no mode while keeping its run history
    expect(snap?.status === "ok" ? snap.cells[0] : undefined).toMatchObject({
      view: "editor",
      mode: null,
      last_run_status: "success",
    })
  })

  it("uses passive snapshot keys to distinguish restorable and missing results", async () => {
    // Given an unmounted cell that ran before and has no snapshot row yet
    const released = sql("a", "SELECT 1", {
      mode: undefined,
      lastRunStatus: "success",
      paneView: "result",
    })
    const id = await seedNotebook({ cells: [released] })

    // When the snapshot is built without a stored result
    const missing = await buildSnapshot(id)

    // Then the cell reports editor
    expect(missing?.status === "ok" ? missing.cells[0].view : undefined).toBe(
      "editor",
    )

    // When a snapshot row is saved and the snapshot is rebuilt
    await saveCellSnapshot({
      bufferId: id,
      cellId: "a",
      results: [],
      savedAt: 1,
    })
    const restorable = await buildSnapshot(id)

    // Then the cell reports its stored view and run mode
    expect(
      restorable?.status === "ok"
        ? [restorable.cells[0].view, restorable.cells[0].mode]
        : undefined,
    ).toEqual(["result", "run"])
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

  it("preserves SQL comparison operators in structured snapshot previews", async () => {
    // Given a cell whose SQL contains comparison operators and an ampersand
    const value =
      "SELECT * FROM fx_trades WHERE price < 1 AND quantity > 2 AND symbol <> 'A&B'"
    const id = await seedNotebook({ cells: [sql("a", value)] })

    // When the snapshot is built
    const snap = await buildSnapshot(id)

    // Then the preview keeps the SQL verbatim
    expect(snap?.status).toBe("ok")
    if (snap?.status === "ok") {
      expect(snap.cells[0].preview).toBe(value)
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
    // Given the same cells and layout stored once in list mode and once in grid mode
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

    // When both snapshots are built
    const listSnap = await buildSnapshot(listId)
    const gridSnap = await buildSnapshot(gridId)

    // Then only the grid snapshot carries placement
    if (listSnap?.status === "ok" && gridSnap?.status === "ok") {
      expect(listSnap.cells[0].grid).toBeUndefined()
      // Agent layout exposes placement/width only; height is controlled through
      // semantic pane dimensions and derived internally.
      expect(gridSnap.cells[0].grid).toEqual({ x: 0, y: 0, w: 6 })
      // A never-run cell presents only its editor, so the view reads "editor".
      expect(gridSnap.cells[0]).toMatchObject({
        editor_height: "auto",
        result_height: "auto",
        view: "editor",
        mode: null,
      })
    } else {
      throw new Error("expected ok snapshots")
    }
  })

  it("reports a null view and result height for a markdown cell", async () => {
    // Given a live markdown cell
    const id = await seedNotebook({
      cells: [sql("a", "# title", { type: "markdown" })],
    })
    // When the snapshot builds
    const snap = await buildSnapshot(id)
    const cellSnapshot = snap?.status === "ok" ? snap.cells[0] : undefined
    // Then the pane fields are null
    expect(cellSnapshot).toMatchObject({
      type: "markdown",
      view: null,
      mode: null,
      result_height: null,
    })
    // And get_cell reports the same null pane fields
    const details = serializeCell(
      [sql("a", "# title", { type: "markdown" })],
      "a",
      id,
      false,
      undefined,
      "unrequested",
    )
    expect(details).toMatchObject({
      view: null,
      mode: null,
      result_height: null,
    })
  })

  it("reports editor from get_cell serialization when the result is missing", () => {
    // Given a cell that ran before whose result is known missing
    const released = sql("a", "SELECT 1", {
      mode: undefined,
      lastRunStatus: "success",
      paneView: "editor_result",
    })

    // When the cell is serialized for get_cell
    const details = serializeCell(
      [released],
      "a",
      7,
      false,
      undefined,
      "missing",
    )

    // Then it reports editor with no mode while keeping its run history
    expect(details).toMatchObject({
      view: "editor",
      mode: null,
      last_run_status: "success",
    })
  })

  it("reports the stored view for an inactive notebook", async () => {
    // Given an unmounted draw cell with a split pane view
    const id = await seedNotebook({
      cells: [
        sql("a", "SELECT 1", {
          mode: "draw",
          paneView: "editor_result",
        }),
      ],
    })

    // When the snapshot is built
    const snap = await buildSnapshot(id)

    // Then the stored view and mode are reported
    expect(snap?.status === "ok" ? snap.cells[0] : undefined).toMatchObject({
      view: "editor_result",
      mode: "draw",
    })
  })

  it("round-trips a pinned result height while passive result data is unloaded", async () => {
    // Given an unmounted cell with a pinned result height and no loaded result
    const id = await seedNotebook({
      cells: [
        sql("a", "SELECT 1", {
          bottomHeight: 400,
          bottomResized: true,
          lastRunStatus: "success",
        }),
      ],
    })

    // When the snapshot is built
    const snap = await buildSnapshot(id)

    // Then the pinned height is reported
    expect(
      snap?.status === "ok" ? snap.cells[0].result_height : undefined,
    ).toBe(400)
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

  it("reports auto_refresh_default only when the notebook configured one", async () => {
    const cells = [sql("a", "SELECT 1")]
    const unsetId = await seedNotebook({ cells })
    const storedId = await seedNotebook({
      cells,
      settings: { autoRefreshDefault: "30s" },
    })
    const offId = await seedNotebook({
      cells,
      settings: { autoRefreshDefault: false },
    })
    const unset = await buildSnapshot(unsetId)
    const stored = await buildSnapshot(storedId)
    const off = await buildSnapshot(offId)
    if (
      unset?.status === "ok" &&
      stored?.status === "ok" &&
      off?.status === "ok"
    ) {
      // Absence stays observable: with no configured default, charts poll on
      // Auto and grids do not poll at all — one synthesized value would hide
      // that split.
      expect(unset.auto_refresh_default).toBeUndefined()
      expect(stored.auto_refresh_default).toBe("30s")
      expect(off.auto_refresh_default).toBe(false)
    } else {
      throw new Error("expected ok snapshots")
    }
  })

  it("surfaces the full chart config in wire shape (for PUT round-trip) without leaking series data", async () => {
    // Given a named draw cell with a chart config and a 5s auto-refresh override
    const cell = sql("a", "SELECT 1", {
      mode: "draw",
      autoRefresh: "5s",
      paneView: "editor_result",
      name: "Trades",
      chartConfig: {
        xColumn: "ts",
        queries: [{ type: "line", yColumns: ["price", "volume"] }],
      },
    })
    // A stored notebook default keeps the cell's 5s a genuine override.
    const id = await seedNotebook({
      cells: [cell],
      settings: { autoRefreshDefault: true },
    })

    // When the snapshot is built
    const snap = await buildSnapshot(id)

    // Then the cell carries its config, name, mode and override in wire shape
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

describe("formatSnapshot", () => {
  it("guards comparison operators only in the pseudo-XML prompt context", async () => {
    // Given a snapshot whose structured preview keeps the raw comparison operators
    const value = "SELECT 1 WHERE price < 2 AND quantity > 0"
    const id = await seedNotebook({ cells: [sql("a", value)] })
    const snap = (await buildSnapshot(id))!
    expect(snap.status === "ok" && snap.cells[0].preview).toBe(value)

    // When the snapshot is formatted for the prompt
    const out = formatSnapshot(snap)

    // Then the operators are replaced with guarded glyphs
    expect(out).toContain("price ‹ 2 AND quantity › 0")
    expect(out).not.toContain("price < 2")
  })

  it("serialises ok snapshots with cells and grid positions", async () => {
    // Given a grid-mode notebook with one placed cell
    const id = await seedNotebook({
      cells: [sql("a", "SELECT 1")],
      settings: {
        layoutMode: "grid",
        layout: [{ i: "a", x: 0, y: 0, w: 12, h: 4 }],
      },
    })
    const snap = (await buildSnapshot(id))!

    // When the snapshot is formatted for the prompt
    const out = formatSnapshot(snap)

    // Then the block lists the notebook, the cell and its grid placement
    expect(out).toContain(`buffer_id: ${id}`)
    expect(out).toContain("layout_mode: grid")
    expect(out).toContain("- id: a")
    expect(out).toContain("editor_height: auto")
    expect(out).toContain("result_height: auto")
    expect(out).toContain("mode: null")
    expect(out).toContain("view: editor")
    expect(out).toContain("grid: { x: 0, y: 0, w: 12 }")
  })

  it("renders the cell's highlight_config as wire JSON", async () => {
    // Given a cell with one previous rule
    const value = "SELECT 1; SELECT symbol, price FROM trades"
    const cell = sql("a", value, {
      highlightConfig: {
        identityColumns: ["symbol"],
        rules: [
          {
            id: "r1",
            enabled: true,
            target: { kind: "column", name: "price" },
            display: "temporary",
            kind: "previous",
            appliesTo: "cell",
            condition: { op: "gt" },
            color: "dataPositive",
          },
        ],
      },
    })
    const id = await seedNotebook({ cells: [cell] })

    // When the snapshot is built and formatted
    const snap = await buildSnapshot(id)
    const out = formatSnapshot(snap!)

    // Then the wire config carries the rule in hue names
    expect(snap?.status === "ok" && snap.cells[0].highlight_config).toEqual({
      identity_columns: ["symbol"],
      rules: [
        {
          kind: "previous",
          column: "price",
          display: "temporary",
          color: "green",
          op: "gt",
        },
      ],
    })
    expect(out).toContain('highlight_config: {"identity_columns":["symbol"]')
  })

  it("keeps angle brackets in highlight rule text across a copy back", async () => {
    // Given a contains rule whose text carries angle brackets
    const cell = sql("a", "SELECT symbol FROM trades", {
      highlightConfig: {
        identityColumns: [],
        rules: [
          {
            id: "r1",
            enabled: true,
            target: { kind: "column", name: "symbol" },
            display: "always",
            kind: "value",
            appliesTo: "cell",
            condition: { op: "contains", text: "<NA>" },
            color: "dataNegative",
          },
        ],
      },
    })
    const id = await seedNotebook({ cells: [cell] })

    // When the snapshot is formatted and the model copies the JSON back
    const out = formatSnapshot((await buildSnapshot(id))!)
    const line = out.split("\n").find((l) => l.includes("highlight_config:"))!
    const copied = JSON.parse(line.slice(line.indexOf("{"))) as {
      rules: { text: string }[]
    }

    // Then the prompt shows no raw tag characters and the text is unchanged
    expect(line).not.toMatch(/[<>]/)
    expect(copied.rules[0].text).toBe("<NA>")
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
