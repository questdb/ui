import type { EChartsOption } from "echarts"

// A bar or candle body narrower than this reads as a line, not a shape.
export const MIN_MARK_PX = 6
// Lines and scatter downsample to the pixel grid, so detail is lost only once
// points outnumber pixels.
export const MIN_POINT_PX = 1
const CHART_WIDTH_STEP_PX = 100
const Y_AXIS_LABEL_WIDTH_PX = 48
// ECharts keeps 20% of a band as the category gap and 20% of a bar between
// grouped columns, so one column is 0.8 / (1.2k - 0.2) of its band. A candle
// body is half its band.
const CANDLE_FILL_RATIO = 0.5

type SeriesSpec = { type?: string; stack?: string; data?: unknown[] }

const seriesOf = (option: EChartsOption): SeriesSpec[] => {
  const raw = option.series
  return (Array.isArray(raw) ? raw : raw ? [raw] : []) as SeriesSpec[]
}

const firstOf = <T>(value: T | T[] | undefined): T | undefined =>
  Array.isArray(value) ? value[0] : value

const dataLength = (series: SeriesSpec): number =>
  Array.isArray(series.data) ? series.data.length : 0

const maxDataLength = (list: SeriesSpec[]): number =>
  list.reduce((max, series) => Math.max(max, dataLength(series)), 0)

const barFillRatio = (columns: number): number => 0.8 / (1.2 * columns - 0.2)

const barColumns = (bars: SeriesSpec[]): number => {
  const stacks = new Set(bars.map((s) => s.stack).filter(Boolean))
  return bars.filter((s) => !s.stack).length + stacks.size
}

const plotWidthOf = (
  option: EChartsOption,
  containerWidthPx: number,
): number => {
  const grid = firstOf(option.grid) as
    | { left?: number; right?: number }
    | undefined
  const yAxisCount = Array.isArray(option.yAxis) ? option.yAxis.length : 1
  return (
    containerWidthPx -
    (grid?.left ?? 0) -
    (grid?.right ?? 0) -
    Y_AXIS_LABEL_WIDTH_PX * yAxisCount
  )
}

export const snapChartWidth = (px: number): number =>
  Math.max(
    CHART_WIDTH_STEP_PX,
    Math.round(px / CHART_WIDTH_STEP_PX) * CHART_WIDTH_STEP_PX,
  )

// Wheel zoom arms while marks are merely tight — this many times the readable
// floor — since it costs no plot space; the slider waits for the floor itself.
export const WHEEL_ZOOM_HEADROOM = 3

const zoomNeededAt = (
  option: EChartsOption,
  containerWidthPx: number,
  headroom: number,
): boolean => {
  const plotWidth = plotWidthOf(option, containerWidthPx)
  if (plotWidth <= 0) return false

  const series = seriesOf(option)
  const bars = series.filter((s) => s.type === "bar")
  const candles = series.filter((s) => s.type === "candlestick")
  const points = series.filter((s) => s.type === "line" || s.type === "scatter")
  const xAxis = firstOf(option.xAxis) as { data?: unknown[] } | undefined
  const categorySlots = Array.isArray(xAxis?.data) ? xAxis.data.length : 0
  const bandSlots = (list: SeriesSpec[]) =>
    Math.max(categorySlots, maxDataLength(list))

  const tooDense = (slots: number, fillRatio: number, minPx: number) =>
    slots > 0 && (plotWidth / slots) * fillRatio < minPx * headroom

  return (
    (bars.length > 0 &&
      tooDense(bandSlots(bars), barFillRatio(barColumns(bars)), MIN_MARK_PX)) ||
    (candles.length > 0 &&
      tooDense(bandSlots(candles), CANDLE_FILL_RATIO, MIN_MARK_PX)) ||
    tooDense(maxDataLength(points), 1, MIN_POINT_PX)
  )
}

export const needsZoomSlider = (
  option: EChartsOption,
  containerWidthPx: number,
): boolean => zoomNeededAt(option, containerWidthPx, 1)

export const needsWheelZoom = (
  option: EChartsOption,
  containerWidthPx: number,
): boolean => zoomNeededAt(option, containerWidthPx, WHEEL_ZOOM_HEADROOM)
