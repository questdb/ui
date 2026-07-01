import { useEffect, useState } from "react"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"

// Tracks whether a cell's chart is currently zoomed, as broadcast by its
// DrawCanvas. Lives on the always-mounted cell so the flag survives the toolbar
// remounting when its tier changes with the cell width — a tier-local
// subscription would reset and miss the standing zoom (the event bus does not
// replay).
export const useChartZoomed = (cellId: string): boolean => {
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    const handler = (payload?: { cellId?: string; zoomed?: boolean }) => {
      if (payload?.cellId === cellId) setZoomed(!!payload.zoomed)
    }
    eventBus.subscribe(EventType.NOTEBOOK_CELL_CHART_ZOOM, handler)
    return () =>
      eventBus.unsubscribe(EventType.NOTEBOOK_CELL_CHART_ZOOM, handler)
  }, [cellId])

  return zoomed
}
