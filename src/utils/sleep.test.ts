import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { sleep } from "./sleep"

describe("sleep", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("resolves false after the timeout", async () => {
    // Given a pending sleep
    const promise = sleep(100)

    // When the timeout elapses
    await vi.advanceTimersByTimeAsync(100)

    // Then it resolves as not aborted
    await expect(promise).resolves.toBe(false)
  })

  it("resolves true immediately for an already-aborted signal", async () => {
    // Given a signal aborted before the call
    const controller = new AbortController()
    controller.abort()

    // When sleeping with it
    // Then it resolves aborted without waiting
    await expect(sleep(10_000, controller.signal)).resolves.toBe(true)
  })

  it("resolves true and clears the timer on abort", async () => {
    // Given a pending sleep on a live signal
    const controller = new AbortController()
    const promise = sleep(10_000, controller.signal)

    // When the signal aborts mid-wait
    controller.abort()

    // Then it resolves aborted and no timer remains
    await expect(promise).resolves.toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("removes its abort listener after a normal timeout", async () => {
    // Given a long-lived signal reused across poll ticks
    const controller = new AbortController()
    const addSpy = vi.spyOn(controller.signal, "addEventListener")
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener")

    // When many sleeps complete normally on the same signal
    for (let i = 0; i < 5; i++) {
      const promise = sleep(10, controller.signal)
      await vi.advanceTimersByTimeAsync(10)
      await promise
    }

    // Then every registered listener was removed — nothing accumulates
    expect(addSpy).toHaveBeenCalledTimes(5)
    expect(removeSpy).toHaveBeenCalledTimes(5)
  })
})
