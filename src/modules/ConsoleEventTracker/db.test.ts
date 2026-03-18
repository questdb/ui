import "fake-indexeddb/auto"
import { vi, describe, it, expect, beforeEach } from "vitest"

// Stub browser globals before db.ts singleton is created
vi.hoisted(() => {
  const storage: Record<string, string> = {}
  globalThis.localStorage = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => {
      storage[key] = value
    },
    removeItem: (key: string) => {
      delete storage[key]
    },
    clear: () => {
      Object.keys(storage).forEach((k) => delete storage[k])
    },
    get length() {
      return Object.keys(storage).length
    },
    key: () => null,
  } as Storage

  // Set window = globalThis so that window.indexedDB works after fake-indexeddb polyfills it
  globalThis.window = globalThis as unknown as Window & typeof globalThis
  ;(globalThis as Record<string, unknown>).location = {
    href: "http://localhost/",
  }
  ;(globalThis as Record<string, unknown>).history = {
    replaceState: () => {},
  }
})

import { db } from "../../store/db"
import {
  putEvent,
  getEntriesAfter,
  deleteEntriesUpTo,
  trimToMaxRows,
} from "./db"

beforeEach(async () => {
  await db.events.clear()
})

describe("putEvent", () => {
  it("stores event with correct fields", async () => {
    await putEvent("query.exec")
    const entries = await db.events.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe("query.exec")
    expect(entries[0].created).toBeGreaterThan(0)
    expect(entries[0].props).toBeUndefined()
  })

  it("stores event with props", async () => {
    await putEvent("sidebar.change", '{"panel":"tables"}')
    const entries = await db.events.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0].props).toBe('{"panel":"tables"}')
  })

  it("stores multiple events", async () => {
    await putEvent("query.exec")
    await putEvent("chart.draw")
    await putEvent("ai.explain")
    await putEvent("sidebar.change")
    await putEvent("query.exec")
    expect(await db.events.count()).toBe(5)
  })
})

describe("getEntriesAfter", () => {
  it("returns entries with created > cursor", async () => {
    await db.events.add({ created: 100, name: "a" })
    await db.events.add({ created: 200, name: "b" })
    await db.events.add({ created: 300, name: "c" })

    const entries = await getEntriesAfter(100, 10)
    expect(entries).toHaveLength(2)
    expect(entries[0].name).toBe("b")
    expect(entries[1].name).toBe("c")
  })

  it("returns all entries when cursor is 0", async () => {
    await db.events.add({ created: 100, name: "a" })
    await db.events.add({ created: 200, name: "b" })
    await db.events.add({ created: 300, name: "c" })

    const entries = await getEntriesAfter(0, 10)
    expect(entries).toHaveLength(3)
  })

  it("respects limit", async () => {
    await db.events.add({ created: 100, name: "a" })
    await db.events.add({ created: 200, name: "b" })
    await db.events.add({ created: 300, name: "c" })

    const entries = await getEntriesAfter(0, 2)
    expect(entries).toHaveLength(2)
    expect(entries[0].name).toBe("a")
    expect(entries[1].name).toBe("b")
  })

  it("returns empty array when no entries match", async () => {
    await db.events.add({ created: 100, name: "a" })
    const entries = await getEntriesAfter(100, 10)
    expect(entries).toHaveLength(0)
  })

  it("returns entries sorted by created", async () => {
    await db.events.add({ created: 300, name: "c" })
    await db.events.add({ created: 100, name: "a" })
    await db.events.add({ created: 200, name: "b" })

    const entries = await getEntriesAfter(0, 10)
    expect(entries.map((e) => e.name)).toEqual(["a", "b", "c"])
  })
})

describe("deleteEntriesUpTo", () => {
  it("deletes entries with created <= value", async () => {
    await db.events.add({ created: 100, name: "a" })
    await db.events.add({ created: 200, name: "b" })
    await db.events.add({ created: 300, name: "c" })

    const result = await deleteEntriesUpTo(200)
    expect(result).toBe(2)

    const remaining = await db.events.toArray()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].name).toBe("c")
  })

  it("is a no-op on empty table", async () => {
    const result = await deleteEntriesUpTo(100)
    expect(result).toBe(0)
    expect(await db.events.count()).toBe(0)
  })
})

describe("trimToMaxRows", () => {
  it("deletes oldest rows when count exceeds max", async () => {
    await db.events.add({ created: 100, name: "a" })
    await db.events.add({ created: 200, name: "b" })
    await db.events.add({ created: 300, name: "c" })
    await db.events.add({ created: 400, name: "d" })
    await db.events.add({ created: 500, name: "e" })

    const result = await trimToMaxRows(3)
    expect(result).toBe(true)

    const remaining = await db.events.toArray()
    expect(remaining).toHaveLength(3)
    expect(remaining.map((e) => e.name)).toEqual(
      expect.arrayContaining(["c", "d", "e"]),
    )
  })

  it("is a no-op when count is within limit", async () => {
    await db.events.add({ created: 100, name: "a" })
    await db.events.add({ created: 200, name: "b" })

    const result = await trimToMaxRows(5)
    expect(result).toBe(true)
    expect(await db.events.count()).toBe(2)
  })

  it("is a no-op on empty table", async () => {
    const result = await trimToMaxRows(5)
    expect(result).toBe(true)
    expect(await db.events.count()).toBe(0)
  })
})
