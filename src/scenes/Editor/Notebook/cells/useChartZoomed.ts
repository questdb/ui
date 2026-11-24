import { useCallback, useSyncExternalStore } from "react"
import {
  chartZoomed,
  subscribeChartZoom,
} from "../cellVirtualization/chartZoomStore"

// Whether a chart is zoomed, straight from the zoom store, the source of truth
// that outlives both the chart (virtualized away) and the toolbar (remounted
// on tier changes).
export const useChartZoomed = (bufferId: number, cellId: string): boolean => {
  const subscribe = useCallback(
    (listener: () => void) =>
      subscribeChartZoom({ bufferId, cellId }, listener),
    [bufferId, cellId],
  )
  const read = useCallback(
    () => chartZoomed({ bufferId, cellId }),
    [bufferId, cellId],
  )
  return useSyncExternalStore(subscribe, read)
}
