import type {
  ChartConfig,
  ChartType,
  QueryChart,
} from "../../scenes/Editor/Notebook/CellChart/chartTypes"

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
  return out
}

export const mapRightAxis = (ra: ToolRightAxis): ChartConfig["rightAxis"] => {
  const out: NonNullable<ChartConfig["rightAxis"]> = {}
  if (ra.name) out.name = ra.name
  if (ra.min != null) out.min = ra.min
  if (ra.max != null) out.max = ra.max
  return out
}
