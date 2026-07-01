import { useEffect, useRef, useState } from "react"

type AdaptivePollOptions = {
  fetchFn: () => Promise<void>
  enabled: boolean
  key: string
  minIntervalMs: number
  maxIntervalMs: number
  sampleSize?: number
  multiplier?: number
  getSkipInitialFetch?: () => boolean
}

type AdaptivePollResult = {
  currentInterval: number
}

export const useAdaptivePoll = (
  options: AdaptivePollOptions,
): AdaptivePollResult => {
  const {
    fetchFn,
    enabled,
    key,
    minIntervalMs,
    maxIntervalMs,
    sampleSize = 3,
    multiplier = 2,
    getSkipInitialFetch,
  } = options

  const samplesRef = useRef<number[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)
  const [currentInterval, setCurrentInterval] = useState(minIntervalMs)

  useEffect(() => {
    samplesRef.current = []
    setCurrentInterval(minIntervalMs)

    // Abort any previous polling loop
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    if (!enabled) return

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    const calculateInterval = (samples: number[]): number => {
      if (samples.length === 0) return minIntervalMs

      const avg = samples.reduce((a, b) => a + b, 0) / samples.length
      const calculated = avg * multiplier

      return Math.min(
        maxIntervalMs,
        Math.max(minIntervalMs, Math.round(calculated)),
      )
    }

    const sleep = (ms: number, signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(resolve, ms)
        signal.addEventListener("abort", () => {
          clearTimeout(timeoutId)
          reject(new DOMException("Aborted", "AbortError"))
        })
      })

    const runPollingLoop = async () => {
      let skipFetch = getSkipInitialFetch?.() ?? false
      while (!abortController.signal.aborted) {
        let nextInterval = minIntervalMs

        if (skipFetch) {
          // Data was just transferred in — wait one interval before the first
          // background refresh instead of re-querying it immediately.
          skipFetch = false
        } else {
          const startTime = performance.now()

          try {
            await fetchFn()
          } catch (error) {
            // Silently handle errors - the fetchFn should handle its own errors
          }

          // Check if we should stop after the fetch completed
          if (abortController.signal.aborted) break

          const responseTime = performance.now() - startTime
          samplesRef.current = [...samplesRef.current, responseTime].slice(
            -sampleSize,
          )

          nextInterval = calculateInterval(samplesRef.current)
          setCurrentInterval(nextInterval)
        }

        try {
          await sleep(nextInterval, abortController.signal)
        } catch (error) {
          // Sleep was aborted, exit the loop
          break
        }
      }
    }

    void runPollingLoop()

    return () => {
      abortController.abort()
    }
  }, [
    enabled,
    key,
    fetchFn,
    minIntervalMs,
    maxIntervalMs,
    sampleSize,
    multiplier,
    getSkipInitialFetch,
  ])

  return { currentInterval }
}
