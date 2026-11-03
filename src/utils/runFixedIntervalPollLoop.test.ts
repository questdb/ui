import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { runFixedIntervalPollLoop } from "./runFixedIntervalPollLoop"

const fetchTaking = (durationMs: number, startedAt: number[]) => () => {
  startedAt.push(Date.now())
  return new Promise<void>((resolve) => setTimeout(resolve, durationMs))
}

const stop = async (controller: AbortController, loop: Promise<void>) => {
  controller.abort()
  await vi.runAllTimersAsync()
  await loop
}

describe("runFixedIntervalPollLoop", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts rounds one interval apart when a round is faster than the interval", async () => {
    // Given a 1s interval and a fetch that takes 300ms
    const controller = new AbortController()
    const startedAt: number[] = []
    const loop = runFixedIntervalPollLoop({
      fetchFn: fetchTaking(300, startedAt),
      signal: controller.signal,
      intervalMs: 1000,
    })

    // When three rounds run
    await vi.advanceTimersByTimeAsync(2500)

    // Then each round starts one interval after the previous one started
    expect(startedAt).toEqual([0, 1000, 2000])
    await stop(controller, loop)
  })

  it("starts the next round as soon as a round slower than the interval ends", async () => {
    // Given a 1s interval and a fetch that takes 2s
    const controller = new AbortController()
    const startedAt: number[] = []
    const loop = runFixedIntervalPollLoop({
      fetchFn: fetchTaking(2000, startedAt),
      signal: controller.signal,
      intervalMs: 1000,
    })

    // When three rounds run
    await vi.advanceTimersByTimeAsync(4500)

    // Then each round starts when the previous one ends, never overlapping it
    expect(startedAt).toEqual([0, 2000, 4000])
    await stop(controller, loop)
  })

  it("keeps the interval after a round that fails", async () => {
    // Given a 1s interval and a fetch that fails after 300ms
    const controller = new AbortController()
    const startedAt: number[] = []
    const loop = runFixedIntervalPollLoop({
      fetchFn: () => {
        startedAt.push(Date.now())
        return new Promise((_, reject) =>
          setTimeout(() => reject(new Error("unavailable")), 300),
        )
      },
      signal: controller.signal,
      intervalMs: 1000,
    })

    // When two rounds run
    await vi.advanceTimersByTimeAsync(1500)

    // Then the failed round does not delay the next one
    expect(startedAt).toEqual([0, 1000])
    await stop(controller, loop)
  })
})
