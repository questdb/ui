import type {
  ChartConfig,
  ChartType,
  PieShape,
  QueryChart,
} from "../../scenes/Editor/Notebook/CellChart/chartTypes"

import { parseEvents, type EventsWire } from "./dashboardWire"

// Snake-case shapes the agent tools speak, and their mapping to the internal
// camelCase ChartConfig. Shared by set_cell_chart_config and apply_notebook_state.
export type ToolQueryChart = {
  type: ChartType
  y_columns?: string[] | null
  ohlc?: { open: string; high: string; low: string; close: string } | null
  partition_by_column?: string | null
  axis?: "left" | "right" | null
  enabled?: boolean | null
  name?: string | null
  events?: EventsWire | null
  heatmap?: { y: string; value: string } | null
  band?: { lower: string; upper: string } | null
  range?: { start: string; end: string } | null
  box?: {
    min: string
    q1: string
    median: string
    q3: string
    max: string
  } | null
  percent_stack?: boolean | null
  pie_shape?: PieShape | null
  scatter?: { size?: string | null; color?: string | null } | null
}

/** Chart-wide switches, in the agent's words. */
export type ToolChartOptions = {
  horizontal?: boolean | null
  thresholds?: "off" | "lines" | "bands" | null
}

/**
 * The chart-wide switches an agent set, as a patch: null leaves a switch as
 * it is, false and "off" clear it.
 */
export const mapChartOptions = (
  o: ToolChartOptions,
): Pick<ChartConfig, "horizontal" | "thresholds"> => {
  const out: Pick<ChartConfig, "horizontal" | "thresholds"> = {}
  if (o.horizontal != null) out.horizontal = o.horizontal || undefined
  if (o.thresholds != null)
    out.thresholds = o.thresholds === "off" ? undefined : o.thresholds
  return out
}

export type ToolRightAxis = {
  name?: string | null
  min?: number | null
  max?: number | null
}

export const mapQueryChart = (q: ToolQueryChart): QueryChart => {
  const out: QueryChart = { type: q.type, yColumns: q.y_columns ?? [] }
  if (q.ohlc) out.ohlc = q.ohlc
  if (q.partition_by_column) out.partitionByColumn = q.partition_by_column
  if (q.axis) out.axis = q.axis
  if (q.enabled === false) out.enabled = false
  if (q.name) out.name = q.name
  if (q.events) out.events = parseEvents(q.events)
  if (q.heatmap) out.heatmap = q.heatmap
  if (q.band) out.band = q.band
  if (q.range) out.range = q.range
  if (q.box) out.box = q.box
  if (q.percent_stack) out.percentStack = true
  if (q.pie_shape) out.pieShape = q.pie_shape
  if (q.scatter?.size || q.scatter?.color)
    out.scatter = {
      ...(q.scatter.size ? { size: q.scatter.size } : {}),
      ...(q.scatter.color ? { color: q.scatter.color } : {}),
    }
  return out
}

export const mapRightAxis = (ra: ToolRightAxis): ChartConfig["rightAxis"] => {
  const out: NonNullable<ChartConfig["rightAxis"]> = {}
  if (ra.name) out.name = ra.name
  if (ra.min != null) out.min = ra.min
  if (ra.max != null) out.max = ra.max
  return out
}
