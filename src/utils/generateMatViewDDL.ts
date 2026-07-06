import {
  parseOne,
  toSql,
  type CreateTableStatement,
  type CreateMaterializedViewStatement,
  type SelectStatement,
  type SelectItem,
  type ExpressionSelectItem,
  type ColumnRef,
  type FunctionCall,
  type ColumnDefinition,
  type SampleByClause,
  type MaterializedViewRefresh,
  type StoragePolicy,
} from "@questdb/sql-parser"
import { formatSql } from "./formatSql"

type TTLUnit = "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
type TTLAst = { value: number; unit: TTLUnit }

const PRESERVED_AGGREGATES = new Set([
  "min",
  "max",
  "sum",
  "ksum",
  "nsum",
  "first",
  "first_not_null",
  "last",
  "last_not_null",
  "bool_and",
  "bool_or",
  "bit_and",
  "bit_or",
  "bit_xor",
  "string_agg",
])

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

const EXCLUDED_TYPES = new Set(["BINARY", "LONG128", "INTERVAL"])

const LAST_TYPES = new Set([
  "STRING",
  "VARCHAR",
  "CHAR",
  "BOOLEAN",
  "DATE",
  "TIMESTAMP",
  "TIMESTAMP_NS",
  "LONG256",
  "UUID",
  "IPV4",
])

const SAMPLE_BY_MAP: Record<string, string> = {
  HOUR: "5m",
  DAY: "1h",
  WEEK: "1d",
  MONTH: "7d",
  YEAR: "1M",
  NONE: "1h",
}

const INTERVAL_LADDER = [
  "1s",
  "5s",
  "30s",
  "1m",
  "5m",
  "30m",
  "1h",
  "6h",
  "1d",
  "7d",
  "1M",
  "1y",
] as const

const TTL_LADDER = ["1h", "6h", "1d", "7d", "1M", "1y"] as const

const PARTITION_BY_FOR_SAMPLE: Record<
  string,
  CreateMaterializedViewStatement["partitionBy"]
> = {
  "1s": "DAY",
  "5s": "DAY",
  "30s": "DAY",
  "1m": "DAY",
  "5m": "MONTH",
  "30m": "MONTH",
  "1h": "MONTH",
  "6h": "YEAR",
  "1d": "YEAR",
  "7d": "YEAR",
  "1M": "YEAR",
  "1y": "YEAR",
}

const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
  // Approximations — used only to order intervals against the ladder.
  M: 30 * 24 * 60 * 60,
  y: 365 * 24 * 60 * 60,
}

const INTERVAL_RE = /^(\d+)([smhdMy])$/
const YEAR_RE = /^(\d+)y$/

const TTL_UNIT_TO_LETTER: Partial<Record<TTLUnit, string>> = {
  HOURS: "h",
  DAYS: "d",
  MONTHS: "M",
  YEARS: "y",
}

const TTL_LETTER_TO_UNIT: Record<string, TTLUnit> = {
  h: "HOURS",
  d: "DAYS",
  M: "MONTHS",
  y: "YEARS",
}

const PARTITION_INFO: Partial<
  Record<string, { interval: string; ttlUnit: TTLUnit }>
> = {
  DAY: { interval: "1d", ttlUnit: "DAYS" },
  MONTH: { interval: "1M", ttlUnit: "MONTHS" },
  YEAR: { interval: "1y", ttlUnit: "YEARS" },
}

const HEADER =
  "-- Review SAMPLE BY, PARTITION BY, TTL, refresh clause, and aggregates before running."

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const toSeconds = (interval: string): number | null => {
  const m = INTERVAL_RE.exec(interval)
  if (!m) return null
  return Number(m[1]) * UNIT_SECONDS[m[2]]
}

const nextOnLadder = (
  current: string,
  ladder: readonly string[],
  fallback: string,
): string => {
  const yMatch = YEAR_RE.exec(current)
  if (yMatch) return `${Number(yMatch[1]) + 1}y`

  const srcSec = toSeconds(current)
  if (srcSec == null) return fallback

  for (const rung of ladder) {
    const rungSec = toSeconds(rung)
    if (rungSec != null && rungSec > srcSec) return rung
  }
  const years = Math.floor(srcSec / UNIT_SECONDS.y) + 1
  return `${years}y`
}

const nextInterval = (current: string): string =>
  nextOnLadder(current, INTERVAL_LADDER, "1h")

const nextTTL = (current: string): string =>
  nextOnLadder(current, TTL_LADDER, "1h")

const ttlToLadderString = (ttl: TTLAst): string | null => {
  if (ttl.unit === "WEEKS") return `${ttl.value * 7}d`
  const letter = TTL_UNIT_TO_LETTER[ttl.unit]
  return letter ? `${ttl.value}${letter}` : null
}

const ladderStringToTTL = (s: string): TTLAst | null => {
  const m = INTERVAL_RE.exec(s)
  if (!m) return null
  const unit = TTL_LETTER_TO_UNIT[m[2]]
  if (!unit) return null
  return { value: Number(m[1]), unit }
}

const partitionInfo = (
  partition: CreateMaterializedViewStatement["partitionBy"],
) => (partition ? PARTITION_INFO[partition] : undefined)

const partitionFor = (
  interval: string,
): CreateMaterializedViewStatement["partitionBy"] => {
  const mapped = PARTITION_BY_FOR_SAMPLE[interval]
  if (mapped) return mapped
  if (YEAR_RE.test(interval)) return "YEAR"
  return "MONTH"
}

const deriveNextTTL = (
  src: TTLAst | undefined,
  partition: CreateMaterializedViewStatement["partitionBy"],
): TTLAst | null => {
  if (!src) return null
  const srcStr = ttlToLadderString(src)
  if (!srcStr) return null

  const info = partitionInfo(partition)
  const srcSec = toSeconds(srcStr)
  const partSec = info ? toSeconds(info.interval) : null
  const baseline =
    info && srcSec != null && partSec != null && partSec > srcSec
      ? info.interval
      : srcStr

  return ladderStringToTTL(nextTTL(baseline))
}

const projectRetention = (
  src: { ttl?: TTLAst; storagePolicy?: StoragePolicy },
  partitionBy: CreateMaterializedViewStatement["partitionBy"],
): Pick<CreateMaterializedViewStatement, "ttl"> => {
  const retention = src.storagePolicy ? src.storagePolicy.dropLocal : src.ttl
  return { ttl: deriveNextTTL(retention, partitionBy) ?? undefined }
}

const matchesPattern = (name: string, patterns: string[]): boolean =>
  patterns.some((p) => name.toLowerCase().includes(p))

const isLastType = (dataType: string): boolean =>
  LAST_TYPES.has(dataType) || dataType.startsWith("GEOHASH")

const isExcludedType = (dataType: string): boolean =>
  dataType.endsWith("[]") || EXCLUDED_TYPES.has(dataType)

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

const buildSelectItem = (
  col: ColumnDefinition,
): ExpressionSelectItem | null => {
  const { name, dataType } = col
  if (isExcludedType(dataType)) return null
  if (dataType === "SYMBOL") return mkSelectItem(mkColumnRef(name))
  if (NUMERIC_TYPES.has(dataType) && matchesPattern(name, VOLUME_PATTERNS)) {
    return mkSelectItem(mkFunctionCall("sum", name), `sum_${name}`)
  }
  if (NUMERIC_TYPES.has(dataType) && matchesPattern(name, PRICE_PATTERNS)) {
    return mkSelectItem(mkFunctionCall("last", name), `last_${name}`)
  }
  if (NUMERIC_TYPES.has(dataType) || isLastType(dataType)) {
    return mkSelectItem(mkFunctionCall("last", name), `last_${name}`)
  }
  return null
}

const outputName = (item: ExpressionSelectItem): string | null => {
  if (item.alias) return item.alias
  const e = item.expression
  if (e.type === "column") {
    const parts = e.name.parts
    return parts[parts.length - 1]
  }
  if (e.type === "function") return e.name
  return null
}

const rewriteSelectItemForChain = (
  item: ExpressionSelectItem,
): ExpressionSelectItem | null => {
  const e = item.expression
  if (e.type === "column") return item

  const out = outputName(item)
  if (!out) return item

  if (e.type === "function") {
    const fnLower = e.name.toLowerCase()
    if (fnLower === "count") {
      // count(DISTINCT …) can't decompose from a scalar — drop it.
      if (e.distinct === true) return null
      // count(…) → sum(alias): sum-of-per-bucket-counts is the chained total.
      return {
        type: "selectItem",
        expression: {
          type: "function",
          name: "sum",
          args: [mkColumnRef(out)],
        },
        alias: out,
      }
    }
    const isPreserved = PRESERVED_AGGREGATES.has(fnLower)
    const newExpr: FunctionCall = isPreserved
      ? {
          ...e,
          args:
            e.args.length > 1
              ? [mkColumnRef(out), ...e.args.slice(1)]
              : [mkColumnRef(out)],
        }
      : { type: "function", name: "last", args: [mkColumnRef(out)] }
    return { type: "selectItem", expression: newExpr, alias: out }
  }

  return {
    type: "selectItem",
    expression: mkColumnRef(out),
  }
}

const deriveNextName = (
  srcName: string,
  srcInterval: string,
  newInterval: string,
): string => {
  const trailing = /_(\d+(?:s|m|h|d|M|y))(_\d+)?$/
  if (trailing.test(srcName)) {
    return srcName.replace(trailing, `_${newInterval}`)
  }
  if (srcInterval) {
    const embedded = new RegExp(`(^|_)${escapeRegExp(srcInterval)}(?=_|$)`)
    if (embedded.test(srcName)) {
      return srcName.replace(
        embedded,
        (_m, pre: string) => `${pre}${newInterval}`,
      )
    }
  }
  return `${srcName}_${newInterval}`
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

const normalizeTTLUnits = (ddl: string): string =>
  ddl.replace(
    /\bTTL\s+(\d+)\s+(HOUR|DAY|WEEK|MONTH|YEAR)(?!S)\b/gi,
    (_m: string, n: string, unit: string) => `TTL ${n} ${unit.toUpperCase()}S`,
  )

const fromTable = (
  stmt: CreateTableStatement,
  existingNames: readonly string[],
): string => {
  const columns = stmt.columns ?? []
  const tableName = stmt.table.parts[stmt.table.parts.length - 1]
  const designatedTimestamp = stmt.timestamp
  const partition = stmt.partitionBy ?? "NONE"
  const interval = SAMPLE_BY_MAP[partition] ?? "1h"
  const viewName = pickUniqueViewName(
    deriveNextName(tableName, "", interval),
    existingNames,
  )

  const nonTimestampItems: ExpressionSelectItem[] = []
  let timestampItem: ExpressionSelectItem | null = null

  for (const col of columns) {
    if (designatedTimestamp && col.name === designatedTimestamp) {
      timestampItem = mkSelectItem(mkColumnRef(col.name))
      continue
    }
    const item = buildSelectItem(col)
    if (item) nonTimestampItems.push(item)
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

  const partitionBy = PARTITION_BY_FOR_SAMPLE[interval]
  const matViewStmt: CreateMaterializedViewStatement = {
    type: "createMaterializedView",
    view: { type: "qualifiedName", parts: [viewName] },
    refresh,
    query: selectStmt,
    asParens: true,
    partitionBy,
    ...projectRetention(stmt, partitionBy),
    ownedBy: stmt.ownedBy,
  }

  return `${HEADER}\n${formatSql(toSql(matViewStmt))};`
}

const fromMatView = (
  src: CreateMaterializedViewStatement,
  existingNames: readonly string[],
): string => {
  const srcName = src.view.parts[src.view.parts.length - 1]
  const srcQuery = src.query
  const srcSampleBy = srcQuery.sampleBy
  if (!srcSampleBy?.duration) {
    throw new Error("Source materialized view has no SAMPLE BY clause")
  }
  const srcInterval = srcSampleBy.duration
  const newInterval = nextInterval(srcInterval)
  const newName = pickUniqueViewName(
    deriveNextName(srcName, srcInterval, newInterval),
    existingNames,
  )

  const newColumns: SelectItem[] = srcQuery.columns.flatMap(
    (item): SelectItem[] => {
      if (item.type !== "selectItem") return [item]
      const rewritten = rewriteSelectItemForChain(item)
      return rewritten ? [rewritten] : []
    },
  )

  const newQuery: SelectStatement = {
    ...srcQuery,
    columns: newColumns,
    from: [
      {
        type: "tableRef",
        table: { type: "qualifiedName", parts: [srcName] },
      },
    ],
    // Source columns referenced by these clauses don't exist at the chain layer.
    where: undefined,
    groupBy: undefined,
    latestOn: undefined,
    sampleBy: { ...srcSampleBy, duration: newInterval },
  }

  const partitionBy = partitionFor(newInterval)
  const matViewStmt: CreateMaterializedViewStatement = {
    type: "createMaterializedView",
    view: { type: "qualifiedName", parts: [newName] },
    baseTable: { type: "qualifiedName", parts: [srcName] },
    refresh: src.refresh ?? {
      type: "materializedViewRefresh",
      mode: "immediate",
    },
    query: newQuery,
    asParens: true,
    partitionBy,
    ...projectRetention(src, partitionBy),
    period: src.period,
    ownedBy: src.ownedBy,
  }

  return `${HEADER}\n${formatSql(toSql(matViewStmt))};`
}

export const generateMatViewDDL = (
  ddl: string,
  existingNames: readonly string[] = [],
): string => {
  const stmt = parseOne(normalizeTTLUnits(ddl)) as
    | CreateTableStatement
    | CreateMaterializedViewStatement
  if (stmt.type === "createTable") return fromTable(stmt, existingNames)
  if (stmt.type === "createMaterializedView")
    return fromMatView(stmt, existingNames)
  throw new Error(
    "Expected a CREATE TABLE or CREATE MATERIALIZED VIEW statement",
  )
}
