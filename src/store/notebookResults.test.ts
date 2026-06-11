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
  loadNotebookSnapshots,
  deleteCellSnapshot,
  deleteNotebookSnapshots,
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
  sqlHash: "h",
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
    const loaded = await loadNotebookSnapshots(1)
    expect(loaded).toHaveLength(1)
    expect(loaded[0].results).toEqual(results)
  })

  it("loadNotebookSnapshots returns only the given buffer's cells", async () => {
    await saveCellSnapshot(snap(1, "c1", 100))
    await saveCellSnapshot(snap(1, "c2", 100))
    await saveCellSnapshot(snap(2, "c1", 100))
    expect(
      (await loadNotebookSnapshots(1)).map((s) => s.cellId).sort(),
    ).toEqual(["c1", "c2"])
    expect(await loadNotebookSnapshots(2)).toHaveLength(1)
  })

  it("put overwrites the same [bufferId+cellId]", async () => {
    await saveCellSnapshot(snap(1, "c1", 100))
    await saveCellSnapshot(snap(1, "c1", 200))
    const loaded = await loadNotebookSnapshots(1)
    expect(loaded).toHaveLength(1)
    expect(loaded[0].savedAt).toBe(200)
  })

  it("deletes one cell, then a whole notebook", async () => {
    await saveCellSnapshot(snap(1, "c1", 100))
    await saveCellSnapshot(snap(1, "c2", 100))
    await deleteCellSnapshot(1, "c1")
    expect((await loadNotebookSnapshots(1)).map((s) => s.cellId)).toEqual([
      "c2",
    ])
    await deleteNotebookSnapshots(1)
    expect(await loadNotebookSnapshots(1)).toHaveLength(0)
  })

  it("prunes to the N most-recently-saved notebooks (recency = latest cell)", async () => {
    await saveCellSnapshot(snap(1, "c1", 10))
    await saveCellSnapshot(snap(2, "c1", 30))
    await saveCellSnapshot(snap(2, "c2", 20))
    await saveCellSnapshot(snap(3, "c1", 50))
    await pruneToRecentNotebooks(2)
    // buffers 3 (50) and 2 (30) kept; buffer 1 (10) evicted
    expect(await loadNotebookSnapshots(1)).toHaveLength(0)
    expect(await loadNotebookSnapshots(2)).toHaveLength(2)
    expect(await loadNotebookSnapshots(3)).toHaveLength(1)
  })

  it("prune is a no-op under the budget", async () => {
    await saveCellSnapshot(snap(1, "c1", 10))
    await saveCellSnapshot(snap(2, "c1", 20))
    await pruneToRecentNotebooks(10)
    expect(await loadNotebookSnapshots(1)).toHaveLength(1)
    expect(await loadNotebookSnapshots(2)).toHaveLength(1)
  })
})
