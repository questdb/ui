const zoomWindows = new Map<string, { start: number; end: number }>()
const listeners = new Map<string, Set<() => void>>()

const notify = (cellId: string) => {
  listeners.get(cellId)?.forEach((listener) => listener())
}

export const setChartZoom = (cellId: string, start: number, end: number) => {
  if (start <= 0 && end >= 100) {
    clearChartZoom(cellId)
    return
  }
  zoomWindows.set(cellId, { start, end })
  notify(cellId)
}

export const getChartZoom = (
  cellId: string,
): { start: number; end: number } | undefined => zoomWindows.get(cellId)

export const clearChartZoom = (cellId: string) => {
  if (!zoomWindows.delete(cellId)) return
  notify(cellId)
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
