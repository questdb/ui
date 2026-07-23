import type {
  CellResult,
  NotebookCell,
  SingleQueryResult,
} from "../../../../store/notebook"
import type { NotebookResultSnapshot } from "../../../../store/notebookResults"
import { shallowArrayEquals } from "../../../../utils/shallowArrayEquals"
import { scheduleIdle } from "../notebookScheduling"
import { PerKeyListeners } from "../perKeyListeners"

export type CellResultStatus =
  | "unrequested"
  | "loading"
  | "loaded"
  | "missing"
  | "failed"

const LOAD_RETRY_DELAY_MS = 500
const MAX_LOAD_RETRIES = 2

export type CellResultHydrationDeps = {
  loadSnapshot: (cellId: string) => Promise<NotebookResultSnapshot | undefined>
  getCell: (cellId: string) => NotebookCell | undefined
  applyResult: (cellId: string, result: CellResult) => void
  releaseResult: (cellId: string) => void
  canRelease: (cellId: string) => boolean
}

export const hasRunMarker = (cell: NotebookCell): boolean =>
  cell.lastRunStatus != null && cell.lastRunStatus !== "none"

// IndexedDB → memory, per cell, on scroll approach; memory → IndexedDB-only
// when the cell leaves the retain band.
export class CellResultHydrationEngine {
  private statuses = new Map<string, CellResultStatus>()
  private listeners = new PerKeyListeners()
  private anyListeners = new Set<() => void>()
  private releaseQueue = new Set<string>()
  private releaseScheduled = false
  private loadAttempts = new Map<string, number>()
  private retryTimers = new Set<ReturnType<typeof setTimeout>>()
  private destroyed = false
  // Results safe to drop from memory: hydrated from a snapshot, or a live run
  // whose snapshot save confirmed. Keyed by array identity — a replaced array
  // fails safe (the cell just never releases).
  private persisted = new WeakSet<SingleQueryResult[]>()
  private lastSyncedCellIds: string[] | null = null

  constructor(private deps: CellResultHydrationDeps) {}

  destroy() {
    this.destroyed = true
    this.statuses.clear()
    this.listeners.clear()
    this.anyListeners.clear()
    this.releaseQueue.clear()
    this.retryTimers.forEach((timer) => clearTimeout(timer))
    this.retryTimers.clear()
    this.loadAttempts.clear()
    this.lastSyncedCellIds = null
  }

  sync(cells: NotebookCell[]) {
    const cellIds = cells.map((cell) => cell.id)
    if (
      this.lastSyncedCellIds &&
      shallowArrayEquals(this.lastSyncedCellIds, cellIds)
    )
      return
    this.lastSyncedCellIds = cellIds
    const present = new Set(cellIds)
    for (const cellId of [...this.statuses.keys()]) {
      if (!present.has(cellId)) {
        this.statuses.delete(cellId)
        this.releaseQueue.delete(cellId)
        this.loadAttempts.delete(cellId)
      }
    }
  }

  statusOf(cellId: string): CellResultStatus {
    return this.statuses.get(cellId) ?? "unrequested"
  }

  request(cellId: string) {
    if (this.destroyed) return
    const status = this.statusOf(cellId)
    // "missing" is terminal until forget(): the snapshot is known absent, and
    // no path writes one for a mounted cell without also landing a live result.
    // Re-loading on every band entry would flap the reserved geometry.
    if (status === "loading" || status === "loaded" || status === "missing") {
      return
    }
    const cell = this.deps.getCell(cellId)
    if (!cell) return
    if (cell.result != null) {
      this.setStatus(cellId, "loaded")
      return
    }
    if (cell.mode !== "draw" && !hasRunMarker(cell)) return
    this.setStatus(cellId, "loading")
    this.deps
      .loadSnapshot(cellId)
      .then((snapshot) => this.applyLoaded(cellId, snapshot))
      .catch(() => {
        // Transient read failure — a band re-entry re-requests; a cell at rest
        // on screen gets no new band event, so retry it here (bounded).
        if (this.statusOf(cellId) !== "loading") return
        this.setStatus(cellId, "unrequested")
        this.scheduleLoadRetry(cellId)
      })
  }

  noteReleasable(cellId: string) {
    if (this.destroyed) return
    this.releaseQueue.add(cellId)
    this.scheduleNextRelease()
  }

  notePersisted(cellId: string, results: SingleQueryResult[]) {
    this.persisted.add(results)
    if (this.deps.canRelease(cellId)) this.noteReleasable(cellId)
  }

  noteMissing(cellId: string) {
    if (this.destroyed) return
    this.setStatus(cellId, "missing")
  }

  forget(cellId: string) {
    this.releaseQueue.delete(cellId)
    this.loadAttempts.delete(cellId)
    const previous = this.statuses.get(cellId)
    if (previous === undefined) return
    this.statuses.delete(cellId)
    this.notify(cellId, previous === "missing")
  }

  subscribe(cellId: string, listener: () => void): () => void {
    return this.listeners.subscribe(cellId, listener)
  }

  subscribeAny(listener: () => void): () => void {
    this.anyListeners.add(listener)
    return () => {
      this.anyListeners.delete(listener)
    }
  }

  private applyLoaded(
    cellId: string,
    snapshot: NotebookResultSnapshot | undefined,
  ) {
    if (this.destroyed) return
    this.loadAttempts.delete(cellId)
    if (this.statusOf(cellId) !== "loading") return
    const cell = this.deps.getCell(cellId)
    if (!cell) {
      this.forget(cellId)
      return
    }
    if (cell.result != null) {
      this.setStatus(cellId, "loaded")
      return
    }
    if (this.deps.canRelease(cellId)) {
      this.setStatus(cellId, "unrequested")
      return
    }
    if (snapshot && snapshot.results.length > 0) {
      this.persisted.add(snapshot.results)
      this.deps.applyResult(cellId, {
        results: snapshot.results,
        activeResultIndex: snapshot.activeResultIndex ?? 0,
        timestamp: snapshot.savedAt,
        ...(snapshot.script ? { script: snapshot.script } : {}),
      })
      this.setStatus(cellId, "loaded")
      return
    }
    this.setStatus(cellId, "missing")
  }

  // A cell resting on screen gets no further band transitions, so a failed
  // read must retry itself or the shimmer never resolves. Off-screen cells
  // skip this: their next band entry re-requests anyway.
  private scheduleLoadRetry(cellId: string) {
    const attempt = (this.loadAttempts.get(cellId) ?? 0) + 1
    this.loadAttempts.set(cellId, attempt)
    if (attempt > MAX_LOAD_RETRIES || this.deps.canRelease(cellId)) {
      this.setStatus(cellId, "failed")
      return
    }
    const timer = setTimeout(() => {
      this.retryTimers.delete(timer)
      this.request(cellId)
    }, LOAD_RETRY_DELAY_MS * attempt)
    this.retryTimers.add(timer)
  }

  private scheduleNextRelease() {
    if (this.releaseScheduled || this.destroyed) return
    this.releaseScheduled = true
    scheduleIdle(() => {
      this.releaseScheduled = false
      this.releaseNextCell()
    })
  }

  // One release per idle tick — each release re-renders a cell, and React 17
  // does not batch state updates fired outside event handlers.
  private releaseNextCell() {
    if (this.destroyed) return
    for (const cellId of [...this.releaseQueue]) {
      this.releaseQueue.delete(cellId)
      if (!this.deps.canRelease(cellId)) continue
      const cell = this.deps.getCell(cellId)
      if (!cell || cell.result == null) continue
      if (!this.persisted.has(cell.result.results)) continue
      this.deps.releaseResult(cellId)
      this.setStatus(cellId, "unrequested")
      break
    }
    if (this.releaseQueue.size > 0) this.scheduleNextRelease()
  }

  private setStatus(cellId: string, status: CellResultStatus) {
    const previous = this.statusOf(cellId)
    if (previous === status) return
    this.statuses.set(cellId, status)
    this.notify(cellId, (previous === "missing") !== (status === "missing"))
  }

  // Per-cell subscribers see every transition; any-listeners (the grid layout
  // version) only the known-missing flips — the sole status boundary
  // isExpectingResult reads — so scroll-driven loading/loaded churn doesn't
  // invalidate the layout memo.
  private notify(cellId: string, missingChanged: boolean) {
    this.listeners.notify(cellId)
    if (missingChanged) {
      this.anyListeners.forEach((listener) => listener())
    }
  }
}
