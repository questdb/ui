import type {
  CellResult,
  NotebookCell,
  SingleQueryResult,
} from "../../../../store/notebook"
import type { NotebookResultSnapshot } from "../../../../store/notebookResults"
import { shallowArrayEquals } from "../../../../utils/shallowArrayEquals"
import { getQueriesFromText, normalizeQueryText } from "../../Monaco/utils"
import {
  reconcileResultsForStatements,
  statementKeysFor,
} from "../notebookUtils"

// Legacy records hold the raw cell text — comments included — as the
// statement's query. Parsing it back to the statement lets those results
// survive key matching; the changed frame then rewrites to disk.
const normalizeSnapshotResultQuery = (
  result: SingleQueryResult,
): SingleQueryResult => {
  const parsed = getQueriesFromText(result.query)
  if (parsed.length !== 1) return result
  if (normalizeQueryText(parsed[0]) === normalizeQueryText(result.query)) {
    return result
  }
  return { ...result, query: parsed[0] }
}
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
  rewriteSnapshot: (snapshot: NotebookResultSnapshot) => Promise<boolean>
  deleteSnapshot: (cellId: string) => Promise<void>
  getCell: (cellId: string) => NotebookCell | undefined
  applyResult: (cellId: string, result: CellResult) => void
  releaseResult: (cellId: string) => void
  canRelease: (cellId: string) => boolean
  seedRefreshErrors: (
    cellId: string,
    errors: Array<{ statementKey: string; message: string }>,
  ) => void
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
  // Cells whose current load is a revive: a zero-survivor reconcile must not
  // delete the snapshot — the text that failed to match may still be
  // transient, and a later matching settle (undo) needs the rows back.
  private reviving = new Set<string>()

  constructor(private deps: CellResultHydrationDeps) {}

  destroy() {
    this.destroyed = true
    this.reviving.clear()
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

  // Re-attempts a "missing" cell's load without the delete-on-empty terminal.
  // For the zero-survivor collapse: the snapshot stayed on disk, so a settle
  // back to matching SQL restores the rows instead of staying blank.
  reviveMissing(cellId: string) {
    if (this.destroyed) return
    if (this.statusOf(cellId) !== "missing") return
    this.reviving.add(cellId)
    this.statuses.delete(cellId)
    this.request(cellId)
    if (this.statusOf(cellId) !== "loading") this.reviving.delete(cellId)
  }

  forget(cellId: string) {
    this.reviving.delete(cellId)
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
      this.reviving.delete(cellId)
      this.setStatus(cellId, "loaded")
      return
    }
    if (this.deps.canRelease(cellId)) {
      this.reviving.delete(cellId)
      this.setStatus(cellId, "unrequested")
      return
    }
    if (snapshot && snapshot.results.length > 0) {
      this.applyReconciled(cellId, cell, snapshot)
      return
    }
    this.reviving.delete(cellId)
    this.setStatus(cellId, "missing")
  }

  // The cell's SQL may have changed while the notebook was unmounted
  // (update_cell / apply_notebook_state). Results follow statement content:
  // unmatched old results are never exposed under new SQL. A changed frame is
  // rewritten to disk before its array counts as persisted/releasable, and a
  // frame with no survivor deletes the snapshot — every later reload agrees.
  private applyReconciled(
    cellId: string,
    cell: NotebookCell,
    snapshot: NotebookResultSnapshot,
  ) {
    const statements = getQueriesFromText(cell.value)
    const reconciled = reconcileResultsForStatements(statements, {
      results: snapshot.results.map(normalizeSnapshotResultQuery),
      activeResultIndex: snapshot.activeResultIndex ?? 0,
      ...(snapshot.activeStatementKey !== undefined
        ? { activeStatementKey: snapshot.activeStatementKey }
        : {}),
      timestamp: snapshot.savedAt,
    })
    if (!reconciled) {
      if (!this.reviving.delete(cellId)) {
        void this.deps.deleteSnapshot(cellId).catch(() => undefined)
      }
      this.setStatus(cellId, "missing")
      return
    }
    this.reviving.delete(cellId)
    const frameChanged =
      reconciled.results.length !== snapshot.results.length ||
      reconciled.results.some((result, index) => {
        return result !== snapshot.results[index]
      })
    const slotKeys = new Set(statementKeysFor(statements))
    const refreshErrors = snapshot.refreshErrors?.filter((error) =>
      slotKeys.has(error.statementKey),
    )
    if (frameChanged) {
      const rewritten: NotebookResultSnapshot = {
        ...snapshot,
        results: reconciled.results,
        activeResultIndex: reconciled.activeResultIndex,
        activeStatementKey: reconciled.activeStatementKey,
        ...(refreshErrors && refreshErrors.length > 0 ? { refreshErrors } : {}),
      }
      delete rewritten.script
      if (!refreshErrors || refreshErrors.length === 0) {
        delete rewritten.refreshErrors
      }
      void this.deps
        .rewriteSnapshot(rewritten)
        .then((saved) => {
          if (saved) this.persisted.add(reconciled.results)
        })
        .catch(() => undefined)
    } else {
      this.persisted.add(reconciled.results)
    }
    this.deps.applyResult(cellId, {
      results: reconciled.results,
      activeResultIndex: reconciled.activeResultIndex,
      activeStatementKey: reconciled.activeStatementKey,
      timestamp: snapshot.savedAt,
      ...(snapshot.script && !frameChanged ? { script: snapshot.script } : {}),
    })
    // Persisted refresh failures re-enter the engine channel, so a reload
    // restores the red badge and last_refresh_error alongside the old rows.
    if (refreshErrors && refreshErrors.length > 0) {
      this.deps.seedRefreshErrors(cellId, refreshErrors)
    }
    this.setStatus(cellId, "loaded")
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
