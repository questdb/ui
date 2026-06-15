import { describe, it, expect, beforeEach } from "vitest"
import type { ColumnDefinition } from "../../utils/questdb/types"
import {
  loadColumnLayout,
  removeColumnLayout,
  saveColumnLayout,
} from "./columnLayoutStore"

// The store reads/writes this single localStorage entry.
const STORAGE_KEY = "result.grid.layout"
const LRU_MAX = 50

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

const columnSet = (id: number): ColumnDefinition[] => [
  { name: `c${id}`, type: "INT" },
]

beforeEach(() => {
  installMemoryLocalStorage()
})

describe("columnLayoutStore", () => {
  it("round-trips a saved layout for the same column set", () => {
    // Given a saved sizing for a column set
    const columns = columnSet(1)
    saveColumnLayout(columns, { columnSizing: { col_0: 200 } })

    // When loading it back
    const loaded = loadColumnLayout(columns)

    // Then the same layout is returned
    expect(loaded).toEqual({ columnSizing: { col_0: 200 } })
  })

  it("merges partial layouts for the same columns", () => {
    // Given a sizing already saved
    const columns = columnSet(1)
    saveColumnLayout(columns, { columnSizing: { col_0: 200 } })

    // When a separate order is saved for the same columns
    saveColumnLayout(columns, { columnOrder: ["col_1", "col_0"] })

    // Then both are preserved
    expect(loadColumnLayout(columns)).toEqual({
      columnSizing: { col_0: 200 },
      columnOrder: ["col_1", "col_0"],
    })
  })

  it("keys layouts by column name and type", () => {
    // Given a layout saved for one column set
    saveColumnLayout(columnSet(1), { pinnedColumns: ["col_0"] })

    // When loaded with a structurally identical set vs a different one
    const sameShape = loadColumnLayout([{ name: "c1", type: "INT" }])
    const otherShape = loadColumnLayout(columnSet(2))

    // Then only the matching shape resolves
    expect(sameShape).toEqual({ pinnedColumns: ["col_0"] })
    expect(otherShape).toBeNull()
  })

  it("treats a column type change as a different layout", () => {
    // Given a layout saved for an INT column
    saveColumnLayout([{ name: "c1", type: "INT" }], {
      columnSizing: { col_0: 120 },
    })

    // When the same-named column is now a LONG
    const loaded = loadColumnLayout([{ name: "c1", type: "LONG" }])

    // Then no layout is found
    expect(loaded).toBeNull()
  })

  it("returns null and skips persistence for an empty column set", () => {
    // Given no columns
    // When saving and loading
    saveColumnLayout([], { columnSizing: { col_0: 100 } })

    // Then nothing is stored or returned
    expect(loadColumnLayout([])).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("removes a stored layout", () => {
    // Given a saved layout
    const columns = columnSet(1)
    saveColumnLayout(columns, { columnSizing: { col_0: 200 } })

    // When it is removed
    removeColumnLayout(columns)

    // Then it can no longer be loaded
    expect(loadColumnLayout(columns)).toBeNull()
  })

  it("tolerates corrupted storage", () => {
    // Given a malformed store entry
    localStorage.setItem(STORAGE_KEY, "{not valid json")

    // When loading
    // Then it degrades to null instead of throwing
    expect(() => loadColumnLayout(columnSet(1))).not.toThrow()
    expect(loadColumnLayout(columnSet(1))).toBeNull()
  })

  it("evicts the least-recently-saved layout past the cap", () => {
    // Given one more than the cap of distinct column sets saved in order
    for (let i = 0; i <= LRU_MAX; i++) {
      saveColumnLayout(columnSet(i), { columnSizing: { col_0: i } })
    }

    // When inspecting the oldest and newest
    // Then the first is evicted and the last survives
    expect(loadColumnLayout(columnSet(0))).toBeNull()
    expect(loadColumnLayout(columnSet(LRU_MAX))).toEqual({
      columnSizing: { col_0: LRU_MAX },
    })
  })

  it("bumps recency on re-save so an old layout survives eviction", () => {
    // Given the cap is filled
    for (let i = 0; i < LRU_MAX; i++) {
      saveColumnLayout(columnSet(i), { columnSizing: { col_0: i } })
    }

    // And the oldest entry is re-saved (becoming most recent)
    saveColumnLayout(columnSet(0), { columnSizing: { col_0: 999 } })

    // When one more new set pushes past the cap
    saveColumnLayout(columnSet(LRU_MAX), { columnSizing: { col_0: LRU_MAX } })

    // Then the re-saved entry survives and the next-oldest is evicted instead
    expect(loadColumnLayout(columnSet(0))).toEqual({
      columnSizing: { col_0: 999 },
    })
    expect(loadColumnLayout(columnSet(1))).toBeNull()
  })
})
