import { useEffect, useState } from "react"
import type { CellResult, NotebookCell } from "../../../../store/notebook"
import { useChartRefresh } from "../chartRefresh/ChartRefreshContext"
import {
  deriveChartLoading,
  type ChartFetchState,
} from "../chartRefresh/chartRefreshEngine"
import { toChartResult } from "../DrawCanvas/drawCanvasUtils"
import { useCellResultStatus } from "../resultHydration/CellResultHydrationContext"

type ChartLoadingState = { loading: boolean; refreshing: boolean }

const IDLE: ChartLoadingState = { loading: false, refreshing: false }

const derive = (
  fetchState: ChartFetchState | undefined,
  result: CellResult | null | undefined,
  resultLoading: boolean,
): ChartLoadingState => {
  if (!fetchState) return IDLE
  return deriveChartLoading(
    fetchState,
    toChartResult(result, fetchState.queries),
    resultLoading,
  )
}

// Tracks a cell's chart fetch state, derived from the chart engine, so the
// cell toolbar can spin its controls without owning the fetch. Reading the
// engine (rather than listening for broadcasts) keeps a toolbar that mounts
// mid-fetch correct, and covers entry removal — getState turns undefined and
// the state derives back to idle.
export const useChartLoading = (cell: NotebookCell): ChartLoadingState => {
  const engine = useChartRefresh()
  const resultStatus = useCellResultStatus(cell.id)
  const resultLoading = resultStatus === "loading"
  const result = cell.result
  const [state, setState] = useState<ChartLoadingState>(() =>
    derive(engine?.getState(cell.id), result, resultLoading),
  )

  useEffect(() => {
    if (!engine) return
    const apply = () => {
      const next = derive(engine.getState(cell.id), result, resultLoading)
      setState((prev) =>
        prev.loading === next.loading && prev.refreshing === next.refreshing
          ? prev
          : next,
      )
    }
    apply()
    engine.subscribe(cell.id, apply)
    return () => engine.unsubscribe(cell.id, apply)
  }, [cell.id, result, engine, resultLoading])

  return state
}
