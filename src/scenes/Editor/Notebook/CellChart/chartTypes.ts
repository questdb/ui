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
] as const

export type ChartType = (typeof CHART_TYPES)[number]

export type ColumnRole = "temporal" | "numeric" | "categorical" | "other"

export type SeriesAxis = "left" | "right"

export type QueryChart = {
  type: ChartType
  yColumns: string[]
  ohlc?: {
    open: string
    high: string
    low: string
    close: string
  }
  volume?: string
  partitionByColumn?: string
  axis?: SeriesAxis
  enabled?: boolean
  name?: string
}

export type AxisBounds = { name?: string; min?: number; max?: number }

export type CandlePalette = { up: string; down: string; neutral: string }

export type ChartConfig = {
  xColumn: string | null
  queries: (QueryChart | null)[]
  leftAxis?: AxisBounds
  rightAxis?: AxisBounds
}
