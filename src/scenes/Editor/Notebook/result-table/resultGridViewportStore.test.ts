import { describe, expect, it } from "vitest"
import { createResultGridViewportStore } from "./resultGridViewportStore"

describe("resultGridViewportStore", () => {
  it("restores offsets for the same query result", () => {
    // Given a result with a saved viewport
    const store = createResultGridViewportStore()
    store.replaceResult(100)
    store.save("q1", 100, { scrollTop: 640, scrollLeft: 320 })

    // When the same result is mounted again
    const viewport = store.load("q1", 100)

    // Then both offsets are restored
    expect(viewport).toEqual({ scrollTop: 640, scrollLeft: 320 })
  })

  it("drops old offsets and rejects their late unmount save after a rerun", () => {
    // Given two query viewports from the current result
    const store = createResultGridViewportStore()
    store.replaceResult(100)
    store.save("q1", 100, { scrollTop: 640, scrollLeft: 320 })
    store.save("q2", 100, { scrollTop: 480, scrollLeft: 240 })

    // When a new result arrives before the previous grid cleanup finishes
    store.replaceResult(101)
    store.save("q1", 100, { scrollTop: 800, scrollLeft: 400 })

    // Then no viewport from the previous result survives
    expect(store.load("q1", 100)).toBeNull()
    expect(store.load("q2", 100)).toBeNull()
  })

  it("retains at most twenty query viewports for a mounted cell", () => {
    // Given a mounted cell that has visited twenty-one result tabs
    const store = createResultGridViewportStore()
    store.replaceResult(100)
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
    store.replaceResult(100)
    store.save("q1", 100, { scrollTop: 640, scrollLeft: 320 })

    // When its owner clears the store during unmount
    store.clear()

    // Then the viewport is released
    expect(store.load("q1", 100)).toBeNull()
  })
})
