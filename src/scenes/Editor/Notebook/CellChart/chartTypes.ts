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
  "band",
  "rangeBar",
  "boxplot",
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
  // type "heatmap": cells of x × y, coloured by value.
  heatmap?: HeatmapColumns
  // type "band": the area between two columns; yColumns draw as lines in it.
  band?: BandColumns
  // type "rangeBar": a bar from start to end per x. With times for start and
  // end it lies down: one lane per x value, along a time axis (a Gantt).
  range?: RangeColumns
  // type "boxplot": a box and whiskers per x, from quartiles the query
  // computes (approx_percentile).
  box?: BoxColumns
  // area / stackedBar: each x's series add up to 100 %.
  percentStack?: boolean
  // pie: a full pie, a ring, or a half ring.
  pieShape?: PieShape
  // scatter: columns for the points' size and colour (a number scale).
  scatter?: ScatterColumns
  partitionByColumn?: string
  axis?: SeriesAxis
  enabled?: boolean
  name?: string
  // type "events": this statement's rows are markers on the time axis, not a
  // series. Each column defaults by position: time, then label.
  events?: EventColumns
}

export const PIE_SHAPES = ["pie", "donut", "halfDonut"] as const
export type PieShape = (typeof PIE_SHAPES)[number]

export type ScatterColumns = { size?: string; color?: string }

export const THRESHOLD_MARKS = ["lines", "bands"] as const
export type ThresholdMarks = (typeof THRESHOLD_MARKS)[number]

export type HeatmapColumns = { y: string; value: string }
export type BandColumns = { lower: string; upper: string }
export type RangeColumns = { start: string; end: string }
export type BoxColumns = {
  min: string
  q1: string
  median: string
  q3: string
  max: string
}

/** The columns each of these types reads, and what each is called. */
export const ROLE_COLUMNS = {
  heatmap: [
    ["y", "Y (rows)"],
    ["value", "Value (colour)"],
  ],
  band: [
    ["lower", "Lower edge"],
    ["upper", "Upper edge"],
  ],
  rangeBar: [
    ["start", "Start"],
    ["end", "End"],
  ],
  boxplot: [
    ["min", "Min"],
    ["q1", "Lower quartile"],
    ["median", "Median"],
    ["q3", "Upper quartile"],
    ["max", "Max"],
  ],
} as const

export type RoleChartType = keyof typeof ROLE_COLUMNS

/** The QueryChart field holding a role chart's columns. */
export const ROLE_FIELD = {
  heatmap: "heatmap",
  band: "band",
  rangeBar: "range",
  boxplot: "box",
} as const

export const isRoleChartType = (type: ChartType): type is RoleChartType =>
  Object.hasOwn(ROLE_COLUMNS, type)

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
  // Bars lying along y: the x column runs down the side. Only when every
  // series is a bar, stacked bar or range bar.
  horizontal?: boolean
  // The left axis's format thresholds drawn as lines or shaded bands.
  thresholds?: ThresholdMarks
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
  "uptime",
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
  // uptime: how many bars the time range splits into (fewer when narrow).
  buckets?: number
  // stateTimeline / uptime: what a state means, when its name does not say.
  severity?: Record<string, StateSeverity>
}

export const STATE_SEVERITIES = ["good", "neutral", "warning", "bad"] as const
export type StateSeverity = (typeof STATE_SEVERITIES)[number]

export type CustomChartConfig = {
  option: Record<string, unknown>
}
