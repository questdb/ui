import { describe, it, expect, beforeEach } from "vitest"
import {
  loadNotebookColumnLayout,
  saveNotebookColumnLayout,
  removeNotebookColumnLayout,
  removeNotebookCellLayouts,
  removeNotebookBufferLayouts,
} from "./notebookColumnLayoutStore"

// The store reads/writes this single localStorage entry.
const STORAGE_KEY = "notebook.grid.layout"
const LRU_MAX = 20

const installMemoryLocalStorage = () => {
  const store: Record<string, string> = {}
  globalThis.localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k])
    },
    key: () => null,
    length: 0,
  } as Storage
}

// Query keys are opaque to the store, but the per-cell LRU relies on
// insertion order, so callers prefix a non-digit (here "q") to keep keys from
// sorting as integers.
const q = (n: number): string => `q${n}`

const CELL = "cell-a"
const OTHER_CELL = "cell-b"

beforeEach(() => {
  installMemoryLocalStorage()
})

describe("notebookColumnLayoutStore", () => {
  it("round-trips a saved layout for the same buffer, cell, and query", () => {
    // Given a saved sizing
    saveNotebookColumnLayout(1, CELL, q(0), { columnSizing: { col_0: 200 } })

    // When loading it back
    const loaded = loadNotebookColumnLayout(1, CELL, q(0))

    // Then the same layout is returned
    expect(loaded).toEqual({ columnSizing: { col_0: 200 } })
  })

  it("merges partial layouts for the same key", () => {
    // Given a sizing already saved
    saveNotebookColumnLayout(1, CELL, q(0), { columnSizing: { col_0: 200 } })

    // When an order and pinned set are saved separately for the same key
    saveNotebookColumnLayout(1, CELL, q(0), { columnOrder: ["col_1", "col_0"] })
    saveNotebookColumnLayout(1, CELL, q(0), { pinnedColumns: ["col_0"] })

    // Then all three are preserved
    expect(loadNotebookColumnLayout(1, CELL, q(0))).toEqual({
      columnSizing: { col_0: 200 },
      columnOrder: ["col_1", "col_0"],
      pinnedColumns: ["col_0"],
    })
  })

  it("keeps layouts independent across query, cell, and buffer", () => {
    // Given the same column position sized differently per query/cell/buffer
    saveNotebookColumnLayout(1, CELL, q(0), { columnSizing: { col_0: 100 } })
    saveNotebookColumnLayout(1, CELL, q(1), { columnSizing: { col_0: 200 } })
    saveNotebookColumnLayout(1, OTHER_CELL, q(0), {
      columnSizing: { col_0: 300 },
    })
    saveNotebookColumnLayout(2, CELL, q(0), { columnSizing: { col_0: 400 } })

    // When each is loaded
    // Then none bleed into another
    expect(loadNotebookColumnLayout(1, CELL, q(0))).toEqual({
      columnSizing: { col_0: 100 },
    })
    expect(loadNotebookColumnLayout(1, CELL, q(1))).toEqual({
      columnSizing: { col_0: 200 },
    })
    expect(loadNotebookColumnLayout(1, OTHER_CELL, q(0))).toEqual({
      columnSizing: { col_0: 300 },
    })
    expect(loadNotebookColumnLayout(2, CELL, q(0))).toEqual({
      columnSizing: { col_0: 400 },
    })
  })

  it("returns null and skips persistence for an undefined buffer", () => {
    // Given no buffer id (session-only notebook)
    // When saving and loading
    saveNotebookColumnLayout(undefined, CELL, q(0), {
      columnSizing: { col_0: 100 },
    })

    // Then nothing is stored or returned
    expect(loadNotebookColumnLayout(undefined, CELL, q(0))).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("removes a single query's layout, leaving its siblings", () => {
    // Given two queries saved under one cell
    saveNotebookColumnLayout(1, CELL, q(0), { columnSizing: { col_0: 100 } })
    saveNotebookColumnLayout(1, CELL, q(1), { columnSizing: { col_0: 200 } })

    // When one is removed
    removeNotebookColumnLayout(1, CELL, q(0))

    // Then only that one is gone
    expect(loadNotebookColumnLayout(1, CELL, q(0))).toBeNull()
    expect(loadNotebookColumnLayout(1, CELL, q(1))).toEqual({
      columnSizing: { col_0: 200 },
    })
  })

  it("drops a whole cell's subtree, leaving other cells", () => {
    // Given two cells with layouts
    saveNotebookColumnLayout(1, CELL, q(0), { columnSizing: { col_0: 100 } })
    saveNotebookColumnLayout(1, CELL, q(1), { columnSizing: { col_0: 150 } })
    saveNotebookColumnLayout(1, OTHER_CELL, q(0), {
      columnSizing: { col_0: 200 },
    })

    // When one cell is deleted
    removeNotebookCellLayouts(1, CELL)

    // Then its queries are gone and the other cell survives
    expect(loadNotebookColumnLayout(1, CELL, q(0))).toBeNull()
    expect(loadNotebookColumnLayout(1, CELL, q(1))).toBeNull()
    expect(loadNotebookColumnLayout(1, OTHER_CELL, q(0))).toEqual({
      columnSizing: { col_0: 200 },
    })
  })

  it("drops a whole buffer's subtree, leaving other buffers", () => {
    // Given two buffers with layouts
    saveNotebookColumnLayout(1, CELL, q(0), { columnSizing: { col_0: 100 } })
    saveNotebookColumnLayout(2, CELL, q(0), { columnSizing: { col_0: 200 } })

    // When one buffer is deleted
    removeNotebookBufferLayouts(1)

    // Then its cells are gone and the other buffer survives
    expect(loadNotebookColumnLayout(1, CELL, q(0))).toBeNull()
    expect(loadNotebookColumnLayout(2, CELL, q(0))).toEqual({
      columnSizing: { col_0: 200 },
    })
  })

  it("tolerates corrupted storage", () => {
    // Given a malformed store entry
    localStorage.setItem(STORAGE_KEY, "{not valid json")

    // When loading
    // Then it degrades to null instead of throwing
    expect(() => loadNotebookColumnLayout(1, CELL, q(0))).not.toThrow()
    expect(loadNotebookColumnLayout(1, CELL, q(0))).toBeNull()
  })

  it("evicts the least-recently-saved query past the cap, per cell", () => {
    // Given one more than the cap of distinct queries saved in order
    for (let i = 0; i <= LRU_MAX; i++) {
      saveNotebookColumnLayout(1, CELL, q(i), { columnSizing: { col_0: i } })
    }

    // Then the first is evicted and the last survives
    expect(loadNotebookColumnLayout(1, CELL, q(0))).toBeNull()
    expect(loadNotebookColumnLayout(1, CELL, q(LRU_MAX))).toEqual({
      columnSizing: { col_0: LRU_MAX },
    })
  })

  it("bumps recency on re-save so an old query survives eviction", () => {
    // Given the cap is filled
    for (let i = 0; i < LRU_MAX; i++) {
      saveNotebookColumnLayout(1, CELL, q(i), { columnSizing: { col_0: i } })
    }

    // And the oldest entry is re-saved (becoming most recent)
    saveNotebookColumnLayout(1, CELL, q(0), { columnSizing: { col_0: 999 } })

    // When one more new query pushes past the cap
    saveNotebookColumnLayout(1, CELL, q(LRU_MAX), {
      columnSizing: { col_0: LRU_MAX },
    })

    // Then the re-saved entry survives and the next-oldest is evicted instead
    expect(loadNotebookColumnLayout(1, CELL, q(0))).toEqual({
      columnSizing: { col_0: 999 },
    })
    expect(loadNotebookColumnLayout(1, CELL, q(1))).toBeNull()
  })

  it("scopes the cap per cell, not across the buffer", () => {
    // Given one cell saves a single layout
    saveNotebookColumnLayout(1, OTHER_CELL, q(0), {
      columnSizing: { col_0: 7 },
    })

    // When a sibling cell is filled past the cap
    for (let i = 0; i <= LRU_MAX; i++) {
      saveNotebookColumnLayout(1, CELL, q(i), { columnSizing: { col_0: i } })
    }

    // Then the lightly-used cell's entry is untouched
    expect(loadNotebookColumnLayout(1, OTHER_CELL, q(0))).toEqual({
      columnSizing: { col_0: 7 },
    })
  })
})
