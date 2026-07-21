import { useEffect, useState } from "react"
import { useChartRefresh } from "../chartRefresh/ChartRefreshContext"
import { deriveChartLoading } from "../chartRefresh/chartRefreshEngine"

type ChartLoadingState = { loading: boolean; refreshing: boolean }

const IDLE: ChartLoadingState = { loading: false, refreshing: false }

// Tracks a cell's chart fetch state, derived from the chart engine, so the
// cell toolbar can spin its controls without owning the fetch. Reading the
// engine (rather than listening for broadcasts) keeps a toolbar that mounts
// mid-fetch correct, and covers entry removal — getState turns undefined and
// the state derives back to idle.
export const useChartLoading = (cellId: string): ChartLoadingState => {
  const engine = useChartRefresh()
  const [state, setState] = useState<ChartLoadingState>(() => {
    const fetchState = engine?.getState(cellId)
    return fetchState ? deriveChartLoading(fetchState) : IDLE
  })

  useEffect(() => {
    if (!engine) return
    const apply = () => {
      const fetchState = engine.getState(cellId)
      const next = fetchState ? deriveChartLoading(fetchState) : IDLE
      setState((prev) =>
        prev.loading === next.loading && prev.refreshing === next.refreshing
          ? prev
          : next,
      )
    }
    apply()
    engine.subscribe(cellId, apply)
    return () => engine.unsubscribe(cellId, apply)
  }, [cellId, engine])

  return state
}
