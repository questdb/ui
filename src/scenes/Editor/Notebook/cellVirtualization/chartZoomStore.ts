import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"

import type { ZoomWindow } from "../CellChart/zoomWindow"

const zoomWindows = new Map<string, ZoomWindow>()
const listeners = new Map<string, Set<() => void>>()

const notify = (cellId: string) => {
  listeners.get(cellId)?.forEach((listener) => listener())
}

export const setChartZoom = (
  cellId: string,
  start: number,
  end: number,
  bounds?: ZoomWindow["bounds"],
) => {
  if (start <= 0 && end >= 100) {
    clearChartZoom(cellId)
    return
  }
  zoomWindows.set(cellId, { start, end, ...(bounds ? { bounds } : {}) })
  notify(cellId)
}

export const getChartZoom = (cellId: string): ZoomWindow | undefined =>
  zoomWindows.get(cellId)

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
