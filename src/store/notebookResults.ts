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

export const MAX_PERSISTED_PASSIVE_NOTEBOOKS = 10

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

export const unpinNotebookSnapshots = (bufferId: number): void => {
  pinnedBufferIds.delete(bufferId)
}

export const pruneToRecentNotebooks = async (
  keep: number = MAX_PERSISTED_PASSIVE_NOTEBOOKS,
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
        .filter(([bufferId]) => !pinnedBufferIds.has(bufferId))
        .sort((a, b) => b[1] - a[1]) // newest first
        .slice(keep) // everything past the `keep` newest passive
        .map(([bufferId]) => bufferId)
      if (staleBuffers.length === 0) return
      await db.notebook_results.where("bufferId").anyOf(staleBuffers).delete()
    })
  } catch (error) {
    console.warn("Failed to prune notebook result snapshots", error)
  }
}
