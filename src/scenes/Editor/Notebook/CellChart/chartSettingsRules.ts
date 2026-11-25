import type { AxisBounds, QueryChart } from "./chartTypes"

export const AXIS_BOUNDS_ERROR = "Min must be below max"

export const axisBoundsError = (axis: AxisBounds | undefined): string | null =>
  axis?.min != null && axis.max != null && axis.min >= axis.max
    ? AXIS_BOUNDS_ERROR
    : null

export const candlestickMissingOhlc = (q: QueryChart | null): boolean => {
  if (!q || q.type !== "candlestick" || q.enabled === false) return false
  const o = q.ohlc
  if (!o || !o.open || !o.high || !o.low || !o.close) return true
  return new Set([o.open, o.high, o.low, o.close]).size !== 4
}
