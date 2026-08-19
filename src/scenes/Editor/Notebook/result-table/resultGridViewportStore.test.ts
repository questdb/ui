import { describe, expect, it } from "vitest"
import { createResultGridViewportStore } from "./resultGridViewportStore"

describe("resultGridViewportStore", () => {
  it("restores offsets for the same statement and settle token", () => {
    // Given a statement with a saved viewport
    const store = createResultGridViewportStore()
    store.save("q1", 100, { scrollTop: 640, scrollLeft: 320 })

    // When the same statement is mounted again at the same token
    const viewport = store.load("q1", 100)

    // Then both offsets are restored
    expect(viewport).toEqual({ scrollTop: 640, scrollLeft: 320 })
  })

  it("drops only the statement that got new rows — siblings keep their scroll", () => {
    // Given two statements' viewports from the same round
    const store = createResultGridViewportStore()
    store.save("q1", 100, { scrollTop: 640, scrollLeft: 320 })
    store.save("q2", 100, { scrollTop: 480, scrollLeft: 240 })

    // When only the first statement settles again with fresh rows
    store.save("q1", 101, { scrollTop: 800, scrollLeft: 400 })

    // Then its old offsets are gone while the untouched sibling survives
    expect(store.load("q1", 100)).toBeNull()
    expect(store.load("q1", 101)).toEqual({ scrollTop: 800, scrollLeft: 400 })
    expect(store.load("q2", 100)).toEqual({ scrollTop: 480, scrollLeft: 240 })
  })

  it("rejects a load whose settle token no longer matches", () => {
    // Given a viewport saved under an earlier settle
    const store = createResultGridViewportStore()
    store.save("q1", 100, { scrollTop: 640, scrollLeft: 320 })

    // When the statement re-renders after a refresh swapped its rows
    // Then the stale scroll is not restored
    expect(store.load("q1", 101)).toBeNull()
  })

  it("retains at most twenty statement viewports for a mounted cell", () => {
    // Given a mounted cell that has visited twenty-one result tabs
    const store = createResultGridViewportStore()
    for (let i = 0; i <= 20; i++) {
      store.save(`q${i}`, 100, { scrollTop: i, scrollLeft: i })
    }

    // When the oldest and newest viewports are loaded
    const oldest = store.load("q0", 100)
    const newest = store.load("q20", 100)

    // Then the oldest is evicted and the newest remains
    expect(oldest).toBeNull()
    expect(newest).toEqual({ scrollTop: 20, scrollLeft: 20 })
  })

  it("releases all offsets when the owning cell unmounts", () => {
    // Given a mounted cell with a saved viewport
    const store = createResultGridViewportStore()
    store.save("q1", 100, { scrollTop: 640, scrollLeft: 320 })

    // When its owner clears the store during unmount
    store.clear()

    // Then the viewport is released
    expect(store.load("q1", 100)).toBeNull()
  })
})
