import { parseToAst } from "@questdb/sql-parser"
import { maskParserBlockComments } from "../../../../utils/parserSql"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type {
  BandColumns,
  BoxColumns,
  ChartType,
  ColumnRole,
  HeatmapColumns,
  QueryChart,
  RangeColumns,
  RoleChartType,
} from "./chartTypes"

export type InferredChart = { xColumn: string | null; chart: QueryChart }

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

export const MAX_DEFAULT_SERIES = 10
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

export const findOhlc = (
  numeric: ColumnDefinition[],
): QueryChart["ohlc"] | undefined => {
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
    const { ast } = parseToAst(maskParserBlockComments(query))
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
): InferredChart => {
  const groups = groupColumns(columns)
  const hints = parseQueryHints(query)

  const capSeries = (cols: ColumnDefinition[]): string[] =>
    cols.slice(0, MAX_DEFAULT_SERIES).map((c) => c.name)

  if (groups.temporal.length > 0 && groups.numeric.length >= 4) {
    const ohlc = findOhlc(groups.numeric)
    if (ohlc) {
      return {
        xColumn: groups.temporal[0].name,
        chart: {
          type: "candlestick",
          yColumns: [ohlc.open, ohlc.high, ohlc.low, ohlc.close],
          ohlc,
        },
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
        xColumn: groups.temporal[0].name,
        chart: {
          type: "line",
          yColumns: capSeries(groups.numeric),
          partitionByColumn: catCol.name,
        },
      }
    }
  }

  if (groups.temporal.length > 0 && groups.numeric.length > 0) {
    return {
      xColumn: groups.temporal[0].name,
      chart: { type: "line", yColumns: capSeries(groups.numeric) },
    }
  }

  if (
    hints.hasLatest &&
    groups.categorical.length > 0 &&
    groups.numeric.length > 0
  ) {
    return {
      xColumn: groups.categorical[0].name,
      chart: { type: "bar", yColumns: capSeries(groups.numeric) },
    }
  }

  if (groups.categorical.length > 0 && groups.numeric.length === 1) {
    const xIdx = columns.findIndex((c) => c.name === groups.categorical[0].name)
    if (xIdx >= 0 && distinctCount(dataset, xIdx) < PIE_THRESHOLD) {
      return {
        xColumn: groups.categorical[0].name,
        chart: { type: "pie", yColumns: [groups.numeric[0].name] },
      }
    }
  }

  if (groups.categorical.length > 0 && groups.numeric.length > 0) {
    return {
      xColumn: groups.categorical[0].name,
      chart: { type: "bar", yColumns: capSeries(groups.numeric) },
    }
  }

  if (groups.numeric.length >= 2 && groups.temporal.length === 0) {
    return {
      xColumn: groups.numeric[0].name,
      chart: { type: "scatter", yColumns: capSeries(groups.numeric.slice(1)) },
    }
  }

  const x = columns[0]?.name ?? null
  const ys = columns.slice(1, 1 + MAX_DEFAULT_SERIES).map((c) => c.name)
  return { xColumn: x, chart: { type: "bar", yColumns: ys } }
}

export const availableChartTypes = (
  groups: ColumnGroups,
  hasOhlc: boolean,
): ChartType[] => {
  const types: ChartType[] = []
  const hasNumeric = groups.numeric.length > 0
  const hasTemporal = groups.temporal.length > 0
  const hasCategorical = groups.categorical.length > 0
  if (hasNumeric && (hasTemporal || hasCategorical)) {
    types.push("line", "area", "stepLine", "stepArea", "bar", "stackedBar")
  } else if (groups.numeric.length >= 2) {
    types.push("line", "area", "stepLine", "stepArea")
  }
  if (
    hasNumeric &&
    (groups.numeric.length >= 2 || hasTemporal || hasCategorical)
  )
    types.push("scatter")
  if (hasNumeric && hasCategorical) types.push("pie")
  if (hasTemporal && (hasOhlc || groups.numeric.length >= 4))
    types.push("candlestick")
  const hasAxis = hasTemporal || hasCategorical
  const columnCount =
    groups.temporal.length +
    groups.numeric.length +
    groups.categorical.length +
    groups.other.length
  if (hasNumeric && columnCount >= 3) types.push("heatmap")
  if (groups.numeric.length >= 2 && (hasAxis || groups.numeric.length >= 3))
    types.push("band")
  if (
    (groups.numeric.length >= 2 && hasAxis) ||
    (groups.temporal.length >= 2 && hasCategorical)
  )
    types.push("rangeBar")
  if (groups.numeric.length >= 5 && hasAxis) types.push("boxplot")
  return types.length ? types : ["bar"]
}

const LOWER = /(^|_)(lo|low|lower|min|floor|bottom|p0?1|p0?5|p10)($|_)/i
const UPPER = /(^|_)(hi|high|upper|max|ceil|top|p90|p95|p99)($|_)/i
const START = /(^|_)(start|begin|from|since|opened?|s)($|_)/i
const END = /(^|_)(end|finish|to|until|closed?|e)($|_)/i
const BOX: [keyof BoxColumns, RegExp][] = [
  ["min", /(^|_)(min|lo|low|p0)($|_)/i],
  ["q1", /(^|_)(q1|p25|lower_quartile)($|_)/i],
  ["median", /(^|_)(median|med|p50|q2)($|_)/i],
  ["q3", /(^|_)(q3|p75|upper_quartile)($|_)/i],
  ["max", /(^|_)(max|hi|high|p100)($|_)/i],
]

const named = (columns: ColumnDefinition[], pattern: RegExp) =>
  columns.find((c) => pattern.test(c.name))?.name

const pair = (
  columns: ColumnDefinition[],
  first: RegExp,
  second: RegExp,
): [string, string] | undefined => {
  if (columns.length < 2) return undefined
  const a = named(columns, first)
  const b = named(
    columns.filter((c) => c.name !== a),
    second,
  )
  if (a && b) return [a, b]
  return [columns[0].name, columns[1].name]
}

/**
 * The columns a heatmap, band, range bar or boxplot reads, guessed from names
 * (low/high, start/end, q1/median/q3) and kinds, for a query that does not
 * set them. Undefined when the result cannot draw it.
 */
export const guessRoleColumns = (
  type: RoleChartType,
  columns: ColumnDefinition[],
  xColumn: string | null,
): HeatmapColumns | BandColumns | RangeColumns | BoxColumns | undefined => {
  const rest = columns.filter((c) => c.name !== xColumn)
  const groups = groupColumns(rest)
  switch (type) {
    case "heatmap": {
      const y = groups.categorical[0] ?? groups.temporal[0] ?? groups.numeric[0]
      const value = groups.numeric.find((c) => c.name !== y?.name)
      return y && value ? { y: y.name, value: value.name } : undefined
    }
    case "band": {
      const found = pair(groups.numeric, LOWER, UPPER)
      return found ? { lower: found[0], upper: found[1] } : undefined
    }
    case "rangeBar": {
      const found =
        pair(groups.temporal, START, END) ?? pair(groups.numeric, LOWER, UPPER)
      return found ? { start: found[0], end: found[1] } : undefined
    }
    case "boxplot": {
      if (groups.numeric.length < 5) return undefined
      const byName = BOX.map(([, pattern]) => named(groups.numeric, pattern))
      if (byName.every(Boolean) && new Set(byName).size === 5) {
        const [min, q1, median, q3, max] = byName as string[]
        return { min, q1, median, q3, max }
      }
      const [min, q1, median, q3, max] = groups.numeric.map((c) => c.name)
      return { min, q1, median, q3, max }
    }
  }
}
