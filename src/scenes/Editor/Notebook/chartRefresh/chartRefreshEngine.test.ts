import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import type { CellResult, NotebookCell } from "../../../../store/notebook"
import type { AutoRefresh } from "../../../../store/notebook"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import { loadCellSnapshot } from "../../../../store/notebookResults"
import { ChartRefreshEngine, type ChartRefreshDeps } from "./chartRefreshEngine"

vi.mock("../persistCellSnapshot", () => ({
  persistCellSnapshot: vi.fn().mockResolvedValue(true),
}))

vi.mock("../../../../store/notebookResults", () => ({
  loadCellSnapshot: vi.fn().mockResolvedValue(undefined),
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

const makeDeps = () => ({
  executeSingle: vi.fn((sql: string) => Promise.resolve(dqlResult(sql))),
  validateWithGlobals: vi.fn().mockResolvedValue(dqlValidation),
  mirrorCellResult: vi.fn<[string, CellResult | undefined], void>(),
  getCellResult: vi.fn((): CellResult | undefined => undefined),
})

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
  let deps: ReturnType<typeof makeDeps>
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
    // clearAllMocks keeps implementations; reset the module mock explicitly so
    // one test's snapshot fixture can't hydrate another test's cells.
    vi.mocked(loadCellSnapshot).mockResolvedValue(undefined)
    deps = makeDeps()
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
    expect(state?.results).toHaveLength(1)
    expect(state?.settledKey).toBe(state?.queriesKey)

    // And no further fetches happen over time
    await vi.advanceTimersByTimeAsync(120_000)
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
  })

  it("mirrors fetched results into the cell result", async () => {
    // Given a draw cell whose query succeeds
    syncOnScreen([drawCell("c1", "select 1", false)])

    // When the fetch completes
    await flushAsync()

    // Then every statement is mirrored so the grid shows the chart's data
    expect(deps.mirrorCellResult).toHaveBeenCalledTimes(1)
    const [cellId, result] = deps.mirrorCellResult.mock.calls[0]
    expect(cellId).toBe("c1")
    expect(result?.results).toHaveLength(1)
    expect(result?.results[0]).toMatchObject({ type: "dql", query: "select 1" })
  })

  it("transfers a matching existing cell result instead of fetching", async () => {
    // Given a cell result produced by the exact same query (grid → chart toggle)
    deps.getCellResult.mockReturnValue({
      results: [
        {
          type: "dql",
          query: "select 1",
          columns: [{ name: "x", type: "INT" }],
          dataset: [[1]],
          count: 1,
        },
      ],
      activeResultIndex: 0,
      timestamp: 0,
    })

    // When the engine syncs the draw cell with auto-refresh off
    syncOnScreen([drawCell("c1", "select 1", false)])
    await flushAsync()

    // Then the data is transferred without a fetch
    expect(deps.executeSingle).not.toHaveBeenCalled()
    const state = engine.getState("c1")
    expect(state?.results).toHaveLength(1)
    expect(state?.settledKey).toBe(state?.queriesKey)
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

  it("skips the poll's immediate first fetch when data was transferred in", async () => {
    // Given transferable data and a fixed 1s interval
    deps.getCellResult.mockReturnValue({
      results: [
        {
          type: "dql",
          query: "select 1",
          columns: [{ name: "x", type: "INT" }],
          dataset: [[1]],
          count: 1,
        },
      ],
      activeResultIndex: 0,
      timestamp: 0,
    })

    // When the engine syncs the cell
    syncOnScreen([drawCell("c1", "select 1", "1s")])
    await flushAsync()

    // Then the transferred frame serves as the first tick, and the poll only
    // fetches after one full interval
    expect(deps.executeSingle).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
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

  it("hydrates from a persisted snapshot matching the current SQL", async () => {
    // Given a persisted snapshot produced by the same query
    vi.mocked(loadCellSnapshot).mockResolvedValue({
      bufferId: BUFFER_ID,
      cellId: "c1",
      results: [
        {
          type: "dql",
          query: "select 1",
          columns: [{ name: "x", type: "INT" }],
          dataset: [[1]],
          count: 1,
        },
      ],
      savedAt: 123,
    })

    // When the engine syncs the cell with auto-refresh off
    syncOnScreen([drawCell("c1", "select 1", false)])
    await flushAsync()

    // Then the snapshot renders without a fetch and is mirrored for the grid
    expect(deps.executeSingle).not.toHaveBeenCalled()
    expect(engine.getState("c1")?.results).toHaveLength(1)
    expect(deps.mirrorCellResult).toHaveBeenCalledTimes(1)
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
    expect(engine.getState("c1")?.results).toHaveLength(1)
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
    // Given an engine with 300ms of initial jitter
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
    await vi.advanceTimersByTimeAsync(300)
    expect(deps.executeSingle).toHaveBeenCalledTimes(1)
  })

  it("publishes loading state for the cell toolbar", async () => {
    // Given a listener on the chart loading event
    const events: Array<{ loading: boolean; refreshing: boolean }> = []
    const handler = (payload?: {
      cellId?: string
      loading?: boolean
      refreshing?: boolean
    }) => {
      if (payload?.cellId === "c1")
        events.push({
          loading: !!payload.loading,
          refreshing: !!payload.refreshing,
        })
    }
    eventBus.subscribe(EventType.NOTEBOOK_CELL_CHART_LOADING, handler)

    // When a draw cell fetches for the first time
    syncOnScreen([drawCell("c1", "select 1", false)])
    await flushAsync()
    eventBus.unsubscribe(EventType.NOTEBOOK_CELL_CHART_LOADING, handler)

    // Then it reports loading during the fetch and idle after it settles
    expect(events[0]).toEqual({ loading: true, refreshing: false })
    expect(events[events.length - 1]).toEqual({
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

    // Then the old query's frame reaches neither the state nor the grid mirror
    expect(engine.getState("c1")?.results[0]?.query).toBe("select 2")
    const mirrored = deps.mirrorCellResult.mock.calls.map(
      ([, result]) => result?.results[0]?.query,
    )
    expect(mirrored).not.toContain("select 1")
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

  it("flags a fetch whose query returns a server-side error", async () => {
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

    // Then the failure is flagged and the real message reaches the grid mirror
    expect(engine.getState("c1")?.lastFetchHadError).toBe(true)
    const [, result] = deps.mirrorCellResult.mock.calls.at(-1)!
    expect(result?.results[0]).toMatchObject({
      type: "error",
      error: "table does not exist",
    })
  })

  it("preserves the thrown error's message when a fetch rejects", async () => {
    // Given a query whose execution rejects outright
    deps.executeSingle.mockImplementation(() =>
      Promise.reject(new Error("network down")),
    )

    // When a visible draw cell fetches
    syncOnScreen([drawCell("c1", "select 1", false)])
    await flushAsync()

    // Then the rejection is flagged and its message survives to the mirror
    expect(engine.getState("c1")?.lastFetchHadError).toBe(true)
    const [, result] = deps.mirrorCellResult.mock.calls.at(-1)!
    expect(result?.results[0]).toMatchObject({
      type: "error",
      error: "network down",
    })
  })
})
