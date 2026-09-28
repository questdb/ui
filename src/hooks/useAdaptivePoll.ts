import { useEffect, useRef, useState } from "react"
import { sleep } from "../utils/sleep"

type AdaptivePollLoopOptions = {
  fetchFn: () => Promise<number | void>
  signal: AbortSignal
  minIntervalMs: number
  maxIntervalMs: number
  sampleSize?: number
  multiplier?: number
  skipInitialFetch?: boolean
  onIntervalChange?: (intervalMs: number) => void
}

const BACKOFF_MULTIPLIER = 2

const adaptiveInterval = (
  samples: number[],
  minIntervalMs: number,
  maxIntervalMs: number,
  multiplier: number,
): number => {
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length
  return Math.min(
    maxIntervalMs,
    Math.max(minIntervalMs, Math.round(avg * multiplier)),
  )
}

export const backoffInterval = (
  consecutiveFailures: number,
  minIntervalMs: number,
  maxIntervalMs: number,
): number =>
  Math.min(
    maxIntervalMs,
    minIntervalMs * BACKOFF_MULTIPLIER ** (consecutiveFailures - 1),
  )

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
  let consecutiveFailures = 0
  let skip = skipInitialFetch
  while (!signal.aborted) {
    let nextInterval = minIntervalMs
    if (skip) {
      // Data was just transferred in — wait one interval before the first
      // background refresh instead of re-querying it immediately.
      skip = false
    } else {
      const start = performance.now()
      let measured: number | void = undefined
      let failed = false
      try {
        measured = await fetchFn()
      } catch {
        failed = true
      }
      if (signal.aborted) break
      if (failed) {
        consecutiveFailures += 1
        nextInterval = backoffInterval(
          consecutiveFailures,
          minIntervalMs,
          maxIntervalMs,
        )
      } else {
        consecutiveFailures = 0
        samples = [...samples, measured ?? performance.now() - start].slice(
          -sampleSize,
        )
        nextInterval = adaptiveInterval(
          samples,
          minIntervalMs,
          maxIntervalMs,
          multiplier,
        )
      }
      onIntervalChange?.(nextInterval)
    }
    const aborted = await sleep(nextInterval, signal)
    if (aborted) break
  }
}

type AdaptivePollOptions = {
  fetchFn: () => Promise<number | void>
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
