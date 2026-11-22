export const CHART_TYPES = [
  "line",
  "area",
  "stepLine",
  "stepArea",
  "bar",
  "stackedBar",
  "scatter",
  "pie",
  "candlestick",
  "heatmap",
] as const

export type ChartType = (typeof CHART_TYPES)[number]

export type ColumnRole = "temporal" | "numeric" | "categorical" | "other"

export type SeriesAxis = "left" | "right"

// How a heatmap colors its cells: on one scale for the whole chart, or each
// row on its own, so rows of very different size all show their contrast.
export type HeatmapColorScale = "chart" | "row"

// A heatmap reads its x from the chart's x column, its rows from
// `partitionByColumn` and its cell values from the first of `yColumns`.
export type QueryChart = {
  type: ChartType
  yColumns: string[]
  ohlc?: {
    open: string
    high: string
    low: string
    close: string
  }
  partitionByColumn?: string
  axis?: SeriesAxis
  enabled?: boolean
  name?: string
  // Heatmap only; "chart" when unset.
  colorScale?: HeatmapColorScale
}

// A horizontal line at a fixed value, like RSI's 30 and 70.
export type ReferenceLine = {
  value: number
  axis?: SeriesAxis
  label?: string
}

export type ChartConfig = {
  xColumn: string | null
  queries: (QueryChart | null)[]
  rightAxis?: { name?: string; min?: number; max?: number }
  referenceLines?: ReferenceLine[]
}

// What a query of this type is missing to render; null when nothing is.
export const missingQueryFields = (q: QueryChart): string | null => {
  if (q.type === "candlestick" && !q.ohlc) return "an ohlc mapping"
  if (q.type === "heatmap" && q.enabled !== false) {
    if (!q.partitionByColumn) return "a partition_by_column for its rows"
    if (q.yColumns.length === 0) return "a y_columns value column"
  }
  return null
}

export type ChartSettingsDraft = ChartConfig & {
  // Heatmap Value edits must not replace the series of the previous type.
  heatmapValues?: Partial<Record<number, string>>
}

export type ChartZoomAxis = "x" | "y"
export type ZoomWindow = { start: number; end: number }
export type ChartZoomWindows = Partial<Record<ChartZoomAxis, ZoomWindow>>

export const isZoomed = (start: number, end: number) => start > 0 || end < 100

export const withChartZoom = (
  windows: ChartZoomWindows | undefined,
  axis: ChartZoomAxis,
  start: number,
  end: number,
): ChartZoomWindows | undefined => {
  if (isZoomed(start, end)) {
    if (windows?.[axis]?.start === start && windows[axis].end === end)
      return windows
    return { ...windows, [axis]: { start, end } }
  }
  if (!windows?.[axis]) return windows
  const next = { ...windows }
  delete next[axis]
  return next.x || next.y ? next : undefined
}
