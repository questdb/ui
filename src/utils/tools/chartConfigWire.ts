import type {
  ChartConfig,
  ChartType,
  QueryChart,
  ReferenceLine,
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

export type ToolReferenceLine = {
  value: number
  axis?: "left" | "right" | null
  label?: string | null
}

export const mapReferenceLines = (
  lines: ToolReferenceLine[],
): ReferenceLine[] =>
  lines
    .filter((line) => Number.isFinite(line.value))
    .map((line) => ({
      value: line.value,
      ...(line.axis === "right" && { axis: "right" as const }),
      ...(line.label && { label: line.label }),
    }))

// A right-axis line is drawn in the units of the queries on that axis, so a
// chart without an enabled one hides it. This one rule decides such lines for
// every surface that saves a chart config: the tools refuse a config with one
// instead of reporting success for a line nobody sees, and the chart settings
// drop them on save, whatever the chart type, so that the tools accept every
// config the settings save.
export const RIGHT_AXIS_LINE_WITHOUT_QUERY =
  "a reference line uses the right axis, but no enabled query is on the right axis. Put a query on the right axis, or draw the line on the left."

export const hasEnabledRightAxisQuery = (
  queries: ChartConfig["queries"],
): boolean => queries.some((q) => q?.axis === "right" && q.enabled !== false)

const isRightAxisLineWithoutQuery = (
  line: ReferenceLine,
  queries: ChartConfig["queries"],
): boolean => line.axis === "right" && !hasEnabledRightAxisQuery(queries)

export const hasRightAxisLineWithoutQuery = (
  config: Pick<ChartConfig, "queries" | "referenceLines">,
): boolean =>
  (config.referenceLines ?? []).some((line) =>
    isRightAxisLineWithoutQuery(line, config.queries),
  )

export const dropRightAxisLinesWithoutQuery = (
  config: Pick<ChartConfig, "queries" | "referenceLines">,
): ReferenceLine[] | undefined =>
  config.referenceLines?.filter(
    (line) => !isRightAxisLineWithoutQuery(line, config.queries),
  )

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
