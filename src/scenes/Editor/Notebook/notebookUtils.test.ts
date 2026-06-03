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
  computeCellGridH,
  computeResultBottomHeight,
  duplicateCellAt,
  generateDefaultLayout,
  insertCell,
  isDoubleView,
  mergeCellLayout,
  removeCell,
  setResultAt,
  singleResultFromExec,
  stripCellResults,
  swapCellDown,
  swapCellUp,
  upsertColumnSizing,
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

  it("throws when candlestick has no ohlc", () => {
    expect(() =>
      buildAppliedCells([], {
        cells: [
          {
            value: "SELECT 1",
            mode: "draw",
            chartConfig: {
              xColumn: "ts",
              queries: [{ type: "candlestick", yColumns: ["a", "b"] }],
            },
          },
        ],
      }),
    ).toThrow(/ohlc/)
  })

  it("does not derive ohlc from 4 yColumns — candlestick still requires explicit ohlc", () => {
    expect(() =>
      buildAppliedCells([], {
        cells: [
          {
            value: "SELECT 1",
            mode: "draw",
            chartConfig: {
              xColumn: "ts",
              queries: [
                { type: "candlestick", yColumns: ["o", "h", "l", "c"] },
              ],
            },
          },
        ],
      }),
    ).toThrow(/ohlc/)
  })

  it("throws when a sent chart_config has no queries (null or empty)", () => {
    expect(() =>
      buildAppliedCells([], {
        cells: [
          {
            value: "SELECT 1",
            mode: "draw",
            chartConfig: { xColumn: "ts", queries: [] },
          },
        ],
      }),
    ).toThrow(/no queries/)
  })

  it("throws when chart queries count != the cell's ;-split statement count", () => {
    expect(() =>
      buildAppliedCells([], {
        cells: [
          {
            value: "SELECT 1; SELECT 2",
            mode: "draw",
            chartConfig: {
              xColumn: "ts",
              // One config for a two-statement cell — would silently drop Q2.
              queries: [{ type: "line", yColumns: ["v"] }],
            },
          },
        ],
      }),
    ).toThrow(/2 ;-split statements/)
  })

  it("accepts chart queries that match the ;-split statement count", () => {
    const { nextCells } = buildAppliedCells([], {
      cells: [
        {
          value: "SELECT 1; SELECT 2",
          mode: "draw",
          chartConfig: {
            xColumn: "ts",
            queries: [
              { type: "line", yColumns: ["a"] },
              { type: "bar", yColumns: ["b"] },
            ],
          },
        },
      ],
    })
    expect(nextCells[0].chartConfig?.queries).toHaveLength(2)
  })

  it("defaults isChartMaximized and autoRefresh to true on new draw cells", () => {
    const { nextCells } = buildAppliedCells([], {
      cells: [
        {
          value: "SELECT 1",
          mode: "draw",
          chartConfig: {
            xColumn: "ts",
            queries: [{ type: "line", yColumns: ["v"] }],
          },
        },
      ],
    })
    expect(nextCells[0].autoRefresh).toBe(true)
    expect(nextCells[0].isChartMaximized).toBe(true)
  })

  it("apply is a PUT: mode='draw' with no chart_config throws even when the existing cell had one (no merge)", () => {
    const prev: NotebookCell[] = [
      {
        id: "a",
        position: 0,
        value: "SELECT 1",
        mode: "draw",
        chartConfig: {
          xColumn: "ts",
          queries: [{ type: "line", yColumns: ["v"] }],
        },
      },
    ]
    // Re-send as draw but omit chart_config. The old `?? existing` merge would
    // have silently inherited the saved chart; under PUT this must fail.
    expect(() =>
      buildAppliedCells(prev, {
        cells: [{ id: "a", value: "SELECT 1", mode: "draw" }],
      }),
    ).toThrow(/no chart_config/)
  })

  it("apply is a PUT: omitted fields on an existing cell are cleared, not inherited", () => {
    const prev: NotebookCell[] = [
      {
        id: "a",
        position: 0,
        value: "SELECT 1",
        mode: "draw",
        autoRefresh: true,
        isChartMaximized: true,
        chartConfig: {
          xColumn: "ts",
          queries: [{ type: "line", yColumns: ["v"] }],
        },
      },
    ]
    const { nextCells } = buildAppliedCells(prev, {
      cells: [{ id: "a", value: "SELECT 1" }], // bare cell — everything omitted
    })
    expect(nextCells[0].mode).toBeUndefined()
    expect(nextCells[0].chartConfig).toBeUndefined()
    expect(nextCells[0].autoRefresh).toBeUndefined()
    expect(nextCells[0].isChartMaximized).toBeUndefined()
  })

  it("refuses an empty cells array", () => {
    expect(() => buildAppliedCells([], { cells: [] })).toThrow(
      /at least one cell/,
    )
  })
})

describe("isDoubleView", () => {
  it("returns true for run cell with a result", () => {
    expect(
      isDoubleView({
        id: "x",
        position: 0,
        value: "",
        result: { results: [], activeResultIndex: 0, timestamp: 0 },
      }),
    ).toBe(true)
  })
  it("returns false for run cell with no result", () => {
    expect(isDoubleView({ id: "x", position: 0, value: "" })).toBe(false)
  })
  it("returns true for draw cell, whether chart-expanded or not", () => {
    expect(
      isDoubleView({ id: "x", position: 0, value: "", mode: "draw" }),
    ).toBe(true)
    expect(
      isDoubleView({
        id: "x",
        position: 0,
        value: "",
        mode: "draw",
        isChartMaximized: true,
      }),
    ).toBe(true)
  })
})

describe("computeResultBottomHeight", () => {
  // Layout constants (kept in sync with notebookUtils.ts):
  //   TAB_BAR_PX        = 40
  //   NOTIFICATION_PX   = 44
  //   GRID_HEADER_PX    = 44
  //   GRID_ROW_PX       = 28
  //   MAX_RESERVED_ROWS = 10

  it("null/undefined/empty result → notification-only", () => {
    expect(computeResultBottomHeight(null)).toBe(44)
    expect(computeResultBottomHeight(undefined)).toBe(44)
    expect(
      computeResultBottomHeight({
        results: [],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ).toBe(44)
  })

  it("single error → notification-only", () => {
    expect(
      computeResultBottomHeight({
        results: [{ type: "error", query: "X", error: "boom" }],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ).toBe(44)
  })

  it("single DDL/DML/notice → notification-only", () => {
    for (const type of ["ddl", "dml"] as const) {
      expect(
        computeResultBottomHeight({
          results: [{ type, query: "X" }],
          activeResultIndex: 0,
          timestamp: 0,
        }),
      ).toBe(44)
    }
  })

  it("single DQL with 0 rows → notification-only (no grid header, no rows)", () => {
    expect(
      computeResultBottomHeight({
        results: [
          {
            type: "dql",
            query: "SELECT 1",
            columns: [],
            dataset: [],
            count: 0,
          },
        ],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ).toBe(44)
  })

  it("single DQL with N rows → notification + header + N×row (N capped at 10)", () => {
    const make = (rowCount: number) => ({
      results: [
        {
          type: "dql" as const,
          query: "SELECT 1",
          columns: [],
          dataset: Array.from({ length: rowCount }, () => [1]),
          count: rowCount,
        },
      ],
      activeResultIndex: 0,
      timestamp: 0,
    })
    // 1 row: 44 + 44 + 1*28 = 116
    expect(computeResultBottomHeight(make(1))).toBe(116)
    // 5 rows: 44 + 44 + 5*28 = 228
    expect(computeResultBottomHeight(make(5))).toBe(228)
    // 10 rows: 44 + 44 + 10*28 = 368
    expect(computeResultBottomHeight(make(10))).toBe(368)
    // 50 rows: cap at 10 → still 368
    expect(computeResultBottomHeight(make(50))).toBe(368)
  })

  it("multi-statement, first DQL with rows → tab + notification + header + 10 rows", () => {
    // 40 + 44 + 44 + 10*28 = 408
    expect(
      computeResultBottomHeight({
        results: [
          {
            type: "dql",
            query: "Q1",
            columns: [],
            dataset: [[1]],
            count: 1,
          },
          { type: "ddl", query: "Q2" },
        ],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ).toBe(408)
  })

  it("multi-statement, first is error → tab + notification only (we never saw rows)", () => {
    // 40 + 44 = 84
    expect(
      computeResultBottomHeight({
        results: [
          { type: "error", query: "Q1", error: "boom" },
          { type: "dql", query: "Q2", columns: [], dataset: [[1]], count: 1 },
        ],
        activeResultIndex: 1,
        timestamp: 0,
      }),
    ).toBe(84)
  })

  it("multi-statement, first DQL with 0 rows → tab + notification only", () => {
    // Same shape as first-is-error: the first query produced no rows, so
    // we never reserved 10-row space.
    expect(
      computeResultBottomHeight({
        results: [
          { type: "dql", query: "Q1", columns: [], dataset: [], count: 0 },
          { type: "dql", query: "Q2", columns: [], dataset: [[1]], count: 1 },
        ],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ).toBe(84)
  })
})

describe("computeCellGridH", () => {
  it("single-view (run, no result): topHeight + chrome rounded up", () => {
    // 72 + 56 = 128 → ceil(128/50) = 3
    expect(computeCellGridH({ id: "x", position: 0, value: "" }, 50)).toBe(3)
  })
  it("double-view (run with empty result): tight notification-only bottom", () => {
    // result.results = [] (empty after run) → bottom = NOTIFICATION_PX (44).
    // 72 + 56 + 44 = 172 → ceil(172/50) = 4
    expect(
      computeCellGridH(
        {
          id: "x",
          position: 0,
          value: "",
          result: { results: [], activeResultIndex: 0, timestamp: 0 },
        },
        50,
      ),
    ).toBe(4)
  })
  it("respects explicit topHeight and bottomHeight overrides", () => {
    // 200 + 56 + 300 = 556 → ceil(556/50) = 12
    expect(
      computeCellGridH(
        {
          id: "x",
          position: 0,
          value: "",
          topHeight: 200,
          bottomHeight: 300,
          result: { results: [], activeResultIndex: 0, timestamp: 0 },
        },
        50,
      ),
    ).toBe(12)
  })
  it("draw cell uses chart default 350 when bottomHeight is unset", () => {
    // 72 + 56 + 350 = 478 → ceil(478/50) = 10
    expect(
      computeCellGridH({ id: "x", position: 0, value: "", mode: "draw" }, 50),
    ).toBe(10)
  })
  it("returns at least 1 row even for an empty cell", () => {
    expect(
      computeCellGridH({ id: "x", position: 0, value: "", topHeight: 0 }, 50),
    ).toBeGreaterThanOrEqual(1)
  })
  it("accounts for marginY (inter-row gaps from react-grid-layout)", () => {
    // Same cell as the "respects explicit … overrides" test above
    // (topHeight=200, bottomHeight=300, chrome=56 → totalPx=556).
    // With rowHeight=10 and NO margin: 556/10 = 56 rows. With marginY=20,
    // each row occupies (10+20)=30 px effective, so h = ceil((556+20)/30)
    // = ceil(576/30) = 20. Rendered px = 20*10 + 19*20 = 200 + 380 = 580,
    // which fits the 556-px content. Without the marginY term, h would
    // be 56 → rendered 56*10 + 55*20 = 1660 px (~3× too tall).
    expect(
      computeCellGridH(
        {
          id: "x",
          position: 0,
          value: "",
          topHeight: 200,
          bottomHeight: 300,
          result: { results: [], activeResultIndex: 0, timestamp: 0 },
        },
        10,
        20,
      ),
    ).toBe(20)
  })
})

describe("buildAppliedLayout", () => {
  it("uses request.grid when provided, otherwise derives h from topHeight + bottomHeight", () => {
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
      { gridCols: 12, rowHeight: 50 },
    )
    expect(layout[0]).toEqual({ i: "a", x: 0, y: 0, w: 6, h: 4 })
    // Run-mode cell, no result yet → single-view → only topHeight (72) + chrome (40)
    // = 112 px → ceil(112 / 50) = 3 rows. Stacks below 'a' which had y+h = 4.
    expect(layout[1]).toEqual({ i: "b", x: 0, y: 4, w: 12, h: 3 })
  })

  it("preserves prevLayout entry when request omits grid", () => {
    const cells: NotebookCell[] = [{ id: "a", position: 0, value: "" }]
    const layout = buildAppliedLayout(
      { cells: [{ id: "a", value: "" }] },
      cells,
      [{ i: "a", x: 3, y: 4, w: 8, h: 5 }],
      { gridCols: 12, rowHeight: 50 },
    )
    expect(layout).toEqual([{ i: "a", x: 3, y: 4, w: 8, h: 5 }])
  })

  it("gives draw-mode cells a taller default than run-mode cells (no result yet)", () => {
    // buildAppliedCells seeds bottomHeight = DEFAULT_CHART_BOTTOM_HEIGHT for
    // draw cells, so they're double-view from creation. Run cells stay
    // single-view (no result) and only count topHeight + chrome.
    const cells: NotebookCell[] = [
      { id: "run-cell", position: 0, value: "", mode: "run" },
      {
        id: "draw-cell",
        position: 1,
        value: "",
        mode: "draw",
        bottomHeight: 350,
      },
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
      { gridCols: 12, rowHeight: 50 },
    )
    // run: 72 + 40 = 112 → 3 rows
    expect(layout[0].h).toBe(3)
    // draw: 72 + 350 + 40 = 462 → 10 rows
    expect(layout[1].h).toBe(10)
    expect(layout[1].y).toBe(3) // stacked below the run cell
  })
})

describe("upsertColumnSizing", () => {
  it("creates the map when no prior sizing exists", () => {
    const out = upsertColumnSizing(undefined, "select 1", { col_0: 200 })
    expect(out).toEqual({ "select 1": { col_0: 200 } })
  })

  it("overwrites an existing entry under the same key", () => {
    const prev = { "select 1": { col_0: 100 } }
    const out = upsertColumnSizing(prev, "select 1", { col_0: 300, col_1: 150 })
    expect(out).toEqual({ "select 1": { col_0: 300, col_1: 150 } })
  })

  it("moves an updated key to the tail (most-recent)", () => {
    // Iteration order = insertion order. Re-inserting "a" should put it last.
    const prev = {
      a: { col_0: 1 },
      b: { col_0: 2 },
      c: { col_0: 3 },
    }
    const out = upsertColumnSizing(prev, "a", { col_0: 99 })
    expect(Object.keys(out ?? {})).toEqual(["b", "c", "a"])
  })

  it("evicts oldest entries when exceeding the LRU cap", () => {
    let acc: ReturnType<typeof upsertColumnSizing> = undefined
    for (let i = 0; i < 25; i++) {
      acc = upsertColumnSizing(acc, `q${i}`, { col_0: i }, 20)
    }
    const keys = Object.keys(acc ?? {})
    // Earliest 5 (q0..q4) dropped; newest 20 (q5..q24) retained, q24 last.
    expect(keys).toHaveLength(20)
    expect(keys[0]).toBe("q5")
    expect(keys[19]).toBe("q24")
  })

  it("never mutates the input", () => {
    const prev = { a: { col_0: 1 } }
    const frozen = Object.freeze(prev)
    expect(() => upsertColumnSizing(frozen, "b", { col_0: 2 })).not.toThrow()
    expect(prev).toEqual({ a: { col_0: 1 } })
  })
})
