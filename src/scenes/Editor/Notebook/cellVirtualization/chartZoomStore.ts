const zoomWindows = new Map<string, { start: number; end: number }>()

export const setChartZoom = (cellId: string, start: number, end: number) => {
  if (start <= 0 && end >= 100) {
    zoomWindows.delete(cellId)
    return
  }
  zoomWindows.set(cellId, { start, end })
}

export const getChartZoom = (
  cellId: string,
): { start: number; end: number } | undefined => zoomWindows.get(cellId)

export const clearChartZoom = (cellId: string) => {
  zoomWindows.delete(cellId)
}
