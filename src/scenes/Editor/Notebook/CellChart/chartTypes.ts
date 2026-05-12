export const CHART_TYPES = [
  "line",
  "area",
  "bar",
  "stackedBar",
  "scatter",
  "pie",
  "candlestick",
] as const

export type ChartType = (typeof CHART_TYPES)[number]

export type ColumnRole = "temporal" | "numeric" | "categorical" | "other"

export type ChartConfig = {
  type: ChartType
  xColumn: string | null
  yColumns: string[]
  // For candlestick — explicit OHLC mapping
  ohlc?: {
    open: string
    high: string
    low: string
    close: string
  }
  autoRefresh?: boolean
  // Categorical column whose distinct values become separate series — the
  // long-format pivot QuestDB users know as `PARTITION BY`. With this set,
  // every distinct value of the column produces its own line.
  partitionByColumn?: string
  // User-provided chart name, rendered as the echarts title. When empty a
  // placeholder is shown instead.
  name?: string
}
