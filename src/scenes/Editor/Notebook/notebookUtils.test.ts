import { describe, it, expect } from "vitest"
import {
  ApplyNotebookStateError,
  buildAppliedNotebookState,
  attachScriptSummary,
  autoRefreshIntervalMs,
  autoRefreshLabel,
  AUTO_REFRESH_OPTIONS,
  isAutoRefresh,
  resolveCellView,
  resolveRunAction,
  buildAppliedCells,
  buildAppliedLayout,
  buildInitialScriptResults,
  buildPersistPayload,
  capResultBytes,
  cancelAllInCell,
  cancelOneInCell,
  cellHeightPatchForRows,
  cellToolbarMenuFlags,
  cellToolbarTier,
  cloneNotebookViewState,
  computeAgentCellGridH,
  computeCellGridH,
  computeCellHeights,
  computeResultBottomHeight,
  DEFAULT_CHART_BOTTOM_HEIGHT,
  duplicateCellAt,
  generateDefaultLayout,
  hasAgentVisibleCellHeightChanged,
  insertCell,
  isDoubleView,
  isExpectingResult,
  isUnverifiableExecError,
  mergeCellLayout,
  MIN_MARKDOWN_HEIGHT_PX,
  modeChangeBottomHeightPatch,
  nextCopyLabel,
  nextGridSeedPosition,
  partitionCellHeights,
  patchCellRunResult,
  removeCell,
  resolveRunCompletion,
  scaleCellHeights,
  setResultAt,
  singleResultFromExec,
  snapMarkdownTopHeight,
  summarizeCellResults,
  sqlHash,
  stripCellResults,
  swapCellDown,
  swapCellUp,
  upsertCellLayout,
} from "./notebookUtils"
import type {
  NotebookCell,
  NotebookViewState,
  SingleQueryResult,
} from "../../../store/notebook"
import {
  createDefaultNotebookViewState,
  MAX_NOTEBOOK_CELLS,
} from "../../../store/notebook"
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

describe("singleResultFromExec — notice results", () => {
  it("passes the notice through on dql results and omits the key otherwise", () => {
    // Given a notice-carrying exec result
    const exec = {
      type: "dql" as const,
      query: "Q",
      columns: [{ name: "x", type: "INT" }],
      dataset: [[1]],
      count: 1,
      notice: "partition converted",
    }
    // When it is mapped to a cell result
    const withNotice = singleResultFromExec(exec, "Q")
    // Then the notice survives, and plain dql results never gain the key
    expect(withNotice).toMatchObject({
      type: "dql",
      notice: "partition converted",
    })
    const plain = singleResultFromExec({ ...exec, notice: undefined }, "Q")
    expect("notice" in plain).toBe(false)
  })
})

describe("summarizeCellResults — notice results", () => {
  const cellWith = (notice: string) => ({
    id: "a",
    position: 0,
    value: "Q",
    result: {
      results: [
        {
          type: "dql" as const,
          query: "Q",
          columns: [{ name: "x", type: "INT" }],
          dataset: [[1]],
          count: 1,
          notice,
        },
      ],
      activeResultIndex: 0,
      timestamp: 0,
    },
  })

  it("keeps the run successful and surfaces the notice to the agent", () => {
    // When a notice-carrying DQL is summarized
    const summary = summarizeCellResults(cellWith("partition converted"))
    // Then it still counts as success and names the notice
    expect(summary.success).toBe(true)
    expect(summary.results).toEqual(["success (NOTICE: partition converted)"])
  })

  it("trims a long notice to 200 chars", () => {
    const summary = summarizeCellResults(cellWith("x".repeat(300)))
    expect(summary.results[0].length).toBeLessThanOrEqual(
      "success (NOTICE: )".length + 200,
    )
    expect(summary.results[0].endsWith("...)")).toBe(true)
  })
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

describe("isUnverifiableExecError", () => {
  // Abort / transport / parse failures carry no server verdict → the write may
  // have committed → unverifiable (route through cancelled, not a retryable error).
  it("flags abort and transport-level errors (no server verdict)", () => {
    for (const error of [
      "Cancelled by user",
      "An error occurred, please try again",
      "Failed to read response: TypeError",
      "Invalid JSON response from the server: x",
      "QuestDB is not reachable [504]",
    ]) {
      expect(isUnverifiableExecError({ type: "error", error })).toBe(true)
    }
  })

  it("does NOT flag a real server error (definitively did not commit)", () => {
    expect(
      isUnverifiableExecError({
        type: "error",
        error: "table does not exist [table=trades]",
      }),
    ).toBe(false)
  })

  it("does NOT flag non-error results", () => {
    expect(isUnverifiableExecError({ type: "dml" })).toBe(false)
    expect(isUnverifiableExecError({ type: "dql" })).toBe(false)
    expect(isUnverifiableExecError({ type: "error" })).toBe(false)
  })
})

describe("resolveRunCompletion", () => {
  const runningResult = {
    results: [{ type: "running" as const, query: "SELECT 1" }],
    activeResultIndex: 0,
    timestamp: 0,
  }

  it("rolls back a user run after an external SQL edit clears its result", () => {
    // Given a user run whose SQL and in-flight result were replaced externally
    const liveCell = { value: "SELECT 2", result: null }

    // When the run completes
    const decision = resolveRunCompletion(liveCell, "SELECT 1", false)

    // Then the stale execution is rolled back instead of committed
    expect(decision).toBe("cell_changed")
  })

  it("keeps a user run when the user edits its SQL during execution", () => {
    // Given a direct editor change that leaves the in-flight result present
    const liveCell = { value: "SELECT 2", result: runningResult }

    // When the run completes
    const decision = resolveRunCompletion(liveCell, "SELECT 1", false)

    // Then the result of the user's explicit run can still be committed
    expect(decision).toBe("commit")
  })

  it("discards an agent run when its result was cleared", () => {
    // Given an agent run whose result was cleared during execution
    const liveCell = { value: "SELECT 1", result: null }

    // When the run completes with full-value attribution required
    const decision = resolveRunCompletion(liveCell, "SELECT 1", true)

    // Then it cannot resurrect the cleared result
    expect(decision).toBe("result_cleared")
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

  // The stripped result is the only run signal an unmounted notebook can report
  // to the agent — record it so a committed write isn't read back as "none".
  it("records lastRunStatus from the result before stripping", () => {
    const committed: NotebookCell[] = [
      cell("a", "INSERT INTO t VALUES(1)", {
        results: [{ type: "dml", query: "INSERT INTO t VALUES(1)" }],
        activeResultIndex: 0,
        timestamp: 0,
      }),
      cell("b", "SELECT 2"),
    ]
    const out = stripCellResults(committed)
    expect(out[0].result).toBeUndefined()
    expect(out[0].lastRunStatus).toBe("success")
    // never-run cell gets no run status
    expect(out[1].lastRunStatus).toBeUndefined()
  })

  // A run still in-flight at persist time was interrupted by the unmount; an
  // aborted write may have committed, so persist "cancelled" (→ unverified on
  // re-read), never a perpetual "running" the agent would re-run into a dup.
  it("persists an in-flight (running) result as cancelled", () => {
    const inFlight: NotebookCell[] = [
      cell("a", "INSERT INTO t SELECT * FROM big", {
        results: [
          { type: "running", query: "INSERT INTO t SELECT * FROM big" },
        ],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ]
    expect(stripCellResults(inFlight)[0].lastRunStatus).toBe("cancelled")
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
      cells: [{ ...cells[0], result: undefined, lastRunStatus: "cancelled" }],
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

  it("drops the `result` blob but carries the persisted run status onto the copy", () => {
    const original: NotebookCell = {
      ...cell("a", "INSERT INTO t VALUES (1)"),
      lastRunStatus: "success",
    }
    const out = duplicateCellAt([original], "a", "new-id")
    const copy = out[1]
    expect(copy.id).toBe("new-id")
    expect(copy.result).toBe(null)
    // the copy's write already ran via the original; agents read this from
    // last_run_status before deciding on an explicit run_cell
    expect(copy.lastRunStatus).toBe("success")
  })

  it("collapses a live result into the copy's run status", () => {
    const original: NotebookCell = {
      ...cell("a", "INSERT INTO t VALUES (1)"),
      result: {
        results: [{ type: "dml", query: "INSERT INTO t VALUES (1)" }],
        activeResultIndex: 0,
        timestamp: 0,
      },
    }
    const out = duplicateCellAt([original], "a", "new-id")
    expect(out[1].result).toBe(null)
    expect(out[1].lastRunStatus).toBe("success")
  })

  it("keeps the copy of a never-run cell eligible for auto-run", () => {
    const out = duplicateCellAt([cell("a", "SELECT 1")], "a", "new-id")
    expect(out[1].lastRunStatus).toBeUndefined()
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

  it("sets a cell name on create, then clears it on update with null (PUT)", () => {
    // Given a fresh cell created with a name
    const { nextCells: created } = buildAppliedCells([], {
      cells: [{ value: "SELECT 1", name: "BTC price" }],
    })
    expect(created[0].name).toBe("BTC price")

    // When the cell is re-applied with name: null
    const { nextCells: cleared } = buildAppliedCells(created, {
      cells: [{ id: created[0].id, value: "SELECT 1", name: null }],
    })
    // Then the name is dropped (apply is a full PUT, no preservation)
    expect(cleared[0].name).toBeUndefined()
  })

  it("does not preserve an existing name when name is omitted (PUT reset)", () => {
    // Given an existing named cell
    const prev: NotebookCell[] = [
      { id: "a", position: 0, value: "x", name: "Mine" },
    ]

    // When re-applied without a name field
    const { nextCells } = buildAppliedCells(prev, {
      cells: [{ id: "a", value: "x" }],
    })
    // Then the name is reset (apply describes the cell in full)
    expect(nextCells[0].name).toBeUndefined()
  })

  it("rejects a cell name over the length limit", () => {
    // Given an apply request whose cell name exceeds the 100-character limit
    // When the cells are built
    // Then it throws rather than persisting the oversized name
    expect(() =>
      buildAppliedCells([], {
        cells: [{ value: "SELECT 1", name: "a".repeat(101) }],
      }),
    ).toThrow(/over the 100-character limit/)
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

  it("preserves run history as lastRunStatus when a value change drops the result", () => {
    // A run cell carries its outcome only in the live `result` during a
    // session; dropping it on a value change must collapse to lastRunStatus so
    // agents still see that the cell ran.
    const prev: NotebookCell[] = [
      {
        id: "a",
        position: 0,
        value: "INSERT INTO t VALUES (1)",
        result: {
          results: [{ type: "dml", query: "INSERT INTO t VALUES (1)" }],
          activeResultIndex: 0,
          timestamp: 0,
        },
      },
    ]
    const { nextCells } = buildAppliedCells(prev, {
      cells: [{ id: "a", value: "INSERT INTO t  VALUES (1)" }],
    })
    expect(nextCells[0].result).toBeNull()
    expect(nextCells[0].lastRunStatus).toBe("success")
  })

  it("resets lastRunStatus when a value change drops an error result", () => {
    // Given a cell that errored on its previous SQL
    const prev: NotebookCell[] = [
      {
        id: "a",
        position: 0,
        value: "SELECT * FROM missing",
        result: {
          results: [
            { type: "error", query: "SELECT * FROM missing", error: "boom" },
          ],
          activeResultIndex: 0,
          timestamp: 0,
        },
      },
    ]
    // When the SQL is fixed via apply_notebook_state
    const { nextCells } = buildAppliedCells(prev, {
      cells: [{ id: "a", value: "SELECT * FROM fx_trades" }],
    })
    // Then the stale error must not leak onto the fixed, not-yet-rerun cell
    expect(nextCells[0].result).toBeNull()
    expect(nextCells[0].lastRunStatus).toBeUndefined()
  })

  it("resets a persisted error status when the SQL changes", () => {
    // Given a passive cell whose error survives only as persisted run history
    const prev: NotebookCell[] = [
      {
        id: "a",
        position: 0,
        value: "SELECT * FROM missing",
        lastRunStatus: "error",
      },
    ]

    // When the SQL is fixed without a live result blob
    const { nextCells } = buildAppliedCells(prev, {
      cells: [{ id: "a", value: "SELECT * FROM fx_trades" }],
    })

    // Then the previous SQL's error is cleared
    expect(nextCells[0].lastRunStatus).toBeUndefined()
  })

  it("preserveValue keeps the existing cell's value, result, and run history", () => {
    const prev: NotebookCell[] = [
      {
        id: "a",
        position: 0,
        value: "INSERT INTO t VALUES (1)",
        result: {
          results: [{ type: "dml", query: "INSERT INTO t VALUES (1)" }],
          activeResultIndex: 0,
          timestamp: 0,
        },
      },
    ]
    const { nextCells } = buildAppliedCells(prev, {
      cells: [{ id: "a", preserveValue: true }],
    })
    expect(nextCells[0].value).toBe("INSERT INTO t VALUES (1)")
    expect(nextCells[0].result).toBe(prev[0].result)
  })

  it("rejects a cell providing both value and preserveValue", () => {
    const prev: NotebookCell[] = [{ id: "a", position: 0, value: "SELECT 1" }]
    expect(() =>
      buildAppliedCells(prev, {
        cells: [{ id: "a", value: "SELECT 2", preserveValue: true }],
      }),
    ).toThrow(/exactly one/)
  })

  it("rejects a cell providing neither value nor preserveValue", () => {
    const prev: NotebookCell[] = [{ id: "a", position: 0, value: "SELECT 1" }]
    expect(() => buildAppliedCells(prev, { cells: [{ id: "a" }] })).toThrow(
      /has no value/,
    )
  })

  it("rejects preserveValue on a new cell", () => {
    const prev: NotebookCell[] = [{ id: "a", position: 0, value: "SELECT 1" }]
    expect(() =>
      buildAppliedCells(prev, {
        cells: [{ id: "a", value: "SELECT 1" }, { preserveValue: true }],
      }),
    ).toThrow(/without an existing cell id/)
  })

  it("rejects a request that would exceed the 50-cell limit", () => {
    const prev: NotebookCell[] = []
    expect(() =>
      buildAppliedCells(prev, {
        cells: Array.from({ length: 51 }, () => ({ value: "SELECT 1" })),
      }),
    ).toThrow(/at most 50/)
  })

  it("accepts a request of exactly 50 cells", () => {
    const prev: NotebookCell[] = []
    const { nextCells } = buildAppliedCells(prev, {
      cells: Array.from({ length: 50 }, () => ({ value: "SELECT 1" })),
    })
    expect(nextCells).toHaveLength(50)
  })

  it("rejects a cell whose value exceeds the line limit", () => {
    const prev: NotebookCell[] = []
    const hugeValue = Array(100_000).fill("x").join("\n")
    expect(() =>
      buildAppliedCells(prev, { cells: [{ value: hugeValue }] }),
    ).toThrow(/line limit/)
  })

  it("allows preserving an existing over-limit cell unchanged", () => {
    const hugeValue = Array(100_000).fill("x").join("\n")
    const prev: NotebookCell[] = [{ id: "a", position: 0, value: hugeValue }]
    const { nextCells } = buildAppliedCells(prev, {
      cells: [{ id: "a", preserveValue: true }],
    })
    expect(nextCells[0].value).toBe(hugeValue)
  })

  it("exempts markdown cells from the line limit", () => {
    const prev: NotebookCell[] = []
    const hugeValue = Array(100_000).fill("x").join("\n")
    const { nextCells } = buildAppliedCells(prev, {
      cells: [{ value: hugeValue, type: "markdown" }],
    })
    expect(nextCells[0].value).toBe(hugeValue)
  })

  it("rejects preserving an over-limit markdown cell flipped to sql", () => {
    const hugeValue = Array(100_000).fill("x").join("\n")
    const prev: NotebookCell[] = [
      { id: "a", position: 0, value: hugeValue, type: "markdown" },
    ]
    expect(() =>
      buildAppliedCells(prev, {
        cells: [{ id: "a", preserveValue: true, type: "sql" }],
      }),
    ).toThrow(/line limit/)
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

  it("throws on a supplied unknown id instead of creating it (would silently delete omitted cells)", () => {
    const prev: NotebookCell[] = [
      { id: "real-a", position: 0, value: "a" },
      {
        id: "real-b",
        position: 1,
        value: "IMPORTANT",
        result: dql("IMPORTANT"),
      },
    ]
    expect(() =>
      buildAppliedCells(prev, {
        cells: [
          { id: "real-a", value: "a" },
          { id: "typo-b", value: "b" }, // mistyped id — must throw, not create + drop real-b
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

  it("defaults isViewMaximized and autoRefresh to true on new draw cells", () => {
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
    expect(nextCells[0].isViewMaximized).toBe(true)
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

  it("preserves an existing mode while clearing omitted PUT fields", () => {
    // Given an existing run cell with optional chart presentation fields
    const prev: NotebookCell[] = [
      {
        id: "a",
        position: 0,
        value: "SELECT 1",
        mode: "run",
        autoRefresh: "5s",
        isViewMaximized: true,
        chartConfig: {
          xColumn: "ts",
          queries: [{ type: "line", yColumns: ["v"] }],
        },
      },
    ]

    // When apply omits mode and the other presentation fields
    const { nextCells } = buildAppliedCells(prev, {
      cells: [{ id: "a", value: "SELECT 1" }], // bare cell — everything omitted
    })

    // Then mode is sticky while the documented PUT fields are cleared
    expect(nextCells[0].mode).toBe("run")
    expect(nextCells[0].chartConfig).toBeUndefined()
    expect(nextCells[0].autoRefresh).toBeUndefined()
    expect(nextCells[0].isViewMaximized).toBeUndefined()
  })

  it("preserves draw mode when apply omits mode and supplies its full chart", () => {
    // Given an existing draw cell
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

    // When apply omits mode but re-sends the full chart configuration
    const { nextCells } = buildAppliedCells(prev, {
      cells: [
        {
          id: "a",
          value: "SELECT 2",
          chartConfig: {
            xColumn: "ts",
            queries: [{ type: "line", yColumns: ["v"] }],
          },
        },
      ],
    })

    // Then the cell remains a draw cell
    expect(nextCells[0].mode).toBe("draw")
  })

  it("applies a fixed refresh interval to a draw cell and defaults to adaptive when omitted", () => {
    // Given a draw cell created with a 5s fixed interval
    const drawCell = {
      value: "SELECT 1",
      mode: "draw" as const,
      chartConfig: {
        xColumn: "ts",
        queries: [{ type: "line" as const, yColumns: ["v"] }],
      },
    }
    const created = buildAppliedCells([], {
      cells: [{ ...drawCell, autoRefresh: "5s" as const }],
    }).nextCells
    expect(created[0].autoRefresh).toBe("5s")

    // When the cell is re-applied (PUT) without auto_refresh
    const { nextCells } = buildAppliedCells(created, {
      cells: [{ ...drawCell, id: created[0].id }],
    })
    // Then a draw cell defaults back to adaptive (true)
    expect(nextCells[0].autoRefresh).toBe(true)
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
        isViewMaximized: true,
      }),
    ).toBe(true)
  })
})

describe("computeResultBottomHeight", () => {
  // Layout constants (kept in sync with notebookUtils.ts):
  //   TAB_BAR_PX            = 40
  //   NOTIFICATION_PX       = 44
  //   RESULT_ACTIONS_BAR_PX = 36
  //   HEADER_HEIGHT         = 44
  //   ROW_HEIGHT            = 30
  //   MAX_RESERVED_ROWS     = 10

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

  it("single DQL with columns but 0 rows → notification + actions bar + header (no rows)", () => {
    // The column headers show even with no rows: 44 + 36 + 44 + 0*30 = 124.
    expect(
      computeResultBottomHeight({
        results: [
          {
            type: "dql",
            query: "SELECT 1",
            columns: [{ name: "x", type: "INT" }],
            dataset: [],
            count: 0,
          },
        ],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ).toBe(124)
  })

  it("single DQL with no columns → notification-only", () => {
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
          columns: [{ name: "x", type: "INT" }],
          dataset: Array.from({ length: rowCount }, () => [1]),
          count: rowCount,
        },
      ],
      activeResultIndex: 0,
      timestamp: 0,
    })
    // 1 row: 44 + 36 + 44 + 1*30 = 154
    expect(computeResultBottomHeight(make(1))).toBe(154)
    // 5 rows: 44 + 36 + 44 + 5*30 = 274
    expect(computeResultBottomHeight(make(5))).toBe(274)
    // 10 rows: 44 + 36 + 44 + 10*30 = 424
    expect(computeResultBottomHeight(make(10))).toBe(424)
    // 50 rows: cap at 10 → still 424
    expect(computeResultBottomHeight(make(50))).toBe(424)
  })

  it("multi-statement, first DQL with rows → tab + notification + header + 10 rows", () => {
    // 40 + 44 + 36 + 44 + 10*30 = 464
    expect(
      computeResultBottomHeight({
        results: [
          {
            type: "dql",
            query: "Q1",
            columns: [{ name: "x", type: "INT" }],
            dataset: [[1]],
            count: 1,
          },
          { type: "ddl", query: "Q2" },
        ],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ).toBe(464)
  })

  it("multi-statement, first is error → tab + notification only (no grid to show)", () => {
    // 40 + 44 = 84
    expect(
      computeResultBottomHeight({
        results: [
          { type: "error", query: "Q1", error: "boom" },
          {
            type: "dql",
            query: "Q2",
            columns: [{ name: "x", type: "INT" }],
            dataset: [[1]],
            count: 1,
          },
        ],
        activeResultIndex: 1,
        timestamp: 0,
      }),
    ).toBe(84)
  })

  it("multi-statement, first DQL with columns but 0 rows → tab + full grid block", () => {
    // The first query shows its column headers, so we reserve the grid block
    // like any DQL-first script: 40 + 44 + 36 + 44 + 10*30 = 464.
    expect(
      computeResultBottomHeight({
        results: [
          {
            type: "dql",
            query: "Q1",
            columns: [{ name: "x", type: "INT" }],
            dataset: [],
            count: 0,
          },
          {
            type: "dql",
            query: "Q2",
            columns: [{ name: "x", type: "INT" }],
            dataset: [[1]],
            count: 1,
          },
        ],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ).toBe(464)
  })
})

describe("computeCellHeights", () => {
  const cell = (over = {}) => ({ id: "x", position: 0, value: "", ...over })

  it("single-view (run, no result): default editor, zero bottom", () => {
    expect(computeCellHeights(cell())).toEqual({
      topHeight: 72,
      bottomHeight: 0,
    })
  })
  it("uses persisted topHeight / bottomHeight when present", () => {
    expect(
      computeCellHeights(
        cell({
          topHeight: 200,
          bottomHeight: 300,
          result: { results: [], activeResultIndex: 0, timestamp: 0 },
        }),
      ),
    ).toEqual({ topHeight: 200, bottomHeight: 300 })
  })
  it("draw cell defaults the bottom to the chart height", () => {
    expect(computeCellHeights(cell({ mode: "draw" }))).toEqual({
      topHeight: 72,
      bottomHeight: 350,
    })
  })
  it("double-view (empty result) defaults to the notification-only height", () => {
    expect(
      computeCellHeights(
        cell({ result: { results: [], activeResultIndex: 0, timestamp: 0 } }),
      ),
    ).toEqual({ topHeight: 72, bottomHeight: 44 })
  })
  it("expectingResult reserves the result area when bottomHeight is unset", () => {
    expect(
      computeCellHeights(cell({ lastRunStatus: "success" }), {
        expectingResult: true,
      }),
    ).toEqual({ topHeight: 72, bottomHeight: 424 })
  })
  it("live drag overrides win over persisted values", () => {
    expect(
      computeCellHeights(
        cell({
          topHeight: 200,
          bottomHeight: 300,
          result: { results: [], activeResultIndex: 0, timestamp: 0 },
        }),
        { liveTopHeight: 111, liveBottomHeight: 222 },
      ),
    ).toEqual({ topHeight: 111, bottomHeight: 222 })
  })
  it("keeps the bottom at zero in single-view regardless of live value", () => {
    expect(computeCellHeights(cell(), { liveBottomHeight: 999 })).toEqual({
      topHeight: 72,
      bottomHeight: 0,
    })
  })
})

describe("scaleCellHeights", () => {
  it("scales both heights proportionally to the new content", () => {
    expect(scaleCellHeights(200, 200, 200, 72, 88)).toEqual({
      top: 100,
      bottom: 100,
    })
  })
  it("clamps the bottom to its minimum and gives the rest to the top", () => {
    expect(scaleCellHeights(400, 100, 200, 72, 88)).toEqual({
      top: 112,
      bottom: 88,
    })
  })
  it("clamps the top to its minimum and gives the rest to the bottom", () => {
    expect(scaleCellHeights(100, 400, 200, 72, 88)).toEqual({
      top: 72,
      bottom: 128,
    })
  })
  it("never shrinks below the combined minimum, even when asked smaller", () => {
    expect(scaleCellHeights(400, 200, 50, 72, 88)).toEqual({
      top: 72,
      bottom: 88,
    })
  })
  it("falls back to scale 1 when the old content is zero", () => {
    expect(scaleCellHeights(0, 0, 300, 72, 88)).toEqual({
      top: 72,
      bottom: 228,
    })
  })
})

describe("partitionCellHeights", () => {
  it("keeps the requested top and gives the remainder to the bottom", () => {
    expect(partitionCellHeights(300, 200, 72, 88)).toEqual({
      top: 200,
      bottom: 100,
    })
  })
  it("raises the top to its minimum when requested below it", () => {
    expect(partitionCellHeights(300, 40, 72, 88)).toEqual({
      top: 72,
      bottom: 228,
    })
  })
  it("shrinks the top once the bottom would drop below its minimum", () => {
    expect(partitionCellHeights(300, 260, 72, 88)).toEqual({
      top: 212,
      bottom: 88,
    })
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
  it("expectingResult reserves the result area when bottomHeight is unset", () => {
    // RESERVED_RESULT_BOTTOM_HEIGHT = 44 + 36 + 44 + 10*30 = 424.
    // 72 + 56 + 424 = 552 → ceil(552/50) = 12
    expect(
      computeCellGridH(
        { id: "x", position: 0, value: "", lastRunStatus: "success" },
        50,
        0,
        true,
      ),
    ).toBe(12)
  })
  it("expectingResult uses the cell's own bottomHeight when set", () => {
    // 72 + 56 + 300 = 428 → ceil(428/50) = 9
    expect(
      computeCellGridH(
        {
          id: "x",
          position: 0,
          value: "",
          bottomHeight: 300,
          lastRunStatus: "success",
        },
        50,
        0,
        true,
      ),
    ).toBe(9)
  })
  it("expectingResult is ignored once a result is present (double-view wins)", () => {
    // Same as the "double-view (run with empty result)" case: bottom = 44.
    expect(
      computeCellGridH(
        {
          id: "x",
          position: 0,
          value: "",
          result: { results: [], activeResultIndex: 0, timestamp: 0 },
        },
        50,
        0,
        true,
      ),
    ).toBe(4)
  })
})

describe("markdown cell grid lattice", () => {
  const markdown = (patch: Partial<NotebookCell> = {}): NotebookCell => ({
    id: "m",
    position: 0,
    value: "",
    type: "markdown",
    ...patch,
  })

  it("snapMarkdownTopHeight snaps content height up to the next lattice point", () => {
    // Given 10px rows, 20px margins and 42px markdown chrome, on-lattice
    // content heights are 28, 58, 88, …
    // When the measured content falls between points
    // Then it snaps up to the next one
    expect(snapMarkdownTopHeight(36)).toBe(58)
    expect(snapMarkdownTopHeight(59)).toBe(88)
  })

  it("snapMarkdownTopHeight is idempotent on lattice points", () => {
    expect(snapMarkdownTopHeight(58)).toBe(58)
    expect(snapMarkdownTopHeight(88)).toBe(88)
  })

  it("snapMarkdownTopHeight floors at the markdown minimum", () => {
    expect(snapMarkdownTopHeight(0)).toBe(MIN_MARKDOWN_HEIGHT_PX)
    expect(snapMarkdownTopHeight(10)).toBe(MIN_MARKDOWN_HEIGHT_PX)
  })

  it("a fresh markdown cell derives an exact 4-row box from its 58px default", () => {
    // Given a markdown cell with no stored topHeight
    // When grid h derives from the 58px default + 42px markdown chrome
    // Then 58 + 42 = 100px = exactly 4 rows (4×10 + 3×20), zero slack
    expect(computeCellGridH(markdown(), 10, 20)).toBe(4)
  })

  it("uses markdown chrome (42) instead of SQL chrome (56)", () => {
    // With SQL chrome, 58 + 56 = 114px would round up to 5 rows
    expect(computeCellGridH(markdown({ topHeight: 58 }), 10, 20)).toBe(4)
  })

  it("cellHeightPatchForRows back-solves markdown rows with markdown chrome", () => {
    // Given a markdown cell rendered at 4 rows
    const cell = markdown({ topHeight: 58 })
    // When the user drags the cell to 7 rows (7×10 + 6×20 = 190px box)
    const patch = cellHeightPatchForRows(cell, 7, 10, 20)
    // Then content = 190 − 42 = 148, pinned like a manual drag
    expect(patch).toEqual({ topHeight: 148, topResized: true })
  })

  it("cellHeightPatchForRows floors a tiny markdown drag at the markdown minimum", () => {
    // Given a markdown cell rendered at 4 rows
    const cell = markdown({ topHeight: 58 })
    // When the user drags the cell down to 2 rows (40px box < 42px chrome)
    const patch = cellHeightPatchForRows(cell, 2, 10, 20)
    // Then the content floors at the markdown minimum, not the SQL 72px
    expect(patch).toEqual({
      topHeight: MIN_MARKDOWN_HEIGHT_PX,
      topResized: true,
    })
  })
})

describe("hasAgentVisibleCellHeightChanged", () => {
  const runCell: NotebookCell = {
    id: "x",
    position: 0,
    value: "",
    topHeight: 72,
  }

  it("ignores exact pixel changes within the same agent height breakpoint", () => {
    // Given a grid cell whose next pixel height maps to its current h
    const currentH = computeAgentCellGridH(runCell)
    const nextH = computeAgentCellGridH({ ...runCell, topHeight: 73 })

    // When the resize is checked against the agent-visible state
    const changed = hasAgentVisibleCellHeightChanged(
      runCell,
      { topHeight: 73, topResized: true },
      "grid",
    )

    // Then the pixel-only change does not stale the agent
    expect(nextH).toBe(currentH)
    expect(changed).toBe(false)
  })

  it("reports a grid resize that crosses an agent height breakpoint", () => {
    // Given a grid cell whose next pixel height maps to a different h
    const currentH = computeAgentCellGridH(runCell)
    const nextH = computeAgentCellGridH({ ...runCell, topHeight: 100 })

    // When the resize is checked against the agent-visible state
    const changed = hasAgentVisibleCellHeightChanged(
      runCell,
      { topHeight: 100, topResized: true },
      "grid",
    )

    // Then the agent is told to re-read the new breakpoint
    expect(nextH).not.toBe(currentH)
    expect(changed).toBe(true)
  })

  it("ignores list resize values because they are absent from agent state", () => {
    // Given a list cell with a large pixel height change
    const patch = { topHeight: 300, topResized: true }

    // When the resize is checked against the agent-visible state
    const changed = hasAgentVisibleCellHeightChanged(runCell, patch, "list")

    // Then the invisible height does not stale the agent
    expect(changed).toBe(false)
  })

  it("ignores split changes that preserve the agent-visible total height", () => {
    // Given a double-view grid cell whose editor and result heights trade space
    const splitCell: NotebookCell = {
      ...runCell,
      topHeight: 200,
      bottomHeight: 300,
      result: { results: [], activeResultIndex: 0, timestamp: 0 },
    }

    // When the split moves without changing the total cell height
    const changed = hasAgentVisibleCellHeightChanged(
      splitCell,
      { topHeight: 250, bottomHeight: 250 },
      "grid",
    )

    // Then the agent-visible h remains unchanged
    expect(changed).toBe(false)
  })
})

describe("cellHeightPatchForRows", () => {
  const withResult = (over: Partial<NotebookCell> = {}): NotebookCell => ({
    id: "x",
    position: 0,
    value: "",
    result: { results: [], activeResultIndex: 0, timestamp: 0 },
    ...over,
  })

  it("returns an empty patch when rows already match the derived height", () => {
    // Given a single-view run cell whose content-derived height is 5 rows
    const runCell: NotebookCell = { id: "x", position: 0, value: "" }
    // When the requested rows equal that derived height (not a real resize)
    const patch = cellHeightPatchForRows(runCell, 5, 10, 20)
    // Then nothing is pinned — auto-height is left intact
    expect(patch).toEqual({})
  })

  it("single-view: grows the editor and pins topResized", () => {
    // Given a single-view run cell (no bottom slot)
    const runCell: NotebookCell = { id: "x", position: 0, value: "" }
    // When a taller height is requested (targetContentPx = 30*10 - 76 = 224)
    const patch = cellHeightPatchForRows(runCell, 10, 10, 20)
    // Then the editor grows to fill it and is pinned
    expect(patch).toEqual({ topHeight: 224, topResized: true })
  })

  it("split double-view: resizes the result pane and pins bottomResized", () => {
    // Given a double-view cell (has result), not maximized
    const c = withResult({ topHeight: 72, bottomHeight: 100 })
    // When a taller height is requested (targetContentPx = 30*15 - 76 = 374)
    const patch = cellHeightPatchForRows(c, 15, 10, 20)
    // Then only the bottom slot grows (editor kept), pinned via bottomResized
    expect(patch).toEqual({ bottomHeight: 302, bottomResized: true })
  })

  it("maximized double-view: scales both panes and pins both", () => {
    // Given a maximized double-view cell
    const c = withResult({
      topHeight: 72,
      bottomHeight: 100,
      isViewMaximized: true,
    })
    // When a taller height is requested (targetContentPx = 374, scale ~2.174)
    const patch = cellHeightPatchForRows(c, 15, 10, 20)
    // Then editor and result scale together, both pinned
    expect(patch).toEqual({
      topHeight: 157,
      bottomHeight: 217,
      topResized: true,
      bottomResized: true,
    })
  })
})

describe("isExpectingResult", () => {
  const ranCell = {
    id: "x",
    position: 0,
    value: "select 1",
    lastRunStatus: "success" as const,
  }
  it("true for a hydrating run cell that ran but has no result yet", () => {
    expect(isExpectingResult(ranCell, true)).toBe(true)
  })
  it("false once hydration has settled", () => {
    expect(isExpectingResult(ranCell, false)).toBe(false)
  })
  it("false when a result has already landed", () => {
    expect(
      isExpectingResult(
        {
          ...ranCell,
          result: { results: [], activeResultIndex: 0, timestamp: 0 },
        },
        true,
      ),
    ).toBe(false)
  })
  it("false for a cell that never ran", () => {
    expect(isExpectingResult({ id: "x", position: 0, value: "" }, true)).toBe(
      false,
    )
    expect(isExpectingResult({ ...ranCell, lastRunStatus: "none" }, true)).toBe(
      false,
    )
  })
  it("false for draw cells (they size via the chart default)", () => {
    expect(isExpectingResult({ ...ranCell, mode: "draw" }, true)).toBe(false)
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

describe("cloneNotebookViewState", () => {
  const seqIds = () => {
    let i = 0
    return () => `new-${i++}`
  }

  const source = (): NotebookViewState => ({
    cells: [
      {
        id: "a",
        position: 0,
        value: "SELECT 1",
        topHeight: 120,
        lastRunStatus: "success",
      },
      {
        id: "b",
        position: 1,
        value: "SELECT 2",
        mode: "draw",
        autoRefresh: true,
        isViewMaximized: true,
        chartConfig: {
          xColumn: "ts",
          queries: [{ type: "line", yColumns: ["v"] }],
        },
        result: {
          results: [
            {
              type: "dql",
              query: "SELECT 2",
              columns: [],
              dataset: [],
              count: 0,
            },
          ],
          activeResultIndex: 0,
          timestamp: 0,
        },
      },
    ],
    maximizedCellId: "b",
    focusedCellId: "a",
    settings: {
      layoutMode: "grid",
      layout: [
        { i: "a", x: 0, y: 0, w: 6, h: 4 },
        { i: "b", x: 6, y: 0, w: 6, h: 4 },
      ],
      variables: [{ name: "x", value: "1" }],
    },
  })

  it("regenerates every cell id and preserves order/position/count", () => {
    const src = source()
    const out = cloneNotebookViewState(src, seqIds())
    expect(out.cells.map((c) => c.id)).toEqual(["new-0", "new-1"])
    expect(out.cells.map((c) => c.position)).toEqual([0, 1])
    const srcIds = new Set(src.cells.map((c) => c.id))
    expect(out.cells.every((c) => !srcIds.has(c.id))).toBe(true)
  })

  it("strips results but preserves structural fields and run history", () => {
    const out = cloneNotebookViewState(source(), seqIds())
    expect(out.cells[1].result).toBeUndefined()
    // cloned cells keep run history so auto-run never re-fires their writes
    expect(out.cells[0].lastRunStatus).toBe("success")
    expect(out.cells[1].lastRunStatus).toBe("success")
    expect(out.cells[0].topHeight).toBe(120)
    expect(out.cells[1].mode).toBe("draw")
    expect(out.cells[1].autoRefresh).toBe(true)
    expect(out.cells[1].isViewMaximized).toBe(true)
    expect(out.cells[1].chartConfig).toEqual({
      xColumn: "ts",
      queries: [{ type: "line", yColumns: ["v"] }],
    })
  })

  it("remaps settings.layout[].i to the new ids and keeps geometry", () => {
    const out = cloneNotebookViewState(source(), seqIds())
    expect(out.settings?.layout).toEqual([
      { i: "new-0", x: 0, y: 0, w: 6, h: 4 },
      { i: "new-1", x: 6, y: 0, w: 6, h: 4 },
    ])
    expect(out.settings?.layoutMode).toBe("grid")
  })

  it("drops orphan layout items that reference no cell", () => {
    const src = source()
    src.settings!.layout!.push({ i: "ghost", x: 0, y: 9, w: 1, h: 1 })
    const out = cloneNotebookViewState(src, seqIds())
    expect(out.settings?.layout).toHaveLength(2)
    expect(out.settings?.layout?.some((l) => l.i === "ghost")).toBe(false)
  })

  it("remaps maximizedCellId and focusedCellId", () => {
    const out = cloneNotebookViewState(source(), seqIds())
    expect(out.maximizedCellId).toBe("new-1")
    expect(out.focusedCellId).toBe("new-0")
  })

  it("copies variables by value, not by reference", () => {
    const src = source()
    const out = cloneNotebookViewState(src, seqIds())
    expect(out.settings?.variables).toEqual([{ name: "x", value: "1" }])
    expect(out.settings?.variables).not.toBe(src.settings?.variables)
  })

  it("does not mutate the source when the clone is edited", () => {
    const src = source()
    const out = cloneNotebookViewState(src, seqIds())
    out.cells[0].value = "EDITED"
    expect(src.cells[0].value).toBe("SELECT 1")
  })

  it("clones a default (single empty cell, no settings) notebook", () => {
    const out = cloneNotebookViewState(
      createDefaultNotebookViewState(),
      seqIds(),
    )
    expect(out.cells).toHaveLength(1)
    expect(out.cells[0].id).toBe("new-0")
    expect(out.settings).toBeUndefined()
    expect(out.maximizedCellId).toBeUndefined()
  })

  it("handles settings without a layout", () => {
    const src: NotebookViewState = {
      cells: [{ id: "a", position: 0, value: "x" }],
      settings: { variables: [{ name: "v", value: "1" }] },
    }
    const out = cloneNotebookViewState(src, seqIds())
    expect(out.settings?.layout).toBeUndefined()
    expect(out.settings?.variables).toEqual([{ name: "v", value: "1" }])
  })
})

describe("nextCopyLabel", () => {
  it("appends (copy) to a label with no copy suffix", () => {
    expect(nextCopyLabel("notebook")).toBe("notebook (copy)")
    expect(nextCopyLabel("My Notebook")).toBe("My Notebook (copy)")
  })

  it("bumps (copy) to (copy 2), not (copy) (copy)", () => {
    expect(nextCopyLabel("notebook (copy)")).toBe("notebook (copy 2)")
  })

  it("increments an existing numbered copy suffix", () => {
    expect(nextCopyLabel("notebook (copy 2)")).toBe("notebook (copy 3)")
    expect(nextCopyLabel("report (copy 9)")).toBe("report (copy 10)")
  })

  it("does not treat unrelated parentheses as a copy suffix", () => {
    expect(nextCopyLabel("my (draft) notebook")).toBe(
      "my (draft) notebook (copy)",
    )
  })
})

describe("capResultBytes", () => {
  const dql = (rows: number): Extract<SingleQueryResult, { type: "dql" }> => ({
    type: "dql",
    query: "q",
    columns: [{ name: "x", type: "INT" }],
    dataset: Array.from({ length: rows }, (_, i) => [i]),
    count: rows,
  })

  it("returns the result unchanged when under the byte cap", () => {
    const r = dql(5)
    expect(capResultBytes(r, 1_000_000)).toBe(r)
  })

  it("slices the dataset to fit the byte cap, preserving count", () => {
    const r = dql(100)
    const capped = capResultBytes(r, 50) // tiny cap
    expect(capped.type).toBe("dql")
    if (capped.type !== "dql") throw new Error("expected dql")
    expect(capped.dataset.length).toBeGreaterThanOrEqual(1)
    expect(capped.dataset.length).toBeLessThan(100)
    // kept rows are a prefix; count is left as the server-returned value so the
    // existing "X of Y rows" indicator still reflects truncation
    expect(capped.dataset).toEqual(r.dataset.slice(0, capped.dataset.length))
    expect(capped.count).toBe(100)
    expect(capped.truncated).toBe(true)
  })

  it("passes non-DQL and empty results through untouched", () => {
    const ddl: SingleQueryResult = { type: "ddl", query: "q" }
    expect(capResultBytes(ddl, 1)).toBe(ddl)
    const empty: SingleQueryResult = {
      type: "dql",
      query: "q",
      columns: [],
      dataset: [],
      count: 0,
    }
    expect(capResultBytes(empty, 1)).toBe(empty)
  })
})

describe("sqlHash", () => {
  it("is stable for the same SQL and differs for different SQL", () => {
    expect(sqlHash("select 1")).toBe(sqlHash("select 1"))
    expect(sqlHash("select 1")).not.toBe(sqlHash("select 2"))
    expect(typeof sqlHash("anything")).toBe("string")
  })
})

describe("isAutoRefresh", () => {
  it("accepts booleans and the fixed-interval tokens", () => {
    // Booleans are the 2.0.0-compatible auto/off values.
    expect(isAutoRefresh(true)).toBe(true)
    expect(isAutoRefresh(false)).toBe(true)
    expect(isAutoRefresh("5s")).toBe(true)
    expect(isAutoRefresh("1m")).toBe(true)
  })

  it("rejects unknown tokens and non-values", () => {
    expect(isAutoRefresh("2s")).toBe(false)
    expect(isAutoRefresh("")).toBe(false)
    expect(isAutoRefresh(5000)).toBe(false)
    expect(isAutoRefresh(null)).toBe(false)
    expect(isAutoRefresh(undefined)).toBe(false)
  })
})

describe("autoRefreshLabel", () => {
  it("labels true/false and shows the token verbatim for intervals", () => {
    expect(autoRefreshLabel(true)).toBe("Auto")
    expect(autoRefreshLabel(false)).toBe("Off")
    expect(autoRefreshLabel("5s")).toBe("5s")
    expect(autoRefreshLabel("1m")).toBe("1m")
  })
})

describe("autoRefreshIntervalMs", () => {
  it("maps a fixed token to milliseconds; true/false have no fixed interval", () => {
    expect(autoRefreshIntervalMs("1s")).toBe(1000)
    expect(autoRefreshIntervalMs("5s")).toBe(5000)
    expect(autoRefreshIntervalMs("1m")).toBe(60000)
    expect(autoRefreshIntervalMs(true)).toBeUndefined()
    expect(autoRefreshIntervalMs(false)).toBeUndefined()
  })
})

describe("resolveCellView", () => {
  const result = { results: [], activeResultIndex: 0, timestamp: 0 }
  it("is chart whenever the cell is in draw mode", () => {
    expect(resolveCellView({ mode: "draw" })).toBe("chart")
    // Draw wins even if a stale result is hanging around.
    expect(resolveCellView({ mode: "draw", result })).toBe("chart")
  })
  it("is grid for a run cell that has a result", () => {
    expect(resolveCellView({ mode: "run", result })).toBe("grid")
    expect(resolveCellView({ result })).toBe("grid")
  })
  it("is none for a run cell with no result", () => {
    expect(resolveCellView({ mode: "run" })).toBe("none")
    expect(resolveCellView({})).toBe("none")
  })
})

describe("resolveRunAction", () => {
  const result = { results: [], activeResultIndex: 0, timestamp: 0 }

  it("runs a single query, or all, for a run cell with a visible grid", () => {
    // Given a run cell whose grid is on screen
    const cell = { mode: "run" as const, result }
    const opts = { isCompactTier: false, showBottomSlot: true }
    // When the user presses Run All / Run
    // Then it runs all / one, without revealing anything
    expect(resolveRunAction(cell, { ...opts, intent: "all" })).toEqual({
      kind: "run-all",
      reveal: false,
      exitDraw: false,
    })
    expect(resolveRunAction(cell, { ...opts, intent: "single" })).toEqual({
      kind: "run-single",
      reveal: false,
      exitDraw: false,
    })
  })

  it("runs an empty run cell the same way, with nothing to reveal in wide tiers", () => {
    // Given a run cell with no result in a wide tier (none view)
    const cell = { mode: "run" as const }
    const opts = { isCompactTier: false, showBottomSlot: false }
    // When the user runs
    // Then it runs, and never reveals outside the compact tier
    expect(resolveRunAction(cell, { ...opts, intent: "all" })).toEqual({
      kind: "run-all",
      reveal: false,
      exitDraw: false,
    })
    expect(resolveRunAction(cell, { ...opts, intent: "single" })).toEqual({
      kind: "run-single",
      reveal: false,
      exitDraw: false,
    })
  })

  it("reveals a compact run cell whose grid is collapsed by View SQL", () => {
    // Given a compact run cell with the grid collapsed (View SQL active)
    const cell = { mode: "run" as const, result }
    const opts = { isCompactTier: true, showBottomSlot: false }
    // When the user runs
    // Then it reveals the grid first, then runs
    expect(resolveRunAction(cell, { ...opts, intent: "all" })).toEqual({
      kind: "run-all",
      reveal: true,
      exitDraw: false,
    })
    expect(resolveRunAction(cell, { ...opts, intent: "single" })).toEqual({
      kind: "run-single",
      reveal: true,
      exitDraw: false,
    })
  })

  it("refreshes the whole chart on Run All but ignores Run for a visible chart", () => {
    // Given a draw cell whose chart is on screen
    const cell = { mode: "draw" as const, result }
    const opts = { isCompactTier: false, showBottomSlot: true }
    // When the user presses Run All / Run
    // Then Run All refreshes the chart and Run is a no-op
    expect(resolveRunAction(cell, { ...opts, intent: "all" })).toEqual({
      kind: "chart",
    })
    expect(resolveRunAction(cell, { ...opts, intent: "single" })).toEqual({
      kind: "noop",
    })
  })

  it("treats a compact chart collapsed behind the editor as a grid, exiting draw", () => {
    // Given a compact draw cell with the chart collapsed (View SQL active)
    const cell = { mode: "draw" as const, result }
    const opts = { isCompactTier: true, showBottomSlot: false }
    // When the user presses Run All / Run from the editor
    // Then both reveal a grid and drop the cell out of draw — never the chart
    expect(resolveRunAction(cell, { ...opts, intent: "all" })).toEqual({
      kind: "run-all",
      reveal: true,
      exitDraw: true,
    })
    expect(resolveRunAction(cell, { ...opts, intent: "single" })).toEqual({
      kind: "run-single",
      reveal: true,
      exitDraw: true,
    })
  })
})

describe("cellToolbarTier", () => {
  it("is compact below the standard threshold", () => {
    // Given a cell narrower than 480px
    // When resolving the toolbar tier
    // Then it hides the Run/Draw toggles (compact)
    expect(cellToolbarTier(0, false)).toBe("compact")
    expect(cellToolbarTier(479, false)).toBe("compact")
  })

  it("is standard from 480px up to the expanded threshold", () => {
    // Given a cell at least 480px but under 720px wide
    // When resolving the toolbar tier
    // Then it shows the current Run/Draw toggles (standard)
    expect(cellToolbarTier(480, false)).toBe("standard")
    expect(cellToolbarTier(719, false)).toBe("standard")
  })

  it("is expanded from 720px up", () => {
    // Given a cell at least 720px wide
    // When resolving the toolbar tier
    // Then it shows the rich toolbar (expanded)
    expect(cellToolbarTier(720, false)).toBe("expanded")
    expect(cellToolbarTier(1200, false)).toBe("expanded")
  })

  it("is expanded when the cell is maximized, regardless of width", () => {
    // Given a maximized cell that is otherwise narrow
    // When resolving the toolbar tier
    // Then maximized forces the expanded toolbar
    expect(cellToolbarTier(0, true)).toBe("expanded")
    expect(cellToolbarTier(479, true)).toBe("expanded")
  })
})

describe("AUTO_REFRESH_OPTIONS", () => {
  it("lists the menu choices in order: auto, off, then intervals", () => {
    expect(AUTO_REFRESH_OPTIONS).toEqual([
      true,
      false,
      "1s",
      "5s",
      "10s",
      "30s",
      "1m",
    ])
  })
})

describe("cellToolbarMenuFlags", () => {
  const flags = (
    over: Partial<Parameters<typeof cellToolbarMenuFlags>[0]> = {},
  ) =>
    cellToolbarMenuFlags({
      tier: "compact",
      view: "none",
      isMarkdown: false,
      sqlShown: false,
      chartZoomed: false,
      isGridMode: false,
      cellIndex: 1,
      totalCells: 3,
      ...over,
    })

  it("compact none-view cell offers Run and Draw entry, nothing else in group A", () => {
    // Given a narrow SQL cell with no result yet
    const f = flags({ tier: "compact", view: "none" })
    // When resolving the menu
    // Then it offers the table (Run) and chart (Draw) entry points only
    expect(f.showViewTable).toBe(true)
    expect(f.showViewChart).toBe(true)
    expect(f.showViewSql).toBe(false)
    expect(f.showSplitItem).toBe(false)
    expect(f.showRefreshItem).toBe(false)
    expect(f.groupAHasItems).toBe(true)
    expect(f.groupBHasItems).toBe(false)
  })

  it("compact grid view offers View SQL and View chart, plus Refresh — never View table it already shows", () => {
    // Given a narrow cell currently showing the table
    const f = flags({ tier: "compact", view: "grid" })
    // Then the menu offers the two panes it is NOT showing, plus refresh
    expect(f.showViewSql).toBe(true)
    expect(f.showViewChart).toBe(true)
    expect(f.showViewTable).toBe(false)
    expect(f.showRefreshItem).toBe(true)
    expect(f.showChartSettings).toBe(false)
  })

  it("hides chart commands that reach the unmounted chart when compact View SQL is active", () => {
    // Given a compact chart cell collapsed to the editor (View SQL active),
    // which unmounts the DrawCanvas the chart commands publish events to
    const f = flags({
      tier: "compact",
      view: "chart",
      sqlShown: true,
      chartZoomed: true,
    })
    // Then the commands that would reach the now-unmounted chart are hidden…
    expect(f.showRefreshItem).toBe(false)
    expect(f.showChartSettings).toBe(false)
    expect(f.showResetZoom).toBe(false)
    // …but the interval submenu stays — it patches cell state, not the chart
    expect(f.showAutoRefreshItem).toBe(true)
    // …and View table / View chart still let the user bring a pane back
    expect(f.showViewTable).toBe(true)
    expect(f.showViewChart).toBe(true)
  })

  it("offers Reset zoom only for a zoomed chart in the compact tier", () => {
    // Given a zoomed chart: the wider tiers expose Reset zoom inline instead
    expect(
      flags({ tier: "compact", view: "chart", chartZoomed: true })
        .showResetZoom,
    ).toBe(true)
    expect(
      flags({ tier: "compact", view: "chart", chartZoomed: false })
        .showResetZoom,
    ).toBe(false)
    expect(
      flags({ tier: "standard", view: "chart", chartZoomed: true })
        .showResetZoom,
    ).toBe(false)
  })

  it("standard chart keeps interval/refresh/settings in the menu (only the view toggle is inline)", () => {
    // Given a standard-tier chart whose inline control is just the view toggle
    const f = flags({ tier: "standard", view: "chart" })
    // Then the menu carries the chart actions the inline toggle does not
    expect(f.showAutoRefreshItem).toBe(true)
    expect(f.showRefreshItem).toBe(true)
    expect(f.showChartSettings).toBe(true)
    expect(f.showSplitItem).toBe(false)
  })

  it("expanded tier never duplicates the inline refresh / interval / split controls", () => {
    // Given the expanded toolbar, which shows refresh + interval + split inline
    const chart = flags({ tier: "expanded", view: "chart" })
    const grid = flags({ tier: "expanded", view: "grid" })
    // Then the menu drops all of them, keeping only chart settings (chart only)
    expect(chart.showRefreshItem).toBe(false)
    expect(chart.showAutoRefreshItem).toBe(false)
    expect(chart.showSplitItem).toBe(false)
    expect(chart.showChartSettings).toBe(true)
    expect(grid.showRefreshItem).toBe(false)
    expect(grid.showSplitItem).toBe(false)
    expect(grid.showChartSettings).toBe(false)
  })

  it("markdown cells expose only move/duplicate/delete", () => {
    // Given a markdown cell (no run/draw views)
    const f = flags({ tier: "compact", view: "none", isMarkdown: true })
    // Then no view/chart items appear
    expect(f.showViewSql).toBe(false)
    expect(f.showViewTable).toBe(false)
    expect(f.showViewChart).toBe(false)
    expect(f.showChartSettings).toBe(false)
    expect(f.groupAHasItems).toBe(false)
    expect(f.groupBHasItems).toBe(false)
  })

  it("hides move up/down in grid mode and at the list ends", () => {
    // Given grid mode, where array order doesn't move cells visually
    expect(flags({ isGridMode: true }).showMoveUp).toBe(false)
    expect(flags({ isGridMode: true }).showMoveDown).toBe(false)
    // Given list mode at the first / last position
    expect(flags({ cellIndex: 0, totalCells: 3 }).showMoveUp).toBe(false)
    expect(flags({ cellIndex: 0, totalCells: 3 }).showMoveDown).toBe(true)
    expect(flags({ cellIndex: 2, totalCells: 3 }).showMoveDown).toBe(false)
    expect(flags({ cellIndex: 1, totalCells: 3 }).showMoveUp).toBe(true)
  })

  it("gates duplicate on the cell limit and delete on having more than one cell", () => {
    expect(flags({ totalCells: 1 }).showDelete).toBe(false)
    expect(flags({ totalCells: 2 }).showDelete).toBe(true)
    expect(flags({ totalCells: MAX_NOTEBOOK_CELLS }).showDuplicate).toBe(false)
    expect(flags({ totalCells: MAX_NOTEBOOK_CELLS - 1 }).showDuplicate).toBe(
      true,
    )
  })

  it("never shows a menu item that is also a visible inline toolbar button", () => {
    // Given every tier × view combination
    const tiers = ["compact", "standard", "expanded"] as const
    const views = ["none", "grid", "chart"] as const
    for (const tier of tiers) {
      for (const view of views) {
        const f = flags({ tier, view, chartZoomed: true })
        // Then the expanded tier (which shows refresh/interval/split inline)
        // never repeats them in the menu
        if (tier === "expanded") {
          expect(f.showRefreshItem).toBe(false)
          expect(f.showAutoRefreshItem).toBe(false)
          expect(f.showSplitItem).toBe(false)
          expect(f.showResetZoom).toBe(false)
        }
        // And a divider flag is set iff at least one of its items shows
        expect(f.groupAHasItems).toBe(
          f.showViewSql ||
            f.showViewTable ||
            f.showViewChart ||
            f.showSplitItem,
        )
        expect(f.groupBHasItems).toBe(
          f.showResetZoom ||
            f.showAutoRefreshItem ||
            f.showRefreshItem ||
            f.showChartSettings,
        )
      }
    }
  })
})

describe("nextGridSeedPosition", () => {
  it("empty or missing layout → seeds at the top", () => {
    // Given no existing layout entries
    // When a seed position is computed
    // Then the cell lands at the origin, full-width, with the h=1 sentinel
    expect(nextGridSeedPosition(undefined)).toEqual({ x: 0, y: 0, w: 12, h: 1 })
    expect(nextGridSeedPosition([])).toEqual({ x: 0, y: 0, w: 12, h: 1 })
  })

  it("existing layout → seeds below the lowest cell", () => {
    // Given entries whose lowest edge is y+h = 9
    const layout = [
      { i: "a", x: 0, y: 0, w: 6, h: 4 },
      { i: "b", x: 6, y: 5, w: 6, h: 4 },
    ]
    // When a seed position is computed
    const pos = nextGridSeedPosition(layout)
    // Then the new cell starts exactly below the lowest edge
    expect(pos).toEqual({ x: 0, y: 9, w: 12, h: 1 })
  })
})

describe("upsertCellLayout", () => {
  it("updates the entry in place when the cell already has one", () => {
    // Given a layout containing cell "a"
    const layout = [
      { i: "a", x: 0, y: 0, w: 6, h: 4 },
      { i: "b", x: 6, y: 0, w: 6, h: 4 },
    ]
    // When "a" is repositioned
    const next = upsertCellLayout(layout, "a", { x: 2, y: 3, w: 4, h: 5 })
    // Then only "a" changed and no entry was added
    expect(next).toHaveLength(2)
    expect(next[0]).toEqual({ i: "a", x: 2, y: 3, w: 4, h: 5 })
    expect(next[1]).toBe(layout[1])
  })

  it("appends an entry when the cell has none (including undefined layout)", () => {
    // Given no entry for cell "c"
    // When "c" is positioned
    const next = upsertCellLayout(undefined, "c", { x: 0, y: 9, w: 12, h: 1 })
    // Then the entry is appended
    expect(next).toEqual([{ i: "c", x: 0, y: 9, w: 12, h: 1 }])
  })
})

describe("modeChangeBottomHeightPatch", () => {
  it("never overrides a user-resized bottom slot", () => {
    // Given a cell whose bottom slot the user resized
    const resized = { ...cell("a"), bottomResized: true }
    // When the mode flips either way
    // Then no patch is produced
    expect(modeChangeBottomHeightPatch(resized, "draw")).toEqual({})
    expect(modeChangeBottomHeightPatch(resized, "run")).toEqual({})
  })

  it("draw mode → chart default height", () => {
    // When a cell flips to draw
    const patch = modeChangeBottomHeightPatch(cell("a"), "draw")
    // Then the chart default bottom height is seeded
    expect(patch).toEqual({ bottomHeight: DEFAULT_CHART_BOTTOM_HEIGHT })
  })

  it("run mode with a result → height derived from the result", () => {
    // Given a cell holding an error result (notification-only → 44)
    const withResult = cell("a", "SELECT 1", {
      results: [{ type: "error", query: "X", error: "boom" }],
      activeResultIndex: 0,
      timestamp: 0,
    })
    // When the cell flips back to run
    const patch = modeChangeBottomHeightPatch(withResult, "run")
    // Then the bottom slot matches the result's computed height
    expect(patch).toEqual({ bottomHeight: 44 })
  })

  it("run mode without a result → clears bottomHeight (single view)", () => {
    // When a result-less cell flips back to run
    const patch = modeChangeBottomHeightPatch(cell("a"), "run")
    // Then bottomHeight is explicitly cleared
    expect(patch).toEqual({ bottomHeight: undefined })
  })
})

describe("patchCellRunResult", () => {
  const errorResult = {
    results: [{ type: "error" as const, query: "X", error: "boom" }],
    activeResultIndex: 0,
    timestamp: 0,
  }

  it("patches only the target cell and sizes its bottom slot", () => {
    // Given two cells
    const cells = [cell("a"), cell("b")]
    // When a run result lands on "a"
    const next = patchCellRunResult(cells, "a", errorResult)
    // Then "a" carries the result + derived bottomHeight and "b" is untouched
    expect(next[0].result).toBe(errorResult)
    expect(next[0].bottomHeight).toBe(44)
    expect(next[1]).toBe(cells[1])
  })

  it("keeps a user-resized bottom slot and skips draw/markdown sizing", () => {
    // Given a resized cell, a draw cell, and a markdown cell
    const resized = { ...cell("a"), bottomResized: true, bottomHeight: 500 }
    const draw = { ...cell("b"), mode: "draw" as const }
    const markdown = { ...cell("c"), type: "markdown" as const }
    // When results land on each
    const [a] = patchCellRunResult([resized], "a", errorResult)
    const [b] = patchCellRunResult([draw], "b", errorResult)
    const [c] = patchCellRunResult([markdown], "c", errorResult)
    // Then the result is stored but bottomHeight is never touched
    expect(a.result).toBe(errorResult)
    expect(a.bottomHeight).toBe(500)
    expect(b.bottomHeight).toBeUndefined()
    expect(c.bottomHeight).toBeUndefined()
  })
})

describe("buildAppliedNotebookState", () => {
  const state = (cells: NotebookCell[]) => ({
    cells,
    settings: {},
    maximizedCellId: null,
  })

  it("applies cells and reports the diff", () => {
    // Given one existing cell
    const current = state([cell("a", "SELECT 1")])
    // When the request keeps "a" and adds a new cell
    const next = buildAppliedNotebookState(current, {
      cells: [{ id: "a", preserveValue: true }, { value: "SELECT 2" }],
    })
    // Then both cells exist and the diff names them
    expect(next.cells).toHaveLength(2)
    expect(next.diff.updated).toEqual(["a"])
    expect(next.diff.added).toHaveLength(1)
    expect(next.diff.deleted).toEqual([])
  })

  it("grid layout mode builds a layout for every cell", () => {
    // Given a list-mode notebook
    const current = state([cell("a", "SELECT 1")])
    // When the request switches to grid
    const next = buildAppliedNotebookState(current, {
      layoutMode: "grid",
      cells: [{ id: "a", preserveValue: true }],
    })
    // Then grid mode is set with one layout entry per cell
    expect(next.settings.layoutMode).toBe("grid")
    expect(next.settings.layout).toHaveLength(1)
    expect(next.settings.layout?.[0].i).toBe("a")
  })

  it("grid.h differing from the derived height pins it into the cell", () => {
    // Given a single-view run cell (derived height is 5 rows at 10/20)
    const current = state([cell("a", "SELECT 1")])
    // When apply requests a taller grid.h (targetContentPx = 30*20 - 76 = 524)
    const next = buildAppliedNotebookState(current, {
      layoutMode: "grid",
      cells: [
        { id: "a", preserveValue: true, grid: { x: 0, y: 0, w: 6, h: 20 } },
      ],
    })
    // Then the height is back-solved into the editor and pinned (topResized)
    expect(next.cells[0].topHeight).toBe(524)
    expect(next.cells[0].topResized).toBe(true)
  })

  it("grid.h equal to the derived height does not pin (auto-height intact)", () => {
    // Given a single-view run cell whose derived height is 5 rows
    const current = state([cell("a", "SELECT 1")])
    // When apply merely echoes that height (the required grid.h round-trip)
    const next = buildAppliedNotebookState(current, {
      layoutMode: "grid",
      cells: [
        { id: "a", preserveValue: true, grid: { x: 0, y: 0, w: 6, h: 5 } },
      ],
    })
    // Then nothing is pinned — the cell keeps auto-height
    expect(next.cells[0].topResized).toBeUndefined()
    expect(next.cells[0].bottomResized).toBeUndefined()
  })

  it("value edit that echoes the pre-apply grid.h does not pin the editor", () => {
    // Given a run cell showing a table result (double-view)
    const withTable = cell("a", "SELECT 1", {
      results: [],
      activeResultIndex: 0,
      timestamp: 0,
    })
    const current = state([withTable])
    // Its grid height is derived from editor + result together
    const h = computeCellGridH(withTable, 10, 20)
    // When the agent fixes the SQL (clearing the result) and echoes that same h
    const next = buildAppliedNotebookState(current, {
      layoutMode: "grid",
      cells: [{ id: "a", value: "SELECT 2", grid: { x: 0, y: 0, w: 6, h } }],
    })
    // Then the result clears but no phantom resize is pinned — after the re-run
    // the cell returns to the same split, not a ballooned editor
    expect(next.cells[0].result).toBeNull()
    expect(next.cells[0].topHeight).toBeUndefined()
    expect(next.cells[0].topResized).toBeUndefined()
    expect(next.cells[0].bottomResized).toBeUndefined()
  })

  it("value edit with a taller grid.h resizes the result pane, like a bottom-edge drag", () => {
    // Given a run cell showing a table result (double-view)
    const withTable = cell("a", "SELECT 1", {
      results: [],
      activeResultIndex: 0,
      timestamp: 0,
    })
    const current = state([withTable])
    const h = computeCellGridH(withTable, 10, 20)
    // When the agent fixes the SQL and grows the cell taller (a real resize)
    const next = buildAppliedNotebookState(current, {
      layoutMode: "grid",
      cells: [
        { id: "a", value: "SELECT 2", grid: { x: 0, y: 0, w: 6, h: h + 5 } },
      ],
    })
    // Then it pins the result pane (bottomResized), never the editor — matching
    // what the user's grid bottom-edge drag on a table cell writes
    expect(next.cells[0].bottomResized).toBe(true)
    expect(next.cells[0].topResized).toBeUndefined()
  })

  it("keeps settings referentially identical when nothing settings-related changed", () => {
    // Given a list-mode notebook
    const current = state([cell("a", "SELECT 1")])
    // When the request touches only cells
    const next = buildAppliedNotebookState(current, {
      cells: [{ id: "a", value: "SELECT 2" }],
    })
    // Then the settings object is the same reference
    expect(next.settings).toBe(current.settings)
  })

  it("maximizedCellId: explicit id is kept only when the cell exists", () => {
    const current = state([cell("a", "SELECT 1")])
    // When the request maximizes an existing cell
    const kept = buildAppliedNotebookState(current, {
      maximizedCellId: "a",
      cells: [{ id: "a", preserveValue: true }],
    })
    // Then it is kept
    expect(kept.maximizedCellId).toBe("a")
    // When the request maximizes a cell that does not exist
    const dropped = buildAppliedNotebookState(current, {
      maximizedCellId: "ghost",
      cells: [{ id: "a", preserveValue: true }],
    })
    // Then it falls back to null
    expect(dropped.maximizedCellId).toBeNull()
  })

  it("maximizedCellId: a stale maximized cell is cleared when deleted", () => {
    // Given "b" is maximized
    const current = {
      cells: [cell("a", "SELECT 1"), cell("b", "SELECT 2")],
      settings: {},
      maximizedCellId: "b",
    }
    // When the request omits maximizedCellId but deletes "b"
    const next = buildAppliedNotebookState(current, {
      cells: [{ id: "a", preserveValue: true }],
    })
    // Then the stale maximize is cleared
    expect(next.maximizedCellId).toBeNull()
  })

  it("variables: set when provided, cleared on null, untouched when omitted", () => {
    const current = {
      cells: [cell("a", "SELECT 1")],
      settings: { variables: [{ name: "x", value: "1" }] },
      maximizedCellId: null,
    }
    const request = { cells: [{ id: "a", preserveValue: true as const }] }
    // When variables are omitted → untouched
    expect(
      buildAppliedNotebookState(current, request).settings.variables,
    ).toEqual([{ name: "x", value: "1" }])
    // When variables are null → cleared
    expect(
      buildAppliedNotebookState(current, { ...request, variables: null })
        .settings.variables,
    ).toEqual([])
    // When variables are provided → replaced
    expect(
      buildAppliedNotebookState(current, {
        ...request,
        variables: [{ name: "y", value: "2" }],
      }).settings.variables,
    ).toEqual([{ name: "y", value: "2" }])
  })
})
