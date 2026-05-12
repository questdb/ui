import { parseToAst } from "@questdb/sql-parser"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type { ChartConfig, ChartType, ColumnRole } from "./chartTypes"

const TEMPORAL = new Set(["TIMESTAMP", "TIMESTAMP_NS", "DATE"])
const NUMERIC = new Set([
  "DOUBLE",
  "FLOAT",
  "INT",
  "LONG",
  "SHORT",
  "BYTE",
  "DECIMAL",
])
const CATEGORICAL = new Set(["SYMBOL", "STRING", "VARCHAR", "CHAR", "BOOLEAN"])

const MAX_DEFAULT_SERIES = 8
const PIE_THRESHOLD = 12
export const MAX_AUTO_PARTITION_CARDINALITY = 20
export const MAX_PARTITION_SERIES = 30

export const classifyColumn = (col: ColumnDefinition): ColumnRole => {
  const t = col.type?.toUpperCase()
  if (!t) return "other"
  if (TEMPORAL.has(t)) return "temporal"
  if (NUMERIC.has(t)) return "numeric"
  if (CATEGORICAL.has(t)) return "categorical"
  return "other"
}

export type ColumnGroups = {
  temporal: ColumnDefinition[]
  numeric: ColumnDefinition[]
  categorical: ColumnDefinition[]
  other: ColumnDefinition[]
}

export const groupColumns = (columns: ColumnDefinition[]): ColumnGroups => {
  const groups: ColumnGroups = {
    temporal: [],
    numeric: [],
    categorical: [],
    other: [],
  }
  for (const col of columns) {
    groups[classifyColumn(col)].push(col)
  }
  return groups
}

export const isResultChartable = (columns: ColumnDefinition[]): boolean => {
  const g = groupColumns(columns)
  return (
    g.numeric.length > 0 || g.categorical.length > 0 || g.temporal.length > 0
  )
}

const findOhlc = (
  numeric: ColumnDefinition[],
): ChartConfig["ohlc"] | undefined => {
  const byName = new Map<string, string>()
  for (const c of numeric) byName.set(c.name.toLowerCase(), c.name)
  const open = byName.get("open")
  const high = byName.get("high")
  const low = byName.get("low")
  const close = byName.get("close")
  if (open && high && low && close) return { open, high, low, close }
  return undefined
}

type QueryHints = {
  hasSampleBy?: boolean
  hasLatest?: boolean
}

// AST-based so SAMPLE BY / LATEST ON in literals/comments/subqueries
// don't false-positive. `LATEST BY <col>` (legacy) also maps to latestOn.
const parseQueryHints = (query: string): QueryHints => {
  try {
    const { ast } = parseToAst(query)
    const topSelect = ast.find((s) => s?.type === "select")
    if (topSelect?.type !== "select") return {}
    return {
      hasSampleBy: !!topSelect.sampleBy,
      hasLatest: !!topSelect.latestOn,
    }
  } catch {
    return {}
  }
}

const distinctCount = (
  dataset: (boolean | string | number | null)[][],
  colIndex: number,
  cap = PIE_THRESHOLD,
): number => {
  const seen = new Set<unknown>()
  for (const row of dataset) {
    seen.add(row[colIndex])
    if (seen.size > cap) return seen.size
  }
  return seen.size
}

export const inferChartConfig = (
  columns: ColumnDefinition[],
  dataset: (boolean | string | number | null)[][],
  query: string,
): ChartConfig => {
  const groups = groupColumns(columns)
  const hints = parseQueryHints(query)

  const capSeries = (cols: ColumnDefinition[]): string[] =>
    cols.slice(0, MAX_DEFAULT_SERIES).map((c) => c.name)

  if (groups.temporal.length > 0 && groups.numeric.length >= 4) {
    const ohlc = findOhlc(groups.numeric)
    if (ohlc) {
      return {
        type: "candlestick",
        xColumn: groups.temporal[0].name,
        yColumns: [ohlc.open, ohlc.high, ohlc.low, ohlc.close],
        ohlc,
      }
    }
  }

  if (
    groups.temporal.length > 0 &&
    groups.categorical.length > 0 &&
    groups.numeric.length > 0
  ) {
    const catCol = groups.categorical[0]
    const catIdx = columns.findIndex((c) => c.name === catCol.name)
    if (
      catIdx >= 0 &&
      distinctCount(dataset, catIdx, MAX_AUTO_PARTITION_CARDINALITY) <=
        MAX_AUTO_PARTITION_CARDINALITY
    ) {
      return {
        type: "line",
        xColumn: groups.temporal[0].name,
        yColumns: capSeries(groups.numeric),
        partitionByColumn: catCol.name,
      }
    }
  }

  if (groups.temporal.length > 0 && groups.numeric.length > 0) {
    return {
      type: "line",
      xColumn: groups.temporal[0].name,
      yColumns: capSeries(groups.numeric),
    }
  }

  if (
    hints.hasLatest &&
    groups.categorical.length > 0 &&
    groups.numeric.length > 0
  ) {
    return {
      type: "bar",
      xColumn: groups.categorical[0].name,
      yColumns: capSeries(groups.numeric),
    }
  }

  if (groups.categorical.length > 0 && groups.numeric.length === 1) {
    const xIdx = columns.findIndex((c) => c.name === groups.categorical[0].name)
    if (xIdx >= 0 && distinctCount(dataset, xIdx) < PIE_THRESHOLD) {
      return {
        type: "pie",
        xColumn: groups.categorical[0].name,
        yColumns: [groups.numeric[0].name],
      }
    }
  }

  if (groups.categorical.length > 0 && groups.numeric.length > 0) {
    return {
      type: "bar",
      xColumn: groups.categorical[0].name,
      yColumns: capSeries(groups.numeric),
    }
  }

  if (groups.numeric.length >= 2 && groups.temporal.length === 0) {
    return {
      type: "scatter",
      xColumn: groups.numeric[0].name,
      yColumns: capSeries(groups.numeric.slice(1)),
    }
  }

  const x = columns[0]?.name ?? null
  const ys = columns.slice(1, 1 + MAX_DEFAULT_SERIES).map((c) => c.name)
  return {
    type: "bar",
    xColumn: x,
    yColumns: ys,
  }
}

export const ensureChartConfig = (
  existing: ChartConfig | undefined,
  columns: ColumnDefinition[],
  dataset: (boolean | string | number | null)[][],
  query: string,
): ChartConfig => existing ?? inferChartConfig(columns, dataset, query)

export const __testing = { parseQueryHints, findOhlc }

export const availableChartTypes = (
  groups: ColumnGroups,
  hasOhlc: boolean,
): ChartType[] => {
  const types: ChartType[] = []
  const hasNumeric = groups.numeric.length > 0
  const hasTemporal = groups.temporal.length > 0
  const hasCategorical = groups.categorical.length > 0
  if (hasNumeric && (hasTemporal || hasCategorical)) {
    types.push("line", "area", "bar", "stackedBar")
  }
  if (hasNumeric && groups.numeric.length >= 2) types.push("scatter")
  if (hasNumeric && hasCategorical) types.push("pie")
  if (hasOhlc && hasTemporal) types.push("candlestick")
  return types.length ? types : ["bar"]
}
