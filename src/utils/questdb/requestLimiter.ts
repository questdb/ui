export const MAX_ACTIVE_STATEMENT_REQUESTS = 8

export type RequestLimiter = <T>(
  task: () => Promise<T>,
  signal?: AbortSignal,
) => Promise<T>

const abortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException("Aborted", "AbortError")

type WaitingRequest = {
  start: () => void
  previous: WaitingRequest | null
  next: WaitingRequest | null
}

export const createRequestLimiter = (maxActive: number): RequestLimiter => {
  let active = 0
  let head: WaitingRequest | null = null
  let tail: WaitingRequest | null = null

  // Unlink directly so cancelling a notebook's queued statements stays O(n).
  const remove = (request: WaitingRequest) => {
    if (request.previous) request.previous.next = request.next
    else head = request.next
    if (request.next) request.next.previous = request.previous
    else tail = request.previous
    request.previous = null
    request.next = null
  }

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
      const request: WaitingRequest = {
        start: () => {
          signal?.removeEventListener("abort", onAbort)
          active++
          resolve()
        },
        previous: tail,
        next: null,
      }
      const onAbort = () => {
        remove(request)
        reject(abortReason(signal as AbortSignal))
      }
      if (tail) tail.next = request
      else head = request
      tail = request
      signal?.addEventListener("abort", onAbort, { once: true })
    })

  const release = () => {
    active--
    if (head) {
      const request = head
      remove(request)
      request.start()
    }
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
