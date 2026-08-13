export const MAX_ACTIVE_STATEMENT_REQUESTS = 8

export type RequestLimiter = <T>(
  task: () => Promise<T>,
  signal?: AbortSignal,
) => Promise<T>

const abortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException("Aborted", "AbortError")

export const createRequestLimiter = (maxActive: number): RequestLimiter => {
  let active = 0
  const waiting: Array<() => void> = []

  const acquire = (signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortReason(signal))
        return
      }
      if (active < maxActive) {
        active++
        resolve()
        return
      }
      const start = () => {
        signal?.removeEventListener("abort", onAbort)
        active++
        resolve()
      }
      const onAbort = () => {
        const index = waiting.indexOf(start)
        if (index !== -1) waiting.splice(index, 1)
        reject(abortReason(signal as AbortSignal))
      }
      waiting.push(start)
      signal?.addEventListener("abort", onAbort, { once: true })
    })

  const release = () => {
    active--
    waiting.shift()?.()
  }

  return async <T>(
    task: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> => {
    await acquire(signal)
    try {
      if (signal?.aborted) throw abortReason(signal)
      return await task()
    } finally {
      release()
    }
  }
}

export const statementRequestLimiter = createRequestLimiter(
  MAX_ACTIVE_STATEMENT_REQUESTS,
)
