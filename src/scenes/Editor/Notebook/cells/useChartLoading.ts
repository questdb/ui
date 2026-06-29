import { useEffect, useState } from "react"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"

type ChartLoadingState = { loading: boolean; refreshing: boolean }

const IDLE: ChartLoadingState = { loading: false, refreshing: false }

// Tracks a cell's chart fetch state, as broadcast by its DrawCanvas, so the
// cell toolbar can spin its controls without owning the fetch. `loading` is the
// first-time draw (view toggle spins); `refreshing` is a re-fetch over existing
// data (refresh button spins).
export const useChartLoading = (cellId: string): ChartLoadingState => {
  const [state, setState] = useState<ChartLoadingState>(IDLE)

  useEffect(() => {
    const handler = (payload?: {
      cellId?: string
      loading?: boolean
      refreshing?: boolean
    }) => {
      if (payload?.cellId !== cellId) return
      setState({ loading: !!payload.loading, refreshing: !!payload.refreshing })
    }
    eventBus.subscribe(EventType.NOTEBOOK_CELL_CHART_LOADING, handler)
    return () =>
      eventBus.unsubscribe(EventType.NOTEBOOK_CELL_CHART_LOADING, handler)
  }, [cellId])

  return state
}
