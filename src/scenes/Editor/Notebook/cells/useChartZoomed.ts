import { useEffect, useState } from "react"
import {
  getChartZoom,
  subscribeChartZoom,
} from "../cellVirtualization/chartZoomStore"

// Tracks whether a cell's chart is currently zoomed, straight from the zoom
// store — the source of truth that outlives both the DrawCanvas (virtualized
// away) and the toolbar (remounted on tier changes).
export const useChartZoomed = (cellId: string): boolean => {
  const [zoomed, setZoomed] = useState(() => getChartZoom(cellId) !== undefined)

  useEffect(() => {
    setZoomed(getChartZoom(cellId) !== undefined)
    return subscribeChartZoom(cellId, () =>
      setZoomed(getChartZoom(cellId) !== undefined),
    )
  }, [cellId])

  return zoomed
}
