import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { scheduleFrame, scheduleIdle } from "./notebookScheduling"

describe("notebookScheduling", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("arms requestIdleCallback with a timeout so a busy main thread still drains", () => {
    // Given a browser whose idle callbacks fire only via their timeout
    const requestIdleCallback = vi.fn(
      (callback: () => void, options?: { timeout?: number }) => {
        setTimeout(callback, options?.timeout ?? 99999)
        return 1
      },
    )
    vi.stubGlobal("requestIdleCallback", requestIdleCallback)
    const callback = vi.fn()

    // When idle work is scheduled
    scheduleIdle(callback)

    // Then the callback is armed with a finite timeout and fires through it
    const [, options] = requestIdleCallback.mock.calls[0]
    expect(options?.timeout).toBeGreaterThan(0)
    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it("falls back to timers when the idle and frame APIs are unavailable", () => {
    // Given an environment without requestIdleCallback/requestAnimationFrame
    const idleCallback = vi.fn()
    const frameCallback = vi.fn()

    // When work is scheduled
    scheduleIdle(idleCallback)
    scheduleFrame(frameCallback)

    // Then both fire through their timer fallbacks
    vi.advanceTimersByTime(1000)
    expect(idleCallback).toHaveBeenCalledTimes(1)
    expect(frameCallback).toHaveBeenCalledTimes(1)
  })
})
