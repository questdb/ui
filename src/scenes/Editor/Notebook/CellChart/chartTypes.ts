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
  "events",
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
  partitionByColumn?: string
  axis?: SeriesAxis
  enabled?: boolean
  name?: string
  // type "events": this statement's rows are markers on the time axis, not a
  // series. Each column defaults by position: time, then label.
  events?: EventColumns
}

export type EventColumns = {
  /** When the event happened, or when its range starts. */
  time?: string
  /** End of a range; without it each event is a single line. */
  end?: string
  label?: string
  /** A column holding tone names (positive, warning, negative, ...). */
  tone?: string
}

export type ChartConfig = {
  xColumn: string | null
  queries: (QueryChart | null)[]
  rightAxis?: { name?: string; min?: number; max?: number }
  // A component (stat tile, order book, gauge, ...) drawn from the cell's
  // statements instead of the preset chart.
  visual?: VisualConfig
  // An ECharts option written as JSON, drawn instead of the preset chart.
  // The console supplies the data and the styling.
  custom?: CustomChartConfig
}

export const VISUAL_TYPES = [
  "stat",
  "gauge",
  "bullet",
  "orderBook",
  "stateTimeline",
  "treemap",
  "sunburst",
  "graph",
  "sankey",
  "chord",
  "map",
  "liquidityHeatmap",
  "volumeProfile",
  "planTree",
] as const

export type VisualType = (typeof VISUAL_TYPES)[number]

// Column roles a visual reads. Every role defaults by position when unset, so
// a query that returns its columns in the documented order needs no mapping.
export type VisualColumns = {
  value?: string
  label?: string
  // stat: a line of context under the value, e.g. "254 use WAL".
  caption?: string
  change?: string
  target?: string
  time?: string
  end?: string
  lane?: string
  state?: string
  path?: string[]
  from?: string
  to?: string
  lat?: string
  lon?: string
  region?: string
  price?: string
  size?: string
  buy?: string
  sell?: string
  text?: string
}

export type VisualConfig = {
  type: VisualType
  columns?: VisualColumns
  min?: number
  max?: number
  // stat: the statement whose rows draw the sparkline (time, value).
  sparklineQuery?: number
}

export type CustomChartConfig = {
  option: Record<string, unknown>
}
