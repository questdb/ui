import "fake-indexeddb/auto"
import { describe, it, expect, beforeEach, vi } from "vitest"

// Stub browser globals before the db.ts singleton is constructed at import.
vi.hoisted(() => {
  const storage: Record<string, string> = {}
  globalThis.localStorage = {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => {
      storage[k] = v
    },
    removeItem: (k: string) => {
      delete storage[k]
    },
    clear: () => {
      Object.keys(storage).forEach((k) => delete storage[k])
    },
    get length() {
      return Object.keys(storage).length
    },
    key: () => null,
  } as Storage
  globalThis.window = globalThis as unknown as Window & typeof globalThis
  ;(globalThis as Record<string, unknown>).location = {
    href: "http://localhost/",
  }
  ;(globalThis as Record<string, unknown>).history = {
    replaceState: () => {},
  }
})

import { db } from "./db"
import {
  saveCellSnapshot,
  loadCellSnapshot,
  loadSnapshotCellIds,
  updateCellSnapshotActiveIndex,
  deleteCellSnapshot,
  deleteNotebookSnapshots,
  pinNotebookSnapshots,
  pruneToRecentNotebooks,
  type NotebookResultSnapshot,
} from "./notebookResults"
import type { SingleQueryResult } from "./notebook"

const dqlResult: SingleQueryResult = {
  type: "dql",
  query: "select 1",
  columns: [{ name: "x", type: "INT" }],
  dataset: [[1], [2]],
  count: 2,
}

const snap = (
  bufferId: number,
  cellId: string,
  savedAt: number,
  results: SingleQueryResult[] = [dqlResult],
): NotebookResultSnapshot => ({
  bufferId,
  cellId,
  results,
  savedAt,
})

beforeEach(async () => {
  await db.notebook_results.clear()
})

describe("notebookResults", () => {
  it("round-trips a snapshot faithfully (dql + ddl + error)", async () => {
    const results: SingleQueryResult[] = [
      dqlResult,
      { type: "ddl", query: "create table t (x int)" },
      { type: "error", query: "bad", error: "boom" },
    ]
    await saveCellSnapshot(snap(1, "c1", 100, results))
    const loaded = await loadCellSnapshot(1, "c1")
    expect(loaded?.results).toEqual(results)
  })

  it("round-trips the viewed tab and script summary", async () => {
    // Given a script cell's snapshot with a non-default tab and a summary
    await saveCellSnapshot({
      ...snap(1, "c1", 100),
      activeResultIndex: 2,
      script: { successCount: 2, failedCount: 1, durationMs: 42 },
    })

    // When it is loaded back
    const loaded = await loadCellSnapshot(1, "c1")

    // Then both fields survive
    expect(loaded?.activeResultIndex).toBe(2)
    expect(loaded?.script).toEqual({
      successCount: 2,
      failedCount: 1,
      durationMs: 42,
    })
  })

  it("reads a pre-tab-field record with the fields absent", async () => {
    // Given a record written before activeResultIndex/script existed
    await saveCellSnapshot(snap(1, "c1", 100))

    // When it is loaded back
    const loaded = await loadCellSnapshot(1, "c1")

    // Then the fields are undefined and the reader must default
    expect(loaded?.activeResultIndex).toBeUndefined()
    expect(loaded?.script).toBeUndefined()
  })

  it("updateCellSnapshotActiveIndex updates an existing record and skips a missing one", async () => {
    await saveCellSnapshot(snap(1, "c1", 100))
    await updateCellSnapshotActiveIndex(1, "c1", 3)
    expect((await loadCellSnapshot(1, "c1"))?.activeResultIndex).toBe(3)

    await updateCellSnapshotActiveIndex(1, "ghost", 3)
    expect(await loadCellSnapshot(1, "ghost")).toBeUndefined()
  })

  it("loadSnapshotCellIds returns the buffer's cell ids only", async () => {
    await saveCellSnapshot(snap(1, "c1", 100))
    await saveCellSnapshot(snap(1, "c2", 100))
    await saveCellSnapshot(snap(2, "other", 100))
    expect((await loadSnapshotCellIds(1)).sort()).toEqual(["c1", "c2"])
    expect(await loadSnapshotCellIds(3)).toEqual([])
  })

  it("put overwrites the same [bufferId+cellId]", async () => {
    await saveCellSnapshot(snap(1, "c1", 100))
    await saveCellSnapshot(snap(1, "c1", 200))
    expect(await loadSnapshotCellIds(1)).toHaveLength(1)
    expect((await loadCellSnapshot(1, "c1"))?.savedAt).toBe(200)
  })

  it("deletes one cell, then a whole notebook", async () => {
    await saveCellSnapshot(snap(1, "c1", 100))
    await saveCellSnapshot(snap(1, "c2", 100))
    await deleteCellSnapshot(1, "c1")
    expect(await loadSnapshotCellIds(1)).toEqual(["c2"])
    await deleteNotebookSnapshots(1)
    expect(await loadSnapshotCellIds(1)).toHaveLength(0)
  })

  it("prunes to the N most-recently-saved notebooks (recency = latest cell)", async () => {
    await saveCellSnapshot(snap(1, "c1", 10))
    await saveCellSnapshot(snap(2, "c1", 30))
    await saveCellSnapshot(snap(2, "c2", 20))
    await saveCellSnapshot(snap(3, "c1", 50))
    await pruneToRecentNotebooks(2)
    // buffers 3 (50) and 2 (30) kept; buffer 1 (10) evicted
    expect(await loadSnapshotCellIds(1)).toHaveLength(0)
    expect(await loadSnapshotCellIds(2)).toHaveLength(2)
    expect(await loadSnapshotCellIds(3)).toHaveLength(1)
  })

  it("prune is a no-op under the budget", async () => {
    await saveCellSnapshot(snap(1, "c1", 10))
    await saveCellSnapshot(snap(2, "c1", 20))
    await pruneToRecentNotebooks(10)
    expect(await loadSnapshotCellIds(1)).toHaveLength(1)
    expect(await loadSnapshotCellIds(2)).toHaveLength(1)
  })

  it("keeps a pinned notebook on top of the passive budget, not in it", async () => {
    // Given the newest notebook is open (pinned) and two passive ones exist
    await saveCellSnapshot(snap(1, "c1", 10))
    await saveCellSnapshot(snap(2, "c1", 20))
    await saveCellSnapshot(snap(3, "c1", 30))
    const unpin = pinNotebookSnapshots(3)

    // When the prune runs with a budget of two
    await pruneToRecentNotebooks(2)

    // Then both passive notebooks survive — the pinned one takes no slot
    expect(await loadSnapshotCellIds(1)).toEqual(["c1"])
    expect(await loadSnapshotCellIds(2)).toEqual(["c1"])
    expect(await loadSnapshotCellIds(3)).toEqual(["c1"])
    unpin()
  })

  it("never prunes a pinned (open) notebook's snapshots", async () => {
    // Given the oldest notebook is open (pinned) while newer ones save
    await saveCellSnapshot(snap(1, "c1", 10))
    await saveCellSnapshot(snap(2, "c1", 20))
    await saveCellSnapshot(snap(3, "c1", 30))
    const unpin = pinNotebookSnapshots(1)

    // When the recency prune runs over budget
    await pruneToRecentNotebooks(2)

    // Then the open notebook's snapshots survive the eviction
    expect(await loadSnapshotCellIds(1)).toEqual(["c1"])

    // When it is closed (unpinned)
    unpin()
    await pruneToRecentNotebooks(2)

    // Then the next prune evicts it normally
    expect(await loadSnapshotCellIds(1)).toEqual([])
  })
})
