import { db } from "./db"
import type { SingleQueryResult } from "./notebook"

// A persisted, bounded copy of a cell's last run/draw result. One record per
// cell (mode-agnostic: both the run grid and the draw chart render the same
// rows). `results` is a faithful copy of the live `cell.result.results`, already
// capped at the notebook row/byte limits before it is saved.
export type NotebookResultSnapshot = {
  bufferId: number
  cellId: string
  results: SingleQueryResult[]
  savedAt: number
}

// Only the N most-recently-saved notebooks keep persisted results; older ones
// are evicted so IndexedDB can't grow unbounded across many notebooks.
export const MAX_PERSISTED_NOTEBOOKS = 10

export const saveCellSnapshot = async (
  snapshot: NotebookResultSnapshot,
): Promise<void> => {
  await db.notebook_results.put(snapshot)
}

export const loadNotebookSnapshots = (
  bufferId: number,
): Promise<NotebookResultSnapshot[]> =>
  db.notebook_results.where("bufferId").equals(bufferId).toArray()

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

// Keep snapshots only for the `keep` most-recently-saved notebooks; a notebook's
// recency is the latest `savedAt` among its cells. Iterates the `savedAt` index
// keys only — snapshot payloads are never deserialized. One transaction: a save
// landing between the recency read and the delete must not lose its snapshot.
export const pruneToRecentNotebooks = (
  keep: number = MAX_PERSISTED_NOTEBOOKS,
): Promise<void> =>
  db.transaction("rw", db.notebook_results, async () => {
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
    await db.notebook_results.where("bufferId").anyOf(staleBuffers).delete()
  })
