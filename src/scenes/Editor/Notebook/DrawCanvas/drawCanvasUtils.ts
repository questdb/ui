import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import type { CellResult, SingleQueryResult } from "../../../../store/notebook"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import { normalizeQueryText } from "../../Monaco/utils"
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

// Rehydrate a persisted snapshot entry into the QueryExecResult shape DrawCanvas
// works with. Only DQL carries chartable data; other types map to empty results
// (which successResults() then filters out).
export const toExecResult = (r: SingleQueryResult): QueryExecResult => {
  if (r.type === "dql") {
    return {
      type: "dql",
      query: r.query,
      columns: r.columns,
      dataset: r.dataset,
      count: r.count,
      timestamp: r.timestamp,
      timings: r.timings,
      notice: r.notice,
    }
  }
  if (r.type === "error") {
    return {
      type: "error",
      query: r.query,
      columns: [],
      dataset: [],
      count: 0,
      error: r.error,
    }
  }
  if (r.type === "ddl" || r.type === "dml") {
    return { type: r.type, query: r.query, columns: [], dataset: [], count: 0 }
  }
  // transient (running/queued/cancelled) — not chartable
  return { type: "error", query: r.query, columns: [], dataset: [], count: 0 }
}

// True when an existing, complete cell result was produced by exactly the
// CURRENT queries (same count, same per-statement query text). The run grid
// stores the raw cell value verbatim (trailing `;`, surrounding whitespace)
// while the draw side parses each statement, so both sides are normalized
// before comparing. A result left over from edited-but-not-rerun SQL or capped
// by the notebook byte limit fails this, so the chart re-fetches.
export const resultMatchesQueries = (
  result: CellResult | null | undefined,
  queries: string[],
): result is CellResult =>
  result != null &&
  result.results.length === queries.length &&
  result.results.every(
    (r, i) =>
      !(r.type === "dql" && r.truncated) &&
      normalizeQueryText(r.query) === normalizeQueryText(queries[i]),
  )

export const resultsEquivalent = (
  a: QueryExecResult[],
  b: QueryExecResult[],
): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    // Query identity is the primary discriminator. Formatting differences
    // introduced by parsing (surrounding whitespace / trailing semicolon) do
    // not make a new result, but different SQL must always replace the prior
    // frame even when it happens to return identical rows.
    if (normalizeQueryText(x.query) !== normalizeQueryText(y.query)) {
      return false
    }
    if (x.type !== y.type) return false
    if (x.count !== y.count) return false
    if (x.error !== y.error) return false
    if (x.notice !== y.notice) return false
    // Cheap O(1) reject before the O(rows×cols) walk: a live poll that moved
    // almost always changes the row count or the first/last row's x value, so
    // most ticks bail here without scanning every cell.
    if (x.dataset.length !== y.dataset.length) return false
    if (x.dataset.length > 0) {
      const last = x.dataset.length - 1
      if (x.dataset[0][0] !== y.dataset[0][0]) return false
      if (x.dataset[last][0] !== y.dataset[last][0]) return false
    }
    if (x.columns.length !== y.columns.length) return false
    for (let c = 0; c < x.columns.length; c++) {
      const colX = x.columns[c]
      const colY = y.columns[c]
      if (
        colX.name !== colY.name ||
        colX.type !== colY.type ||
        colX.dim !== colY.dim ||
        colX.elemType !== colY.elemType
      )
        return false
    }
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
  inferredChart: QueryChart
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
        inferredChart: it.inferred.chart,
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
      rightAxis: config?.rightAxis,
    },
    renderQueries,
    effectiveConfig: {
      xColumn: anchorX,
      rightAxis: config?.rightAxis,
      queries: denseQueries,
    },
    tabs,
  }
}
