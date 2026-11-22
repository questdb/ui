import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"

import {
  withChartZoom,
  type ChartZoomAxis,
  type ChartZoomWindows,
} from "../CellChart/chartTypes"

const zoomWindows = new Map<string, ChartZoomWindows>()
const listeners = new Map<string, Set<() => void>>()

const notify = (cellId: string) => {
  listeners.get(cellId)?.forEach((listener) => listener())
}

export const setChartZoom = (
  cellId: string,
  axis: ChartZoomAxis,
  start: number,
  end: number,
) => {
  const previous = zoomWindows.get(cellId)
  const next = withChartZoom(previous, axis, start, end)
  if (previous === next) return
  if (next) zoomWindows.set(cellId, next)
  else zoomWindows.delete(cellId)
  notify(cellId)
}

export const getChartZoom = (cellId: string) => zoomWindows.get(cellId)

export const clearChartZoom = (cellId: string) => {
  if (!zoomWindows.delete(cellId)) return
  notify(cellId)
}

// A mounted chart holds its window in ECharts too: the event resets it there.
export const resetChartZoom = (cellId: string) => {
  if (!zoomWindows.has(cellId)) return
  clearChartZoom(cellId)
  eventBus.publish(EventType.NOTEBOOK_CELL_RESET_ZOOM, { cellId })
}

export const clearChartZooms = (cellIds: Iterable<string>) => {
  for (const cellId of cellIds) clearChartZoom(cellId)
}

export const subscribeChartZoom = (
  cellId: string,
  listener: () => void,
): (() => void) => {
  let set = listeners.get(cellId)
  if (!set) {
    set = new Set()
    listeners.set(cellId, set)
  }
  set.add(listener)
  return () => {
    const current = listeners.get(cellId)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) listeners.delete(cellId)
  }
}
