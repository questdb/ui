import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  CellResult,
  NotebookCell,
  SingleQueryResult,
} from "../../../src/store/notebook"
import type { NotebookResultSnapshot } from "../../../src/store/notebookResults"
import { CellVirtualizationEngine } from "../../../src/scenes/Editor/Notebook/cellVirtualization/cellVirtualizationEngine"
import { CellResultHydrationEngine } from "../../../src/scenes/Editor/Notebook/resultHydration/cellResultHydration"

vi.mock("../../../src/scenes/Editor/Notebook/notebookScheduling", () => ({
  scheduleFrame: (callback: () => void) => setTimeout(callback, 0),
  scheduleIdle: (callback: () => void) => setTimeout(callback, 0),
}))

const dqlResult = (query: string): SingleQueryResult => ({
  type: "dql",
  query,
  columns: [{ name: "x", type: "INT" }],
  dataset: [[1]],
  count: 1,
  fetchedAt: 500,
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
      rewriteSnapshot: () => Promise.resolve(true),
      deleteSnapshot: () => Promise.resolve(),
      seedRefreshState: () => undefined,
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
    })
    virtualization = new CellVirtualizationEngine({
      dwellMs: 0,
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
