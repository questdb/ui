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
  copyNotebookSnapshots,
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

  it("copies mapped snapshots under new ids without coupling them to the source", async () => {
    // Given two live source snapshots, one orphan, and full restore metadata
    const scriptResults: SingleQueryResult[] = [
      dqlResult,
      { ...dqlResult, query: "select 2" },
    ]
    await saveCellSnapshot({
      ...snap(1, "run", 100, scriptResults),
      activeResultIndex: 1,
      script: { successCount: 2, failedCount: 0, durationMs: 42 },
    })
    await saveCellSnapshot(snap(1, "draw", 200))
    await saveCellSnapshot(snap(1, "orphan", 300))

    // When the notebook snapshots are copied through the cell-id mapping
    const copiedAtLeast = Date.now()
    const copied = await copyNotebookSnapshots(
      1,
      2,
      new Map([
        ["run", "new-run"],
        ["draw", "new-draw"],
        ["missing", "new-missing"],
      ]),
      () => true,
    )

    // Then only mapped cells are copied with their payload and UI metadata,
    // stamped with a fresh savedAt so recency pruning treats them as current
    expect(copied).toBe(2)
    expect((await loadSnapshotCellIds(2)).sort()).toEqual([
      "new-draw",
      "new-run",
    ])
    const copiedRun = await loadCellSnapshot(2, "new-run")
    const { savedAt, ...restOfCopiedRun } = copiedRun!
    expect(restOfCopiedRun).toEqual({
      bufferId: 2,
      cellId: "new-run",
      results: scriptResults,
      activeResultIndex: 1,
      script: { successCount: 2, failedCount: 0, durationMs: 42 },
    })
    expect(savedAt).toBeGreaterThanOrEqual(copiedAtLeast)

    // And changing the duplicate leaves the source snapshot untouched
    await updateCellSnapshotActiveIndex(2, "new-run", 0)
    await deleteCellSnapshot(2, "new-draw")
    expect(await loadCellSnapshot(1, "run")).toMatchObject({
      activeResultIndex: 1,
      savedAt: 100,
    })
    expect(await loadCellSnapshot(1, "draw")).toEqual(snap(1, "draw", 200))
    expect(await loadCellSnapshot(2, "orphan")).toBeUndefined()
    expect(await loadCellSnapshot(2, "new-missing")).toBeUndefined()
  })

  it("keeps a duplicated notebook out of stale eviction by refreshing savedAt", async () => {
    // Given a source whose only snapshot was saved long ago, plus newer
    // notebooks that would fill the recency budget
    await saveCellSnapshot(snap(1, "cell", 10))
    await saveCellSnapshot(snap(2, "cell", 1000))
    await saveCellSnapshot(snap(3, "cell", 2000))

    // When the old source is duplicated into a new buffer and pruning runs
    await copyNotebookSnapshots(1, 4, new Map([["cell", "copy"]]), () => true)
    await pruneToRecentNotebooks(2)

    // Then the fresh duplicate survives while the stale source is evicted
    expect(await loadSnapshotCellIds(4)).toEqual(["copy"])
    expect(await loadSnapshotCellIds(1)).toHaveLength(0)
  })

  it("skips a mapped snapshot that no longer matches the cloned cell", async () => {
    // Given a snapshot that raced ahead of the notebook state being cloned
    await saveCellSnapshot(snap(1, "cell", 100))

    // When the caller rejects that stale snapshot
    const copied = await copyNotebookSnapshots(
      1,
      2,
      new Map([["cell", "new-cell"]]),
      () => false,
    )

    // Then no result is attached to the duplicated cell
    expect(copied).toBe(0)
    expect(await loadCellSnapshot(2, "new-cell")).toBeUndefined()
    expect(await loadCellSnapshot(1, "cell")).toEqual(snap(1, "cell", 100))
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
