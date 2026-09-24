import { useCallback, useEffect, useState } from "react"
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

type TrackedSnapshot = {
  snapshot: QueryActivitySnapshot | null
  finished: FinishedQueries
}

const NO_TRACKED_SNAPSHOT: TrackedSnapshot = {
  snapshot: null,
  finished: NO_FINISHED_QUERIES,
}

const carryFinishedQueries = (
  tracked: TrackedSnapshot,
  snapshot: QueryActivitySnapshot | null,
  heldIds: ReadonlySet<string>,
  nowMs: number,
): FinishedQueries => {
  if (snapshot === null) return NO_FINISHED_QUERIES
  if (tracked.snapshot === null || tracked.snapshot === snapshot) {
    return tracked.finished
  }
  return collectFinishedQueries(
    tracked.finished,
    tracked.snapshot,
    snapshot,
    heldIds,
    nowMs,
  )
}

const transformResponse = (response: QuestDB.QueryRawResult) =>
  transformQueryActivityResponse(response, Date.now())

type DrawerSession = {
  enabled: boolean
  generation: number
}

export const useQueryActivity = ({
  enabled,
  autoRefresh,
}: Params): QueryActivitySource => {
  const [session, setSession] = useState<DrawerSession>({
    enabled,
    generation: 0,
  })
  if (session.enabled !== enabled) {
    setSession({ enabled, generation: session.generation + 1 })
  }

  const source = useCatalogSource<QueryActivitySnapshot>({
    sourceKey: `query-activity:${session.generation}`,
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
  const [tracked, setTracked] = useState(NO_TRACKED_SNAPSHOT)
  const [heldIds, setHeldIds] = useState(NO_HELD_IDS)

  const snapshot =
    source.state.status === "ready"
      ? source.state.data
      : source.state.status === "unavailable"
        ? source.lastReadyData
        : null

  const finished = expireFinishedQueries(
    carryFinishedQueries(tracked, snapshot, heldIds, clientNowMs),
    heldIds,
    clientNowMs,
    FINISHED_GRACE_MS,
  )
  if (snapshot !== tracked.snapshot || finished !== tracked.finished) {
    setTracked({ snapshot, finished })
  }

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
    setTracked((current) => {
      if (!current.finished.has(id)) return current
      const next = new Map(current.finished)
      next.delete(id)
      return { ...current, finished: next }
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
