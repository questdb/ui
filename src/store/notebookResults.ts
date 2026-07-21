import { db } from "./db"
import type { CellResult, SingleQueryResult } from "./notebook"

// A persisted, bounded copy of a cell's last run/draw result. One record per
// cell (mode-agnostic: both the run grid and the draw chart render the same
// rows). `results` is a faithful copy of the live `cell.result.results`, already
// capped at the notebook row/byte limits before it is saved.
// `activeResultIndex` and `script` restore the tab the user was viewing and the
// script summary; records written before these fields existed omit them, so
// readers must default (index 0, no summary).
export type NotebookResultSnapshot = {
  bufferId: number
  cellId: string
  results: SingleQueryResult[]
  savedAt: number
  activeResultIndex?: number
  script?: CellResult["script"]
}

// Only the N most-recently-saved notebooks keep persisted results; older ones
// are evicted so IndexedDB can't grow unbounded across many notebooks.
export const MAX_PERSISTED_NOTEBOOKS = 10

export const saveCellSnapshot = async (
  snapshot: NotebookResultSnapshot,
): Promise<void> => {
  await db.notebook_results.put(snapshot)
}

// Records the result tab the user switched to, so a release/re-hydrate cycle
// (or a reload) restores the tab they were viewing. No-op when the cell has no
// snapshot yet.
export const updateCellSnapshotActiveIndex = (
  bufferId: number,
  cellId: string,
  activeResultIndex: number,
): Promise<void> =>
  db.notebook_results
    .update([bufferId, cellId], { activeResultIndex })
    .then(() => undefined)

// Index-only read: snapshot payloads are never deserialized.
export const loadSnapshotCellIds = (bufferId: number): Promise<string[]> =>
  db.notebook_results
    .where("bufferId")
    .equals(bufferId)
    .primaryKeys()
    .then((keys) => keys.map(([, cellId]) => cellId))

export const loadCellSnapshot = (
  bufferId: number,
  cellId: string,
): Promise<NotebookResultSnapshot | undefined> =>
  db.notebook_results.get([bufferId, cellId])

export const deleteCellSnapshot = async (
  bufferId: number,
  cellId: string,
): Promise<void> => {
  await db.notebook_results.delete([bufferId, cellId])
}

export const deleteNotebookSnapshots = async (
  bufferId: number,
): Promise<void> => {
  await db.notebook_results.where("bufferId").equals(bufferId).delete()
}

// An open notebook releases its results to IndexedDB-only as cells leave the
// retain band, so its snapshots are the ONLY copy of data the user can scroll
// back to. Pinned notebooks are exempt from recency eviction until unpinned on
// unmount — otherwise saves in 10 other notebooks (e.g. agent background runs)
// would silently destroy an open notebook's released results.
const pinnedBufferIds = new Set<number>()

export const pinNotebookSnapshots = (bufferId: number): (() => void) => {
  pinnedBufferIds.add(bufferId)
  return () => pinnedBufferIds.delete(bufferId)
}

// Keep snapshots only for the `keep` most-recently-saved notebooks; a notebook's
// recency is the latest `savedAt` among its cells. Iterates the `savedAt` index
// keys only — snapshot payloads are never deserialized. One transaction: a save
// landing between the recency read and the delete must not lose its snapshot,
// and a failure rolls every delete back. Never rejects — pruning is
// best-effort housekeeping; a failure only means over-retention until the next
// prune trigger (notebook open / headless run commit) retries it.
export const pruneToRecentNotebooks = async (
  keep: number = MAX_PERSISTED_NOTEBOOKS,
): Promise<void> => {
  try {
    const bufferIds = await db.notebook_results.orderBy("bufferId").uniqueKeys()
    if (bufferIds.length <= keep) return
    await db.transaction("rw", db.notebook_results, async () => {
      const latestByBuffer = new Map<number, number>()
      await db.notebook_results
        .orderBy("savedAt")
        .eachKey((savedAt, { primaryKey }) => {
          // Ascending key order: the last write per buffer is its latest savedAt.
          const [bufferId] = primaryKey
          latestByBuffer.set(bufferId, savedAt as number)
        })
      if (latestByBuffer.size <= keep) return
      const staleBuffers = Array.from(latestByBuffer.entries())
        .sort((a, b) => b[1] - a[1]) // newest first
        .slice(keep) // everything past the `keep` newest
        .map(([bufferId]) => bufferId)
        .filter((bufferId) => !pinnedBufferIds.has(bufferId))
      if (staleBuffers.length === 0) return
      await db.notebook_results.where("bufferId").anyOf(staleBuffers).delete()
    })
  } catch (error) {
    console.warn("Failed to prune notebook result snapshots", error)
  }
}
