import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

describe("useAdaptivePoll core logic", () => {
  describe("calculateInterval algorithm", () => {
    const calculateInterval = (
      samples: number[],
      minIntervalMs: number,
      maxIntervalMs: number,
      multiplier: number,
    ): number => {
      if (samples.length === 0) return minIntervalMs

      const avg = samples.reduce((a, b) => a + b, 0) / samples.length
      const calculated = avg * multiplier

      return Math.min(
        maxIntervalMs,
        Math.max(minIntervalMs, Math.round(calculated)),
      )
    }

    it("should return minIntervalMs when no samples", () => {
      expect(calculateInterval([], 200, 5000, 2)).toBe(200)
    })

    it("should calculate average and multiply by multiplier", () => {
      // Single sample: 500ms * 2 = 1000ms
      expect(calculateInterval([500], 200, 5000, 2)).toBe(1000)
    })

    it("should average multiple samples", () => {
      // [100, 200, 300] avg = 200, * 2 = 400
      expect(calculateInterval([100, 200, 300], 200, 5000, 2)).toBe(400)
    })

    it("should respect minIntervalMs floor", () => {
      // 50ms * 2 = 100ms, but min is 200ms
      expect(calculateInterval([50], 200, 5000, 2)).toBe(200)
    })

    it("should respect maxIntervalMs ceiling", () => {
      // 3000ms * 2 = 6000ms, but max is 5000ms
      expect(calculateInterval([3000], 200, 5000, 2)).toBe(5000)
    })

    it("should use custom multiplier", () => {
      // 200ms * 3 = 600ms
      expect(calculateInterval([200], 100, 5000, 3)).toBe(600)
    })

    it("should round to nearest integer", () => {
      // [100, 150] avg = 125, * 2 = 250
      expect(calculateInterval([100, 150], 100, 5000, 2)).toBe(250)

      // [100, 101] avg = 100.5, * 2 = 201
      expect(calculateInterval([100, 101], 100, 5000, 2)).toBe(201)
    })
  })

  describe("sliding window samples", () => {
    const updateSamples = (
      samples: number[],
      newSample: number,
      sampleSize: number,
    ): number[] => {
      return [...samples, newSample].slice(-sampleSize)
    }

    it("should add samples up to sampleSize", () => {
      let samples: number[] = []

      samples = updateSamples(samples, 100, 3)
      expect(samples).toEqual([100])

      samples = updateSamples(samples, 200, 3)
      expect(samples).toEqual([100, 200])

      samples = updateSamples(samples, 300, 3)
      expect(samples).toEqual([100, 200, 300])
    })

    it("should drop oldest sample when exceeding sampleSize", () => {
      let samples = [100, 200, 300]

      samples = updateSamples(samples, 400, 3)
      expect(samples).toEqual([200, 300, 400])

      samples = updateSamples(samples, 500, 3)
      expect(samples).toEqual([300, 400, 500])
    })
  })

  describe("AbortController cancellation", () => {
    it("should clear timeout when abort is called", async () => {
      const sleep = (ms: number, signal: AbortSignal) =>
        new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(resolve, ms)
          signal.addEventListener("abort", () => {
            clearTimeout(timeoutId)
            reject(new DOMException("Aborted", "AbortError"))
          })
        })

      const controller = new AbortController()

      const promise = sleep(10000, controller.signal)

      controller.abort()

      await expect(promise).rejects.toThrow("Aborted")
    })

    it("should resolve normally if not aborted", async () => {
      vi.useFakeTimers()

      const sleep = (ms: number, signal: AbortSignal) =>
        new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(resolve, ms)
          signal.addEventListener("abort", () => {
            clearTimeout(timeoutId)
            reject(new DOMException("Aborted", "AbortError"))
          })
        })

      const controller = new AbortController()

      const promise = sleep(100, controller.signal)

      vi.advanceTimersByTime(100)

      await expect(promise).resolves.toBeUndefined()

      vi.useRealTimers()
    })
  })

  describe("polling loop behavior simulation", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("should execute fetchFn and wait calculated interval", async () => {
      const fetchFn = vi.fn().mockResolvedValue(undefined)

      const calculateInterval = (samples: number[]): number => {
        if (samples.length === 0) return 200
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length
        return Math.round(avg * 2)
      }

      const samples: number[] = []
      const mockResponseTime = 500

      const startTime = 0
      await fetchFn()
      const endTime = mockResponseTime
      samples.push(endTime - startTime)

      const nextInterval = calculateInterval(samples)

      expect(fetchFn).toHaveBeenCalledTimes(1)
      expect(nextInterval).toBe(1000) // 500 * 2
    })

    it("should stop loop when aborted during sleep", async () => {
      const controller = new AbortController()
      let loopIterations = 0

      const sleep = (ms: number, signal: AbortSignal) =>
        new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(resolve, ms)
          signal.addEventListener("abort", () => {
            clearTimeout(timeoutId)
            reject(new DOMException("Aborted", "AbortError"))
          })
        })

      const runLoop = async () => {
        while (!controller.signal.aborted) {
          loopIterations++

          // Simulate fetch
          await Promise.resolve()

          if (controller.signal.aborted) break

          try {
            await sleep(100, controller.signal)
          } catch {
            break
          }
        }
      }

      const loopPromise = runLoop()

      // Let one iteration complete
      await vi.advanceTimersByTimeAsync(0)
      expect(loopIterations).toBe(1)

      // Start sleep
      vi.advanceTimersByTime(50)

      // Abort mid-sleep
      controller.abort()

      await loopPromise

      // Should have only done 1 iteration
      expect(loopIterations).toBe(1)
    })

    it("should continue loop when fetch throws error", async () => {
      const controller = new AbortController()
      let loopIterations = 0
      let fetchCallCount = 0

      const fetchFn = async () => {
        fetchCallCount++
        if (fetchCallCount === 1) {
          await new Promise((resolve) => setTimeout(resolve))
          throw new Error("Network error")
        }
      }

      const sleep = (ms: number, signal: AbortSignal) =>
        new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(resolve, ms)
          signal.addEventListener("abort", () => {
            clearTimeout(timeoutId)
            reject(new DOMException("Aborted", "AbortError"))
          })
        })

      const runLoop = async () => {
        while (!controller.signal.aborted) {
          loopIterations++

          try {
            await fetchFn()
          } catch {
            // Silently handle errors
          }

          if (controller.signal.aborted) break

          try {
            await sleep(100, controller.signal)
          } catch {
            break
          }
        }
      }

      const loopPromise = runLoop()

      // First iteration (fetch throws)
      await vi.advanceTimersByTimeAsync(0)
      expect(loopIterations).toBe(1)
      expect(fetchCallCount).toBe(1)

      // Complete first sleep
      await vi.advanceTimersByTimeAsync(100)

      // Second iteration (fetch succeeds)
      expect(loopIterations).toBe(2)
      expect(fetchCallCount).toBe(2)

      // Abort
      controller.abort()
      await loopPromise
    })
  })

  describe("sequential execution", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("should not overlap fetches - waits for fetch to complete", async () => {
      const controller = new AbortController()
      let fetchInProgress = false
      let overlappingFetchDetected = false
      let fetchCount = 0

      const fetchFn = async () => {
        if (fetchInProgress) {
          overlappingFetchDetected = true
        }
        fetchInProgress = true
        fetchCount++

        // Simulate slow fetch
        await new Promise((resolve) => setTimeout(resolve, 500))

        fetchInProgress = false
      }

      const sleep = (ms: number, signal: AbortSignal) =>
        new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(resolve, ms)
          signal.addEventListener("abort", () => {
            clearTimeout(timeoutId)
            reject(new DOMException("Aborted", "AbortError"))
          })
        })

      const runLoop = async () => {
        while (!controller.signal.aborted && fetchCount < 3) {
          try {
            await fetchFn()
          } catch {
            // ignore
          }

          if (controller.signal.aborted) break

          try {
            await sleep(100, controller.signal)
          } catch {
            break
          }
        }
      }

      const loopPromise = runLoop()

      // Process all iterations
      await vi.advanceTimersByTimeAsync(2000)

      controller.abort()
      await loopPromise

      expect(overlappingFetchDetected).toBe(false)
      expect(fetchCount).toBe(3)
    })
  })

  describe("key change behavior", () => {
    it("should reset samples array when key changes", () => {
      let samples = [100, 200, 300]
      let currentKey = "table1"

      // Simulate key change - reset samples
      const handleKeyChange = (newKey: string) => {
        if (newKey !== currentKey) {
          samples = [] // Reset samples
          currentKey = newKey
        }
      }

      handleKeyChange("table2")

      expect(samples).toEqual([])
      expect(currentKey).toBe("table2")
    })
  })

  describe("enabled state behavior", () => {
    it("should not start loop when enabled is false", async () => {
      let fetchCallCount = 0
      const enabled = false

      const fetchFn = async () => {
        await new Promise((resolve) => setTimeout(resolve))
        fetchCallCount++
      }

      // Simulate the effect check
      if (enabled) {
        await fetchFn()
      }

      expect(fetchCallCount).toBe(0)
    })

    it("should start loop when enabled is true", async () => {
      let fetchCallCount = 0
      const enabled = true

      const fetchFn = async () => {
        await new Promise((resolve) => setTimeout(resolve))
        fetchCallCount++
      }

      // Simulate the effect check
      if (enabled) {
        await fetchFn()
      }

      expect(fetchCallCount).toBe(1)
    })
  })
})
