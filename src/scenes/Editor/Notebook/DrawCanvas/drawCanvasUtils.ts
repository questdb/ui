import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type { ChartConfig, QueryChart } from "../CellChart/chartTypes"
import type {
  ChartGlobals,
  ResolvedQuery,
} from "../CellChart/buildEchartsOption"
import {
  classifyColumn,
  findOhlc,
  groupColumns,
  inferChartConfig,
} from "../CellChart/inferChartConfig"

// Keep only DQL results that actually returned rows. The chart can't render
// empty datasets, and non-DQL results (error/ddl/dml) have no columns.
export const successResults = (
  results: (QueryExecResult | null)[],
): QueryExecResult[] =>
  results.filter(
    (r): r is QueryExecResult =>
      r !== null && r.type === "dql" && r.dataset.length > 0,
  )

export const resultsEquivalent = (
  a: QueryExecResult[],
  b: QueryExecResult[],
): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (x.columns.length !== y.columns.length) return false
    for (let c = 0; c < x.columns.length; c++) {
      if (x.columns[c].name !== y.columns[c].name) return false
    }
    if (x.dataset.length !== y.dataset.length) return false
    for (let r = 0; r < x.dataset.length; r++) {
      const rowA = x.dataset[r]
      const rowB = y.dataset[r]
      if (rowA.length !== rowB.length) return false
      for (let c = 0; c < rowA.length; c++) {
        if (rowA[c] !== rowB[c]) return false
      }
    }
  }
  return true
}

export type QueryTab = {
  index: number
  label: string
  query: string
  columns: ColumnDefinition[]
  compatible: boolean
}

export type DrawResolution = {
  chart: ChartGlobals
  renderQueries: ResolvedQuery[] // enabled & x-compatible, anchor first — for echarts
  effectiveConfig: ChartConfig // dense, statement-aligned — for the settings drawer
  tabs: QueryTab[] // one per successful query — for the drawer tab strip
}

const xRoleOf = (columns: ColumnDefinition[], name: string | null) => {
  const col = name != null ? columns.find((c) => c.name === name) : undefined
  return col ? classifyColumn(col) : "other"
}

const resolveOhlc = (
  qc: QueryChart,
  columns: ColumnDefinition[],
): QueryChart["ohlc"] | undefined => {
  if (qc.type !== "candlestick") return undefined
  const names = new Set(columns.map((c) => c.name))
  const allPresent = (o: NonNullable<QueryChart["ohlc"]>) =>
    names.has(o.open) &&
    names.has(o.high) &&
    names.has(o.low) &&
    names.has(o.close)

  if (qc.ohlc && allPresent(qc.ohlc)) return qc.ohlc

  return findOhlc(groupColumns(columns).numeric)
}

// Drop references to columns the query no longer returns (e.g. a column removed
// from the SELECT), so series/partition don't carry stale entries.
const pruneQuery = (
  qc: QueryChart,
  columns: ColumnDefinition[],
): QueryChart => {
  const names = new Set(columns.map((c) => c.name))
  const next: QueryChart = {
    ...qc,
    yColumns: (Array.isArray(qc.yColumns) ? qc.yColumns : []).filter((n) =>
      names.has(n),
    ),
  }
  if (next.partitionByColumn && !names.has(next.partitionByColumn))
    delete next.partitionByColumn
  return next
}

// Resolves the cell's queries into everything the chart + drawer need: matches
// each successful result to its statement (stable index, tolerant of failures),
// merges saved config with per-query inference, picks the anchor x-axis, and
// flags x-incompatible queries. Pure so it can be memoized and tested.
export const resolveDraw = (
  statements: string[],
  results: QueryExecResult[],
  config: ChartConfig | undefined,
): DrawResolution => {
  const used = new Set<number>()
  const items = results.map((r) => {
    let idx = statements.indexOf(r.query)
    if (idx >= 0 && used.has(idx)) {
      idx = statements.findIndex((s, i) => s === r.query && !used.has(i))
    }
    if (idx >= 0) used.add(idx)
    const inferred = inferChartConfig(r.columns, r.dataset, r.query)
    const saved = idx >= 0 ? config?.queries[idx] : undefined
    return {
      idx,
      r,
      inferred,
      qc: pruneQuery(saved ?? inferred.chart, r.columns),
    }
  })

  const anchor = items[0]
  // Drop a stale x-axis (a removed column) by falling back to inference.
  const savedX = config?.xColumn
  const anchorX: string | null =
    savedX != null &&
    anchor != null &&
    anchor.r.columns.some((c) => c.name === savedX)
      ? savedX
      : (anchor?.inferred.xColumn ?? null)
  const anchorRole = anchor ? xRoleOf(anchor.r.columns, anchorX) : "other"
  const canCombine = anchorRole === "temporal" || anchorRole === "categorical"

  const tabs: QueryTab[] = []
  const renderQueries: ResolvedQuery[] = []
  items.forEach((it, i) => {
    const isAnchor = i === 0
    const ownX = isAnchor ? anchorX : it.inferred.xColumn
    const role = xRoleOf(it.r.columns, ownX)
    const compatible = isAnchor || (canCombine && role === anchorRole)
    const enabled = isAnchor ? true : (it.qc.enabled ?? true)
    if (it.idx >= 0) {
      tabs.push({
        index: it.idx,
        label: `Q${it.idx + 1}`,
        query: it.r.query,
        columns: it.r.columns,
        compatible,
      })
    }
    if (!compatible || !enabled) return
    renderQueries.push({
      index: it.idx,
      columns: it.r.columns,
      dataset: it.r.dataset,
      xColumn: ownX,
      type: it.qc.type,
      yColumns: it.qc.yColumns ?? [],
      ohlc: resolveOhlc(it.qc, it.r.columns),
      partitionByColumn: it.qc.partitionByColumn,
      axis: it.qc.axis ?? "left",
      name: it.qc.name,
    })
  })

  // Dense, statement-aligned config for the drawer: a concrete QueryChart per
  // statement that ran, else the saved override, else `null` for unresolved statements.
  const denseQueries: (QueryChart | null)[] = statements.map((_stmt, i) => {
    const it = items.find((x) => x.idx === i)
    if (it) {
      const qc: QueryChart = { ...it.qc }
      const oh = resolveOhlc(qc, it.r.columns)
      if (oh) qc.ohlc = oh
      return qc
    }
    return config?.queries[i] ?? null
  })

  return {
    chart: {
      xColumn: anchorX,
      name: config?.name,
      rightAxis: config?.rightAxis,
    },
    renderQueries,
    effectiveConfig: {
      xColumn: anchorX,
      name: config?.name,
      rightAxis: config?.rightAxis,
      queries: denseQueries,
    },
    tabs,
  }
}
