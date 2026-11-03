import { useEffect, useState } from "react"
import type { CellResult, NotebookCell } from "../../../../store/notebook"
import { useCellRefresh } from "../cellRefresh/CellRefreshContext"
import {
  deriveChartLoading,
  pendingCellFetchState,
  type CellFetchState,
} from "../cellRefresh/cellRefreshEngine"
import { toChartResult } from "../DrawCanvas/drawCanvasUtils"
import { useCellResultStatus } from "../resultHydration/CellResultHydrationContext"

// `stopVisible`: a first fetch is in flight, so Stop can cancel it. A refresh
// of a drawn chart keeps both flags false, so a poll tick re-renders no one.
type ChartLoadingState = { loading: boolean; stopVisible: boolean }

const IDLE: ChartLoadingState = { loading: false, stopVisible: false }

const derive = (
  fetchState: CellFetchState,
  result: CellResult | null | undefined,
  resultLoading: boolean,
): ChartLoadingState => {
  const loading = deriveChartLoading(
    fetchState,
    toChartResult(result, fetchState.queries),
    resultLoading,
  )
  return { loading, stopVisible: loading && fetchState.fetching }
}

// Tracks a draw cell's chart fetch state, derived from the chart engine, so
// the cell toolbar and the canvas share one answer without owning the fetch.
// Reading the engine (rather than listening for broadcasts) keeps a toolbar
// that mounts mid-fetch correct. Until the engine holds the cell's entry, the
// chart is pending on the SQL it shows. A run cell has no chart and never
// subscribes.
export const useChartLoading = (cell: NotebookCell): ChartLoadingState => {
  const engine = useCellRefresh()
  const resultStatus = useCellResultStatus(cell.id)
  const isDrawCell = cell.mode === "draw"
  const resultLoading = resultStatus === "loading"
  const { id: cellId, result, value } = cell
  const [state, setState] = useState<ChartLoadingState>(() =>
    isDrawCell
      ? derive(
          engine?.getState(cellId) ?? pendingCellFetchState(value),
          result,
          resultLoading,
        )
      : IDLE,
  )

  useEffect(() => {
    const apply = () => {
      const next = isDrawCell
        ? derive(
            engine?.getState(cellId) ?? pendingCellFetchState(value),
            result,
            resultLoading,
          )
        : IDLE
      setState((prev) =>
        prev.loading === next.loading && prev.stopVisible === next.stopVisible
          ? prev
          : next,
      )
    }
    apply()
    if (!isDrawCell) return
    return engine?.subscribe(cellId, apply)
  }, [cellId, isDrawCell, result, value, engine, resultLoading])

  return state
}
