import { useContext, useEffect, useRef, useState } from "react"
import type { MutableRefObject } from "react"
import { QuestContext } from "../../../providers"
import type { QueryExecResult } from "../../../hooks/useQueryExecution"
import * as QuestDB from "../../../utils/questdb"
import type { Client, QueryId } from "../../../utils/questdb/client"

/**
 * The chart downsamples on render — line families with LTTB, scatter and bar
 * with `large` — so past roughly twice the plot width in pixels extra rows
 * change nothing on screen. 10k keeps the sampler well fed for about 0.4MB on a
 * two-column result, and matches the cap notebook cells already fetch with.
 */
export const CHART_ROW_LIMIT = 10_000

// The client rejects an aborted request with this exact message.
const CANCELLED_ERROR = "Cancelled by user"

export type ChartQueryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; result: QueryExecResult }
  | { status: "error"; message: string }

// Stable references so a repeated transition into the same state bails out of
// re-rendering instead of minting a new object.
const IDLE: ChartQueryState = { status: "idle" }
const LOADING: ChartQueryState = { status: "loading" }

type SeedResult = Extract<QuestDB.QueryRawResult, { type: QuestDB.Type.DQL }>

type Params = {
  /** The grid's result. Supplies the SQL to re-run and the true total count. */
  seed: SeedResult | null
  /** Only fetch while the chart is on screen. */
  enabled: boolean
}

const abortInFlight = (
  quest: Client,
  queryIdRef: MutableRefObject<QueryId | null>,
) => {
  if (queryIdRef.current === null) return
  quest.abort(queryIdRef.current)
  queryIdRef.current = null
}

/**
 * Fetches the chart's own, deeper slice of the active query.
 *
 * The grid seeds from a 1000-row page, which is too coarse to plot — below one
 * point per pixel on a wide chart. Rather than widen that page and disturb the
 * grid's paging arithmetic, the chart re-runs the same SQL for itself.
 */
export const useChartQuery = ({ seed, enabled }: Params): ChartQueryState => {
  const { quest } = useContext(QuestContext)
  const [state, setState] = useState<ChartQueryState>(IDLE)
  const activeQueryIdRef = useRef<QueryId | null>(null)
  // Identity, not query text: re-running the same SQL must refetch.
  const loadedSeedRef = useRef<SeedResult | null>(null)

  // A new execution invalidates what the chart holds even while it is hidden,
  // so switching back never shows the previous run's chart.
  useEffect(() => {
    abortInFlight(quest, activeQueryIdRef)
    loadedSeedRef.current = null
    setState(IDLE)
  }, [seed, quest])

  useEffect(() => {
    if (!enabled || seed === null) return
    if (loadedSeedRef.current === seed) return

    abortInFlight(quest, activeQueryIdRef)
    setState(LOADING)

    const { promise, queryId } = quest.queryRaw(seed.query, {
      limit: `0,${CHART_ROW_LIMIT}`,
      // The grid's execution already paid for the total, and asking again would
      // make the server recount the whole table for a number we hold.
      count: false,
      src: "vis",
      cancellable: true,
    })
    activeQueryIdRef.current = queryId
    let superseded = false

    promise
      .then((response) => {
        if (superseded) return
        activeQueryIdRef.current = null

        if (response.type !== QuestDB.Type.DQL) {
          setState({
            status: "error",
            message: "This result cannot be charted.",
          })
          return
        }

        loadedSeedRef.current = seed
        setState({
          status: "ready",
          result: {
            type: "dql",
            query: response.query,
            columns: response.columns,
            dataset: response.dataset,
            // `count: false` makes the server echo the returned row count, so
            // the real total has to come from the grid's execution.
            count: seed.count,
            timestamp: response.timestamp,
            timings: response.timings,
          },
        })
      })
      .catch((error: { error?: string }) => {
        if (superseded) return
        activeQueryIdRef.current = null
        if (error?.error === CANCELLED_ERROR) return
        setState({
          status: "error",
          message: error?.error ?? "Failed to load chart data.",
        })
      })

    return () => {
      superseded = true
      abortInFlight(quest, activeQueryIdRef)
    }
  }, [enabled, seed, quest])

  return state
}
