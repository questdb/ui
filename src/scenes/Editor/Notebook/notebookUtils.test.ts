import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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
  cellToolbarMenuFlags,
  cellToolbarTier,
  clearCellAutoRefresh,
  cloneNotebookViewState,
  countActiveAutoRefreshOverrides,
  countAutoRefreshOverrides,
  resolveAutoRefresh,
  cloneNotebookViewStateWithCellIdMap,
  duplicateCellAt,
  generateDefaultLayout,
  insertCell,
  isUnverifiableExecError,
  mergeCellLayout,
  nextCopyLabel,
  nextGridSeedPosition,
  removeCell,
  resolveRunCompletion,
  setResultAt,
  singleResultFromExec,
  summarizeCellResults,
  sqlHash,
  stripCellResults,
  swapCellDown,
  swapCellUp,
  upsertCellLayout,
} from "./notebookUtils"
import {
  paneHeightsFromGridRows,
  cellModeChangePatch,
  computeCellGridBounds,
  computeResultBottomHeight,
  DEFAULT_CHART_BOTTOM_HEIGHT,
  releaseCellResultPatch,
  topHeightForSql,
  snapMarkdownTopHeight,
} from "./cellSizing"
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
import type { CellResultStatusReader } from "./cellSizing"
import { getCellRunStatus } from "../../../utils/ai/runStatus"

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
  const FETCHED_AT = 1_700_000_000_000

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FETCHED_AT)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("maps dql exec to DqlQueryResult preserving columns/dataset/count/timings", () => {
    // Given a dql exec with columns, rows, a count and timings
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
    // When mapped to a cell result
    // Then the data fields carry over with the fetch time
    expect(singleResultFromExec(exec, "SELECT 1")).toEqual({
      type: "dql",
      query: "SELECT 1",
      columns: exec.columns,
      dataset: exec.dataset,
      count: 1,
      timings: exec.timings,
      fetchedAt: FETCHED_AT,
    })
  })

  it("maps error exec to ErrorQueryResult with error message", () => {
    // Given an error exec with a message
    const exec: QueryExecResult = {
      type: "error",
      query: "SELECT boom",
      columns: [],
      dataset: [],
      count: 0,
      error: "syntax error",
    }
    // When mapped to a cell result
    // Then the error result keeps the message
    expect(singleResultFromExec(exec, "SELECT boom")).toEqual({
      type: "error",
      query: "SELECT boom",
      error: "syntax error",
      fetchedAt: FETCHED_AT,
    })
  })

  it("falls back to 'Unknown error' when error exec has no message", () => {
    // Given an error exec without a message
    const exec: QueryExecResult = {
      type: "error",
      query: "SELECT ?",
      columns: [],
      dataset: [],
      count: 0,
    }
    // When mapped to a cell result
    // Then the error text falls back to Unknown error
    expect(singleResultFromExec(exec, "SELECT ?")).toEqual({
      type: "error",
      query: "SELECT ?",
      error: "Unknown error",
      fetchedAt: FETCHED_AT,
    })
  })

  it("maps ddl exec to DdlDmlQueryResult without data fields", () => {
    // Given a ddl exec
    const exec: QueryExecResult = {
      type: "ddl",
      query: "CREATE TABLE t (x INT)",
      columns: [],
      dataset: [],
      count: 0,
    }
    // When mapped to a cell result
    // Then only the type, the query and the fetch time remain
    expect(singleResultFromExec(exec, "CREATE TABLE t (x INT)")).toEqual({
      type: "ddl",
      query: "CREATE TABLE t (x INT)",
      fetchedAt: FETCHED_AT,
    })
  })

  it("maps dml exec to DdlDmlQueryResult", () => {
    // Given a dml exec
    const exec: QueryExecResult = {
      type: "dml",
      query: "INSERT INTO t VALUES (1)",
      columns: [],
      dataset: [],
      count: 0,
    }
    // When mapped to a cell result
    // Then only the type, the query and the fetch time remain
    expect(singleResultFromExec(exec, "INSERT INTO t VALUES (1)")).toEqual({
      type: "dml",
      query: "INSERT INTO t VALUES (1)",
      fetchedAt: FETCHED_AT,
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

  it("normalizes legacy stored run mode away while preserving draw mode", () => {
    // Given a cell with a legacy stored run mode and a draw cell
    const legacyRun = {
      ...cell("run", "SELECT 1"),
      mode: "run",
    } as unknown as NotebookCell
    const draw = { ...cell("draw", "SELECT 2"), mode: "draw" as const }

    // When the cells are stripped for persistence
    const [persistedRun, persistedDraw] = stripCellResults([legacyRun, draw])

    // Then the run mode key is gone and the draw mode stays
    expect("mode" in persistedRun).toBe(false)
    expect(persistedDraw.mode).toBe("draw")
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
    // Given a cell with an in-flight result
    const cells: NotebookCell[] = [
      cell("a", "SELECT 1", {
        results: [{ type: "running", query: "SELECT 1" }],
        activeResultIndex: 0,
        timestamp: 0,
      }),
    ]
    // When the persist payload is built
    const payload = buildPersistPayload(cells, "a", null, {
      layoutMode: "list",
    })
    // Then it packs the ids and the settings and collapses the result to a run status
    expect(payload).toEqual({
      cells: [
        {
          ...cells[0],
          result: undefined,
          lastRunStatus: "cancelled",
          lastRunError: undefined,
          paneView: "editor_result",
        },
      ],
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

  it("reports resultsCleared only for run cells whose value changed", () => {
    // Given a run cell, an untouched run cell, and a never-run cell
    const prev: NotebookCell[] = [
      { id: "a", position: 0, value: "x", result: dql("x") },
      { id: "b", position: 1, value: "y", result: dql("y") },
      { id: "c", position: 2, value: "z" },
    ]
    // When an apply rewrites the SQL of "a" and "c"
    const { resultsCleared } = buildAppliedCells(prev, {
      cells: [
        { id: "a", value: "x2" },
        { id: "b", value: "y" },
        { id: "c", value: "z2" },
      ],
    })
    // Then only the run cell with replaced SQL needs its snapshot deleted
    expect(resultsCleared).toEqual(["a"])
  })

  it("keeps a released cell's snapshot on a value change — hydration reconciles it", () => {
    // Given a cell released by virtualization: no in-memory result, only a run
    // marker pointing at a persisted snapshot
    const prev: NotebookCell[] = [
      { id: "a", position: 0, value: "x", lastRunStatus: "success" },
    ]
    // When an apply replaces its SQL
    const { nextCells, resultsCleared } = buildAppliedCells(prev, {
      cells: [{ id: "a", value: "x2" }],
    })
    // Then the snapshot survives for hydration to reconcile by statement
    // content — unmatched results are dropped at load, never shown
    expect(resultsCleared).toEqual([])
    expect(nextCells[0].lastRunStatus).toBe("success")
  })

  it("rejects turning an existing sql cell into markdown", () => {
    // Given a sql cell
    const prev: NotebookCell[] = [{ id: "a", position: 0, value: "x" }]
    // When the apply re-sends its id with type markdown
    // Then the request is refused
    expect(() =>
      buildAppliedCells(prev, {
        cells: [{ id: "a", value: "x", type: "markdown" }],
      }),
    ).toThrow(/Cell "a" is sql; cell kind cannot change/)
  })

  it("rejects turning an existing markdown cell into sql", () => {
    // Given a markdown cell
    const prev: NotebookCell[] = [
      { id: "a", position: 0, value: "# title", type: "markdown" },
    ]
    // When the apply re-sends its id with type sql
    // Then the request is refused
    expect(() =>
      buildAppliedCells(prev, {
        cells: [{ id: "a", preserveValue: true, type: "sql" }],
      }),
    ).toThrow(/Cell "a" is markdown; cell kind cannot change/)
  })

  it("ignores view and result_height on a markdown cell", () => {
    // Given an existing markdown cell
    const prev: NotebookCell[] = [
      { id: "a", position: 0, value: "# title", type: "markdown" },
    ]
    // When the apply sends a view and a result_height with the editor height
    const { nextCells } = buildAppliedCells(prev, {
      cells: [
        {
          id: "a",
          preserveValue: true,
          editorHeight: 86,
          resultHeight: 300,
          view: "result",
        },
      ],
    })
    // Then only the editor height lands on the cell
    expect(nextCells[0]).toMatchObject({ topHeight: 86, topResized: true })
    expect(nextCells[0].bottomHeight).toBeUndefined()
    expect(nextCells[0].paneView).toBeUndefined()
  })

  it("accepts an echoed kind on an existing cell", () => {
    // Given a sql cell and a markdown cell
    const prev: NotebookCell[] = [
      { id: "a", position: 0, value: "x" },
      { id: "b", position: 1, value: "# title", type: "markdown" },
    ]
    // When the apply repeats each cell's current kind
    const { nextCells } = buildAppliedCells(prev, {
      cells: [
        { id: "a", preserveValue: true, type: "sql" },
        { id: "b", preserveValue: true, type: "markdown" },
      ],
    })
    // Then both cells keep their kind
    expect(nextCells[0].type).toBeUndefined()
    expect(nextCells[1].type).toBe("markdown")
  })

  it("preserves run history as lastRunStatus when a value change drops the result", () => {
    // A run cell carries its outcome only in the live `result` during a
    // session; dropping it on a value change must collapse to lastRunStatus so
    // agents still see that the cell ran.
    // Given a run cell holding a dml result
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
    // When the apply changes its value
    const { nextCells } = buildAppliedCells(prev, {
      cells: [{ id: "a", value: "INSERT INTO t VALUES (2)" }],
    })
    // Then the result drops and the run outcome survives as lastRunStatus
    expect(nextCells[0].result).toBeNull()
    expect(nextCells[0].lastRunStatus).toBe("success")
  })

  it("carries the error outcome as recorded history when a value change drops an error result", () => {
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
    // When the SQL is rewritten via apply_notebook_state
    const { nextCells } = buildAppliedCells(prev, {
      cells: [{ id: "a", value: "SELECT * FROM fx_trades" }],
    })
    // Then the record still describes the last run that actually happened —
    // only a new run rewrites it
    expect(nextCells[0].result).toBeNull()
    expect(nextCells[0].lastRunStatus).toBe("error")
    expect(nextCells[0].lastRunError).toBe("boom")
  })

  describe("mode change", () => {
    const drawCell = (overrides: Partial<NotebookCell> = {}): NotebookCell => ({
      id: "a",
      position: 0,
      value: "SELECT 1",
      mode: "draw",
      paneView: "editor_result",
      chartConfig: { xColumn: null, queries: [null] },
      bottomHeight: DEFAULT_CHART_BOTTOM_HEIGHT,
      result: {
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
      },
      ...overrides,
    })
    const runCell = (overrides: Partial<NotebookCell> = {}): NotebookCell => ({
      id: "a",
      position: 0,
      value: "SELECT 1",
      paneView: "editor_result",
      bottomHeight: 180,
      ...overrides,
    })

    it("validates a draw-to-run height against the table floor", () => {
      // Given a draw cell
      const prev = [drawCell()]
      // When the apply switches it to run with a table-legal height
      const { nextCells } = buildAppliedCells(prev, {
        cells: [
          {
            id: "a",
            value: "SELECT 1",
            mode: "run",
            view: "editor_result",
            resultHeight: 100,
          },
        ],
      })
      // Then the apply succeeds and the height is pinned
      expect(nextCells[0].mode).toBeUndefined()
      expect(nextCells[0].bottomHeight).toBe(100)
      expect(nextCells[0].bottomResized).toBe(true)
    })

    it("validates a run-to-draw height against the chart floor", () => {
      // Given a run cell
      const prev = [runCell()]
      // When the apply switches it to draw with a height below the chart floor
      const apply = () =>
        buildAppliedCells(prev, {
          cells: [
            {
              id: "a",
              value: "SELECT 1",
              mode: "draw",
              chartConfig: { xColumn: null, queries: [null] },
              resultHeight: 100,
            },
          ],
        })
      // Then the chart minimum applies
      expect(apply).toThrowError(/minimum is 296px/)
    })

    it("re-derives an unpinned height when draw becomes run", () => {
      // Given a draw cell whose height is the draw seed, not a user pin
      const prev = [drawCell()]
      // When the apply switches it to run and preserves the height
      const { nextCells } = buildAppliedCells(prev, {
        cells: [
          { id: "a", value: "SELECT 1", mode: "run", resultHeight: null },
        ],
      })
      // Then the table height follows the carried result
      const next = nextCells[0]
      expect(next.bottomHeight).toBe(
        computeResultBottomHeight(next.result, next.value),
      )
      expect(next.bottomHeight).not.toBe(DEFAULT_CHART_BOTTOM_HEIGHT)
      expect(next.bottomResized).toBeFalsy()
    })

    it("re-seeds an unpinned height when run becomes draw", () => {
      // Given a run cell with a result-derived height
      const prev = [runCell()]
      // When the apply switches it to draw and preserves the height
      const { nextCells } = buildAppliedCells(prev, {
        cells: [
          {
            id: "a",
            value: "SELECT 1",
            mode: "draw",
            chartConfig: { xColumn: null, queries: [null] },
            resultHeight: null,
          },
        ],
      })
      // Then the chart starts at its default height
      expect(nextCells[0].bottomHeight).toBe(DEFAULT_CHART_BOTTOM_HEIGHT)
    })

    it("keeps a pinned height across a mode change", () => {
      // Given a draw cell the user resized
      const prev = [drawCell({ bottomHeight: 640, bottomResized: true })]
      // When the apply switches it to run and preserves the height
      const { nextCells } = buildAppliedCells(prev, {
        cells: [
          { id: "a", value: "SELECT 1", mode: "run", resultHeight: null },
        ],
      })
      // Then the pin survives
      expect(nextCells[0].bottomHeight).toBe(640)
      expect(nextCells[0].bottomResized).toBe(true)
    })

    it("keeps the stored height when the mode does not change", () => {
      // Given a draw cell
      const prev = [drawCell()]
      // When the apply keeps it in draw mode
      const { nextCells } = buildAppliedCells(prev, {
        cells: [
          {
            id: "a",
            value: "SELECT 1",
            mode: "draw",
            chartConfig: { xColumn: null, queries: [null] },
            resultHeight: null,
          },
        ],
      })
      // Then nothing re-seeds
      expect(nextCells[0].bottomHeight).toBe(DEFAULT_CHART_BOTTOM_HEIGHT)
      expect(nextCells[0].bottomResized).toBeFalsy()
    })
  })

  it("keeps a released cell's persisted run history when the SQL changes", () => {
    // Given a passive cell whose outcome survives only as persisted run history
    const prev: NotebookCell[] = [
      {
        id: "a",
        position: 0,
        value: "SELECT * FROM missing",
        lastRunStatus: "error",
      },
    ]

    // When the SQL is edited without a live result blob
    const { nextCells } = buildAppliedCells(prev, {
      cells: [{ id: "a", value: "SELECT * FROM fx_trades" }],
    })

    // Then the recorded history stays — hydration reconciles the snapshot,
    // and only a run rewrites the recorded outcome
    expect(nextCells[0].lastRunStatus).toBe("error")
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

  it("rejects a request that would exceed the cell limit", () => {
    const prev: NotebookCell[] = []
    expect(() =>
      buildAppliedCells(prev, {
        cells: Array.from({ length: MAX_NOTEBOOK_CELLS + 1 }, () => ({
          value: "SELECT 1",
        })),
      }),
    ).toThrow(new RegExp(`at most ${MAX_NOTEBOOK_CELLS}`))
  })

  it("accepts a request of exactly the cell limit", () => {
    const prev: NotebookCell[] = []
    const { nextCells } = buildAppliedCells(prev, {
      cells: Array.from({ length: MAX_NOTEBOOK_CELLS }, () => ({
        value: "SELECT 1",
      })),
    })
    expect(nextCells).toHaveLength(MAX_NOTEBOOK_CELLS)
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

  it("rejects grid placement that extends beyond the notebook columns", () => {
    // Given a cell placed at column 11 with a width of 2
    // When applied
    // Then the placement is rejected
    expect(() =>
      buildAppliedCells([], {
        cells: [{ value: "SELECT 1", grid: { x: 11, y: 0, w: 2 } }],
      }),
    ).toThrow(/x \+ w must be at most 12/)
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

  it("defaults a new draw cell to result and stores no autoRefresh key", () => {
    // Given a new draw cell request with no view and no autoRefresh
    // When applied to an empty notebook
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
    // Then the cell inherits the notebook default and shows the result
    // No stored key: the cell inherits the notebook default.
    expect("autoRefresh" in nextCells[0]).toBe(false)
    expect(nextCells[0].paneView).toBe("result")
  })

  it("applies semantic pane dimensions and view to a new draw cell", () => {
    // Given a new draw cell request with pane heights and a view
    // When applied to an empty notebook
    const { nextCells } = buildAppliedCells([], {
      cells: [
        {
          value: "SELECT 1",
          mode: "draw",
          editorHeight: 120,
          resultHeight: 300,
          view: "editor_result",
          chartConfig: {
            xColumn: "ts",
            queries: [{ type: "line", yColumns: ["v"] }],
          },
        },
      ],
    })

    // Then the heights are pinned and the view is stored
    expect(nextCells[0]).toMatchObject({
      topHeight: 120,
      topResized: true,
      bottomHeight: 300,
      bottomResized: true,
      paneView: "editor_result",
    })
  })

  it("treats null semantic dimensions as preserve for an existing cell", () => {
    // Given an existing draw cell with pinned heights and a view
    const existing: NotebookCell = {
      id: "a",
      position: 0,
      value: "SELECT 1",
      mode: "draw",
      topHeight: 120,
      topResized: true,
      bottomHeight: 280,
      bottomResized: true,
      paneView: "editor_result",
      chartConfig: {
        xColumn: "ts",
        queries: [{ type: "line", yColumns: ["v"] }],
      },
    }
    // When the apply sends null for every dimension and the view
    const { nextCells } = buildAppliedCells([existing], {
      cells: [
        {
          id: "a",
          preserveValue: true,
          mode: "draw",
          editorHeight: null,
          resultHeight: null,
          view: null,
          chartConfig: existing.chartConfig,
        },
      ],
    })

    // Then the stored heights and the view stay
    expect(nextCells[0]).toMatchObject({
      topHeight: 120,
      topResized: true,
      bottomHeight: 280,
      bottomResized: true,
      paneView: "editor_result",
    })
  })

  it("treats editor view as authoritative over a preserved draw mode", () => {
    // Given an existing draw cell with a result and a chart config
    const existing: NotebookCell = {
      id: "a",
      position: 0,
      value: "SELECT 1",
      mode: "draw",
      result: { results: [], activeResultIndex: 0, timestamp: 1 },
      paneView: "result",
      chartConfig: {
        xColumn: "ts",
        queries: [{ type: "line", yColumns: ["v"] }],
      },
    }

    // When the apply requests the editor view with a null mode
    const { nextCells, resultsCleared } = buildAppliedCells([existing], {
      cells: [
        {
          id: "a",
          preserveValue: true,
          mode: null,
          view: "editor",
          chartConfig: null,
        },
      ],
    })

    // Then the mode, the result and the chart config are cleared and the cell is reported
    expect("mode" in nextCells[0]).toBe(false)
    expect(nextCells[0].result).toBeUndefined()
    expect(nextCells[0].chartConfig).toBeUndefined()
    expect(resultsCleared).toEqual(["a"])
  })

  it.each(["run", "draw"] as const)(
    "rejects explicit mode %s with editor view",
    (mode) => {
      // Given a new cell request with an explicit mode and the editor view
      // When applied
      // Then the request is rejected
      expect(() =>
        buildAppliedCells([], {
          cells: [{ value: "SELECT 1", mode, view: "editor" }],
        }),
      ).toThrow(/explicit mode.*view "editor"/)
    },
  )

  it("honors an explicit editor_height sent together with a value change", () => {
    // Given a never-manually-resized cell
    const existing: NotebookCell = {
      id: "a",
      position: 0,
      value: "SELECT 1",
      topHeight: 72,
    }
    // When one apply changes the value AND pins the editor height
    const { nextCells } = buildAppliedCells([existing], {
      cells: [{ id: "a", value: "SELECT 2", editorHeight: 500 }],
    })
    // Then the pinned height wins over the line-count estimate
    expect(nextCells[0]).toMatchObject({
      topHeight: 500,
      topResized: true,
    })
  })

  it("re-estimates the editor height for a value change with editor_height auto", () => {
    // Given a cell with a pinned editor height
    const existing: NotebookCell = {
      id: "a",
      position: 0,
      value: "SELECT 1",
      topHeight: 700,
      topResized: true,
    }
    // When the apply changes the value and asks for an auto editor height
    const { nextCells } = buildAppliedCells([existing], {
      cells: [{ id: "a", value: "SELECT 2", editorHeight: "auto" }],
    })

    // Then the pin is released and the height follows the new SQL
    expect(nextCells[0].topResized).toBe(false)
    expect(nextCells[0].topHeight).toBe(topHeightForSql("SELECT 2"))
  })

  it("heals a markdown cell that carries a leaked mode from a legacy import", () => {
    // Given a markdown cell poisoned with run/draw sub-state by an old import
    const poisoned: NotebookCell = {
      id: "a",
      position: 0,
      value: "# title",
      type: "markdown",
      mode: "draw",
    }
    // When an apply preserves the cell
    const { nextCells } = buildAppliedCells([poisoned], {
      cells: [{ id: "a", preserveValue: true }],
    })
    // Then the apply succeeds and the leaked mode is gone
    expect(nextCells[0].type).toBe("markdown")
    expect("mode" in nextCells[0]).toBe(false)
  })

  it("still rejects an explicit mode on a markdown cell", () => {
    // Given a markdown cell request with a mode
    // When applied
    // Then the request is rejected
    expect(() =>
      buildAppliedCells([], {
        cells: [{ value: "# title", type: "markdown", mode: "run" }],
      }),
    ).toThrow(/markdown cell and cannot have a mode/)
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

  it("preserves existing mode and editor visibility while clearing omitted PUT fields", () => {
    // Given an existing run cell with optional chart presentation fields
    const prev: NotebookCell[] = [
      {
        id: "a",
        position: 0,
        value: "SELECT 1",
        mode: undefined,
        autoRefresh: "5s",
        paneView: "result",
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

    // Then implicit run stays unstored while the documented PUT fields clear
    expect(nextCells[0].mode).toBeUndefined()
    expect(nextCells[0].chartConfig).toBeUndefined()
    expect(nextCells[0].autoRefresh).toBeUndefined()
    expect(nextCells[0].paneView).toBe("result")
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

  it("applies a fixed refresh interval to a draw cell and clears it to inherit when omitted", () => {
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
    // Then no key remains — the cell inherits the notebook default
    expect("autoRefresh" in nextCells[0]).toBe(false)
  })

  it("refuses an empty cells array", () => {
    expect(() => buildAppliedCells([], { cells: [] })).toThrow(
      /at least one cell/,
    )
  })
})

describe("lastRunError carry chain", () => {
  const errored = (id: string): NotebookCell => ({
    id,
    position: 0,
    value: "select boom",
    result: {
      results: [
        { type: "error", query: "select boom", error: "table does not exist" },
      ],
      activeResultIndex: 0,
      timestamp: 0,
    },
  })

  it("stripCellResults carries the error alongside the status", () => {
    // Given an errored cell persisted (result blob stripped)
    const [out] = stripCellResults([errored("a")])

    // Then the error string travels with the error marker
    expect(out.lastRunStatus).toBe("error")
    expect(out.lastRunError).toBe("table does not exist")
  })

  it("stripCellResults clears a stale carried error once the cell succeeds", () => {
    // Given a cell re-run to success while still carrying an old error marker
    const fixed: NotebookCell = {
      ...cell("a", "select 1", {
        results: [
          {
            type: "dql",
            query: "select 1",
            columns: [],
            dataset: [],
            count: 0,
          },
        ],
        activeResultIndex: 0,
        timestamp: 0,
      }),
      lastRunError: "table does not exist",
    }

    // When it is stripped for persistence
    const [out] = stripCellResults([fixed])

    // Then the stale error does not survive next to a success marker
    expect(out.lastRunStatus).toBe("success")
    expect(out.lastRunError).toBeUndefined()
  })

  it("duplicateCellAt copies the carried error onto the duplicate", () => {
    // When an errored cell is duplicated (the copy gets no result blob)
    const out = duplicateCellAt([errored("a")], "a", "new-id")

    // Then the duplicate reports the same failure
    expect(out[1].id).toBe("new-id")
    expect(out[1].lastRunStatus).toBe("error")
    expect(out[1].lastRunError).toBe("table does not exist")
  })

  it("cloneNotebookViewState carries the error into the cloned cells", () => {
    // When a notebook with an errored cell is cloned
    const clone = cloneNotebookViewState({ cells: [errored("a")] }, () => "n1")

    // Then the clone keeps the failure marker and its message
    expect(clone.cells[0].lastRunStatus).toBe("error")
    expect(clone.cells[0].lastRunError).toBe("table does not exist")
  })

  it("releaseCellResultPatch carries the error when the result leaves memory", () => {
    // When an errored result is released to IndexedDB-only
    const patch = releaseCellResultPatch(errored("a"))

    // Then the failure marker and message survive the release
    expect(patch.lastRunStatus).toBe("error")
    expect(patch.lastRunError).toBe("table does not exist")
  })

  it("getCellRunStatus surfaces the carried error after a strip", () => {
    // Given an errored cell whose result blob was stripped
    const [stripped] = stripCellResults([errored("a")])

    // Then the agent-facing status still reports the error message
    expect(getCellRunStatus(stripped)).toEqual({
      status: "error",
      error: "table does not exist",
    })
  })

  it("buildAppliedCells keeps a stripped cell's carried error across a value change", () => {
    // Given a stripped errored cell carrying status + error markers
    const [stripped] = stripCellResults([errored("a")])

    // When apply rewrites the SQL
    const { nextCells } = buildAppliedCells([stripped], {
      cells: [{ id: "a", value: "select fixed" }],
    })

    // Then the recorded history survives — it describes the last run that
    // actually happened, and only a run rewrites it
    expect(nextCells[0].lastRunStatus).toBe("error")
    expect(nextCells[0].lastRunError).toBe("table does not exist")
  })
})

const unrequested: CellResultStatusReader = () => "unrequested"

describe("buildAppliedLayout", () => {
  it("derives h from the live snapshot-load status when a reader is provided", () => {
    // Given a run-marked cell whose result lives only on disk
    const pending: NotebookCell[] = [
      { id: "a", position: 0, value: "SELECT 1", lastRunStatus: "success" },
    ]
    const request = { cells: [{ id: "a", value: "SELECT 1" }] }
    const defaults = { gridCols: 12, rowHeight: 10, marginY: 20 }
    // When the reader reports the snapshot missing vs still loadable
    const collapsed = buildAppliedLayout(
      request,
      pending,
      [],
      defaults,
      () => "missing",
    )
    const reserved = buildAppliedLayout(
      request,
      pending,
      [],
      defaults,
      unrequested,
    )
    // Then the missing cell collapses to its editor while the default
    // ("unrequested") reserves the result area — statuses drive h
    expect(collapsed[0].h).toBeLessThan(reserved[0].h)
    expect(reserved[0].h).toBe(19)
    expect(collapsed[0].h).toBe(5)
  })

  it("uses request.grid when provided, otherwise derives h from topHeight + bottomHeight", () => {
    // Given two cells, one with an explicit grid placement
    const cells: NotebookCell[] = [
      { id: "a", position: 0, value: "" },
      { id: "b", position: 1, value: "" },
    ]
    // When the layout is built
    const layout = buildAppliedLayout(
      {
        cells: [
          { id: "a", value: "", grid: { x: 0, y: 0, w: 6 } },
          { id: "b", value: "" },
        ],
      },
      cells,
      [],
      { gridCols: 12, rowHeight: 50, marginY: 0 },
      unrequested,
    )
    // Then the explicit grid is kept and the other cell derives its height
    expect(layout[0]).toEqual({ i: "a", x: 0, y: 0, w: 6, h: 3 })
    // Run-mode cell, no result yet → single-view → only topHeight (72) + chrome (40)
    // = 112 px → ceil(112 / 50) = 3 rows. Both cells derive h and the second
    // stacks below the first at y=3.
    expect(layout[1]).toEqual({ i: "b", x: 0, y: 3, w: 12, h: 3 })
  })

  it("keeps prevLayout placement and re-derives h when request omits grid", () => {
    // Given a cell with a previous placement
    const cells: NotebookCell[] = [{ id: "a", position: 0, value: "" }]
    // When the layout is built without a grid
    const layout = buildAppliedLayout(
      { cells: [{ id: "a", value: "" }] },
      cells,
      [{ i: "a", x: 3, y: 4, w: 8, h: 5 }],
      { gridCols: 12, rowHeight: 50, marginY: 0 },
      unrequested,
    )
    // Then the placement stays and the height is re-derived
    expect(layout).toEqual([{ i: "a", x: 3, y: 4, w: 8, h: 3 }])
  })

  it("gives draw-mode cells a taller default than run-mode cells (no result yet)", () => {
    // buildAppliedCells seeds bottomHeight = DEFAULT_CHART_BOTTOM_HEIGHT for
    // draw cells, so they're double-view from creation. Run cells stay
    // single-view (no result) and only count topHeight + chrome.
    // Given a run cell and a draw cell without results
    const cells: NotebookCell[] = [
      { id: "run-cell", position: 0, value: "", mode: undefined },
      {
        id: "draw-cell",
        position: 1,
        value: "",
        mode: "draw",
        bottomHeight: 350,
      },
    ]
    // When the layout is built
    const layout = buildAppliedLayout(
      {
        cells: [
          { id: "run-cell", value: "" },
          { id: "draw-cell", value: "" },
        ],
      },
      cells,
      [],
      { gridCols: 12, rowHeight: 50, marginY: 0 },
      unrequested,
    )
    // Then the draw cell is taller and stacks below
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
        paneView: "result",
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

  it("returns the old-to-new cell id mapping used by snapshot copies", () => {
    // Given a notebook whose cells and layout refer to the original ids
    const src = source()

    // When the notebook is cloned
    const { notebookViewState, cellIdMap } =
      cloneNotebookViewStateWithCellIdMap(src, seqIds())

    // Then every structural reference and snapshot mapping use the same ids
    expect(Array.from(cellIdMap.entries())).toEqual([
      ["a", "new-0"],
      ["b", "new-1"],
    ])
    expect(notebookViewState.cells.map((cell) => cell.id)).toEqual([
      "new-0",
      "new-1",
    ])
    expect(notebookViewState.settings?.layout?.map((item) => item.i)).toEqual([
      "new-0",
      "new-1",
    ])
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
    // Given a notebook with a run cell and a draw cell holding results
    // When the view state is cloned
    const out = cloneNotebookViewState(source(), seqIds())
    // Then the results are stripped and the structure and run history stay
    expect(out.cells[1].result).toBeUndefined()
    // cloned cells keep recorded run history so auto-run never re-fires their
    // writes; a draw cell's frame is refresh-produced and never seeds history
    expect(out.cells[0].lastRunStatus).toBe("success")
    expect(out.cells[1].lastRunStatus).toBeUndefined()
    expect(out.cells[0].topHeight).toBe(120)
    expect(out.cells[1].mode).toBe("draw")
    expect(out.cells[1].autoRefresh).toBe(true)
    expect(out.cells[1].paneView).toBe("result")
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

  it("rejects inherited Object property names", () => {
    // An `in` check would accept these; each one reaches the poll-interval
    // lookup as a function and degrades the cadence math to NaN.
    expect(isAutoRefresh("toString")).toBe(false)
    expect(isAutoRefresh("constructor")).toBe(false)
    expect(isAutoRefresh("__proto__")).toBe(false)
    expect(isAutoRefresh("hasOwnProperty")).toBe(false)
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

describe("auto-refresh inheritance helpers", () => {
  it("resolveAutoRefresh prefers the override, then the default, then Off", () => {
    expect(resolveAutoRefresh("5s", "30s")).toBe("5s")
    expect(resolveAutoRefresh(undefined, "30s")).toBe("30s")
    expect(resolveAutoRefresh(undefined, undefined)).toBe(false)
  })

  it("resolveAutoRefresh treats false as a value, never as absent", () => {
    expect(resolveAutoRefresh(false, "30s")).toBe(false)
    expect(resolveAutoRefresh(undefined, false)).toBe(false)
  })

  it("countAutoRefreshOverrides counts stored keys on ANY mode, including dormant run-cell overrides", () => {
    // Given a draw override, an Auto chart, a dormant run-mode override, and an inheriting cell
    const cells: NotebookCell[] = [
      { ...cell("a", "SELECT 1"), mode: "draw", autoRefresh: "5s" },
      { ...cell("b", "SELECT 2"), mode: "draw", autoRefresh: true },
      { ...cell("c", "SELECT 3"), mode: undefined, autoRefresh: false },
      cell("d", "SELECT 4"),
    ]
    // When the stored overrides are counted
    // Then every stored key counts — the count matches what a reset would clear
    expect(countAutoRefreshOverrides(cells)).toBe(3)
  })

  it("countActiveAutoRefreshOverrides counts overrides on cells showing a view — editor-only keys stay dormant", () => {
    // Given a chart override, a grid-view run override, and an editor-only override
    const gridResult: NotebookCell["result"] = {
      results: [
        {
          type: "dql",
          query: "SELECT 2",
          columns: [{ name: "x", type: "INT" }],
          dataset: [[1]],
          count: 1,
        },
      ],
      activeResultIndex: 0,
      timestamp: 0,
    }
    const cells: NotebookCell[] = [
      { ...cell("a", "SELECT 1"), mode: "draw", autoRefresh: "5s" },
      {
        ...cell("b", "SELECT 2", gridResult),
        mode: undefined,
        autoRefresh: false,
      },
      { ...cell("c", "SELECT 3"), mode: undefined, autoRefresh: "1s" },
    ]
    // When the active overrides are counted
    // Then only the cells with a visible view count toward the displayed total
    expect(countActiveAutoRefreshOverrides(cells)).toBe(2)
    // And a notebook with only editor-only keys shows no override at all
    expect(countActiveAutoRefreshOverrides([cells[2]])).toBe(0)
  })

  it("clearCellAutoRefresh deletes the key so a later draw switch cannot resurrect it", () => {
    // Given a run cell carrying a dormant override
    const dormant: NotebookCell = {
      ...cell("a", "SELECT 1"),
      mode: undefined,
      autoRefresh: "1s",
    }
    // When the override clears and the cell later switches to draw
    const cleared = clearCellAutoRefresh(dormant)
    const redrawn: NotebookCell = {
      ...cleared,
      mode: "draw",
      ...cellModeChangePatch(cleared, "draw"),
    }
    // Then no key exists at any point
    expect("autoRefresh" in cleared).toBe(false)
    expect("autoRefresh" in redrawn).toBe(false)
  })

  it("clearCellAutoRefresh returns the same cell when no override exists", () => {
    const c = cell("a", "SELECT 1")
    expect(clearCellAutoRefresh(c)).toBe(c)
  })

  it("clearCellAutoRefresh drops a chart's Auto so the cell inherits the notebook default", () => {
    // Given a chart set to Auto, no notebook default
    const chart: NotebookCell = {
      ...cell("a", "SELECT 1"),
      mode: "draw",
      autoRefresh: true,
    }
    // When the user picks "Notebook default" on the cell
    const cleared = clearCellAutoRefresh(chart)
    // Then the key is gone — the chart inherits (Off while the default is unset)
    expect("autoRefresh" in cleared).toBe(false)
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
    // Given a run cell with a result
    // When the view is resolved
    // Then it is the grid
    expect(resolveCellView({ mode: undefined, result })).toBe("grid")
    expect(resolveCellView({ result })).toBe("grid")
  })
  it("is none for a run cell with no result", () => {
    // Given a run cell without a result
    // When the view is resolved
    // Then there is no view
    expect(resolveCellView({ mode: undefined })).toBe("none")
    expect(resolveCellView({})).toBe("none")
  })
})

describe("resolveRunAction", () => {
  it("runs a single query, or all, for a run cell", () => {
    // Given a run cell
    const cell = {}
    // When the user presses Run All / Run
    // Then it runs all / one
    expect(resolveRunAction(cell, { intent: "all" })).toEqual({
      kind: "run-all",
    })
    expect(resolveRunAction(cell, { intent: "single" })).toEqual({
      kind: "run-single",
    })
  })

  it("refreshes the whole chart on Run All but ignores Run for a draw cell", () => {
    // Given a draw cell
    const cell = { mode: "draw" as const }
    // When the user presses Run All / Run
    // Then Run All refreshes the chart and Run is a no-op
    expect(resolveRunAction(cell, { intent: "all" })).toEqual({
      kind: "chart",
    })
    expect(resolveRunAction(cell, { intent: "single" })).toEqual({
      kind: "noop",
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
    expect(f.showEditorToggleItem).toBe(false)
    expect(f.showRefreshItem).toBe(false)
    expect(f.groupAHasItems).toBe(true)
    expect(f.groupBHasItems).toBe(false)
  })

  it("compact grid view carries all three checkable view controls plus refresh", () => {
    // Given a narrow cell currently showing the table
    // When the menu flags are computed
    const f = flags({ tier: "compact", view: "grid" })
    // Then the menu mirrors the wide header: both segments and the editor
    // toggle, as checkable items
    expect(f.showViewTable).toBe(true)
    expect(f.showViewChart).toBe(true)
    expect(f.showEditorToggleItem).toBe(true)
    expect(f.showRefreshItem).toBe(true)
    expect(f.showChartSettings).toBe(false)
  })

  it("compact cells offer the editor toggle whenever a result is on screen", () => {
    // Given a compact chart in split or result-only view
    // When the menu flags are computed
    // Then Show editor is in the menu, as the wide header's inline toggle
    expect(flags({ tier: "compact", view: "chart" }).showEditorToggleItem).toBe(
      true,
    )
    // And wider tiers show the toggle inline instead
    expect(
      flags({ tier: "standard", view: "chart" }).showEditorToggleItem,
    ).toBe(false)
  })

  it("offers the interval submenu to grids, not just charts, wherever the inline control is absent", () => {
    // Given grid cells in the tiers that render no inline interval control
    // Then the menu is the fallback — auto-refresh is not a chart-only feature
    expect(flags({ tier: "compact", view: "grid" }).showAutoRefreshItem).toBe(
      true,
    )
    expect(flags({ tier: "standard", view: "grid" }).showAutoRefreshItem).toBe(
      true,
    )
  })

  it("never duplicates the inline interval control at the expanded tier", () => {
    // Given the expanded tier, which renders the split-button interval for
    // BOTH views
    // Then the menu omits it rather than showing the same control twice
    expect(flags({ tier: "expanded", view: "grid" }).showAutoRefreshItem).toBe(
      false,
    )
    expect(flags({ tier: "expanded", view: "chart" }).showAutoRefreshItem).toBe(
      false,
    )
  })

  it("omits the interval submenu for a cell with no view", () => {
    // Given a cell showing neither a grid nor a chart, there is nothing to
    // auto-refresh
    expect(flags({ tier: "compact", view: "none" }).showAutoRefreshItem).toBe(
      false,
    )
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
    // When the menu flags are computed
    const f = flags({ tier: "standard", view: "chart" })
    // Then the menu carries the chart actions the inline toggle does not
    expect(f.showAutoRefreshItem).toBe(true)
    expect(f.showRefreshItem).toBe(true)
    expect(f.showChartSettings).toBe(true)
    expect(f.showEditorToggleItem).toBe(false)
  })

  it("expanded tier never duplicates the inline refresh / interval / split controls", () => {
    // Given the expanded toolbar, which shows refresh + interval + split inline
    // When the menu flags are computed for a chart and a grid
    const chart = flags({ tier: "expanded", view: "chart" })
    const grid = flags({ tier: "expanded", view: "grid" })
    // Then the menu drops all of them, keeping only chart settings (chart only)
    expect(chart.showRefreshItem).toBe(false)
    expect(chart.showAutoRefreshItem).toBe(false)
    expect(chart.showEditorToggleItem).toBe(false)
    expect(chart.showChartSettings).toBe(true)
    expect(grid.showRefreshItem).toBe(false)
    expect(grid.showEditorToggleItem).toBe(false)
    expect(grid.showChartSettings).toBe(false)
  })

  it("markdown cells expose only move/duplicate/delete", () => {
    // Given a markdown cell (no run/draw views)
    // When the menu flags are computed
    const f = flags({ tier: "compact", view: "none", isMarkdown: true })
    // Then no view/chart items appear
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
        // When the menu flags are computed for each
        const f = flags({ tier, view, chartZoomed: true })
        // Then the expanded tier (which shows refresh/interval/split inline)
        // never repeats them in the menu
        if (tier === "expanded") {
          expect(f.showRefreshItem).toBe(false)
          expect(f.showAutoRefreshItem).toBe(false)
          expect(f.showEditorToggleItem).toBe(false)
          expect(f.showResetZoom).toBe(false)
        }
        // And a divider flag is set iff at least one of its items shows
        expect(f.groupAHasItems).toBe(
          f.showViewTable || f.showViewChart || f.showEditorToggleItem,
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
    const next = buildAppliedNotebookState(
      current,
      {
        cells: [{ id: "a", preserveValue: true }, { value: "SELECT 2" }],
      },
      unrequested,
    )
    // Then both cells exist and the diff names them
    expect(next.cells).toHaveLength(2)
    expect(next.diff.updated).toEqual(["a"])
    expect(next.diff.added).toHaveLength(1)
    expect(next.diff.deleted).toEqual([])
  })

  it("applies auto_refresh_default and preserves it on null", () => {
    // Given a notebook with a stored notebook-level default
    const current = {
      cells: [cell("a", "SELECT 1")],
      settings: { autoRefreshDefault: "30s" as const },
      maximizedCellId: null,
    }
    // When apply sets a new default
    const set = buildAppliedNotebookState(
      current,
      {
        autoRefreshDefault: "5s",
        cells: [{ id: "a", preserveValue: true }],
      },
      unrequested,
    )
    // Then the new default is stored
    expect(set.settings.autoRefreshDefault).toBe("5s")
    // When apply passes null
    const preserved = buildAppliedNotebookState(
      current,
      {
        autoRefreshDefault: null,
        cells: [{ id: "a", preserveValue: true }],
      },
      unrequested,
    )
    // Then the stored default survives
    expect(preserved.settings.autoRefreshDefault).toBe("30s")
  })

  const chart = (id: string): NotebookCell => ({
    ...cell(id, "SELECT 1"),
    mode: "draw",
    chartConfig: {
      xColumn: "ts",
      queries: [{ type: "line", yColumns: ["v"] }],
    },
  })
  const chartRequestCell = {
    value: "SELECT 1",
    mode: "draw" as const,
    chartConfig: {
      xColumn: "ts",
      queries: [{ type: "line" as const, yColumns: ["v"] }],
    },
  }

  it("never synthesizes auto_refresh — new and converted charts inherit", () => {
    // Given a notebook with no auto-refresh default
    const current = state([cell("a", "SELECT 1")])
    // When apply converts one cell to a chart and adds another, both without auto_refresh
    const next = buildAppliedNotebookState(
      current,
      {
        cells: [{ ...chartRequestCell, id: "a" }, chartRequestCell],
      },
      unrequested,
    )
    // Then neither chart stores a key — both inherit the notebook default
    expect("autoRefresh" in next.cells[0]).toBe(false)
    expect("autoRefresh" in next.cells[1]).toBe(false)
  })

  it("echoing a chart's explicit auto_refresh keeps it", () => {
    // Given a chart set to Auto
    const current = state([{ ...chart("a"), autoRefresh: true as const }])
    // When an agent echoes the value
    const next = buildAppliedNotebookState(
      current,
      {
        cells: [{ ...chartRequestCell, id: "a", autoRefresh: true }],
      },
      unrequested,
    )
    // Then the chart keeps polling
    expect(next.cells[0].autoRefresh).toBe(true)
  })

  it("apply clears a chart's explicit auto_refresh to inherit when omitted", () => {
    // Given a chart pinned to a fixed interval
    const current = state([{ ...chart("a"), autoRefresh: "5s" as const }])
    // When an agent applies the cell without auto_refresh
    const next = buildAppliedNotebookState(
      current,
      {
        cells: [{ ...chartRequestCell, id: "a" }],
      },
      unrequested,
    )
    // Then the override clears — PUT semantics, no re-stamp
    expect("autoRefresh" in next.cells[0]).toBe(false)
  })

  it("grid layout mode builds a layout for every cell", () => {
    // Given a list-mode notebook
    const current = state([cell("a", "SELECT 1")])
    // When the request switches to grid
    const next = buildAppliedNotebookState(
      current,
      {
        layoutMode: "grid",
        cells: [{ id: "a", preserveValue: true }],
      },
      unrequested,
    )
    // Then grid mode is set with one layout entry per cell
    expect(next.settings.layoutMode).toBe("grid")
    expect(next.settings.layout).toHaveLength(1)
    expect(next.settings.layout?.[0].i).toBe("a")
  })

  it("keeps settings referentially identical when nothing settings-related changed", () => {
    // Given a list-mode notebook
    const current = state([cell("a", "SELECT 1")])
    // When the request touches only cells
    const next = buildAppliedNotebookState(
      current,
      {
        cells: [{ id: "a", value: "SELECT 2" }],
      },
      unrequested,
    )
    // Then the settings object is the same reference
    expect(next.settings).toBe(current.settings)
  })

  it("maximizedCellId: explicit id is kept only when the cell exists", () => {
    const current = state([cell("a", "SELECT 1")])
    // When the request maximizes an existing cell
    const kept = buildAppliedNotebookState(
      current,
      {
        maximizedCellId: "a",
        cells: [{ id: "a", preserveValue: true }],
      },
      unrequested,
    )
    // Then it is kept
    expect(kept.maximizedCellId).toBe("a")
    // When the request maximizes a cell that does not exist
    const dropped = buildAppliedNotebookState(
      current,
      {
        maximizedCellId: "ghost",
        cells: [{ id: "a", preserveValue: true }],
      },
      unrequested,
    )
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
    const next = buildAppliedNotebookState(
      current,
      {
        cells: [{ id: "a", preserveValue: true }],
      },
      unrequested,
    )
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
      buildAppliedNotebookState(current, request, unrequested).settings
        .variables,
    ).toEqual([{ name: "x", value: "1" }])
    // When variables are null → cleared
    expect(
      buildAppliedNotebookState(
        current,
        { ...request, variables: null },
        unrequested,
      ).settings.variables,
    ).toEqual([])
    // When variables are provided → replaced
    expect(
      buildAppliedNotebookState(
        current,
        {
          ...request,
          variables: [{ name: "y", value: "2" }],
        },
        unrequested,
      ).settings.variables,
    ).toEqual([{ name: "y", value: "2" }])
  })
})

describe("topHeight stamping", () => {
  const tenLines = Array.from({ length: 10 }, (_, i) => `SELECT ${i}`).join(
    "\n",
  )

  it("floors topHeightForSql at the default editor height for short SQL", () => {
    expect(topHeightForSql("SELECT 1")).toBe(72)
  })

  it("computes lines × lineHeight + padding beyond the floor", () => {
    expect(topHeightForSql(tenLines)).toBe(10 * 24 + 8)
  })

  it("insertCell stamps topHeight so never-mounted cells keep exact heights", () => {
    // Given an insert of a ten-line SQL cell
    const out = insertCell([], undefined, undefined, { value: tenLines })

    // Then the created cell carries the stamped editor height
    expect(out[0].topHeight).toBe(topHeightForSql(tenLines))
  })

  it("insertCell does not stamp topHeight on markdown cells", () => {
    // Given an insert of a markdown cell (its height is measured, not stamped)
    const out = insertCell([], undefined, undefined, {
      value: "# note",
      type: "markdown",
    })

    // Then no height is stamped
    expect(out[0].topHeight).toBeUndefined()
  })

  it("buildAppliedCells stamps new SQL cells and restamps value changes", () => {
    // Given a fresh agent-built cell
    const { nextCells: created } = buildAppliedCells([], {
      cells: [{ value: tenLines }],
    })
    expect(created[0].topHeight).toBe(topHeightForSql(tenLines))

    // When the same cell's SQL shrinks to one line
    const { nextCells: updated } = buildAppliedCells(created, {
      cells: [{ id: created[0].id, value: "SELECT 1" }],
    })

    // Then the height follows the new SQL
    expect(updated[0].topHeight).toBe(topHeightForSql("SELECT 1"))
  })

  it("buildAppliedCells keeps a user-resized topHeight (hard cap wins)", () => {
    // Given a cell the user resized to a fixed editor height
    const prev: NotebookCell[] = [
      {
        id: "a",
        position: 0,
        value: "SELECT 1",
        topHeight: 300,
        topResized: true,
      },
    ]

    // When an apply changes its SQL
    const { nextCells } = buildAppliedCells(prev, {
      cells: [{ id: "a", value: tenLines }],
    })

    // Then the user's height stays pinned
    expect(nextCells[0].topHeight).toBe(300)
  })
})

describe("pane height ceiling", () => {
  const withResult: NotebookCell = {
    id: "x",
    position: 0,
    value: "SELECT 1",
    topHeight: 100,
    topResized: true,
    result: { results: [], activeResultIndex: 0, timestamp: 0 },
  }

  it("caps the editor estimate for a huge pasted query", () => {
    // Given a query with 100,000 lines
    // When the editor height is estimated
    // Then it stops at the pane ceiling
    expect(topHeightForSql(Array(100_000).fill("x").join("\n"))).toBe(2400)
  })

  it("caps the markdown auto-height snap", () => {
    // Given a markdown height far above the ceiling
    // When it snaps
    // Then it stops at the pane ceiling
    expect(snapMarkdownTopHeight(9_999)).toBe(2400)
  })

  it("caps a south-edge drag that asks for more rows than the ceiling", () => {
    // Given a result-only cell
    // When a drag asks for 500 rows
    // Then the result pane stops at the ceiling
    expect(
      paneHeightsFromGridRows(
        { ...withResult, paneView: "result" },
        500,
        10,
        20,
        false,
      ),
    ).toEqual({ bottomHeight: 2400, bottomResized: true })
  })

  it("limits grid rows to the pane the south edge owns at the ceiling", () => {
    // Given a cell with a 100px editor and a result
    // When the grid bounds are computed for the result-only and split layouts
    // Then maxH covers the ceiling of the pane the edge owns
    // Rounded UP like h, so maxH can never land below the rendered height;
    // the save path clamps any overshoot back to the 2400px pane ceiling.
    // result-only: 2400 + 44 chrome = 2444px → 83 rows
    expect(
      computeCellGridBounds(
        { ...withResult, paneView: "result" },
        10,
        20,
        false,
      ).maxH,
    ).toBe(83)
    // split keeps the 100px editor: 100 + 2400 + 50 = 2550px → 86 rows
    expect(computeCellGridBounds(withResult, 10, 20, false).maxH).toBe(86)
  })

  it("rejects agent heights above the ceiling in apply", () => {
    // Given cell requests with an editor or a result height above the ceiling
    // When applied
    // Then each request is rejected
    expect(() =>
      buildAppliedCells([], {
        cells: [{ value: "SELECT 1", editorHeight: 2401 }],
      }),
    ).toThrow(/maximum is 2400px/)
    expect(() =>
      buildAppliedCells([], {
        cells: [{ value: "SELECT 1", resultHeight: 2401 }],
      }),
    ).toThrow(/maximum is 2400px/)
  })
})
