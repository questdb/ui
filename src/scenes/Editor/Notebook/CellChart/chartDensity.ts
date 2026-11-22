import type { EChartsOption } from "echarts"
import { format } from "echarts/core"

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

const labelFont = (axisLabel: {
  fontSize?: number | string
  fontFamily?: string
}) => `${axisLabel.fontSize ?? 12}px ${axisLabel.fontFamily ?? "sans-serif"}`

export const withBoundedHeatmapLabels = (
  option: EChartsOption,
  containerWidth: number,
): EChartsOption => {
  const axis = option.yAxis
  if (Array.isArray(axis) || axis?.type !== "category") return option
  // Leave room for the plot and the vertical slider, even on narrow panes.
  const width = Math.max(0, Math.min(160, Math.floor(containerWidth / 3)))
  const font = labelFont(axis.axisLabel ?? {})
  const fitted = new Map<string, string>()
  return {
    ...option,
    yAxis: {
      ...axis,
      type: "category",
      axisLabel: {
        ...axis.axisLabel,
        formatter: (value: string) => {
          const cached = fitted.get(value)
          if (cached !== undefined) return cached
          const label = format.truncateText(value, width, font, "…")
          fitted.set(value, label)
          return label
        },
      },
    },
  }
}

// Work on the text, not a double: converting a LONG or DECIMAL here could
// change its magnitude or round two distinct endpoints to the same value.
const compactScaleEndpoint = (label: string) => {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(label.trim())
  if (!match) return null
  const [, sign, whole, fraction = "", power = "0"] = match
  const digits = whole + fraction
  const first = digits.search(/[1-9]/)
  if (first === -1) return "0"
  const significant = digits.slice(first).replace(/0+$/, "")
  const tail = significant.slice(1, 4)
  const exponent = Number(power) + whole.length - first - 1
  return `${sign}${significant[0]}${tail ? `.${tail}` : ""}${significant.length > 4 ? "…" : ""}e${exponent}`
}

export const withFittedHeatmapLegend = (
  option: EChartsOption,
  containerWidth: number,
): EChartsOption => {
  const map = option.visualMap
  if (Array.isArray(map) || map?.type !== "continuous" || !map.text)
    return option

  const font = labelFont(map.textStyle ?? {})
  const widthOf = (labels: string[]) =>
    labels.reduce(
      (width, label) => width + format.getTextRect(label, font).width,
      0,
    )
  // Account for both text gaps, component padding and a small edge inset.
  const available = containerWidth - 2 * ((map.textGap ?? 8) + 5 + 3)
  const minRampWidth = 48
  const fits = (labels: string[]) => available - widthOf(labels) >= minRampWidth
  let labels = map.text
  if (!fits(labels)) {
    const compact = labels.map(compactScaleEndpoint)
    // Never replace the explicitly per-row labels with a chart-wide range.
    if (compact.every((label) => label != null)) {
      labels =
        (compact[0] !== compact[1] || labels[0] === labels[1]) && fits(compact)
          ? compact
          : ["Max", "Min"]
    }
  }
  const rampWidth = Math.floor(available - widthOf(labels))
  return {
    ...option,
    visualMap: {
      ...map,
      // At impractically small widths, don't show a clipped scale. Exact
      // chart endpoints remain in each cell's tooltip.
      show: rampWidth >= minRampWidth,
      itemHeight: Math.max(
        minRampWidth,
        Math.min(map.itemHeight ?? 140, rampWidth),
      ),
      text: labels,
    },
  }
}

const heatmapLabelWidth = (option: EChartsOption): number => {
  const yAxis = firstOf(option.yAxis)
  if (yAxis?.type !== "category" || !("data" in yAxis) || !yAxis.data?.length)
    return 0
  const { formatter, margin = 0 } = yAxis.axisLabel ?? {}
  const font = labelFont(yAxis.axisLabel ?? {})
  // Use the renderer's text metrics. Consider every row because Y zoom can
  // bring labels that were not sampled by the initial layout into view.
  return (
    yAxis.data.reduce<number>((max, label, index) => {
      const value = typeof label === "object" ? label.value : label
      const text =
        typeof formatter === "function"
          ? formatter(String(value), index)
          : String(value)
      return Math.max(max, format.getTextRect(text, font).width)
    }, 0) + margin
  )
}

const plotWidthOf = (
  option: EChartsOption,
  containerWidthPx: number,
  heatmap: boolean,
): number => {
  const grid = firstOf(option.grid) as
    | { left?: number; right?: number }
    | undefined
  const yAxisCount = Array.isArray(option.yAxis) ? option.yAxis.length : 1
  return (
    containerWidthPx -
    (grid?.left ?? 0) -
    (grid?.right ?? 0) -
    (heatmap ? heatmapLabelWidth(option) : Y_AXIS_LABEL_WIDTH_PX * yAxisCount)
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
export const HEATMAP_ROW_SLIDER_GRID_RIGHT = 48
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
  const series = seriesOf(option)
  const heatmap = series.some((s) => s.type === "custom")
  const plotWidth = plotWidthOf(option, containerWidthPx, heatmap)
  const bars = series.filter((s) => s.type === "bar")
  const candles = series.filter((s) => s.type === "candlestick")
  const points = series.filter((s) => s.type === "line" || s.type === "scatter")
  const xAxis = firstOf(option.xAxis) as { data?: unknown[] } | undefined
  const categorySlots = Array.isArray(xAxis?.data) ? xAxis.data.length : 0
  const bandSlots = (list: SeriesSpec[]) =>
    Math.max(categorySlots, maxDataLength(list))

  const density = { slider: false, wheel: false, rowSlider: false }
  if (plotWidth <= 0 && !heatmap) return density
  const include = (
    slots: number,
    fillRatio: number,
    minPx: number,
    width = plotWidth,
  ) => {
    if (slots <= 0) return
    const markPx = (width / slots) * fillRatio
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
  if (heatmap) {
    if (categorySlots > 1) include(categorySlots, 1, MIN_MARK_PX)
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
    if (density.rowSlider && categorySlots > 1) {
      const right = typeof grid?.right === "number" ? grid.right : 0
      include(
        categorySlots,
        1,
        MIN_MARK_PX,
        plotWidth + right - HEATMAP_ROW_SLIDER_GRID_RIGHT,
      )
    }
  }
  return density
}
