import { sleep } from "./sleep"

type FixedIntervalPollLoopOptions = {
  fetchFn: () => Promise<unknown>
  signal: AbortSignal
  intervalMs: number
}

export const runFixedIntervalPollLoop = async ({
  fetchFn,
  signal,
  intervalMs,
}: FixedIntervalPollLoopOptions): Promise<void> => {
  while (!signal.aborted) {
    const startedAt = Date.now()
    await fetchFn().catch(() => undefined)
    if (signal.aborted) break
    const remainingMs = intervalMs - (Date.now() - startedAt)
    if (remainingMs <= 0) continue
    const aborted = await sleep(remainingMs, signal)
    if (aborted) break
  }
}
