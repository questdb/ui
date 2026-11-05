import type {
  AxisBounds,
  ChartType,
  QueryChart,
} from "../../scenes/Editor/Notebook/CellChart/chartTypes"
import { axisBoundsError } from "../../scenes/Editor/Notebook/CellChart/chartSettingsRules"

// Snake-case shapes the agent tools speak, and their mapping to the internal
// camelCase ChartConfig. Shared by set_cell_chart_config and apply_notebook_state.
export type ToolQueryChart = {
  type: ChartType
  y_columns?: string[] | null
  ohlc?: { open: string; high: string; low: string; close: string } | null
  volume?: string | null
  partition_by_column?: string | null
  axis?: "left" | "right" | null
  enabled?: boolean | null
  name?: string | null
}

export type ToolAxisBounds = {
  name?: string | null
  min?: number | null
  max?: number | null
}

export const mapQueryChart = (q: ToolQueryChart): QueryChart => {
  const out: QueryChart = { type: q.type, yColumns: q.y_columns ?? [] }
  if (q.ohlc) out.ohlc = q.ohlc
  if (q.volume) out.volume = q.volume
  if (q.partition_by_column) out.partitionByColumn = q.partition_by_column
  if (q.axis) out.axis = q.axis
  if (q.enabled === false) out.enabled = false
  if (q.name) out.name = q.name
  return out
}

export const mapAxisBounds = (axis: ToolAxisBounds): AxisBounds => {
  const out: AxisBounds = {}
  if (axis.name) out.name = axis.name
  if (axis.min != null) out.min = axis.min
  if (axis.max != null) out.max = axis.max
  return out
}

export const axisBoundsValidationError = (axes: {
  left_axis?: ToolAxisBounds | null
  right_axis?: ToolAxisBounds | null
}): string | null => {
  for (const key of ["left_axis", "right_axis"] as const) {
    const axis = axes[key]
    if (axis && axisBoundsError(mapAxisBounds(axis)))
      return `VALIDATION_ERROR: ${key}.min must be below ${key}.max. Set either to null for autoscale.`
  }
  return null
}
