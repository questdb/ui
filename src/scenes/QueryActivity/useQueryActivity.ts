import { useCallback, useEffect, useRef, useState } from "react"
import {
  MANUAL_RETRY_POLICY,
  POLLING_RETRY_POLICY,
  useCatalogSource,
  type SourceState,
} from "../../hooks/catalogSource"
import { useAdaptivePoll } from "../../hooks/useAdaptivePoll"
import * as QuestDB from "../../utils/questdb"
import {
  collectFinishedQueries,
  expireFinishedQueries,
  FINISHED_GRACE_MS,
  NO_FINISHED_QUERIES,
  QUERY_ACTIVITY_SQL,
  transformQueryActivityResponse,
  type FinishedQueries,
  type QueryActivitySnapshot,
} from "./queryActivity"

const POLL_MIN_MS = 1_000
const POLL_MAX_MS = 30_000
const CLOCK_TICK_MS = 1_000

type Params = {
  enabled: boolean
  autoRefresh: boolean
}

type QueryActivitySource = {
  state: SourceState<QueryActivitySnapshot>
  snapshot: QueryActivitySnapshot | null
  finished: FinishedQueries
  clientNowMs: number
  refresh: () => void
  setHeld: (queryId: bigint, held: boolean) => void
  dismissFinished: (queryId: bigint) => void
}

const NO_HELD_IDS: ReadonlySet<string> = new Set()

const transformResponse = (response: QuestDB.QueryRawResult) =>
  transformQueryActivityResponse(response, Date.now())

export const useQueryActivity = ({
  enabled,
  autoRefresh,
}: Params): QueryActivitySource => {
  const source = useCatalogSource<QueryActivitySnapshot>({
    sourceKey: "query-activity",
    revalidateKey: enabled,
    sourceName: "query activity",
    enabled,
    query: QUERY_ACTIVITY_SQL,
    pollIntervalMs: null,
    retryPolicy: autoRefresh ? POLLING_RETRY_POLICY : MANUAL_RETRY_POLICY,
    transformResponse,
  })
  const [pollGeneration, setPollGeneration] = useState(0)
  const [clientNowMs, setClientNowMs] = useState(() => Date.now())
  const [finished, setFinished] = useState(NO_FINISHED_QUERIES)
  const [heldIds, setHeldIds] = useState(NO_HELD_IDS)
  const previousSnapshotRef = useRef<QueryActivitySnapshot | null>(null)

  const snapshot =
    source.state.status === "ready"
      ? source.state.data
      : source.state.status === "unavailable"
        ? source.lastReadyData
        : null

  const { fetchNow, poll } = source

  const pollOnce = useCallback(async () => {
    const outcome = await poll()
    if (outcome === "failure") {
      throw new Error("Query activity poll failed")
    }
  }, [poll])

  useAdaptivePoll({
    fetchFn: pollOnce,
    enabled: enabled && autoRefresh,
    key: `query-activity:${pollGeneration}`,
    minIntervalMs: POLL_MIN_MS,
    maxIntervalMs: POLL_MAX_MS,
  })

  const refresh = () => {
    setPollGeneration((generation) => generation + 1)
    void fetchNow()
  }

  const setHeld = (queryId: bigint, held: boolean) => {
    const id = queryId.toString()
    setHeldIds((current) => {
      if (current.has(id) === held) return current
      const next = new Set(current)
      if (held) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const dismissFinished = (queryId: bigint) => {
    const id = queryId.toString()
    setFinished((current) => {
      if (!current.has(id)) return current
      const next = new Map(current)
      next.delete(id)
      return next
    })
  }

  useEffect(() => {
    if (!enabled) return

    setClientNowMs(Date.now())
    const intervalId = window.setInterval(() => {
      setClientNowMs(Date.now())
    }, CLOCK_TICK_MS)

    return () => window.clearInterval(intervalId)
  }, [enabled])

  useEffect(() => {
    const previous = previousSnapshotRef.current
    previousSnapshotRef.current = snapshot
    if (snapshot === null) {
      setFinished(NO_FINISHED_QUERIES)
      return
    }
    if (previous === null || previous === snapshot) return
    setFinished((current) =>
      collectFinishedQueries(current, previous, snapshot, heldIds, Date.now()),
    )
  }, [snapshot])

  useEffect(() => {
    setFinished((current) =>
      expireFinishedQueries(current, heldIds, clientNowMs, FINISHED_GRACE_MS),
    )
  }, [clientNowMs, heldIds])

  return {
    state: source.state,
    snapshot,
    finished,
    clientNowMs,
    refresh,
    setHeld,
    dismissFinished,
  }
}
