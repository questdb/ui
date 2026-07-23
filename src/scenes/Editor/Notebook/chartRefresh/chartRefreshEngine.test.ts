import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import type {
  AutoRefresh,
  CellResult,
  NotebookCell,
  SingleQueryResult,
} from "../../../../store/notebook"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import { deleteCellSnapshot } from "../../../../store/notebookResults"
import { persistCellSnapshot } from "../persistCellSnapshot"
import type { CellResultStatus } from "../resultHydration/cellResultHydration"
import {
  ChartRefreshEngine,
  deriveChartLoading,
  type ChartRefreshDeps,
} from "./chartRefreshEngine"
import { toChartResult } from "../DrawCanvas/drawCanvasUtils"

vi.mock("../persistCellSnapshot", () => ({
  persistCellSnapshot: vi.fn().mockResolvedValue(true),
}))

vi.mock("../../../../store/notebookResults", () => ({
  deleteCellSnapshot: vi.fn().mockResolvedValue(undefined),
}))

const BUFFER_ID = 1

const dqlResult = (query: string): QueryExecResult => ({
  type: "dql",
  query,
  columns: [
    { name: "x", type: "INT" },
    { name: "y", type: "INT" },
  ],
  dataset: [[1, 2]],
  count: 1,
})

const dqlCellResult = (query: string, timestamp = 0): CellResult => ({
  results: [
    {
      type: "dql",
      query,
      columns: [{ name: "x", type: "INT" }],
      dataset: [[1]],
      count: 1,
      timestamp: 0,
    },
  ],
  activeResultIndex: 0,
  timestamp,
})

const drawCell = (
  id: string,
  value: string,
  autoRefresh: AutoRefresh,
): NotebookCell => ({
  id,
  position: 0,
  value,
  mode: "draw",
  autoRefresh,
})

const dqlValidation = { query: "q", columns: [], timestamp: 0 }

// Backs getCellResult with whatever setCellResult last wrote — the engine
// dedups against the CURRENT cell result, so a fake returning undefined would
// silently disable dedup and over-count writes. The load fakes stand in for
// the hydration engine: requestResultLoad settles "missing" synchronously by
// default; tests that model a snapshot load override it to "loading" and
// settle through settleLoad.
const makeDeps = () => {
  const cellResults = new Map<string, CellResult | undefined>()
  const loadStatuses = new Map<string, CellResultStatus>()
  const loadListeners = new Map<string, Set<() => void>>()
  const deps = {
    executeSingle: vi.fn((sql: string) => Promise.resolve(dqlResult(sql))),
    validateWithGlobals: vi.fn().mockResolvedValue(dqlValidation),
    setCellResult: vi.fn((cellId: string, result: CellResult | undefined) => {
      cellResults.set(cellId, result)
    }),
    getCellResult: vi.fn((cellId: string) => cellResults.get(cellId)),
    isDrawCell: vi.fn(() => true),
    resultLoadStatus: vi.fn(
      (cellId: string): CellResultStatus =>
        loadStatuses.get(cellId) ?? "unrequested",
    ),
    subscribeResultLoad: vi.fn((cellId: string, listener: () => void) => {
      let set = loadListeners.get(cellId)
      if (!set) {
        set = new Set()
        loadListeners.set(cellId, set)
      }
      set.add(listener)
      return () => {
        loadListeners.get(cellId)?.delete(listener)
      }
    }),
    requestResultLoad: vi.fn((cellId: string) => {
      loadStatuses.set(cellId, "missing")
    }),
    noteResultMissing: vi.fn((cellId: string) => {
      loadStatuses.set(cellId, "missing")
    }),
    onSnapshotPersisted: vi.fn<[string, SingleQueryResult[]], void>(),
  }
  const beginLoadOnRequest = () => {
    deps.requestResultLoad.mockImplementation((cellId: string) => {
      loadStatuses.set(cellId, "loading")
    })
  }
  const settleLoad = (
    cellId: string,
    outcome: CellResult | "missing" | "failed",
  ) => {
    if (outcome === "missing" || outcome === "failed") {
      loadStatuses.set(cellId, outcome)
    } else {
      cellResults.set(cellId, outcome)
      loadStatuses.set(cellId, "loaded")
    }
    loadListeners.get(cellId)?.forEach((listener) => listener())
  }
  return {
    deps,
    cellResults,
    loadStatuses,
    loadListeners,
    beginLoadOnRequest,
    settleLoad,
  }
}

const flushAsync = async () => {
  await vi.advanceTimersByTimeAsync(0)
}

// The node test environment has no document; the engine only needs the
// visibility surface, so stub exactly that.
const fakeDocument = Object.assign(new EventTarget(), { hidden: false })

const setDocumentHidden = (hidden: boolean) => {
  fakeDocument.hidden = hidden
  fakeDocument.dispatchEvent(new Event("visibilitychange"))
}

describe("ChartRefreshEngine", () => {
  let harness: ReturnType<typeof makeDeps>
  let deps: ReturnType<typeof makeDeps>["deps"]
  let cellResults: ReturnType<typeof makeDeps>["cellResults"]
  let engine: ChartRefreshEngine

  // Entries start hidden until an observer reports them (no init-load fetch
  // burst); tests that model on-screen cells report visibility before sync.
  const syncOnScreen = (cells: NotebookCell[]) => {
    for (const cell of cells) engine.setVisible(cell.id, true)
    engine.sync(cells)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    fakeDocument.hidden = false
    ;(globalThis as { document?: unknown }).document = fakeDocument
    harness = makeDeps()
    deps = harness.deps
    cellResults = harness.cellResults
    // Jitter off: tests assert exact fetch timing.
    engine = new ChartRefreshEngine(BUFFER_ID, () => deps as ChartRefreshDeps, {
      initialFetchJitterMs: 0,
    })
    engine.attach()
  })

  afterEach(() => {
    engine.destroy()
    delete (globalThis as { document?: unknown }).document
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it("fetches once for a draw cell with auto-refresh off", async () => {
    // Given a draw cell with auto-refresh disabled and no prior data
    const cell = drawCell("c1", "select 1", false)

    // When the engine syncs it
    syncOnScreen([cell])
    await flushAsync()

    // Then it executes the query exactly once and settles the state
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
    expect(deps.executeSingle).toHaveBeenCalledWith(
      "select 1",
      expect.any(AbortSignal),
      10_000,
    )
    const state = engine.getState("c1")
    expect(state?.settledKey).toBe(state?.queriesKey)

    // And no further fetches happen over time
    await vi.advanceTimersByTimeAsync(120_000)
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
  })

  it("writes fetched results into the cell result", async () => {
    // Given a draw cell whose query succeeds
    syncOnScreen([drawCell("c1", "select 1", false)])

    // When the fetch completes
    await flushAsync()

    // Then every statement lands in cell.result so the grid shows the same data
    expect(deps.setCellResult).toHaveBeenCalledTimes(1)
    const result = cellResults.get("c1")
    expect(result?.results).toHaveLength(1)
    expect(result?.results[0]).toMatchObject({ type: "dql", query: "select 1" })
  })

  it("skips the cell write when a poll tick returns an identical frame", async () => {
    // Given a polling cell whose query returns the same rows every tick
    syncOnScreen([drawCell("c1", "select 1", "1s")])
    await flushAsync()
    expect(deps.setCellResult).toHaveBeenCalledTimes(1)

    // When several ticks pass
    await vi.advanceTimersByTimeAsync(3000)

    // Then the unchanged frames never re-write the cell
    expect(deps.executeSingle.mock.calls.length).toBeGreaterThan(1)
    expect(deps.setCellResult).toHaveBeenCalledTimes(1)
  })

  it("re-writes an identical frame after the result was released from memory", async () => {
    // Given a polling cell that settled a frame
    syncOnScreen([drawCell("c1", "select 1", "1s")])
    await flushAsync()
    expect(deps.setCellResult).toHaveBeenCalledTimes(1)

    // When the hydration engine releases cell.result and the next tick
    // returns the same rows
    cellResults.delete("c1")
    await vi.advanceTimersByTimeAsync(1000)

    // Then the frame is written again — the chart must not stay empty
    expect(deps.setCellResult).toHaveBeenCalledTimes(2)
    expect(cellResults.get("c1")?.results).toHaveLength(1)
  })

  describe("snapshot persistence", () => {
    const incrementingResults = () => {
      let tick = 0
      return vi.fn((_sql: string) => {
        tick += 1
        return Promise.resolve<QueryExecResult>({
          type: "dql",
          query: "select 1",
          columns: [{ name: "x", type: "INT" }],
          dataset: [[tick]],
          count: 1,
        })
      })
    }

    it("persists a snapshot after a successful fetch", async () => {
      // Given a draw cell whose query returns rows
      // When it fetches
      syncOnScreen([drawCell("c1", "select 1", false)])
      await flushAsync()

      // Then the frame is persisted under the cell's id
      expect(persistCellSnapshot).toHaveBeenCalledTimes(1)
      const snapshot = vi.mocked(persistCellSnapshot).mock.calls[0][0]
      expect(snapshot).toMatchObject({ bufferId: BUFFER_ID, cellId: "c1" })
      expect(snapshot.results).toHaveLength(1)
    })

    it("notifies the persisted frame with the exact array held by the cell", async () => {
      // Given a draw cell whose fetch persists
      // When the save confirms
      syncOnScreen([drawCell("c1", "select 1", false)])
      await flushAsync()

      // Then onSnapshotPersisted receives the same array instance that sits in
      // cell.result, so the hydration engine can mark it releasable
      expect(deps.onSnapshotPersisted).toHaveBeenCalledTimes(1)
      const [cellId, results] = deps.onSnapshotPersisted.mock.calls[0]
      expect(cellId).toBe("c1")
      expect(results).toBe(cellResults.get("c1")?.results)
    })

    it("does not notify when the save fails", async () => {
      // Given a save that fails
      vi.mocked(persistCellSnapshot).mockResolvedValueOnce(false)

      // When the cell fetches
      syncOnScreen([drawCell("c1", "select 1", false)])
      await flushAsync()

      // Then the frame is not reported as persisted
      expect(deps.onSnapshotPersisted).not.toHaveBeenCalled()
    })

    it("re-persists an identical frame after a failed save", async () => {
      // Given a polling cell whose first save fails
      vi.mocked(persistCellSnapshot).mockResolvedValueOnce(false)
      syncOnScreen([drawCell("c1", "select 1", "1s")])
      await flushAsync()
      expect(persistCellSnapshot).toHaveBeenCalledTimes(1)

      // When later ticks return the identical frame
      await vi.advanceTimersByTimeAsync(11_000)

      // Then the frame is saved again once the throttle window reopens —
      // identical data does not excuse a failed persist
      expect(
        vi.mocked(persistCellSnapshot).mock.calls.length,
      ).toBeGreaterThanOrEqual(2)
      expect(deps.onSnapshotPersisted).toHaveBeenCalled()
    })

    it("throttles snapshot writes while the chart auto-refreshes", async () => {
      // Given an auto-refreshing cell whose data changes every tick
      deps.executeSingle = incrementingResults()

      // When it polls once per second
      syncOnScreen([drawCell("c1", "select 1", "1s")])
      await flushAsync()
      expect(persistCellSnapshot).toHaveBeenCalledTimes(1)

      // Then ticks inside the 10s throttle window don't re-persist
      await vi.advanceTimersByTimeAsync(9000)
      expect(persistCellSnapshot).toHaveBeenCalledTimes(1)

      // And the first tick past the window persists again
      await vi.advanceTimersByTimeAsync(2000)
      expect(persistCellSnapshot).toHaveBeenCalledTimes(2)
    })

    it("does not re-persist an unchanged frame", async () => {
      // Given an auto-refreshing cell whose query returns identical rows
      // When it polls well past the throttle window
      syncOnScreen([drawCell("c1", "select 1", "1s")])
      await flushAsync()
      await vi.advanceTimersByTimeAsync(30000)

      // Then only the first frame is persisted — the rest dedupe away
      expect(persistCellSnapshot).toHaveBeenCalledTimes(1)
    })

    it("persists the full frame with tabs and summary, like a run would", async () => {
      // Given a two-statement script where the second statement errors
      deps.executeSingle = vi.fn((sql: string) =>
        sql === "select 2"
          ? Promise.resolve<QueryExecResult>({
              type: "error",
              query: sql,
              columns: [],
              dataset: [],
              count: 0,
              error: "boom",
            })
          : Promise.resolve(dqlResult(sql)),
      )

      // When the chart fetches
      syncOnScreen([drawCell("c1", "select 1; select 2", false)])
      await flushAsync()

      // Then the snapshot keeps every statement — error tab included — plus
      // the script summary and tab index a run-mode save would have written,
      // so a reload in run mode restores an undegraded grid
      expect(persistCellSnapshot).toHaveBeenCalledTimes(1)
      const snapshot = vi.mocked(persistCellSnapshot).mock.calls[0][0]
      expect(snapshot.results.map((r) => r.type)).toEqual(["dql", "error"])
      expect(snapshot.activeResultIndex).toBe(0)
      expect(snapshot.script).toMatchObject({ successCount: 1, failedCount: 1 })
    })

    it("saves a throttled final frame once the window reopens, even if polling stopped", async () => {
      // Given an auto-refreshing cell whose data changes every tick
      deps.executeSingle = incrementingResults()
      syncOnScreen([drawCell("c1", "select 1", "1s")])
      await flushAsync()
      expect(persistCellSnapshot).toHaveBeenCalledTimes(1)

      // When a changed frame lands inside the throttle window and the cell
      // then scrolls out of view (polling pauses, no further ticks retry)
      await vi.advanceTimersByTimeAsync(1000)
      engine.setVisible("c1", false)
      expect(persistCellSnapshot).toHaveBeenCalledTimes(1)

      // Then the blocked frame persists when the throttle window reopens
      await vi.advanceTimersByTimeAsync(10_000)
      expect(persistCellSnapshot).toHaveBeenCalledTimes(2)
    })

    it("flushes a throttled frame to storage on demand", async () => {
      // Given a changed frame blocked by the throttle after polling paused
      deps.executeSingle = incrementingResults()
      syncOnScreen([drawCell("c1", "select 1", "1s")])
      await flushAsync()
      expect(persistCellSnapshot).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1000)
      engine.setVisible("c1", false)
      expect(persistCellSnapshot).toHaveBeenCalledTimes(1)

      // When a flush is requested before the throttle window reopens
      await engine.flushPendingSnapshots()

      // Then the latest frame is written now, not after the remaining window
      expect(persistCellSnapshot).toHaveBeenCalledTimes(2)
      const flushed = vi.mocked(persistCellSnapshot).mock.calls[1][0].results[0]
      if (flushed.type !== "dql") throw new Error("expected dql")
      expect(flushed.dataset).toEqual([[2]])

      // And the reopening window has nothing left to persist
      await vi.advanceTimersByTimeAsync(10_000)
      expect(persistCellSnapshot).toHaveBeenCalledTimes(2)
    })

    it("drops a pending throttled frame when the SQL changes", async () => {
      // Given an auto-refreshing cell with a changed frame blocked by the throttle
      deps.executeSingle = incrementingResults()
      syncOnScreen([drawCell("c1", "select 1", "1s")])
      await flushAsync()
      await vi.advanceTimersByTimeAsync(1000)
      expect(persistCellSnapshot).toHaveBeenCalledTimes(1)

      // When the SQL changes before the throttle window reopens
      engine.sync([drawCell("c1", "select 2", false)])
      await vi.advanceTimersByTimeAsync(301)
      await flushAsync()
      expect(persistCellSnapshot).toHaveBeenCalledTimes(2)

      // Then the old SQL's blocked frame never persists under the new SQL
      await vi.advanceTimersByTimeAsync(15_000)
      expect(persistCellSnapshot).toHaveBeenCalledTimes(2)
    })

    it("clears the persisted snapshot when a fetch yields no chartable rows", async () => {
      // Given a query that returns an empty result set
      deps.executeSingle = vi.fn((_sql: string) =>
        Promise.resolve<QueryExecResult>({
          type: "dql",
          query: "select 1",
          columns: [{ name: "x", type: "INT" }],
          dataset: [],
          count: 0,
        }),
      )

      // When the cell fetches
      syncOnScreen([drawCell("c1", "select 1", false)])
      await flushAsync()

      // Then nothing is saved and the stale snapshot is deleted
      expect(persistCellSnapshot).not.toHaveBeenCalled()
      expect(deleteCellSnapshot).toHaveBeenCalledWith(BUFFER_ID, "c1")
    })

    it("retries a failed snapshot delete on the next rowless frame", async () => {
      // Given a polling chart whose first snapshot delete will fail
      vi.mocked(deleteCellSnapshot).mockRejectedValueOnce(new Error("locked"))
      syncOnScreen([drawCell("c1", "select 1", "1s")])
      await flushAsync()
      expect(persistCellSnapshot).toHaveBeenCalledTimes(1)

      // When the query starts returning no rows
      deps.executeSingle = vi.fn((sql: string) =>
        Promise.resolve<QueryExecResult>({
          type: "dql",
          query: sql,
          columns: [{ name: "x", type: "INT" }],
          dataset: [],
          count: 0,
        }),
      )
      await vi.advanceTimersByTimeAsync(1000)
      expect(deleteCellSnapshot).toHaveBeenCalledTimes(1)

      // And the identical rowless frame arrives on the next tick
      await vi.advanceTimersByTimeAsync(1000)

      // Then the delete is retried — old rows must not survive on disk to be
      // resurrected on reload
      expect(
        vi.mocked(deleteCellSnapshot).mock.calls.length,
      ).toBeGreaterThanOrEqual(2)

      // And once a delete confirms, further rowless ticks stop re-deleting
      const settledCount = vi.mocked(deleteCellSnapshot).mock.calls.length
      await vi.advanceTimersByTimeAsync(2000)
      expect(deleteCellSnapshot).toHaveBeenCalledTimes(settledCount)
    })

    it("drops the throttle-blocked frame when the cell leaves draw mode", async () => {
      // Given a polling chart with a changed frame blocked by the throttle
      deps.executeSingle = incrementingResults()
      syncOnScreen([drawCell("c1", "select 1", "1s")])
      await flushAsync()
      await vi.advanceTimersByTimeAsync(1000)
      expect(persistCellSnapshot).toHaveBeenCalledTimes(1)

      // When the user switches the cell back to run mode
      engine.sync([{ ...drawCell("c1", "select 1", "1s"), mode: "run" }])
      await vi.advanceTimersByTimeAsync(15_000)

      // Then the blocked frame never persists — saving it would resurrect the
      // snapshot the toggle-off just deleted
      expect(persistCellSnapshot).toHaveBeenCalledTimes(1)
    })

    it("persists the throttle-blocked final frame on engine teardown", async () => {
      // Given a polling chart with a changed frame blocked by the throttle
      deps.executeSingle = incrementingResults()
      syncOnScreen([drawCell("c1", "select 1", "1s")])
      await flushAsync()
      await vi.advanceTimersByTimeAsync(1000)
      expect(persistCellSnapshot).toHaveBeenCalledTimes(1)

      // When the notebook unmounts mid-throttle
      engine.destroy()

      // Then the final frame persists so a reload restores the latest data
      expect(persistCellSnapshot).toHaveBeenCalledTimes(2)
      const snapshot = vi.mocked(persistCellSnapshot).mock.calls[1][0]
      expect(snapshot.results).toBe(cellResults.get("c1")?.results)
    })

    it("discards a fetch that resolves after the cell left draw mode", async () => {
      // Given a draw cell whose fetch response is still in flight
      let resolveFetch: () => void = () => {}
      deps.executeSingle = vi.fn(
        (sql: string) =>
          new Promise<QueryExecResult>((resolve) => {
            resolveFetch = () => resolve(dqlResult(sql))
          }),
      )
      syncOnScreen([drawCell("c1", "select 1", false)])
      await flushAsync()

      // When the cell exits draw mode before the response lands (the engine's
      // teardown effect has not run yet, so nothing aborted the fetch)
      deps.isDrawCell.mockReturnValue(false)
      resolveFetch()
      await flushAsync()

      // Then no chart rows land in the run-mode cell and nothing persists
      expect(deps.setCellResult).not.toHaveBeenCalled()
      expect(persistCellSnapshot).not.toHaveBeenCalled()
    })

    it("drops the throttle-blocked frame when the cell is deleted", async () => {
      // Given a polling chart with a changed frame blocked by the throttle
      deps.executeSingle = incrementingResults()
      syncOnScreen([drawCell("c1", "select 1", "1s")])
      await flushAsync()
      await vi.advanceTimersByTimeAsync(1000)
      expect(persistCellSnapshot).toHaveBeenCalledTimes(1)

      // When the cell is deleted outright
      engine.sync([])
      await vi.advanceTimersByTimeAsync(15_000)

      // Then the blocked frame never persists — no orphan record
      expect(persistCellSnapshot).toHaveBeenCalledTimes(1)
    })
  })

  describe("settling from existing data", () => {
    it("settles on a matching cell result with rows instead of fetching", async () => {
      // Given a cell result produced by the exact same query (grid → chart)
      cellResults.set("c1", dqlCellResult("select 1"))

      // When the engine syncs the draw cell with auto-refresh off
      syncOnScreen([drawCell("c1", "select 1", false)])
      await flushAsync()

      // Then the data settles without a fetch or a re-write
      expect(deps.executeSingle).not.toHaveBeenCalled()
      expect(deps.setCellResult).not.toHaveBeenCalled()
      const state = engine.getState("c1")
      expect(state?.settledKey).toBe(state?.queriesKey)
    })

    it("fetches when the result holds running leftovers from an aborted run", async () => {
      // Given a run → draw switch that left transient entries behind
      cellResults.set("c1", {
        results: [{ type: "running", query: "select 1" }],
        activeResultIndex: 0,
        timestamp: 0,
      })

      // When the engine syncs the draw cell
      syncOnScreen([drawCell("c1", "select 1", false)])
      await flushAsync()

      // Then it fetches fresh data instead of settling on the transient
      expect(deps.executeSingle).toHaveBeenCalledTimes(1)
      expect(cellResults.get("c1")?.results[0]).toMatchObject({ type: "dql" })
    })

    it("fetches when the matching result has no chartable rows", async () => {
      // Given an adopted result whose only statement errored
      cellResults.set("c1", {
        results: [{ type: "error", query: "select 1", error: "boom" }],
        activeResultIndex: 0,
        timestamp: 0,
      })

      // When the engine syncs the draw cell
      syncOnScreen([drawCell("c1", "select 1", false)])
      await flushAsync()

      // Then it fetches instead of settling on a rowless frame
      expect(deps.executeSingle).toHaveBeenCalledTimes(1)
    })

    it("keeps an engine-settled error frame without refetching on reveal", async () => {
      // Given a fetch that settled with a server-side error
      deps.executeSingle.mockImplementation((sql: string) =>
        Promise.resolve({
          type: "error",
          query: sql,
          columns: [],
          dataset: [],
          count: 0,
          error: "table does not exist",
        } as QueryExecResult),
      )
      syncOnScreen([drawCell("c1", "select 1", false)])
      await flushAsync()
      expect(deps.executeSingle).toHaveBeenCalledTimes(1)

      // When the cell is hidden and revealed again
      engine.setVisible("c1", false)
      engine.setVisible("c1", true)
      await flushAsync()

      // Then the settled error frame stands — no refetch loop
      expect(deps.executeSingle).toHaveBeenCalledTimes(1)
    })

    it("waits for an in-flight result load and settles on the loaded frame", async () => {
      // Given a snapshot load that starts when the engine asks for data
      harness.beginLoadOnRequest()
      syncOnScreen([drawCell("c1", "select 1", false)])
      await flushAsync()
      expect(deps.executeSingle).not.toHaveBeenCalled()

      // When the load settles with a matching frame
      harness.settleLoad("c1", dqlCellResult("select 1"))
      await flushAsync()

      // Then the chart settles on it without fetching
      expect(deps.executeSingle).not.toHaveBeenCalled()
      const state = engine.getState("c1")
      expect(state?.settledKey).toBe(state?.queriesKey)
    })

    it("fetches after a result load settles missing", async () => {
      // Given a snapshot load in flight
      harness.beginLoadOnRequest()
      syncOnScreen([drawCell("c1", "select 1", false)])
      await flushAsync()
      expect(deps.executeSingle).not.toHaveBeenCalled()

      // When the load finds no snapshot
      harness.settleLoad("c1", "missing")
      await flushAsync()

      // Then the engine falls back to a live fetch
      expect(deps.executeSingle).toHaveBeenCalledTimes(1)
    })

    it("fetches after a result load fails", async () => {
      // Given a snapshot load in flight
      harness.beginLoadOnRequest()
      syncOnScreen([drawCell("c1", "select 1", false)])
      await flushAsync()

      // When the load exhausts its retries
      harness.settleLoad("c1", "failed")
      await flushAsync()

      // Then the engine falls back to a live fetch instead of hanging
      expect(deps.executeSingle).toHaveBeenCalledTimes(1)
    })

    it("fetches when the loaded snapshot is truncated", async () => {
      // Given a load that restores a byte-capped frame
      harness.beginLoadOnRequest()
      syncOnScreen([drawCell("c1", "select 1", false)])
      await flushAsync()

      // When the truncated frame lands
      harness.settleLoad("c1", {
        results: [
          {
            type: "dql",
            query: "select 1",
            columns: [{ name: "x", type: "INT" }],
            dataset: [[1]],
            count: 5000,
            timestamp: 0,
            truncated: true,
          },
        ],
        activeResultIndex: 0,
        timestamp: 0,
      })
      await flushAsync()

      // Then the partial rows don't settle the chart — it refetches the frame
      expect(deps.executeSingle).toHaveBeenCalledTimes(1)
    })

    it("unsubscribes a pending load wait on destroy", async () => {
      // Given an engine waiting on a result load
      harness.beginLoadOnRequest()
      syncOnScreen([drawCell("c1", "select 1", false)])
      await flushAsync()
      expect(harness.loadListeners.get("c1")?.size).toBe(1)

      // When the engine is destroyed mid-wait
      engine.destroy()

      // Then the listener is gone and a late settle reaches nothing
      expect(harness.loadListeners.get("c1")?.size).toBe(0)
      harness.settleLoad("c1", dqlCellResult("select 1"))
      await flushAsync()
      expect(deps.executeSingle).not.toHaveBeenCalled()
    })
  })

  it("clears result, load status and snapshot when the SQL becomes empty", async () => {
    // Given a settled draw cell with a frame and a snapshot
    syncOnScreen([drawCell("c1", "select 1", false)])
    await flushAsync()
    expect(cellResults.get("c1")).toBeDefined()

    // When the SQL is cleared
    engine.sync([drawCell("c1", "", false)])
    await vi.advanceTimersByTimeAsync(301)
    await flushAsync()

    // Then memory, hydration status and disk are invalidated together, so an
    // in-flight snapshot read cannot resurrect the cleared rows
    expect(cellResults.get("c1")).toBeUndefined()
    expect(deps.noteResultMissing).toHaveBeenCalledWith("c1")
    expect(deleteCellSnapshot).toHaveBeenCalledWith(BUFFER_ID, "c1")
  })

  it("does not skip the catch-up fetch after a poll aborted during its start jitter", async () => {
    // Given a jittered engine whose cell holds an old settled frame
    const jittered = new ChartRefreshEngine(
      BUFFER_ID,
      () => deps as ChartRefreshDeps,
      { initialFetchJitterMs: 300 },
    )
    cellResults.set("c1", dqlCellResult("select 1"))
    jittered.setVisible("c1", true)
    jittered.sync([drawCell("c1", "select 1", "1s")])

    // When the poll is aborted mid-jitter (cell hidden), the data goes stale
    // off-screen, and the cell is then revealed again
    jittered.setVisible("c1", false)
    await vi.advanceTimersByTimeAsync(5000)
    jittered.setVisible("c1", true)
    await vi.advanceTimersByTimeAsync(300)

    // Then the resumed poll fetches immediately instead of waiting an interval
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
    jittered.destroy()
  })

  it("polls on a fixed interval without any mounted component", async () => {
    // Given a draw cell with a fixed 1s auto-refresh interval
    syncOnScreen([drawCell("c1", "select 1", "1s")])

    // When the poll loop runs — an immediate first fetch, then one per interval
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)

    // Then each elapsed interval triggers exactly one more fetch
    await vi.advanceTimersByTimeAsync(1000)
    expect(deps.executeSingle).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(deps.executeSingle).toHaveBeenCalledTimes(3)
  })

  it("skips the poll's immediate first fetch when a fresh result was adopted", async () => {
    // Given a just-run grid result and a fixed 1s interval
    cellResults.set("c1", dqlCellResult("select 1", Date.now()))

    // When the engine syncs the cell
    syncOnScreen([drawCell("c1", "select 1", "1s")])
    await flushAsync()

    // Then the adopted frame serves as the first tick, and the poll only
    // fetches after one full interval
    expect(deps.executeSingle).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
  })

  it("polls immediately when the adopted result is old", async () => {
    // Given a stale settled frame (a snapshot from a previous session)
    cellResults.set("c1", dqlCellResult("select 1", 0))

    // When the engine syncs the polling cell
    syncOnScreen([drawCell("c1", "select 1", "1s")])
    await flushAsync()

    // Then the poll refreshes the old frame right away
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
  })

  it("keeps polling after a chart → grid → chart toggle without new observer events", async () => {
    // Given a visible polling chart
    syncOnScreen([drawCell("c1", "select 1", "1s")])
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)

    // When the user switches to the grid and back — the cell never leaves the
    // viewport, so the visibility observer reports nothing new
    engine.sync([{ ...drawCell("c1", "select 1", "1s"), mode: "run" }])
    engine.sync([drawCell("c1", "select 1", "1s")])
    await flushAsync()

    // Then the recreated entry still counts as visible and the poll resumes
    const callsAtReturn = deps.executeSingle.mock.calls.length
    await vi.advanceTimersByTimeAsync(3000)
    expect(deps.executeSingle.mock.calls.length).toBeGreaterThan(callsAtReturn)
  })

  it("drops the visibility record only when the cell is deleted", async () => {
    // Given a visible polling chart
    syncOnScreen([drawCell("c1", "select 1", "1s")])
    await flushAsync()

    // When the cell is deleted and later a NEW cell reuses nothing of it
    engine.sync([])
    engine.sync([drawCell("c1", "select 1", "1s")])
    await flushAsync()

    // Then the recreated entry starts hidden until an observer reports it
    const calls = deps.executeSingle.mock.calls.length
    await vi.advanceTimersByTimeAsync(3000)
    expect(deps.executeSingle.mock.calls.length).toBe(calls)
  })

  it("stops polling when the cell leaves draw mode", async () => {
    // Given a polling draw cell
    syncOnScreen([drawCell("c1", "select 1", "1s")])
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)

    // When the cell is no longer in draw mode
    engine.sync([{ ...drawCell("c1", "select 1", "1s"), mode: "run" }])

    // Then no further fetches happen and the entry's state is gone
    await vi.advanceTimersByTimeAsync(10_000)
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
    expect(engine.getState("c1")).toBeUndefined()
  })

  it("refetches when the refresh-chart event fires, even with auto-refresh off", async () => {
    // Given a settled draw cell with auto-refresh off
    syncOnScreen([drawCell("c1", "select 1", false)])
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)

    // When the toolbar publishes a manual refresh
    eventBus.publish(EventType.NOTEBOOK_CELL_REFRESH_CHART, { cellId: "c1" })
    await flushAsync()

    // Then the cell refetches once
    expect(deps.executeSingle).toHaveBeenCalledTimes(2)
  })

  it("debounces SQL changes before refetching", async () => {
    // Given a settled draw cell
    syncOnScreen([drawCell("c1", "select 1", false)])
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)

    // When the SQL changes
    engine.sync([drawCell("c1", "select 2", false)])

    // Then nothing refetches inside the debounce window
    await vi.advanceTimersByTimeAsync(299)
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)

    // And the new SQL fetches once the debounce elapses
    await vi.advanceTimersByTimeAsync(301)
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(2)
    expect(deps.executeSingle).toHaveBeenLastCalledWith(
      "select 2",
      expect.any(AbortSignal),
      10_000,
    )
  })

  it("keeps the old frame in the cell while the new query fetches", async () => {
    // Given a settled draw cell showing the old query's rows
    syncOnScreen([drawCell("c1", "select 1", false)])
    await flushAsync()
    const oldFrame = cellResults.get("c1")
    expect(oldFrame?.results[0]).toMatchObject({ query: "select 1" })

    // When the SQL changes and the new query's fetch begins but hasn't landed
    deps.executeSingle = vi.fn(
      (_sql: string) => new Promise<QueryExecResult>(() => undefined),
    )
    engine.sync([drawCell("c1", "select 2", false)])
    await vi.advanceTimersByTimeAsync(301)
    await flushAsync()

    // Then the grid keeps the old rows (the chart gates them out as stale)
    // and the engine reports the fetch in flight
    expect(cellResults.get("c1")).toBe(oldFrame)
    expect(engine.getState("c1")?.fetching).toBe(true)
    expect(toChartResult(cellResults.get("c1"), ["select 2"]).kind).toBe(
      "stale",
    )
  })

  it("keeps the frame and skips refetching on a formatting-only SQL change", async () => {
    // Given a settled draw cell showing results
    syncOnScreen([drawCell("c1", "select 1", false)])
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
    const frame = cellResults.get("c1")

    // When the SQL only gains whitespace and a trailing semicolon
    engine.sync([drawCell("c1", "select 1;\n", false)])
    await vi.advanceTimersByTimeAsync(301)
    await flushAsync()

    // Then the displayed frame survives without a refetch
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
    expect(cellResults.get("c1")).toBe(frame)
    const state = engine.getState("c1")
    expect(state?.settledKey).toBe(state?.queriesKey)
  })

  it("never executes a query that fails validation, and blocks it once it resolves to a write", async () => {
    // Given a polling draw cell whose INSERT fails validation because its
    // target table does not exist yet (reachable via edit-in-draw or the
    // agent path, which skip the UI's all-DQL gate)
    deps.validateWithGlobals.mockResolvedValue({
      query: "insert into t select 1",
      position: 0,
      error: "table does not exist [table=t]",
    })

    // When the engine syncs it
    syncOnScreen([drawCell("c1", "insert into t select 1", "1s")])
    await flushAsync()

    // Then the query never executes and the validation error reaches the cell
    expect(deps.executeSingle).not.toHaveBeenCalled()
    expect(cellResults.get("c1")?.results[0]).toMatchObject({
      type: "error",
      error: "table does not exist [table=t]",
    })

    // When the table appears and the query now classifies as a write
    deps.validateWithGlobals.mockResolvedValue({ queryType: "insert" })
    await vi.advanceTimersByTimeAsync(1000)

    // Then the next tick blocks the write instead of silently running it,
    // and the stale error rows are dropped from the cell
    expect(deps.executeSingle).not.toHaveBeenCalled()
    expect(engine.getState("c1")?.classifyBlock).toEqual({
      kind: "write",
      queryType: "insert",
    })
    expect(cellResults.get("c1")).toBeUndefined()
    expect(deps.noteResultMissing).toHaveBeenCalledWith("c1")
  })

  it("re-validates an erroring query each tick until it charts as DQL", async () => {
    // Given a polling draw cell whose query fails validation at first
    deps.validateWithGlobals.mockResolvedValueOnce({
      query: "select * from t",
      position: 0,
      error: "table does not exist [table=t]",
    })

    // When the engine syncs it
    syncOnScreen([drawCell("c1", "select * from t", "1s")])
    await flushAsync()
    expect(deps.executeSingle).not.toHaveBeenCalled()
    expect(deps.validateWithGlobals).toHaveBeenCalledTimes(1)

    // Then the next tick re-validates, classifies DQL and executes
    await vi.advanceTimersByTimeAsync(1000)
    expect(deps.validateWithGlobals).toHaveBeenCalledTimes(2)
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
    expect(cellResults.get("c1")?.results[0]).toMatchObject({ type: "dql" })

    // And the settled DQL class is cached — later ticks skip validation
    await vi.advanceTimersByTimeAsync(1000)
    expect(deps.validateWithGlobals).toHaveBeenCalledTimes(2)
    expect(deps.executeSingle).toHaveBeenCalledTimes(2)
  })

  it("blocks write queries from executing", async () => {
    // Given a cell whose SQL classifies as a write
    deps.validateWithGlobals.mockResolvedValue({ queryType: "update" })

    // When the engine syncs it
    syncOnScreen([drawCell("c1", "update t set x = 1", false)])
    await flushAsync()

    // Then the query never executes and the block reaches the state
    expect(deps.executeSingle).not.toHaveBeenCalled()
    const state = engine.getState("c1")
    expect(state?.classifyBlock).toEqual({ kind: "write", queryType: "update" })
  })

  it("does not poll a cell that is hidden before it enters draw mode", async () => {
    // Given the observer reported the cell offscreen before it became a chart
    engine.setVisible("c1", false)

    // When the engine syncs the polling draw cell
    engine.sync([drawCell("c1", "select 1", "1s")])
    await flushAsync()

    // Then no fetch happens no matter how much time passes
    await vi.advanceTimersByTimeAsync(10_000)
    expect(deps.executeSingle).not.toHaveBeenCalled()
  })

  it("asks for no data at all for a draw cell outside the bands", async () => {
    // Given a hidden draw cell no observer has reported yet
    // When the engine syncs it
    engine.sync([drawCell("c1", "select 1", "1s")])
    await flushAsync()

    // Then no result load, no cell write, and no fetch happen off-band
    expect(deps.requestResultLoad).not.toHaveBeenCalled()
    expect(deps.setCellResult).not.toHaveBeenCalled()
    expect(deps.executeSingle).not.toHaveBeenCalled()
  })

  it("requests the result load when the retain band asks, without fetching", async () => {
    // Given a hidden draw cell whose snapshot loads asynchronously
    harness.beginLoadOnRequest()
    engine.sync([drawCell("c1", "select 1", "1s")])

    // When the retain band reports the cell approaching
    engine.requestHydrate("c1")
    await flushAsync()
    harness.settleLoad("c1", dqlCellResult("select 1"))
    await flushAsync()

    // Then the loaded frame settles without any live fetch (the cell stays
    // outside the mount band)
    expect(deps.requestResultLoad).toHaveBeenCalledTimes(1)
    expect(deps.executeSingle).not.toHaveBeenCalled()
    const state = engine.getState("c1")
    expect(state?.settledKey).toBe(state?.queriesKey)

    // And a repeated band report does not re-request
    engine.requestHydrate("c1")
    await flushAsync()
    expect(deps.requestResultLoad).toHaveBeenCalledTimes(1)
  })

  it("falls through to the fetch on reveal when no snapshot exists", async () => {
    // Given a draw cell born hidden inside the retain band
    engine.sync([drawCell("c1", "select 1", false)])
    await flushAsync()
    expect(deps.requestResultLoad).not.toHaveBeenCalled()

    // When the cell reaches the mount band directly
    engine.setVisible("c1", true)
    await flushAsync()

    // Then the load is requested and, with no snapshot, the fetch runs
    expect(deps.requestResultLoad).toHaveBeenCalledTimes(1)
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
  })

  it("catches up immediately on reveal when the cell never fetched", async () => {
    // Given a hidden, never-fetched polling cell
    engine.setVisible("c1", false)
    engine.sync([drawCell("c1", "select 1", "1s")])
    await flushAsync()
    expect(deps.executeSingle).not.toHaveBeenCalled()

    // When the cell scrolls into view
    engine.setVisible("c1", true)
    await flushAsync()

    // Then it fetches immediately and keeps polling
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(deps.executeSingle).toHaveBeenCalledTimes(2)
  })

  it("pauses every chart except the listed ones when the view unroots", async () => {
    // Given two visible polling charts
    syncOnScreen([
      drawCell("c1", "select 1", "1s"),
      drawCell("c2", "select 2", "1s"),
    ])
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(2)

    // When only c1 stays in the DOM (a cell is maximized)
    engine.setOnlyVisible(["c1"])
    await vi.advanceTimersByTimeAsync(3000)

    // Then only c1 keeps polling
    const laterCalls = deps.executeSingle.mock.calls.slice(2)
    expect(laterCalls.length).toBeGreaterThan(0)
    expect(laterCalls.every(([sql]) => sql === "select 1")).toBe(true)
  })

  it("pauses polling when the cell scrolls out of view", async () => {
    // Given a visible polling cell that has fetched once
    syncOnScreen([drawCell("c1", "select 1", "1s")])
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)

    // When it scrolls out of view
    engine.setVisible("c1", false)

    // Then polling stops while its data stays intact
    await vi.advanceTimersByTimeAsync(10_000)
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
    expect(cellResults.get("c1")?.results).toHaveLength(1)
  })

  it("skips the reveal catch-up when the data is still fresh", async () => {
    // Given a cell hidden right after a fetch
    syncOnScreen([drawCell("c1", "select 1", "1s")])
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
    engine.setVisible("c1", false)

    // When it is revealed again well within its refresh interval
    await vi.advanceTimersByTimeAsync(100)
    engine.setVisible("c1", true)
    await flushAsync()

    // Then there is no immediate refetch — the next one waits a full interval
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(deps.executeSingle).toHaveBeenCalledTimes(2)
  })

  it("defers an auto-refresh-off cell's initial fetch to its first reveal", async () => {
    // Given a hidden cell with auto-refresh off
    engine.setVisible("c1", false)
    engine.sync([drawCell("c1", "select 1", false)])
    await flushAsync()
    expect(deps.executeSingle).not.toHaveBeenCalled()

    // When it is revealed for the first time
    engine.setVisible("c1", true)
    await flushAsync()

    // Then it fetches exactly once
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)

    // And hiding and revealing it again does not refetch settled data
    engine.setVisible("c1", false)
    engine.setVisible("c1", true)
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
  })

  it("refetches on reveal when the SQL changed while the cell was hidden", async () => {
    // Given a visible auto-refresh-off cell whose query settled
    syncOnScreen([drawCell("c1", "select 1", false)])
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)

    // When its SQL is edited (agent path) while the cell is hidden
    engine.setVisible("c1", false)
    engine.sync([drawCell("c1", "select 2", false)])
    await vi.advanceTimersByTimeAsync(1000)
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)

    // And the cell is revealed again
    engine.setVisible("c1", true)
    await flushAsync()

    // Then the new SQL fetches — the old settled key must not suppress the
    // catch-up (previously this left the chart on a spinner forever)
    expect(deps.executeSingle).toHaveBeenCalledTimes(2)
    expect(deps.executeSingle).toHaveBeenLastCalledWith(
      "select 2",
      expect.any(AbortSignal),
      10_000,
    )
  })

  it("refetches immediately on reveal after its result was released mid-interval", async () => {
    // Given a fixed-interval cell that fetched moments ago
    syncOnScreen([drawCell("c1", "select 1", "1s")])
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)

    // When it hides, its result is released, and it is revealed within the
    // interval
    engine.setVisible("c1", false)
    cellResults.delete("c1")
    engine.setVisible("c1", true)
    await flushAsync()

    // Then the fetch runs now — the pre-release lastFetchedAt must not make
    // the poll sleep out the interval over an empty chart
    expect(deps.executeSingle).toHaveBeenCalledTimes(2)
  })

  it("refetches immediately when a mid-interval reveal's snapshot load settles missing", async () => {
    // Given a fixed-interval cell that fetched moments ago
    syncOnScreen([drawCell("c1", "select 1", "1s")])
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)

    // When it hides, its result is released, and the reveal finds a snapshot
    // load in flight
    engine.setVisible("c1", false)
    cellResults.delete("c1")
    harness.loadStatuses.set("c1", "unrequested")
    harness.beginLoadOnRequest()
    engine.setVisible("c1", true)
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)

    // And the load settles with nothing usable
    harness.settleLoad("c1", "missing")
    await flushAsync()

    // Then the refetch runs now instead of waiting out the sleeping poll
    expect(deps.executeSingle).toHaveBeenCalledTimes(2)
  })

  it("stays loading while fetching with no usable frame, but not over a settled empty frame", () => {
    // Given a settled key that matches while a fetch is in flight
    const state = {
      queries: ["select 1"],
      queriesKey: "select 1",
      fetching: true,
      settledKey: "select 1",
      classifyBlock: null,
    }

    // Then the recovery fetch after a failed restore shows the spinner
    expect(deriveChartLoading(state, { kind: "missing" }, false).loading).toBe(
      true,
    )

    // And a genuinely empty settled frame keeps "No data" without flicker
    expect(
      deriveChartLoading(
        state,
        { kind: "settled", results: [], hadError: false, timestamp: 0 },
        false,
      ).loading,
    ).toBe(false)
  })

  it("refetches on reveal when the settled frame was replaced by a truncated one", async () => {
    // Given a settled auto-refresh-off cell released and re-hydrated with a
    // byte-capped snapshot (the >2MB flow)
    syncOnScreen([drawCell("c1", "select 1", false)])
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
    engine.setVisible("c1", false)
    cellResults.set("c1", {
      results: [
        {
          type: "dql",
          query: "select 1",
          columns: [{ name: "x", type: "INT" }],
          dataset: [[1]],
          count: 5000,
          timestamp: 0,
          truncated: true,
        },
      ],
      activeResultIndex: 0,
      timestamp: 0,
    })

    // When the cell is revealed again
    engine.setVisible("c1", true)
    await flushAsync()

    // Then the truncated frame does not satisfy the settled key — the full
    // frame refetches instead of leaving the chart empty forever
    expect(deps.executeSingle).toHaveBeenCalledTimes(2)
  })

  it("bounds concurrent fetches across cells", async () => {
    // Given an engine capped at one in-flight fetch and a slow first query
    engine.destroy()
    engine = new ChartRefreshEngine(BUFFER_ID, () => deps as ChartRefreshDeps, {
      initialFetchJitterMs: 0,
      maxConcurrentFetches: 1,
    })
    engine.attach()
    let releaseFirst!: (value: QueryExecResult) => void
    deps.executeSingle
      .mockImplementationOnce(
        () => new Promise<QueryExecResult>((res) => (releaseFirst = res)),
      )
      .mockImplementation((sql: string) => Promise.resolve(dqlResult(sql)))

    // When two cells want to fetch at the same time
    syncOnScreen([
      drawCell("c1", "select 1", false),
      drawCell("c2", "select 2", false),
    ])
    await flushAsync()

    // Then only the first is in flight; the second waits its turn
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
    releaseFirst(dqlResult("select 1"))
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(2)
  })

  it("spreads a loop's first fetch by the configured jitter", async () => {
    // Given an engine with 300ms of initial jitter and a fixed random draw,
    // so the jitter is a deterministic 150ms
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5)
    engine.destroy()
    engine = new ChartRefreshEngine(BUFFER_ID, () => deps as ChartRefreshDeps, {
      initialFetchJitterMs: 300,
    })
    engine.attach()

    // When a polling cell syncs
    syncOnScreen([drawCell("c1", "select 1", "1s")])
    await flushAsync()

    // Then the first fetch waits for the jitter window instead of firing at t=0
    expect(deps.executeSingle).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(149)
    expect(deps.executeSingle).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
    random.mockRestore()
  })

  it("exposes loading state for the cell toolbar via its subscription", async () => {
    // Given a subscriber deriving loading from the engine's state and the
    // cell's result, as the toolbar's useChartLoading does
    const states: Array<{ loading: boolean; refreshing: boolean }> = []
    const listener = () => {
      const state = engine.getState("c1")
      if (!state) {
        states.push({ loading: false, refreshing: false })
        return
      }
      states.push(
        deriveChartLoading(
          state,
          toChartResult(cellResults.get("c1"), state.queries),
          false,
        ),
      )
    }
    const unsubscribe = engine.subscribe("c1", listener)

    // When a draw cell fetches for the first time
    syncOnScreen([drawCell("c1", "select 1", false)])
    await flushAsync()
    unsubscribe()

    // Then it reports loading during the fetch and idle after it settles
    expect(states[0]).toEqual({ loading: true, refreshing: false })
    expect(states[states.length - 1]).toEqual({
      loading: false,
      refreshing: false,
    })
  })

  it("defers fetching until the observer reports the cell visible", async () => {
    // Given a synced draw cell that no observer has reported yet
    engine.sync([drawCell("c1", "select 1", false)])
    await flushAsync()

    // Then nothing fetches — entries start hidden to avoid an init-load burst
    expect(deps.executeSingle).not.toHaveBeenCalled()

    // When the observer reports it on screen
    engine.setVisible("c1", true)
    await flushAsync()

    // Then the deferred initial fetch runs
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
  })

  it("discards the in-flight fetch when the SQL changes mid-flight", async () => {
    // Given a visible cell whose first fetch hangs
    let releaseFirst!: (value: QueryExecResult) => void
    deps.executeSingle
      .mockImplementationOnce(
        () => new Promise<QueryExecResult>((res) => (releaseFirst = res)),
      )
      .mockImplementation((sql: string) => Promise.resolve(dqlResult(sql)))
    syncOnScreen([drawCell("c1", "select 1", false)])
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)

    // When the SQL changes while that fetch is still in flight
    syncOnScreen([drawCell("c1", "select 2", false)])
    await vi.advanceTimersByTimeAsync(301)
    await flushAsync()

    // And the superseded fetch finally lands
    releaseFirst(dqlResult("select 1"))
    await flushAsync()

    // Then the old query's frame never reaches the cell
    expect(cellResults.get("c1")?.results[0]?.query).toBe("select 2")
    const writtenQueries = deps.setCellResult.mock.calls.map(
      ([, result]) => result?.results[0]?.query,
    )
    expect(writtenQueries).not.toContain("select 1")
  })

  it("pauses polling while the document is hidden and catches up on return", async () => {
    // Given a visible polling cell with one fetch landed
    syncOnScreen([drawCell("c1", "select 1", "1s")])
    await flushAsync()
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)

    // When the tab is hidden
    setDocumentHidden(true)

    // Then polling fully stops
    await vi.advanceTimersByTimeAsync(10_000)
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)

    // When the tab becomes visible again with stale data
    setDocumentHidden(false)
    await flushAsync()

    // Then it fetches immediately and the poll cadence resumes
    expect(deps.executeSingle).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(deps.executeSingle).toHaveBeenCalledTimes(3)
  })

  it("lands a fetch whose query returns a server-side error in the cell", async () => {
    // Given a query that executes into an error result
    deps.executeSingle.mockImplementation((sql: string) =>
      Promise.resolve({
        type: "error",
        query: sql,
        columns: [],
        dataset: [],
        count: 0,
        error: "table does not exist",
      } as QueryExecResult),
    )

    // When a visible draw cell fetches
    syncOnScreen([drawCell("c1", "select 1", false)])
    await flushAsync()

    // Then the real message reaches the cell for both grid tab and chart
    expect(cellResults.get("c1")?.results[0]).toMatchObject({
      type: "error",
      error: "table does not exist",
    })
    const chartResult = toChartResult(cellResults.get("c1"), ["select 1"])
    expect(chartResult).toMatchObject({ kind: "settled", hadError: true })
  })

  it("preserves the thrown error's message when a fetch rejects", async () => {
    // Given a query whose execution rejects outright
    deps.executeSingle.mockImplementation(() =>
      Promise.reject(new Error("network down")),
    )

    // When a visible draw cell fetches
    syncOnScreen([drawCell("c1", "select 1", false)])
    await flushAsync()

    // Then the rejection's message survives into the cell result
    expect(cellResults.get("c1")?.results[0]).toMatchObject({
      type: "error",
      error: "network down",
    })
  })
})
