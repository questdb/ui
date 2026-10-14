import { REFRESH_WAIT_TIMEOUT_MS } from "../../utils/questdb/tokenRefresh"
import { SOURCE_TIMEOUT_MS } from "./sourceState"

export const createCatalogRequestDeadline = (
  sourceName: string,
  onTimeout: () => void,
) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let rejectTimeout!: (error: Error) => void
  const promise = new Promise<never>((_, reject) => {
    rejectTimeout = reject
  })
  const schedule = (delay: number) => {
    if (timeoutId !== null) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      onTimeout()
      rejectTimeout(new Error(`${sourceName} request timed out`))
    }, delay)
  }

  // The refresh is bounded independently; SQL still gets its full timeout
  // after onRequestStart, even if refreshing consumed the entire first 10s.
  // A query can also wait for a refresh after a 401, between two requests.
  const allowRefreshThenRequest = () =>
    schedule(REFRESH_WAIT_TIMEOUT_MS + SOURCE_TIMEOUT_MS)
  allowRefreshThenRequest()
  return {
    promise,
    onRefreshWait: allowRefreshThenRequest,
    onRequestStart: () => schedule(SOURCE_TIMEOUT_MS),
    clear: () => {
      if (timeoutId !== null) clearTimeout(timeoutId)
    },
  }
}
