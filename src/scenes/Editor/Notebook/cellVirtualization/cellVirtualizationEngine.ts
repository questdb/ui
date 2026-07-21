import type { NotebookCell } from "../../../../store/notebook"
import { shallowArrayEquals } from "../../../../utils/shallowArrayEquals"
import { scheduleFrame, scheduleIdle } from "../notebookScheduling"

export type CellContentMode = "full" | "placeholder"

const DWELL_MS = 100
const RECENT_EDIT_LIMIT = 5

export type CellVirtualizationEngineOptions = {
  dwellMs?: number
  recentEditLimit?: number
  onCellDataNeeded?: (cellId: string) => void
  onCellDataReleasable?: (cellId: string) => void
}

type Entry = {
  cellId: string
  mode: CellContentMode
  inMountBand: boolean
  inRetainBand: boolean
  distance: number
  candidateSince: number | null
}

// Full content inside the mount band, placeholder beyond the retain band —
// the gap is hysteresis. Mounts pace one per frame, nearest first, after a
// dwell; pinned cells never drop.
export class CellVirtualizationEngine {
  private entries = new Map<string, Entry>()
  private listeners = new Map<string, Set<() => void>>()
  private pendingDrops = new Set<string>()
  private focusedCellId: string | null = null
  private maximizedCellId: string | null = null
  private runningCellIds = new Set<string>()
  private recentlyEditedCellIds: string[] = []
  private lastSyncedCellIds: string[] | null = null
  private revealPinnedCellIds = new Set<string>()
  private mountScheduled = false
  private dropScheduled = false
  private destroyed = false
  private dwellMs: number
  private recentEditLimit: number
  private onCellDataNeeded?: (cellId: string) => void
  private onCellDataReleasable?: (cellId: string) => void

  constructor(options: CellVirtualizationEngineOptions = {}) {
    this.dwellMs = options.dwellMs ?? DWELL_MS
    this.recentEditLimit = options.recentEditLimit ?? RECENT_EDIT_LIMIT
    this.onCellDataNeeded = options.onCellDataNeeded
    this.onCellDataReleasable = options.onCellDataReleasable
  }

  destroy() {
    this.destroyed = true
    this.entries.clear()
    this.listeners.clear()
    this.pendingDrops.clear()
    this.runningCellIds.clear()
    this.revealPinnedCellIds.clear()
    this.recentlyEditedCellIds = []
    this.lastSyncedCellIds = null
  }

  sync(cells: NotebookCell[]) {
    const sqlCells = cells.filter((cell) => cell.type !== "markdown")
    const cellIds = sqlCells.map((cell) => cell.id)
    if (
      this.lastSyncedCellIds &&
      shallowArrayEquals(this.lastSyncedCellIds, cellIds)
    )
      return
    this.lastSyncedCellIds = cellIds
    const present = new Set(cellIds)
    for (const cell of sqlCells) {
      if (this.entries.has(cell.id)) continue
      const pinned = this.isPinned(cell.id)
      this.entries.set(cell.id, {
        cellId: cell.id,
        mode: pinned ? "full" : "placeholder",
        inMountBand: false,
        inRetainBand: false,
        distance: Number.MAX_SAFE_INTEGER,
        candidateSince: null,
      })
      if (pinned) this.onCellDataNeeded?.(cell.id)
    }
    for (const cellId of [...this.entries.keys()]) {
      if (!present.has(cellId)) this.removeEntry(cellId)
    }
  }

  getContentMode(cellId: string): CellContentMode {
    return this.entries.get(cellId)?.mode ?? "placeholder"
  }

  reportMountBand(cellId: string, inBand: boolean, distancePx: number) {
    const entry = this.entries.get(cellId)
    if (!entry) return
    entry.distance = distancePx
    if (entry.inMountBand === inBand) return
    entry.inMountBand = inBand
    if (!inBand) {
      entry.candidateSince = null
      // A retain exit reported earlier in the same observer tick saw a stale
      // mount flag and skipped its drop — re-evaluate.
      this.requestDrop(cellId)
      return
    }
    this.revealPinnedCellIds.delete(cellId)
    this.pendingDrops.delete(cellId)
    if (entry.mode === "placeholder") {
      entry.candidateSince = Date.now()
      this.scheduleNextMount()
    }
  }

  reportRetainBand(cellId: string, inBand: boolean) {
    const entry = this.entries.get(cellId)
    if (!entry || entry.inRetainBand === inBand) return
    entry.inRetainBand = inBand
    if (inBand) {
      this.pendingDrops.delete(cellId)
      this.onCellDataNeeded?.(cellId)
    } else {
      this.requestDrop(cellId)
    }
  }

  ensureFullContent(cellId: string) {
    const entry = this.entries.get(cellId)
    if (!entry) return
    this.revealPinnedCellIds.add(cellId)
    this.pendingDrops.delete(cellId)
    this.setMode(entry, "full")
  }

  isInBand(cellId: string): boolean {
    const entry = this.entries.get(cellId)
    if (!entry) return true
    return entry.inMountBand || entry.inRetainBand
  }

  releaseRevealPin(cellId: string) {
    if (!this.revealPinnedCellIds.delete(cellId)) return
    this.requestDrop(cellId)
  }

  setFocusedCell(cellId: string | null) {
    if (this.focusedCellId === cellId) return
    const previous = this.focusedCellId
    this.focusedCellId = cellId
    if (cellId) this.promotePinned(cellId)
    if (previous) this.requestDrop(previous)
  }

  setMaximizedCell(cellId: string | null) {
    if (this.maximizedCellId === cellId) return
    const previous = this.maximizedCellId
    this.maximizedCellId = cellId
    if (cellId) this.promotePinned(cellId)
    if (previous) this.requestDrop(previous)
  }

  setRunningCells(cellIds: Iterable<string>) {
    const next = new Set(cellIds)
    const previous = this.runningCellIds
    this.runningCellIds = next
    for (const cellId of next) {
      if (!previous.has(cellId)) this.promotePinned(cellId)
    }
    for (const cellId of previous) {
      if (!next.has(cellId)) this.requestDrop(cellId)
    }
  }

  noteCellEdited(cellId: string) {
    if (!this.entries.has(cellId)) return
    const list = this.recentlyEditedCellIds.filter((id) => id !== cellId)
    list.unshift(cellId)
    const evicted = list.splice(this.recentEditLimit)
    this.recentlyEditedCellIds = list
    this.promotePinned(cellId)
    for (const evictedId of evicted) this.requestDrop(evictedId)
  }

  subscribe(cellId: string, listener: () => void): () => void {
    let set = this.listeners.get(cellId)
    if (!set) {
      set = new Set()
      this.listeners.set(cellId, set)
    }
    set.add(listener)
    return () => {
      const current = this.listeners.get(cellId)
      if (!current) return
      current.delete(listener)
      if (current.size === 0) this.listeners.delete(cellId)
    }
  }

  private isPinned(cellId: string): boolean {
    return (
      cellId === this.focusedCellId ||
      cellId === this.maximizedCellId ||
      this.runningCellIds.has(cellId) ||
      this.recentlyEditedCellIds.includes(cellId) ||
      this.revealPinnedCellIds.has(cellId)
    )
  }

  private promotePinned(cellId: string) {
    const entry = this.entries.get(cellId)
    if (!entry) return
    this.pendingDrops.delete(cellId)
    this.setMode(entry, "full")
  }

  canReleaseData(cellId: string): boolean {
    const entry = this.entries.get(cellId)
    if (!entry) return true
    return !entry.inRetainBand && !entry.inMountBand && !this.isPinned(cellId)
  }

  private requestDrop(cellId: string) {
    const entry = this.entries.get(cellId)
    if (!entry) return
    if (entry.inRetainBand || entry.inMountBand || this.isPinned(cellId)) return
    this.onCellDataReleasable?.(cellId)
    if (entry.mode !== "full") return
    this.pendingDrops.add(cellId)
    this.scheduleNextDrop()
  }

  private removeEntry(cellId: string) {
    this.entries.delete(cellId)
    this.pendingDrops.delete(cellId)
    this.revealPinnedCellIds.delete(cellId)
    this.recentlyEditedCellIds = this.recentlyEditedCellIds.filter(
      (id) => id !== cellId,
    )
    this.notify(cellId)
  }

  private scheduleNextMount() {
    if (this.mountScheduled || this.destroyed) return
    this.mountScheduled = true
    scheduleFrame(() => {
      this.mountScheduled = false
      this.mountNextCandidate()
    })
  }

  private mountNextCandidate() {
    if (this.destroyed) return
    const now = Date.now()
    let ready: Entry | null = null
    let pending = 0
    for (const entry of this.entries.values()) {
      if (
        entry.mode !== "placeholder" ||
        !entry.inMountBand ||
        entry.candidateSince === null
      )
        continue
      pending += 1
      if (now - entry.candidateSince < this.dwellMs) continue
      if (!ready || entry.distance < ready.distance) ready = entry
    }
    if (ready) {
      this.setMode(ready, "full")
      pending -= 1
    }
    if (pending > 0) this.scheduleNextMount()
  }

  private scheduleNextDrop() {
    if (this.dropScheduled || this.destroyed) return
    this.dropScheduled = true
    scheduleIdle(() => {
      this.dropScheduled = false
      this.dropNextCell()
    })
  }

  // One drop per idle tick — each drop unmounts a Monaco/grid, and React 17
  // does not batch state updates fired outside event handlers.
  private dropNextCell() {
    if (this.destroyed) return
    for (const cellId of [...this.pendingDrops]) {
      this.pendingDrops.delete(cellId)
      const entry = this.entries.get(cellId)
      if (!entry || entry.mode !== "full") continue
      if (entry.inRetainBand || entry.inMountBand || this.isPinned(cellId))
        continue
      this.setMode(entry, "placeholder")
      break
    }
    if (this.pendingDrops.size > 0) this.scheduleNextDrop()
  }

  private setMode(entry: Entry, mode: CellContentMode) {
    if (entry.mode === mode) return
    entry.mode = mode
    entry.candidateSince = null
    if (mode === "full") this.onCellDataNeeded?.(entry.cellId)
    this.notify(entry.cellId)
  }

  private notify(cellId: string) {
    this.listeners.get(cellId)?.forEach((listener) => listener())
  }
}
