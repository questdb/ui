import { useEffect, useRef, useState } from "react"

type AdaptivePollLoopOptions = {
  fetchFn: () => Promise<void>
  signal: AbortSignal
  minIntervalMs: number
  maxIntervalMs: number
  sampleSize?: number
  multiplier?: number
  skipInitialFetch?: boolean
  onIntervalChange?: (intervalMs: number) => void
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => {
      clearTimeout(timeoutId)
      reject(new DOMException("Aborted", "AbortError"))
    })
  })

export const runAdaptivePollLoop = async ({
  fetchFn,
  signal,
  minIntervalMs,
  maxIntervalMs,
  sampleSize = 3,
  multiplier = 2,
  skipInitialFetch = false,
  onIntervalChange,
}: AdaptivePollLoopOptions): Promise<void> => {
  let samples: number[] = []
  let skip = skipInitialFetch
  while (!signal.aborted) {
    let nextInterval = minIntervalMs
    if (skip) {
      // Data was just transferred in — wait one interval before the first
      // background refresh instead of re-querying it immediately.
      skip = false
    } else {
      const start = performance.now()
      try {
        await fetchFn()
      } catch {
        // fetchFn handles its own errors; never let one kill the loop
      }
      if (signal.aborted) break
      samples = [...samples, performance.now() - start].slice(-sampleSize)
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length
      nextInterval = Math.min(
        maxIntervalMs,
        Math.max(minIntervalMs, Math.round(avg * multiplier)),
      )
      onIntervalChange?.(nextInterval)
    }
    try {
      await sleep(nextInterval, signal)
    } catch {
      break
    }
  }
}

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

  const abortControllerRef = useRef<AbortController | null>(null)
  const [currentInterval, setCurrentInterval] = useState(minIntervalMs)

  useEffect(() => {
    setCurrentInterval(minIntervalMs)
    abortControllerRef.current?.abort()

    if (!enabled) return

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    void runAdaptivePollLoop({
      fetchFn,
      signal: abortController.signal,
      minIntervalMs,
      maxIntervalMs,
      sampleSize,
      multiplier,
      skipInitialFetch: getSkipInitialFetch?.() ?? false,
      onIntervalChange: setCurrentInterval,
    })

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
