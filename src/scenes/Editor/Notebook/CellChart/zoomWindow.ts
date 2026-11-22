import type { EChartsType } from "echarts"
import { zoomControls, zoomForTarget, type ZoomTarget } from "./liveZoom"

type DataZoomRange = ZoomTarget & {
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
  const range =
    instance && zoomForTarget(zoomControls(instance), first)?.getPercentRange()
  if (range?.every(Number.isFinite))
    return {
      start: range[0],
      end: range[1],
      ...(typeof first.startValue === "number" &&
      typeof first.endValue === "number"
        ? { bounds: { startValue: first.startValue, endValue: first.endValue } }
        : {}),
    }
}

export type ZoomWindow = {
  start: number
  end: number
  bounds?: { startValue: number; endValue: number }
}
