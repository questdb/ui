import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  CellResult,
  NotebookCell,
  SingleQueryResult,
} from "../../../../store/notebook"
import type { NotebookResultSnapshot } from "../../../../store/notebookResults"
import { CellVirtualizationEngine } from "../cellVirtualization/cellVirtualizationEngine"
import { CellResultHydrationEngine } from "./cellResultHydration"

const dqlResult = (query: string): SingleQueryResult => ({
  type: "dql",
  query,
  columns: [{ name: "x", type: "INT" }],
  dataset: [[1]],
  count: 1,
})

const snapshot = (
  cellId: string,
  results: SingleQueryResult[],
  extras: Pick<NotebookResultSnapshot, "activeResultIndex" | "script"> = {},
): NotebookResultSnapshot => ({
  bufferId: 1,
  cellId,
  results,
  savedAt: 1000,
  ...extras,
})

type LoadHandle = {
  resolve: () => void
  reject: () => void
}

describe("CellResultHydrationEngine", () => {
  let engine: CellResultHydrationEngine
  let cells: Map<string, NotebookCell>
  let snapshots: Map<string, NotebookResultSnapshot>
  let pendingLoads: Map<string, LoadHandle[]>
  let loadCounts: Map<string, number>
  let applied: Array<[string, CellResult]>
  let released: string[]
  let releasableCellIds: Set<string>

  const ranCell = (id: string): NotebookCell => ({
    id,
    position: 0,
    value: "select 1",
    lastRunStatus: "success",
  })

  const seedCell = (cell: NotebookCell) => {
    cells.set(cell.id, cell)
  }

  const settleLoad = async (cellId: string, outcome: "resolve" | "reject") => {
    const handles = pendingLoads.get(cellId) ?? []
    pendingLoads.delete(cellId)
    handles.forEach((handle) => handle[outcome]())
    await vi.advanceTimersByTimeAsync(0)
  }

  const resolveLoad = (cellId: string) => settleLoad(cellId, "resolve")
  const rejectLoad = (cellId: string) => settleLoad(cellId, "reject")

  beforeEach(() => {
    vi.useFakeTimers()
    cells = new Map()
    snapshots = new Map()
    pendingLoads = new Map()
    loadCounts = new Map()
    applied = []
    released = []
    releasableCellIds = new Set()
    engine = new CellResultHydrationEngine({
      loadSnapshot: (cellId) =>
        new Promise((resolve, reject) => {
          loadCounts.set(cellId, (loadCounts.get(cellId) ?? 0) + 1)
          const handles = pendingLoads.get(cellId) ?? []
          handles.push({
            resolve: () => resolve(snapshots.get(cellId)),
            reject: () => reject(new Error("read failed")),
          })
          pendingLoads.set(cellId, handles)
        }),
      getCell: (cellId) => cells.get(cellId),
      applyResult: (cellId, result) => {
        applied.push([cellId, result])
        const cell = cells.get(cellId)
        if (cell) cells.set(cellId, { ...cell, result })
      },
      releaseResult: (cellId) => {
        released.push(cellId)
        const cell = cells.get(cellId)
        if (cell) {
          cells.set(cellId, {
            ...cell,
            result: undefined,
            lastRunStatus: "success",
          })
        }
      },
      canRelease: (cellId) => releasableCellIds.has(cellId),
      scheduleIdle: (callback) => {
        setTimeout(callback, 0)
      },
    })
  })

  afterEach(() => {
    engine.destroy()
    vi.useRealTimers()
  })

  it("hydrates a requested cell from its snapshot when no live result exists", async () => {
    // Given a run-marked cell with a persisted snapshot
    seedCell(ranCell("c1"))
    snapshots.set("c1", snapshot("c1", [dqlResult("select 1")]))

    // When its data is requested and the read resolves
    engine.request("c1")
    expect(engine.statusOf("c1")).toBe("loading")
    await resolveLoad("c1")

    // Then the snapshot lands as the cell's result
    expect(engine.statusOf("c1")).toBe("loaded")
    expect(applied).toEqual([
      [
        "c1",
        {
          results: [dqlResult("select 1")],
          activeResultIndex: 0,
          timestamp: 1000,
        },
      ],
    ])
  })

  it("restores the viewed tab and script summary from the snapshot", async () => {
    // Given a script cell's snapshot saved on its second tab with a summary
    seedCell(ranCell("c1"))
    const results = [dqlResult("select 1"), dqlResult("select 2")]
    const script = { successCount: 2, failedCount: 0, durationMs: 12 }
    snapshots.set(
      "c1",
      snapshot("c1", results, { activeResultIndex: 1, script }),
    )

    // When it hydrates
    engine.request("c1")
    await resolveLoad("c1")

    // Then the user lands on the tab they were viewing, summary intact
    expect(applied).toEqual([
      ["c1", { results, activeResultIndex: 1, timestamp: 1000, script }],
    ])
  })

  it("re-hydrates a released cell with the exact same result", async () => {
    // Given a hydrated script cell
    seedCell(ranCell("c1"))
    const results = [dqlResult("select 1"), dqlResult("select 2")]
    const script = { successCount: 2, failedCount: 0, durationMs: 12 }
    snapshots.set(
      "c1",
      snapshot("c1", results, { activeResultIndex: 1, script }),
    )
    engine.request("c1")
    await resolveLoad("c1")

    // When it is released after a far scroll and then requested again
    releasableCellIds.add("c1")
    engine.noteReleasable("c1")
    await vi.advanceTimersByTimeAsync(1)
    expect(released).toEqual(["c1"])
    releasableCellIds.delete("c1")
    engine.request("c1")
    await resolveLoad("c1")

    // Then the second hydration deep-equals the first
    expect(applied).toHaveLength(2)
    expect(applied[1][1]).toEqual(applied[0][1])
  })

  it("never clobbers a live result that lands while the snapshot load is in flight", async () => {
    // Given a requested cell whose read is still pending
    seedCell(ranCell("c1"))
    snapshots.set("c1", snapshot("c1", [dqlResult("select 1")]))
    engine.request("c1")

    // When a live run result lands before the read resolves
    const live: CellResult = {
      results: [dqlResult("select 2")],
      activeResultIndex: 0,
      timestamp: 2000,
    }
    cells.set("c1", { ...cells.get("c1")!, result: live })
    await resolveLoad("c1")

    // Then the snapshot is discarded and the live result stays
    expect(applied).toEqual([])
    expect(engine.statusOf("c1")).toBe("loaded")
    expect(cells.get("c1")!.result).toBe(live)
  })

  it("dedupes concurrent requests for the same cell", async () => {
    // Given a requested cell still loading
    seedCell(ranCell("c1"))
    snapshots.set("c1", snapshot("c1", [dqlResult("select 1")]))
    engine.request("c1")

    // When it is requested again before the read resolves
    engine.request("c1")
    await resolveLoad("c1")

    // Then only one read ran and one apply happened
    expect(applied).toHaveLength(1)
    expect(loadCounts.get("c1")).toBe(1)
  })

  it("marks a cell missing when its snapshot is gone", async () => {
    // Given a run-marked cell whose snapshot was pruned
    seedCell(ranCell("c1"))

    // When its data is requested and the read resolves empty
    engine.request("c1")
    await resolveLoad("c1")

    // Then the cell is known to have nothing to restore
    expect(engine.statusOf("c1")).toBe("missing")
    expect(applied).toEqual([])
  })

  it("does not re-request a cell whose snapshot is known missing", async () => {
    // Given a cell already resolved as missing
    seedCell(ranCell("c1"))
    engine.request("c1")
    await resolveLoad("c1")
    expect(engine.statusOf("c1")).toBe("missing")

    // When a band re-entry requests it again
    engine.request("c1")

    // Then no new read starts and the geometry stays collapsed
    expect(loadCounts.get("c1")).toBe(1)
    expect(engine.statusOf("c1")).toBe("missing")

    // Until forget() resets it (e.g. the result was cleared)
    engine.forget("c1")
    engine.request("c1")
    expect(loadCounts.get("c1")).toBe(2)
  })

  it("skips draw-mode cells and cells that never ran", () => {
    // Given a draw cell and a never-run cell
    seedCell({ ...ranCell("draw"), mode: "draw" })
    seedCell({ id: "fresh", position: 0, value: "" })

    // When their data is requested
    engine.request("draw")
    engine.request("fresh")

    // Then no snapshot read starts for either
    expect(pendingLoads.size).toBe(0)
    expect(engine.statusOf("draw")).toBe("unrequested")
    expect(engine.statusOf("fresh")).toBe("unrequested")
  })

  it("retries a failed read for a cell still on screen and hydrates on success", async () => {
    // Given an on-screen cell whose first read fails transiently
    seedCell(ranCell("c1"))
    snapshots.set("c1", snapshot("c1", [dqlResult("select 1")]))
    engine.request("c1")
    await rejectLoad("c1")
    expect(engine.statusOf("c1")).toBe("unrequested")

    // When the bounded retry fires and the read succeeds
    await vi.advanceTimersByTimeAsync(500)
    expect(engine.statusOf("c1")).toBe("loading")
    await resolveLoad("c1")

    // Then the cell hydrates instead of shimmering forever
    expect(engine.statusOf("c1")).toBe("loaded")
    expect(applied).toHaveLength(1)
  })

  it("stops retrying after the bounded attempts", async () => {
    // Given an on-screen cell whose reads keep failing
    seedCell(ranCell("c1"))
    engine.request("c1")
    await rejectLoad("c1")
    await vi.advanceTimersByTimeAsync(500)
    await rejectLoad("c1")
    await vi.advanceTimersByTimeAsync(1000)
    await rejectLoad("c1")

    // When the retry budget is exhausted
    await vi.advanceTimersByTimeAsync(10_000)

    // Then no further self-scheduled read runs
    expect(loadCounts.get("c1")).toBe(3)

    // But an explicit band re-entry still requests fresh
    engine.request("c1")
    expect(loadCounts.get("c1")).toBe(4)
  })

  it("does not self-retry a cell that scrolled away", async () => {
    // Given a requested cell that left the bands before its read failed
    seedCell(ranCell("c1"))
    releasableCellIds.add("c1")
    engine.request("c1")
    await rejectLoad("c1")

    // When time passes
    await vi.advanceTimersByTimeAsync(10_000)

    // Then no retry runs — the next band entry re-requests instead
    expect(loadCounts.get("c1")).toBe(1)
    expect(engine.statusOf("c1")).toBe("unrequested")
  })

  it("applies nothing when destroyed mid-flight and cancels pending retries", async () => {
    // Given one cell with a read in flight and one with a retry scheduled
    seedCell(ranCell("c1"))
    snapshots.set("c1", snapshot("c1", [dqlResult("select 1")]))
    seedCell(ranCell("c2"))
    engine.request("c1")
    engine.request("c2")
    await rejectLoad("c2")

    // When the engine is destroyed before either continues
    engine.destroy()
    await resolveLoad("c1")
    await vi.advanceTimersByTimeAsync(10_000)

    // Then nothing lands and no retry read starts
    expect(applied).toEqual([])
    expect(loadCounts.get("c2")).toBe(1)
  })

  it("forgets a cell deleted while its read was in flight", async () => {
    // Given a requested cell removed from the notebook before the read lands
    seedCell(ranCell("c1"))
    snapshots.set("c1", snapshot("c1", [dqlResult("select 1")]))
    engine.request("c1")
    cells.delete("c1")

    // When the read resolves
    await resolveLoad("c1")

    // Then nothing is applied and the status is cleared
    expect(applied).toEqual([])
    expect(engine.statusOf("c1")).toBe("unrequested")
  })

  it("treats hydrated results as durably persisted and releases them", async () => {
    // Given a cell hydrated from its snapshot
    seedCell(ranCell("c1"))
    snapshots.set("c1", snapshot("c1", [dqlResult("select 1")]))
    engine.request("c1")
    await resolveLoad("c1")

    // When it becomes releasable and the idle tick runs
    releasableCellIds.add("c1")
    engine.noteReleasable("c1")
    await vi.advanceTimersByTimeAsync(1)

    // Then the result is released and the next request reloads it
    expect(released).toEqual(["c1"])
    expect(engine.statusOf("c1")).toBe("unrequested")
    engine.request("c1")
    expect(engine.statusOf("c1")).toBe("loading")
  })

  it("defers releasing a fresh run result until its save confirms", async () => {
    // Given a cell holding a live result whose snapshot save has not confirmed
    const live: CellResult = {
      results: [dqlResult("select 1")],
      activeResultIndex: 0,
      timestamp: 2000,
    }
    seedCell({ ...ranCell("c1"), result: live })
    releasableCellIds.add("c1")

    // When it is reported releasable
    engine.noteReleasable("c1")
    await vi.advanceTimersByTimeAsync(1)

    // Then the unconfirmed result stays in memory
    expect(released).toEqual([])

    // When the save confirms
    engine.notePersisted("c1", live.results)
    await vi.advanceTimersByTimeAsync(1)

    // Then the release lands
    expect(released).toEqual(["c1"])
  })

  it("releases one cell per idle tick", async () => {
    // Given two hydrated, releasable cells queued in the same tick
    for (const id of ["c1", "c2"]) {
      seedCell(ranCell(id))
      snapshots.set(id, snapshot(id, [dqlResult("select 1")]))
      engine.request(id)
    }
    await resolveLoad("c1")
    await resolveLoad("c2")
    releasableCellIds.add("c1").add("c2")
    engine.noteReleasable("c1")
    engine.noteReleasable("c2")

    // When the first idle tick runs
    await vi.advanceTimersToNextTimerAsync()

    // Then exactly one cell is released, the second on the next tick
    expect(released).toEqual(["c1"])
    await vi.advanceTimersToNextTimerAsync()
    expect(released).toEqual(["c1", "c2"])
  })

  it("never releases a draw cell's mirrored result", async () => {
    // Given a scrolled-away draw cell whose snapshot save confirmed
    const live: CellResult = {
      results: [dqlResult("select 1")],
      activeResultIndex: 0,
      timestamp: 2000,
    }
    seedCell({ ...ranCell("draw"), mode: "draw", result: live })
    releasableCellIds.add("draw")

    // When the save confirms and the idle tick runs
    engine.notePersisted("draw", live.results)
    await vi.advanceTimersByTimeAsync(1)

    // Then the chart's mirrored result stays in memory
    expect(released).toEqual([])
    expect(cells.get("draw")!.result).toBe(live)
  })

  it("re-checks releasability at idle time and keeps a cell that re-entered the band", async () => {
    // Given a hydrated cell reported releasable
    seedCell(ranCell("c1"))
    snapshots.set("c1", snapshot("c1", [dqlResult("select 1")]))
    engine.request("c1")
    await resolveLoad("c1")
    releasableCellIds.add("c1")
    engine.noteReleasable("c1")

    // When it re-enters the band before the idle tick runs
    releasableCellIds.delete("c1")
    await vi.advanceTimersByTimeAsync(1)

    // Then it is not released
    expect(released).toEqual([])
    expect(engine.statusOf("c1")).toBe("loaded")
  })

  it("discards a snapshot that resolves after the cell scrolled far away", async () => {
    // Given a requested cell that left the bands while its read was in flight
    seedCell(ranCell("c1"))
    snapshots.set("c1", snapshot("c1", [dqlResult("select 1")]))
    engine.request("c1")
    releasableCellIds.add("c1")

    // When the read resolves
    await resolveLoad("c1")

    // Then nothing is applied and the next approach re-requests
    expect(applied).toEqual([])
    expect(engine.statusOf("c1")).toBe("unrequested")
  })

  it("drops state for removed cells on sync and on forget", async () => {
    // Given a hydrated cell
    seedCell(ranCell("c1"))
    snapshots.set("c1", snapshot("c1", [dqlResult("select 1")]))
    engine.request("c1")
    await resolveLoad("c1")
    expect(engine.statusOf("c1")).toBe("loaded")

    // When the cell is removed from the notebook
    cells.delete("c1")
    engine.sync([])

    // Then its status resets
    expect(engine.statusOf("c1")).toBe("unrequested")

    // And forget clears a cleared cell's status the same way
    seedCell(ranCell("c2"))
    snapshots.set("c2", snapshot("c2", [dqlResult("select 2")]))
    engine.request("c2")
    await resolveLoad("c2")
    engine.forget("c2")
    expect(engine.statusOf("c2")).toBe("unrequested")
  })

  it("notifies per-cell listeners on every transition", async () => {
    // Given a listener on a cell that hydrates normally
    seedCell(ranCell("c1"))
    snapshots.set("c1", snapshot("c1", [dqlResult("select 1")]))
    const cellListener = vi.fn()
    engine.subscribe("c1", cellListener)

    // When the cell loads
    engine.request("c1")
    await resolveLoad("c1")

    // Then it saw both the loading and loaded transitions
    expect(cellListener).toHaveBeenCalledTimes(2)
  })

  it("notifies any-listeners only when a cell's known-missing state flips", async () => {
    // Given an any-listener and a cell whose snapshot exists
    seedCell(ranCell("c1"))
    snapshots.set("c1", snapshot("c1", [dqlResult("select 1")]))
    const anyListener = vi.fn()
    engine.subscribeAny(anyListener)

    // When it hydrates (unrequested → loading → loaded)
    engine.request("c1")
    await resolveLoad("c1")

    // Then the layout version never bumped
    expect(anyListener).toHaveBeenCalledTimes(0)

    // When a snapshot-less cell resolves missing
    seedCell(ranCell("c2"))
    engine.request("c2")
    await resolveLoad("c2")

    // Then the version bumps once for the geometry collapse
    expect(anyListener).toHaveBeenCalledTimes(1)

    // And once more when forget() lifts the missing state
    engine.forget("c2")
    expect(anyListener).toHaveBeenCalledTimes(2)
  })
})

// Mirrors the NotebookProvider wiring: band callbacks drive request /
// noteReleasable, and canRelease delegates to the virtualization engine.
describe("virtualization band → hydration engine wiring", () => {
  let virtualization: CellVirtualizationEngine
  let hydration: CellResultHydrationEngine
  let cells: Map<string, NotebookCell>
  let snapshots: Map<string, NotebookResultSnapshot>
  let pendingLoads: Map<string, LoadHandle[]>
  let loadCounts: Map<string, number>
  let applied: Array<[string, CellResult]>
  let released: string[]

  const cell = (id: string): NotebookCell => ({
    id,
    position: 0,
    value: "select 1",
    lastRunStatus: "success",
  })

  const resolveLoad = async (cellId: string) => {
    const handles = pendingLoads.get(cellId) ?? []
    pendingLoads.delete(cellId)
    handles.forEach((handle) => handle.resolve())
    await vi.advanceTimersByTimeAsync(0)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    cells = new Map()
    snapshots = new Map()
    pendingLoads = new Map()
    loadCounts = new Map()
    applied = []
    released = []
    hydration = new CellResultHydrationEngine({
      loadSnapshot: (cellId) =>
        new Promise((resolve, reject) => {
          loadCounts.set(cellId, (loadCounts.get(cellId) ?? 0) + 1)
          const handles = pendingLoads.get(cellId) ?? []
          handles.push({
            resolve: () => resolve(snapshots.get(cellId)),
            reject: () => reject(new Error("read failed")),
          })
          pendingLoads.set(cellId, handles)
        }),
      getCell: (cellId) => cells.get(cellId),
      applyResult: (cellId, result) => {
        applied.push([cellId, result])
        const current = cells.get(cellId)
        if (current) cells.set(cellId, { ...current, result })
      },
      releaseResult: (cellId) => {
        released.push(cellId)
        const current = cells.get(cellId)
        if (current) {
          cells.set(cellId, {
            ...current,
            result: undefined,
            lastRunStatus: "success",
          })
        }
      },
      canRelease: (cellId) => virtualization.canReleaseData(cellId),
      scheduleIdle: (callback) => {
        setTimeout(callback, 0)
      },
    })
    virtualization = new CellVirtualizationEngine({
      dwellMs: 0,
      scheduleFrame: (callback) => {
        setTimeout(callback, 0)
      },
      scheduleIdle: (callback) => {
        setTimeout(callback, 0)
      },
      onCellDataNeeded: (cellId) => hydration.request(cellId),
      onCellDataReleasable: (cellId) => hydration.noteReleasable(cellId),
    })
  })

  afterEach(() => {
    virtualization.destroy()
    hydration.destroy()
    vi.useRealTimers()
  })

  it("starts a snapshot load on retain-band entry and applies it on resolve", async () => {
    // Given a synced run-marked cell with a snapshot
    cells.set("c1", cell("c1"))
    snapshots.set("c1", snapshot("c1", [dqlResult("select 1")]))
    virtualization.sync([cell("c1")])

    // When the cell approaches the viewport
    virtualization.reportRetainBand("c1", true)
    expect(hydration.statusOf("c1")).toBe("loading")
    await resolveLoad("c1")

    // Then the snapshot lands
    expect(hydration.statusOf("c1")).toBe("loaded")
    expect(applied).toHaveLength(1)
  })

  it("discards a read that resolves after the cell left the band, reloads on re-entry", async () => {
    // Given a cell whose read is in flight when it leaves the band
    cells.set("c1", cell("c1"))
    snapshots.set("c1", snapshot("c1", [dqlResult("select 1")]))
    virtualization.sync([cell("c1")])
    virtualization.reportRetainBand("c1", true)
    virtualization.reportRetainBand("c1", false)

    // When the stale read resolves
    await resolveLoad("c1")

    // Then nothing is applied
    expect(applied).toEqual([])
    expect(hydration.statusOf("c1")).toBe("unrequested")

    // And re-entering the band hydrates it fresh
    virtualization.reportRetainBand("c1", true)
    await resolveLoad("c1")
    expect(applied).toHaveLength(1)
    expect(loadCounts.get("c1")).toBe(2)
  })

  it("releases a hydrated result after the cell leaves the retain band", async () => {
    // Given a hydrated cell inside the band
    cells.set("c1", cell("c1"))
    snapshots.set("c1", snapshot("c1", [dqlResult("select 1")]))
    virtualization.sync([cell("c1")])
    virtualization.reportRetainBand("c1", true)
    await resolveLoad("c1")

    // When it scrolls far past the retain band and idle time passes
    virtualization.reportRetainBand("c1", false)
    await vi.advanceTimersByTimeAsync(1)

    // Then its result is dropped back to IndexedDB-only
    expect(released).toEqual(["c1"])
    expect(hydration.statusOf("c1")).toBe("unrequested")
  })
})
