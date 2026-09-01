import { useCallback, useContext, useEffect, useRef, useState } from "react"
import { QuestContext } from "../../../providers"
import * as QuestDB from "../../../utils/questdb"
import {
  createSourceMachineState,
  nextSourceState,
  SOURCE_FAILURE_GRACE_MS,
  SOURCE_FAILURE_THRESHOLD,
  SOURCE_TIMEOUT_MS,
  type SourceMachineState,
} from "./sourceState"
import type { SourceState } from "./types"

type Params<T> = {
  sourceKey: string
  sourceName: string
  enabled: boolean
  query: string
  pollIntervalMs: number | null
  transformResponse: (response: QuestDB.QueryRawResult) => T | undefined
}

type CatalogSource<T> = {
  state: SourceState<T>
  lastReadyData: T | null
  fetchNow: () => Promise<void>
}

const isCancelledRequest = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "error" in error &&
  error.error === "Cancelled by user"

export const useCatalogSource = <T>({
  sourceKey,
  sourceName,
  enabled,
  query,
  pollIntervalMs,
  transformResponse,
}: Params<T>): CatalogSource<T> => {
  const { quest } = useContext(QuestContext)
  const [machine, setMachine] = useState<SourceMachineState<T>>(() =>
    createSourceMachineState(sourceKey),
  )
  const activeQueryIdRef = useRef<QuestDB.QueryId | null>(null)
  const currentKeyRef = useRef(sourceKey)

  const fetchNow = useCallback(async () => {
    if (!enabled || activeQueryIdRef.current !== null) return

    const requestKey = sourceKey
    let queryId: QuestDB.QueryId | null = null
    let timeoutId: number | null = null
    let timedOut = false

    try {
      const request = quest.queryRaw(query, { cancellable: true })
      queryId = request.queryId
      activeQueryIdRef.current = request.queryId

      const timeout = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          timedOut = true
          if (activeQueryIdRef.current === request.queryId) {
            quest.abort(request.queryId)
          }
          reject(new Error(`${sourceName} request timed out`))
        }, SOURCE_TIMEOUT_MS)
      })

      const response = await Promise.race([request.promise, timeout])
      if (
        currentKeyRef.current !== requestKey ||
        activeQueryIdRef.current !== queryId
      ) {
        return
      }

      const data = transformResponse(response)
      setMachine((previous) =>
        nextSourceState(
          previous,
          data === undefined
            ? { type: "failure", key: requestKey, at: Date.now() }
            : { type: "success", key: requestKey, data },
        ),
      )
    } catch (error) {
      if (currentKeyRef.current !== requestKey) return
      if (isCancelledRequest(error) && !timedOut) return

      setMachine((previous) =>
        nextSourceState(
          previous,
          timedOut
            ? { type: "timeout", key: requestKey }
            : { type: "failure", key: requestKey, at: Date.now() },
        ),
      )
      console.error(`Failed to fetch ${sourceName}:`, error)
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      if (activeQueryIdRef.current === queryId) {
        activeQueryIdRef.current = null
      }
    }
  }, [enabled, quest, query, sourceKey, sourceName, transformResponse])

  useEffect(() => {
    currentKeyRef.current = sourceKey
  }, [sourceKey])

  useEffect(() => {
    const activeQueryId = activeQueryIdRef.current
    if (activeQueryId !== null) {
      quest.abort(activeQueryId)
      activeQueryIdRef.current = null
    }
    setMachine(createSourceMachineState(sourceKey))

    if (!enabled) return

    void fetchNow()

    return () => {
      const currentQueryId = activeQueryIdRef.current
      if (currentQueryId !== null) {
        quest.abort(currentQueryId)
        activeQueryIdRef.current = null
      }
    }
  }, [enabled, fetchNow, quest, sourceKey])

  useEffect(() => {
    if (!enabled || pollIntervalMs === null) return

    const intervalId = window.setInterval(() => {
      void fetchNow()
    }, pollIntervalMs)

    return () => window.clearInterval(intervalId)
  }, [enabled, fetchNow, pollIntervalMs])

  useEffect(() => {
    if (
      machine.key !== sourceKey ||
      machine.source.status === "unavailable" ||
      machine.consecutiveFailures < SOURCE_FAILURE_THRESHOLD ||
      machine.firstFailureAt === null
    ) {
      return
    }

    const remaining = Math.max(
      0,
      SOURCE_FAILURE_GRACE_MS - (Date.now() - machine.firstFailureAt),
    )
    const deadlineId = window.setTimeout(() => {
      setMachine((previous) =>
        nextSourceState(previous, {
          type: "failure-deadline",
          key: sourceKey,
          at: Date.now(),
        }),
      )
    }, remaining)

    return () => window.clearTimeout(deadlineId)
  }, [
    machine.consecutiveFailures,
    machine.firstFailureAt,
    machine.key,
    machine.source.status,
    sourceKey,
  ])

  if (machine.key !== sourceKey) {
    return {
      state: { status: "loading" },
      lastReadyData: null,
      fetchNow,
    }
  }

  return {
    state: machine.source,
    lastReadyData: machine.lastReadyData,
    fetchNow,
  }
}
