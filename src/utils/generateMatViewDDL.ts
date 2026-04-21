import {
  parseOne,
  toSql,
  type CreateTableStatement,
  type CreateMaterializedViewStatement,
  type SelectStatement,
  type ExpressionSelectItem,
  type ColumnRef,
  type FunctionCall,
  type ColumnDefinition,
  type SampleByClause,
  type MaterializedViewRefresh,
} from "@questdb/sql-parser"
import { formatSql } from "./formatSql"

const VOLUME_PATTERNS = [
  "volume",
  "vol",
  "count",
  "qty",
  "quantity",
  "amount",
  "size",
  "total",
  "shares",
  "lots",
  "notional",
]

const PRICE_PATTERNS = [
  "price",
  "bid",
  "ask",
  "rate",
  "yield",
  "spread",
  "close",
  "open",
  "high",
  "low",
  "mid",
  "px",
  "premium",
  "discount",
  "fee",
  "cost",
  "margin",
]

const NUMERIC_TYPES = new Set([
  "DOUBLE",
  "FLOAT",
  "INT",
  "INTEGER",
  "LONG",
  "SHORT",
  "BYTE",
  "DECIMAL",
])

const EXCLUDED_TYPE_PREFIXES = ["GEOHASH"]
const EXCLUDED_TYPES = new Set([
  "BINARY",
  "LONG256",
  "LONG128",
  "INTERVAL",
  "TIMESTAMP_NS",
])

const LAST_TYPES = new Set([
  "STRING",
  "VARCHAR",
  "CHAR",
  "BOOLEAN",
  "DATE",
  "TIMESTAMP",
])

const SAMPLE_BY_MAP: Record<string, string> = {
  HOUR: "5m",
  DAY: "1h",
  WEEK: "1d",
  MONTH: "7d",
  YEAR: "1M",
  NONE: "1h",
}

// Docs' "Default partitioning" inference
// (concepts/materialized-views.md): SAMPLE BY > 1h → YEAR, > 1m → MONTH.
const PARTITION_BY_FOR_SAMPLE: Record<
  string,
  CreateMaterializedViewStatement["partitionBy"]
> = {
  "5m": "MONTH",
  "1h": "MONTH",
  "1d": "YEAR",
  "7d": "YEAR",
  "1M": "YEAR",
}

const matchesPattern = (name: string, patterns: string[]): boolean =>
  patterns.some((p) => name.toLowerCase().includes(p))

const mkColumnRef = (name: string): ColumnRef => ({
  type: "column",
  name: { type: "qualifiedName", parts: [name] },
})

const mkFunctionCall = (fnName: string, colName: string): FunctionCall => ({
  type: "function",
  name: fnName,
  args: [mkColumnRef(colName)],
})

const mkSelectItem = (
  expression: ColumnRef | FunctionCall,
  alias?: string,
): ExpressionSelectItem => ({
  type: "selectItem",
  expression,
  alias,
})

const isExcludedType = (dataType: string): boolean => {
  if (dataType.endsWith("[]")) return true
  if (EXCLUDED_TYPES.has(dataType)) return true
  return EXCLUDED_TYPE_PREFIXES.some((p) => dataType.startsWith(p))
}

const buildSelectItem = (
  col: ColumnDefinition,
  designatedTimestamp: string | undefined,
): ExpressionSelectItem | null => {
  const { name, dataType } = col

  // 1. Designated timestamp → passthrough (last in SELECT)
  if (designatedTimestamp && name === designatedTimestamp) {
    return mkSelectItem(mkColumnRef(name))
  }

  // 2. Excluded types
  if (isExcludedType(dataType)) {
    return null
  }

  // 3. SYMBOL → passthrough (group-by dimension)
  if (dataType === "SYMBOL") {
    return mkSelectItem(mkColumnRef(name))
  }

  // 4. UUID, IPV4 → exclude (high cardinality; bad group-by dim)
  if (dataType === "UUID" || dataType === "IPV4") {
    return null
  }

  // 5. Numeric + volume pattern → sum()
  if (NUMERIC_TYPES.has(dataType) && matchesPattern(name, VOLUME_PATTERNS)) {
    return mkSelectItem(mkFunctionCall("sum", name), `sum_${name}`)
  }

  // 6. Numeric + price pattern → last()
  if (NUMERIC_TYPES.has(dataType) && matchesPattern(name, PRICE_PATTERNS)) {
    return mkSelectItem(mkFunctionCall("last", name), `last_${name}`)
  }

  // 7. Other numeric → last()
  if (NUMERIC_TYPES.has(dataType)) {
    return mkSelectItem(mkFunctionCall("last", name), `last_${name}`)
  }

  // 8-9. STRING, VARCHAR, CHAR, BOOLEAN, DATE, TIMESTAMP → last()
  if (LAST_TYPES.has(dataType)) {
    return mkSelectItem(mkFunctionCall("last", name), `last_${name}`)
  }

  // 10. Anything else → exclude
  return null
}

const pickUniqueViewName = (
  base: string,
  existingNames: readonly string[],
): string => {
  const taken = new Set(existingNames.map((n) => n.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) {
    const candidate = `${base}_${i}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

export const generateMatViewDDL = (
  tableDDL: string,
  existingNames: readonly string[] = [],
): string => {
  const stmt = parseOne(tableDDL) as CreateTableStatement
  if (stmt.type !== "createTable") {
    throw new Error("Expected a CREATE TABLE statement")
  }

  const columns = stmt.columns ?? []
  const tableName = stmt.table.parts[stmt.table.parts.length - 1]
  const designatedTimestamp = stmt.timestamp
  const partition = stmt.partitionBy ?? "NONE"
  const interval = SAMPLE_BY_MAP[partition] ?? "1h"
  const viewName = pickUniqueViewName(`${tableName}_${interval}`, existingNames)

  // Build select items, keeping designated timestamp last
  const nonTimestampItems: ExpressionSelectItem[] = []
  let timestampItem: ExpressionSelectItem | null = null

  for (const col of columns) {
    const item = buildSelectItem(col, designatedTimestamp)
    if (!item) continue
    if (designatedTimestamp && col.name === designatedTimestamp) {
      timestampItem = item
    } else {
      nonTimestampItems.push(item)
    }
  }

  const selectItems: ExpressionSelectItem[] = [
    ...nonTimestampItems,
    ...(timestampItem ? [timestampItem] : []),
  ]

  const sampleBy: SampleByClause = {
    type: "sampleBy",
    duration: interval,
  }

  const selectStmt: SelectStatement = {
    type: "select",
    columns: selectItems,
    from: [
      {
        type: "tableRef",
        table: { type: "qualifiedName", parts: [tableName] },
      },
    ],
    sampleBy,
  }

  const refresh: MaterializedViewRefresh = {
    type: "materializedViewRefresh",
    mode: "immediate",
  }

  const matViewStmt: CreateMaterializedViewStatement = {
    type: "createMaterializedView",
    view: {
      type: "qualifiedName",
      parts: [viewName],
    },
    refresh,
    query: selectStmt,
    asParens: true,
    partitionBy: PARTITION_BY_FOR_SAMPLE[interval],
  }

  // OWNED BY: inherit from source
  if (stmt.ownedBy) {
    matViewStmt.ownedBy = stmt.ownedBy
  }

  const header =
    "-- Change sampling, partitioning, and column aggregates as needed."

  return `${header}\n${formatSql(toSql(matViewStmt))};`
}
