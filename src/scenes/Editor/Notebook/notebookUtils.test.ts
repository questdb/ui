import { describe, it, expect } from "vitest"
import {
  ApplyNotebookStateError,
  attachScriptSummary,
  buildAppliedCells,
  buildAppliedLayout,
  buildInitialScriptResults,
  buildPersistPayload,
  cancelAllInCell,
  cancelOneInCell,
  duplicateCellAt,
  generateDefaultLayout,
  insertCell,
  mergeCellLayout,
  removeCell,
  setResultAt,
  singleResultFromExec,
  stripCellResults,
  swapCellDown,
  swapCellUp,
} from "./notebookUtils"
import type { NotebookCell } from "../../../store/notebook"
import type { QueryExecResult } from "../../../hooks/useQueryExecution"

const cell = (
  id: string,
  value = "",
  result?: NotebookCell["result"],
): NotebookCell => ({
  id,
  position: 0,
  value,
  result,
})

describe("singleResultFromExec", () => {
  it("maps dql exec to DqlQueryResult preserving columns/dataset/count/timings", () => {
    const exec: QueryExecResult = {
      type: "dql",
      query: "SELECT 1",
      columns: [{ name: "x", type: "INT" }],
      dataset: [[1]],
      count: 1,
      timings: {
        compiler: 100,
        execute: 200,
        authentication: 10,
        fetch: 5,
        count: 1,
      },
    }
    expect(singleResultFromExec(exec, "SELECT 1")).toEqual({
      type: "dql",
      query: "SELECT 1",
      columns: exec.columns,
      dataset: exec.dataset,
      count: 1,
      timings: exec.timings,
    })
  })

  it("maps error exec to ErrorQueryResult with error message", () => {
    const exec: QueryExecResult = {
      type: "error",
      query: "SELECT boom",
      columns: [],
      dataset: [],
      count: 0,
      error: "syntax error",
    }
    expect(singleResultFromExec(exec, "SELECT boom")).toEqual({
      type: "error",
      query: "SELECT boom",
      error: "syntax error",
    })
  })

  it("falls back to 'Unknown error' when error exec has no message", () => {
    const exec: QueryExecResult = {
      type: "error",
      query: "SELECT ?",
      columns: [],
      dataset: [],
      count: 0,
    }
    expect(singleResultFromExec(exec, "SELECT ?")).toEqual({
      type: "error",
      query: "SELECT ?",
      error: "Unknown error",
    })
  })

  it("maps ddl exec to DdlDmlQueryResult without data fields", () => {
    const exec: QueryExecResult = {
      type: "ddl",
      query: "CREATE TABLE t (x INT)",
      columns: [],
      dataset: [],
      count: 0,
    }
    expect(singleResultFromExec(exec, "CREATE TABLE t (x INT)")).toEqual({
      type: "ddl",
      query: "CREATE TABLE t (x INT)",
    })
  })

  it("maps dml exec to DdlDmlQueryResult", () => {
    const exec: QueryExecResult = {
      type: "dml",
      query: "INSERT INTO t VALUES (1)",
      columns: [],
      dataset: [],
      count: 0,
    }
    expect(singleResultFromExec(exec, "INSERT INTO t VALUES (1)")).toEqual({
      type: "dml",
      query: "INSERT INTO t VALUES (1)",
    })
  })
})

describe("stripCellResults", () => {
  it("removes result from every cell", () => {
    const cells: NotebookCell[] = [
      cell("a", "SELECT 1", {
        results: [
          {
            type: "dql",
            query: "SELECT 1",
            columns: [{ name: "x", type: "INT" }],
            dataset: [[1]],
            count: 1,
          },
        ],
        activeResultIndex: 0,
        timestamp: 0,
      }),
      cell("b", "SELECT 2"),
    ]
    const out = stripCellResults(cells)
    expect(out[0].result).toBeUndefined()
    expect(out[1].result).toBeUndefined()
  })

  it("returns an empty array for empty input", () => {
    expect(stripCellResults([])).toEqual([])
  })
})

describe("buildPersistPayload", () => {
  it("packs cells, focusedCellId, maximizedCellId and settings; results are stripped", () => {
    const cells: NotebookCell[] = [
      cell("a", "SELECT 1", {
        results: [{ type: "running", query: "SELECT 1" }],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ]
    const payload = buildPersistPayload(cells, "a", null, {
      layoutMode: "list",
    })
    expect(payload).toEqual({
      cells: [{ ...cells[0], result: undefined }],
      focusedCellId: "a",
      maximizedCellId: undefined,
      settings: { layoutMode: "list" },
    })
  })

  it("coerces null focusedCellId/maximizedCellId to undefined", () => {
    const payload = buildPersistPayload([], null, null, {})
    expect(payload.focusedCellId).toBeUndefined()
    expect(payload.maximizedCellId).toBeUndefined()
  })
})

describe("generateDefaultLayout", () => {
  it("stacks each cell in its own row at x=0", () => {
    const cells = [{ id: "a" }, { id: "b" }, { id: "c" }]
    expect(
      generateDefaultLayout(cells, { gridCols: 12, defaultCellH: 6 }),
    ).toEqual([
      { i: "a", x: 0, y: 0, w: 12, h: 6 },
      { i: "b", x: 0, y: 6, w: 12, h: 6 },
      { i: "c", x: 0, y: 12, w: 12, h: 6 },
    ])
  })

  it("returns empty for no cells", () => {
    expect(
      generateDefaultLayout([], { gridCols: 12, defaultCellH: 6 }),
    ).toEqual([])
  })
})

describe("mergeCellLayout", () => {
  const opts = { gridCols: 12, defaultCellH: 6, minW: 2, minH: 2 }

  it("preserves saved entries for existing cells and adds minW/minH", () => {
    const saved = [{ i: "a", x: 3, y: 4, w: 8, h: 10 }]
    const cells = [{ id: "a" }]
    expect(mergeCellLayout(saved, cells, opts)).toEqual([
      { i: "a", x: 3, y: 4, w: 8, h: 10, minW: 2, minH: 2 },
    ])
  })

  it("stacks new cells below the current max-y+h and defaults w/h", () => {
    const saved = [{ i: "a", x: 0, y: 0, w: 12, h: 6 }]
    const cells = [{ id: "a" }, { id: "b" }]
    expect(mergeCellLayout(saved, cells, opts)).toEqual([
      { i: "a", x: 0, y: 0, w: 12, h: 6, minW: 2, minH: 2 },
      { i: "b", x: 0, y: 6, w: 12, h: 6, minW: 2, minH: 2 },
    ])
  })

  it("preserves order from cells, not saved layout", () => {
    const saved = [
      { i: "a", x: 0, y: 0, w: 12, h: 6 },
      { i: "b", x: 0, y: 6, w: 12, h: 6 },
    ]
    const cells = [{ id: "b" }, { id: "a" }]
    const out = mergeCellLayout(saved, cells, opts)
    expect(out.map((l) => l.i)).toEqual(["b", "a"])
  })

  it("starts at y=0 when saved layout is empty", () => {
    expect(mergeCellLayout([], [{ id: "a" }, { id: "b" }], opts)).toEqual([
      { i: "a", x: 0, y: 0, w: 12, h: 6, minW: 2, minH: 2 },
      { i: "b", x: 0, y: 6, w: 12, h: 6, minW: 2, minH: 2 },
    ])
  })

  it("drops entries for cells that no longer exist", () => {
    const saved = [
      { i: "a", x: 0, y: 0, w: 12, h: 6 },
      { i: "b", x: 0, y: 6, w: 12, h: 6 },
    ]
    const cells = [{ id: "a" }]
    expect(mergeCellLayout(saved, cells, opts).map((l) => l.i)).toEqual(["a"])
  })
})

// Deterministic factory so tests can assert exact ids/positions.
const fakeFactory = (position: number, value = ""): NotebookCell => ({
  id: `cell-${position}`,
  position,
  value,
})

describe("insertCell", () => {
  it("appends a new cell when afterCellId is undefined", () => {
    const start: NotebookCell[] = [cell("a")]
    const out = insertCell(start, undefined, fakeFactory)
    expect(out).toHaveLength(2)
    expect(out[0].id).toBe("a")
    expect(out.map((c) => c.position)).toEqual([0, 1])
  })

  it("inserts right after the named cell", () => {
    const start: NotebookCell[] = [cell("a"), cell("b"), cell("c")]
    const out = insertCell(start, "a", fakeFactory)
    expect(out).toHaveLength(4)
    expect(out.map((c) => c.id)).toEqual(["a", "cell-1", "b", "c"])
    expect(out.map((c) => c.position)).toEqual([0, 1, 2, 3])
  })

  it("inserts at the top when afterCellId is unknown (findIndex -1 + 1 = 0)", () => {
    // Locks original provider behaviour: unknown afterCellId inserts at index 0, not the end.
    const start: NotebookCell[] = [cell("a")]
    const out = insertCell(start, "missing", fakeFactory)
    expect(out).toHaveLength(2)
    expect(out[1].id).toBe("a")
    expect(out.map((c) => c.position)).toEqual([0, 1])
  })

  it("uses the override id when provided", () => {
    const start: NotebookCell[] = [cell("a")]
    const out = insertCell(start, undefined, fakeFactory, { id: "forced-id" })
    expect(out[1].id).toBe("forced-id")
  })

  it("uses the override value when provided", () => {
    const start: NotebookCell[] = [cell("a")]
    const out = insertCell(start, undefined, fakeFactory, {
      value: "SELECT 42",
    })
    expect(out[1].value).toBe("SELECT 42")
  })

  it("applies both id and value overrides together", () => {
    const start: NotebookCell[] = [cell("a")]
    const out = insertCell(start, undefined, fakeFactory, {
      id: "forced",
      value: "SELECT 1",
    })
    expect(out[1].id).toBe("forced")
    expect(out[1].value).toBe("SELECT 1")
  })
})

describe("removeCell", () => {
  it("removes the target cell and re-numbers positions", () => {
    const out = removeCell([cell("a"), cell("b"), cell("c")], "b")
    expect(out.map((c) => c.id)).toEqual(["a", "c"])
    expect(out.map((c) => c.position)).toEqual([0, 1])
  })

  it("refuses to delete the last remaining cell (returns original)", () => {
    const start: NotebookCell[] = [cell("a")]
    expect(removeCell(start, "a")).toBe(start)
  })

  it("returns the original when the id is unknown", () => {
    const start: NotebookCell[] = [cell("a"), cell("b")]
    expect(removeCell(start, "missing")).toBe(start)
  })
})

describe("swapCellUp / swapCellDown", () => {
  const start = [cell("a"), cell("b"), cell("c")] as NotebookCell[]

  it("swapCellUp swaps with the previous cell and renumbers positions", () => {
    const out = swapCellUp(start, "b")
    expect(out.map((c) => c.id)).toEqual(["b", "a", "c"])
    expect(out.map((c) => c.position)).toEqual([0, 1, 2])
  })

  it("swapCellUp is a no-op at the top", () => {
    expect(swapCellUp(start, "a")).toBe(start)
  })

  it("swapCellDown swaps with the next cell", () => {
    const out = swapCellDown(start, "b")
    expect(out.map((c) => c.id)).toEqual(["a", "c", "b"])
  })

  it("swapCellDown is a no-op at the bottom", () => {
    expect(swapCellDown(start, "c")).toBe(start)
  })

  it("unknown ids are no-ops for both directions", () => {
    expect(swapCellUp(start, "missing")).toBe(start)
    expect(swapCellDown(start, "missing")).toBe(start)
  })
})

describe("duplicateCellAt", () => {
  it("inserts a copy immediately after the original with the provided id", () => {
    const start: NotebookCell[] = [cell("a", "SELECT 1"), cell("b")]
    const out = duplicateCellAt(start, "a", "new-id")
    expect(out.map((c) => c.id)).toEqual(["a", "new-id", "b"])
    expect(out.map((c) => c.position)).toEqual([0, 1, 2])
  })

  it("drops the `result` blob on the copy", () => {
    const original = cell("a", "SELECT 1", {
      results: [{ type: "running", query: "SELECT 1" }],
      activeResultIndex: 0,
      timestamp: 0,
    })
    const out = duplicateCellAt([original], "a", "new-id")
    const copy = out[1]
    expect(copy.id).toBe("new-id")
    expect(copy.result).toBe(null)
  })

  it("returns the original when the id is unknown", () => {
    const start: NotebookCell[] = [cell("a")]
    expect(duplicateCellAt(start, "missing", "x")).toBe(start)
  })
})

describe("setResultAt", () => {
  const withResult = (results: NotebookCell["result"]): NotebookCell =>
    cell("a", "SELECT 1", results)

  it("replaces the result at the given index", () => {
    const cells: NotebookCell[] = [
      withResult({
        results: [
          { type: "running", query: "q1" },
          { type: "running", query: "q2" },
        ],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ]
    const next = {
      type: "dql" as const,
      query: "q2",
      columns: [{ name: "x", type: "INT" }],
      dataset: [[1]],
      count: 1,
    }
    const out = setResultAt(cells, "a", 1, next)
    expect(out[0].result?.results[1]).toEqual(next)
    expect(out[0].result?.results[0].type).toBe("running")
  })

  it("updates activeResultIndex when provided", () => {
    const cells: NotebookCell[] = [
      withResult({
        results: [
          { type: "running", query: "q1" },
          { type: "running", query: "q2" },
        ],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ]
    const out = setResultAt(cells, "a", 1, { type: "running", query: "q2" }, 1)
    expect(out[0].result?.activeResultIndex).toBe(1)
  })

  it("does nothing when the cell has no result", () => {
    const cells: NotebookCell[] = [cell("a")]
    expect(setResultAt(cells, "a", 0, { type: "running", query: "q" })).toEqual(
      cells,
    )
  })

  it("does nothing when the cell id is unknown", () => {
    const cells: NotebookCell[] = [cell("a")]
    expect(
      setResultAt(cells, "missing", 0, { type: "running", query: "q" }),
    ).toEqual(cells)
  })
})

describe("cancelAllInCell", () => {
  it("flips running and queued results to cancelled, leaves terminal types alone", () => {
    const c = cell("a", "", {
      results: [
        { type: "dql", query: "q1", columns: [], dataset: [[1]], count: 1 },
        { type: "running", query: "q2" },
        { type: "queued", query: "q3" },
        { type: "error", query: "q4", error: "nope" },
      ],
      activeResultIndex: 0,
      timestamp: 0,
    })
    const out = cancelAllInCell([c], "a")
    const results = out[0].result!.results
    expect(results.map((r) => r.type)).toEqual([
      "dql",
      "cancelled",
      "cancelled",
      "error",
    ])
    expect(results[1].query).toBe("q2")
    expect(results[2].query).toBe("q3")
  })

  it("is a no-op for cells without a result", () => {
    const cells: NotebookCell[] = [cell("a")]
    expect(cancelAllInCell(cells, "a")).toEqual(cells)
  })
})

describe("cancelOneInCell", () => {
  it("marks only the running result at the given index as cancelled", () => {
    const c = cell("a", "", {
      results: [
        { type: "running", query: "q1" },
        { type: "running", query: "q2" },
      ],
      activeResultIndex: 0,
      timestamp: 0,
    })
    const out = cancelOneInCell([c], "a", 0)
    const results = out[0].result!.results
    expect(results[0].type).toBe("cancelled")
    expect(results[1].type).toBe("running")
  })

  it("is a no-op when the result isn't running (queued, dql, error)", () => {
    const c = cell("a", "", {
      results: [{ type: "queued", query: "q1" }],
      activeResultIndex: 0,
      timestamp: 0,
    })
    expect(cancelOneInCell([c], "a", 0)).toEqual([c])
  })

  it("is a no-op at an out-of-range index", () => {
    const c = cell("a", "", {
      results: [{ type: "running", query: "q" }],
      activeResultIndex: 0,
      timestamp: 0,
    })
    expect(cancelOneInCell([c], "a", 5)).toEqual([c])
  })
})

describe("buildInitialScriptResults", () => {
  it("marks the first as running and the rest queued", () => {
    expect(buildInitialScriptResults(["q1", "q2", "q3"])).toEqual([
      { type: "running", query: "q1" },
      { type: "queued", query: "q2" },
      { type: "queued", query: "q3" },
    ])
  })

  it("returns an empty list for no queries", () => {
    expect(buildInitialScriptResults([])).toEqual([])
  })

  it("returns a single running result for one query", () => {
    expect(buildInitialScriptResults(["only"])).toEqual([
      { type: "running", query: "only" },
    ])
  })
})

describe("attachScriptSummary", () => {
  it("attaches the summary to the cell's existing result", () => {
    const cells: NotebookCell[] = [
      cell("a", "", {
        results: [
          { type: "dql", query: "q", columns: [], dataset: [], count: 0 },
        ],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ]
    const out = attachScriptSummary(cells, "a", {
      successCount: 2,
      failedCount: 0,
      durationMs: 123,
    })
    expect(out[0].result?.script).toEqual({
      successCount: 2,
      failedCount: 0,
      durationMs: 123,
    })
  })

  it("is a no-op when the cell has no result", () => {
    const cells: NotebookCell[] = [cell("a")]
    expect(
      attachScriptSummary(cells, "a", {
        successCount: 0,
        failedCount: 0,
        durationMs: 0,
      }),
    ).toEqual(cells)
  })

  it("is a no-op when the cell id is unknown", () => {
    const cells: NotebookCell[] = [cell("a")]
    expect(
      attachScriptSummary(cells, "missing", {
        successCount: 0,
        failedCount: 0,
        durationMs: 0,
      }),
    ).toEqual(cells)
  })
})

describe("buildAppliedCells", () => {
  const dql = (query: string): NotebookCell["result"] => ({
    results: [
      {
        type: "dql" as const,
        query,
        columns: [],
        dataset: [],
        count: 0,
      },
    ],
    activeResultIndex: 0,
    timestamp: 0,
  })

  it("inserts new cells with generated ids when id is omitted", () => {
    const prev: NotebookCell[] = []
    const { nextCells, diff } = buildAppliedCells(prev, {
      cells: [{ value: "SELECT 1" }, { value: "SELECT 2" }],
    })
    expect(nextCells.map((c) => c.value)).toEqual(["SELECT 1", "SELECT 2"])
    expect(nextCells.map((c) => c.position)).toEqual([0, 1])
    expect(diff.added).toHaveLength(2)
    expect(diff.updated).toEqual([])
    expect(diff.deleted).toEqual([])
  })

  it("updates existing cells in place and preserves result when value unchanged", () => {
    const prev: NotebookCell[] = [
      { id: "a", position: 0, value: "x", result: dql("x") },
      { id: "b", position: 1, value: "y", result: dql("y") },
    ]
    const { nextCells, diff } = buildAppliedCells(prev, {
      cells: [
        { id: "a", value: "x" }, // unchanged → result preserved
        { id: "b", value: "y2" }, // changed → result dropped
      ],
    })
    expect(nextCells[0].result).toEqual(dql("x"))
    expect(nextCells[1].result).toBeNull()
    expect(diff.updated).toEqual(["a", "b"])
    expect(diff.added).toEqual([])
    expect(diff.deleted).toEqual([])
  })

  it("deletes cells whose ids are missing from the request", () => {
    const prev: NotebookCell[] = [
      { id: "a", position: 0, value: "" },
      { id: "b", position: 1, value: "" },
      { id: "c", position: 2, value: "" },
    ]
    const { nextCells, diff } = buildAppliedCells(prev, {
      cells: [
        { id: "a", value: "" },
        { id: "c", value: "" },
      ],
    })
    expect(nextCells.map((c) => c.id)).toEqual(["a", "c"])
    expect(diff.deleted.sort()).toEqual(["b"])
  })

  it("throws when ids are duplicated within a request", () => {
    expect(() =>
      buildAppliedCells([], {
        cells: [
          { id: "x", value: "a" },
          { id: "x", value: "b" },
        ],
      }),
    ).toThrow(ApplyNotebookStateError)
  })

  it("throws when a draw-mode cell has no chart_config", () => {
    expect(() =>
      buildAppliedCells([], {
        cells: [{ value: "SELECT 1", mode: "draw" }],
      }),
    ).toThrow(/no chart_config/)
  })

  it("throws when candlestick has no ohlc and y_columns are not 4", () => {
    expect(() =>
      buildAppliedCells([], {
        cells: [
          {
            value: "SELECT 1",
            mode: "draw",
            chartConfig: {
              type: "candlestick",
              xColumn: "ts",
              yColumns: ["a", "b"],
            },
          },
        ],
      }),
    ).toThrow(/ohlc/)
  })

  it("auto-derives ohlc from 4 yColumns for candlestick", () => {
    const { nextCells } = buildAppliedCells([], {
      cells: [
        {
          value: "SELECT 1",
          mode: "draw",
          chartConfig: {
            type: "candlestick",
            xColumn: "ts",
            yColumns: ["o", "h", "l", "c"],
          },
        },
      ],
    })
    expect(nextCells[0].chartConfig?.ohlc).toEqual({
      open: "o",
      high: "h",
      low: "l",
      close: "c",
    })
  })

  it("defaults isChartMaximized and autoRefresh to true on new draw cells", () => {
    const { nextCells } = buildAppliedCells([], {
      cells: [
        {
          value: "SELECT 1",
          mode: "draw",
          chartConfig: { type: "line", xColumn: "ts", yColumns: ["v"] },
        },
      ],
    })
    expect(nextCells[0].autoRefresh).toBe(true)
    expect(nextCells[0].isChartMaximized).toBe(true)
  })

  it("refuses an empty cells array", () => {
    expect(() => buildAppliedCells([], { cells: [] })).toThrow(
      /at least one cell/,
    )
  })
})

describe("buildAppliedLayout", () => {
  it("uses request.grid when provided, otherwise stacks mode-aware defaults", () => {
    const cells: NotebookCell[] = [
      { id: "a", position: 0, value: "" },
      { id: "b", position: 1, value: "" },
    ]
    const layout = buildAppliedLayout(
      {
        cells: [
          { id: "a", value: "", grid: { x: 0, y: 0, w: 6, h: 4 } },
          { id: "b", value: "" },
        ],
      },
      cells,
      [],
      { gridCols: 12, defaultCellH: 6 },
    )
    expect(layout).toEqual([
      { i: "a", x: 0, y: 0, w: 6, h: 4 },
      // Run-mode default = BULK_DEFAULT_RUN_CELL_H (8) so the user sees a
      // few result rows; stacks below 'a' which has y+h = 0+4.
      { i: "b", x: 0, y: 4, w: 12, h: 8 },
    ])
  })

  it("preserves prevLayout entry when request omits grid", () => {
    const cells: NotebookCell[] = [{ id: "a", position: 0, value: "" }]
    const layout = buildAppliedLayout(
      { cells: [{ id: "a", value: "" }] },
      cells,
      [{ i: "a", x: 3, y: 4, w: 8, h: 5 }],
      { gridCols: 12, defaultCellH: 6 },
    )
    expect(layout).toEqual([{ i: "a", x: 3, y: 4, w: 8, h: 5 }])
  })

  it("gives draw-mode cells a taller default than run-mode cells", () => {
    const cells: NotebookCell[] = [
      { id: "run-cell", position: 0, value: "", mode: "run" },
      { id: "draw-cell", position: 1, value: "", mode: "draw" },
    ]
    const layout = buildAppliedLayout(
      {
        cells: [
          { id: "run-cell", value: "" },
          { id: "draw-cell", value: "" },
        ],
      },
      cells,
      [],
      { gridCols: 12, defaultCellH: 6 },
    )
    expect(layout[0].h).toBe(8) // run cell — editor + a few result rows
    expect(layout[1].h).toBe(10) // draw cell — chart room
    expect(layout[1].y).toBe(8) // stacked below the run cell's height
  })
})
