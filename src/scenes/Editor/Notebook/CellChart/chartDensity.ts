import type { EChartsOption } from "echarts"

// A bar or candle body narrower than this reads as a line, not a shape.
export const MIN_MARK_PX = 6
// Lines and scatter downsample to the pixel grid, so detail is lost only once
// points outnumber pixels.
export const MIN_POINT_PX = 1
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

// Wheel zoom arms while marks are merely tight — this many times the readable
// floor — since it costs no plot space; the slider waits for the floor itself.
export const WHEEL_ZOOM_HEADROOM = 3

export const X_WHEEL_ZOOM_ID = "chart-x-wheel"
export const X_SLIDER_ZOOM_ID = "chart-x-slider"
export const Y_SLIDER_ZOOM_ID = "chart-y-slider"

export const GRID_BOTTOM_NO_ZOOM = 56
export const GRID_BOTTOM_WITH_ZOOM = 86
export const HEATMAP_ROW_FILL = 0.8
const X_AXIS_LABEL_HEIGHT_PX = 20
// Leave a little headroom above a one-pixel pointer target.
const MIN_HEATMAP_ROW_PX = 2

export type ChartZoomDensity = {
  slider: boolean
  wheel: boolean
  rowSlider: boolean
}

export const chartZoomDensity = (
  option: EChartsOption,
  containerWidthPx: number,
  containerHeightPx = 0,
): ChartZoomDensity => {
  const plotWidth = plotWidthOf(option, containerWidthPx)

  const series = seriesOf(option)
  const bars = series.filter((s) => s.type === "bar")
  const candles = series.filter((s) => s.type === "candlestick")
  const points = series.filter((s) => s.type === "line" || s.type === "scatter")
  const xAxis = firstOf(option.xAxis) as { data?: unknown[] } | undefined
  const categorySlots = Array.isArray(xAxis?.data) ? xAxis.data.length : 0
  const bandSlots = (list: SeriesSpec[]) =>
    Math.max(categorySlots, maxDataLength(list))

  const density = { slider: false, wheel: false, rowSlider: false }
  if (plotWidth <= 0) return density
  const include = (slots: number, fillRatio: number, minPx: number) => {
    if (slots <= 0) return
    const markPx = (plotWidth / slots) * fillRatio
    density.slider ||= markPx < minPx
    density.wheel ||= markPx < minPx * WHEEL_ZOOM_HEADROOM
  }
  if (bars.length > 0) {
    include(bandSlots(bars), barFillRatio(barColumns(bars)), MIN_MARK_PX)
  }
  if (candles.length > 0) {
    include(bandSlots(candles), CANDLE_FILL_RATIO, MIN_MARK_PX)
  }
  include(maxDataLength(points), 1, MIN_POINT_PX)
  // Heatmap cells share x slots across rows; count columns, not cells.
  if (series.some((s) => s.type === "custom")) {
    include(categorySlots, 1, MIN_MARK_PX)
    const yAxis = firstOf(option.yAxis) as
      | { type?: string; data?: unknown[] }
      | undefined
    const grid = firstOf(option.grid)
    const rowCount = yAxis?.type === "category" ? (yAxis.data?.length ?? 0) : 0
    const plotHeight =
      containerHeightPx -
      (typeof grid?.top === "number" ? grid.top : 0) -
      (density.slider ? GRID_BOTTOM_WITH_ZOOM : GRID_BOTTOM_NO_ZOOM) -
      X_AXIS_LABEL_HEIGHT_PX
    density.rowSlider =
      rowCount > 1 &&
      plotHeight > 0 &&
      (plotHeight * HEATMAP_ROW_FILL) / rowCount < MIN_HEATMAP_ROW_PX
  }
  return density
}
