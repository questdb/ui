import { useCallback, useContext, useEffect, useRef, useState } from "react"
import { QuestContext } from "../../providers"
import * as QuestDB from "../../utils/questdb"
import {
  createSourceMachineState,
  nextSourceState,
  SOURCE_TIMEOUT_MS,
  type SourceMachineState,
  type SourceRetryPolicy,
} from "./sourceState"
import type { SourceFetchOutcome, SourceState } from "./types"

type Params<T> = {
  sourceKey: string
  revalidateKey: string | number | boolean
  sourceName: string
  enabled: boolean
  query: string
  pollIntervalMs: number | null
  retryPolicy: SourceRetryPolicy
  transformResponse: (response: QuestDB.QueryRawResult) => T | undefined
}

type CatalogSource<T> = {
  state: SourceState<T>
  lastReadyData: T | null
  fetchNow: () => Promise<SourceFetchOutcome>
  poll: () => Promise<SourceFetchOutcome>
}

const isCancelledRequest = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "error" in error &&
  error.error === "Cancelled by user"

export const useCatalogSource = <T>({
  sourceKey,
  revalidateKey,
  sourceName,
  enabled,
  query,
  pollIntervalMs,
  retryPolicy,
  transformResponse,
}: Params<T>): CatalogSource<T> => {
  const { quest } = useContext(QuestContext)
  const [machine, setMachine] = useState<SourceMachineState<T>>(() =>
    createSourceMachineState(sourceKey),
  )
  const activeQueryIdRef = useRef<QuestDB.QueryId | null>(null)
  const currentKeyRef = useRef(sourceKey)
  const retryPolicyRef = useRef(retryPolicy)

  const abortActiveRequest = useCallback(() => {
    const activeQueryId = activeQueryIdRef.current
    if (activeQueryId === null) return
    activeQueryIdRef.current = null
    quest.abort(activeQueryId)
  }, [quest])

  const runRequest = useCallback(async (): Promise<SourceFetchOutcome> => {
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
        return "skipped"
      }

      const data = transformResponse(response)
      setMachine((previous) =>
        nextSourceState(
          previous,
          data === undefined
            ? { type: "failure", key: requestKey, at: Date.now() }
            : { type: "success", key: requestKey, data },
          retryPolicyRef.current,
        ),
      )
      return data === undefined ? "failure" : "success"
    } catch (error) {
      if (
        currentKeyRef.current !== requestKey ||
        activeQueryIdRef.current !== queryId
      ) {
        return "skipped"
      }
      if (isCancelledRequest(error) && !timedOut) return "skipped"

      setMachine((previous) =>
        nextSourceState(
          previous,
          timedOut
            ? { type: "timeout", key: requestKey }
            : { type: "failure", key: requestKey, at: Date.now() },
          retryPolicyRef.current,
        ),
      )
      console.error(`Failed to fetch ${sourceName}:`, error)
      return "failure"
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      if (activeQueryIdRef.current === queryId) {
        activeQueryIdRef.current = null
      }
    }
  }, [quest, query, sourceKey, sourceName, transformResponse])

  const fetchNow = useCallback(async (): Promise<SourceFetchOutcome> => {
    if (!enabled) return "skipped"
    abortActiveRequest()
    return runRequest()
  }, [abortActiveRequest, enabled, runRequest])

  const poll = useCallback(async (): Promise<SourceFetchOutcome> => {
    if (!enabled || activeQueryIdRef.current !== null) return "skipped"
    return runRequest()
  }, [enabled, runRequest])

  useEffect(() => {
    currentKeyRef.current = sourceKey
  }, [sourceKey])

  useEffect(() => {
    retryPolicyRef.current = retryPolicy
  }, [retryPolicy])

  useEffect(() => {
    setMachine((previous) => {
      if (previous.key !== sourceKey) {
        return createSourceMachineState(sourceKey)
      }
      return nextSourceState(
        previous,
        { type: "revalidate", key: sourceKey },
        retryPolicyRef.current,
      )
    })
  }, [revalidateKey, sourceKey])

  useEffect(() => {
    abortActiveRequest()
    if (!enabled) return

    void fetchNow()

    return abortActiveRequest
  }, [abortActiveRequest, enabled, fetchNow, sourceKey])

  useEffect(() => {
    if (!enabled || pollIntervalMs === null) return

    const intervalId = window.setInterval(() => {
      void poll()
    }, pollIntervalMs)

    return () => window.clearInterval(intervalId)
  }, [enabled, poll, pollIntervalMs])

  useEffect(() => {
    if (
      machine.key !== sourceKey ||
      machine.source.status === "unavailable" ||
      machine.consecutiveFailures < retryPolicy.failureThreshold ||
      machine.firstFailureAt === null
    ) {
      return
    }

    const remaining = Math.max(
      0,
      retryPolicy.failureGraceMs - (Date.now() - machine.firstFailureAt),
    )
    const deadlineId = window.setTimeout(() => {
      setMachine((previous) =>
        nextSourceState(
          previous,
          { type: "failure-deadline", key: sourceKey, at: Date.now() },
          retryPolicy,
        ),
      )
    }, remaining)

    return () => window.clearTimeout(deadlineId)
  }, [
    machine.consecutiveFailures,
    machine.firstFailureAt,
    machine.key,
    machine.source.status,
    retryPolicy,
    sourceKey,
  ])

  if (machine.key !== sourceKey) {
    return {
      state: { status: "loading" },
      lastReadyData: null,
      fetchNow,
      poll,
    }
  }

  return {
    state: machine.source,
    lastReadyData: machine.lastReadyData,
    fetchNow,
    poll,
  }
}
