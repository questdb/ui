import { useCallback, useContext, useEffect, useRef, useState } from "react"
import { QuestContext } from "../../../providers"
import * as QuestDB from "../../../utils/questdb"
import type { LiveView, TableKind } from "../../../utils/questdb/types"
import { LIVE_VIEW_POLL_MS } from "./healthCheck"

const QUERY_TIMEOUT_MS = 10_000
// The banner needs consecutive failures so a single slow poll does not flash it,
// and consecutive successes so a flapping server does not clear it too eagerly.
const FAILURE_THRESHOLD = 3
const RECOVERY_THRESHOLD = 2

type Params = {
  tableName: string
  isLiveView: boolean
  isDrawerOpen: boolean
  isCurrentTarget: (tableName: string, kind: TableKind) => boolean
  clearIfCurrentTarget: (tableName: string, kind: TableKind) => void
}

type LiveViewMetadata = {
  liveViewData: LiveView | null
  metadataError: boolean
  fetchLiveViewData: () => Promise<void>
  reset: () => void
}

export const useLiveViewMetadata = ({
  tableName,
  isLiveView,
  isDrawerOpen,
  isCurrentTarget,
  clearIfCurrentTarget,
}: Params): LiveViewMetadata => {
  const { quest } = useContext(QuestContext)

  const [liveViewData, setLiveViewData] = useState<LiveView | null>(null)
  const [metadataError, setMetadataError] = useState(false)

  const activeQueryIdRef = useRef<QuestDB.QueryId | null>(null)
  const failureCountRef = useRef(0)
  const successCountRef = useRef(0)

  const recordSuccess = useCallback(() => {
    failureCountRef.current = 0
    successCountRef.current += 1
    if (successCountRef.current >= RECOVERY_THRESHOLD) {
      setMetadataError(false)
    }
  }, [])

  const recordFailure = useCallback(() => {
    successCountRef.current = 0
    failureCountRef.current += 1
    if (failureCountRef.current >= FAILURE_THRESHOLD) {
      setMetadataError(true)
    }
  }, [])

  const reset = useCallback(() => {
    failureCountRef.current = 0
    successCountRef.current = 0
    setMetadataError(false)
    setLiveViewData(null)
  }, [])

  const fetchLiveViewData = useCallback(async () => {
    if (!isLiveView) return
    if (activeQueryIdRef.current !== null) return

    let queryId: QuestDB.QueryId | null = null
    let timeoutId: number | null = null
    let timedOut = false
    try {
      const escapedName = QuestDB.escapeSqlLiteral(tableName)
      const query = quest.queryRaw(
        `live_views() WHERE view_name = '${escapedName}'`,
        { cancellable: true },
      )
      const currentQueryId = query.queryId
      queryId = currentQueryId
      activeQueryIdRef.current = currentQueryId
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          timedOut = true
          if (activeQueryIdRef.current === currentQueryId) {
            quest.abort(currentQueryId)
          }
          reject(new Error("Live view metadata request timed out"))
        }, QUERY_TIMEOUT_MS)
      })

      const rawResponse = await Promise.race([query.promise, timeoutPromise])
      if (activeQueryIdRef.current !== queryId) return
      if (!isCurrentTarget(tableName, "liveview")) return

      const response = QuestDB.Client.transformQueryRawResult<LiveView>(
        rawResponse,
        { convertLongsToBigInt: true },
      )
      if (response.type === QuestDB.Type.DQL && response.data.length > 0) {
        setLiveViewData(response.data[0])
        recordSuccess()
      } else if (
        response.type === QuestDB.Type.DQL &&
        response.data.length === 0
      ) {
        clearIfCurrentTarget(tableName, "liveview")
      } else {
        recordFailure()
      }
    } catch (error) {
      const wasCancelled =
        typeof error === "object" &&
        error !== null &&
        "error" in error &&
        error.error === "Cancelled by user"
      if (wasCancelled && !timedOut) {
        return
      }
      if (!isCurrentTarget(tableName, "liveview")) return
      recordFailure()
      console.error("Failed to fetch live view data:", error)
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      if (activeQueryIdRef.current === queryId) {
        activeQueryIdRef.current = null
      }
    }
  }, [
    quest,
    tableName,
    isLiveView,
    isCurrentTarget,
    clearIfCurrentTarget,
    recordSuccess,
    recordFailure,
  ])

  useEffect(() => {
    if (!isDrawerOpen || !isLiveView) return

    const interval = setInterval(() => {
      void fetchLiveViewData()
    }, LIVE_VIEW_POLL_MS)

    return () => {
      clearInterval(interval)
      const queryId = activeQueryIdRef.current
      if (queryId !== null) {
        quest.abort(queryId)
        activeQueryIdRef.current = null
      }
    }
  }, [isDrawerOpen, isLiveView, fetchLiveViewData, quest])

  return { liveViewData, metadataError, fetchLiveViewData, reset }
}
