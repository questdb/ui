import type { EChartsType } from "echarts"

type DataZoomRange = {
  start?: number
  end?: number
  startValue?: unknown
  endValue?: unknown
}

export type DataZoomEvent = DataZoomRange & { batch?: DataZoomRange[] }

export const zoomWindowForEvent = (
  event: DataZoomEvent,
  instance: EChartsType | null,
): ZoomWindow | undefined => {
  const first = event.batch?.[0] ?? event
  if (typeof first.start === "number" && typeof first.end === "number")
    return { start: first.start, end: first.end }

  // Linked charts can receive absolute bounds only. The updated chart model
  // has already converted these to percentages on the peer's own time axis.
  if (first.startValue === undefined && first.endValue === undefined) return
  const option = instance?.getOption() as
    | { dataZoom?: DataZoomRange[] }
    | undefined
  const zoom = option?.dataZoom?.[0]
  if (typeof zoom?.start === "number" && typeof zoom.end === "number")
    return { start: zoom.start, end: zoom.end }
}

export type ZoomWindow = { start: number; end: number }
