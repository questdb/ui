import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import type { CellResult, SingleQueryResult } from "../../../../store/notebook"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import { hasPendingResult } from "../statementIdentity"
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
export const successResults = <T extends QueryExecResult>(
  results: (T | null)[],
): T[] =>
  results.filter(
    (r): r is T => r !== null && r.type === "dql" && r.dataset.length > 0,
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

// Retain statement position across filtering; SQL text alone is ambiguous.
type PositionedResult = QueryExecResult & { statementIndex: number }

export type ChartResult =
  | { kind: "missing" }
  | { kind: "stale" }
  | { kind: "pending" }
  | {
      kind: "settled"
      results: PositionedResult[]
      hadError: boolean
    }

export const toChartResult = (
  result: CellResult | null | undefined,
  queries: string[],
): ChartResult => {
  if (result == null) return { kind: "missing" }
  if (!resultMatchesQueries(result, queries)) return { kind: "stale" }
  if (hasPendingResult(result)) return { kind: "pending" }
  return {
    kind: "settled",
    results: successResults(
      result.results.map((entry, statementIndex) => ({
        ...toExecResult(entry),
        statementIndex,
      })),
    ),
    hadError: result.results.some((r) => r.type === "error"),
  }
}

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

type QueryAxisCandidate = {
  index: number
  columns: ColumnDefinition[]
  inferredXColumn: string | null
}

export type QueryTab = QueryAxisCandidate & {
  label: string
  query: string
  inferredChart: QueryChart
}

export type DrawResolution = {
  chart: ChartGlobals
  renderQueries: ResolvedQuery[] // enabled & x-compatible, anchor first — for echarts
  effectiveConfig: ChartConfig // dense, statement-aligned — for the settings drawer
  tabs: QueryTab[] // one per successful query — for the drawer tab strip
}

export const HEATMAP_CONFLICT_MESSAGE =
  "Heatmaps need a chart of their own. Include only one query in Chart settings."
export const HEATMAP_INCOMPLETE_MESSAGE =
  "This heatmap needs an X-axis, a row column, and a value column. Update Chart settings."

export const heatmapIssue = (queries: ResolvedQuery[]) => {
  const heatmaps = queries.filter(({ type }) => type === "heatmap")
  if (heatmaps.length > 0 && queries.length > 1) return "conflict"
  if (
    heatmaps.some((q) => !q.xColumn || !q.partitionByColumn || !q.yColumns[0])
  ) {
    return "incomplete"
  }
  return null
}

const xRoleOf = (columns: ColumnDefinition[], name: string | null) => {
  const col = name != null ? columns.find((c) => c.name === name) : undefined
  return col ? classifyColumn(col) : "other"
}

const canCombineXAxis = (
  anchorColumns: ColumnDefinition[],
  anchorX: string | null,
  otherColumns: ColumnDefinition[],
  otherX: string | null,
) => {
  const anchorRole = xRoleOf(anchorColumns, anchorX)
  return (
    (anchorRole === "temporal" || anchorRole === "categorical") &&
    xRoleOf(otherColumns, otherX) === anchorRole
  )
}

export const chartXAxisOf = (
  query: QueryAxisCandidate,
  savedX: string | null | undefined,
): string | null =>
  savedX != null && query.columns.some((c) => c.name === savedX)
    ? savedX
    : query.inferredXColumn

// Legacy charts always keep the first result. An explicit heatmap config
// (even if excluded or temporarily without rows) opts into full exclusion.
export const resolveQueryAxes = <T extends QueryAxisCandidate>(
  items: T[],
  config: ChartConfig | undefined,
) => {
  const allowAnchorExclusion =
    config?.queries.some((q) => q?.type === "heatmap") ?? false
  const enabled = (item: T) => config?.queries[item.index]?.enabled !== false
  const anchor = allowAnchorExclusion ? items.find(enabled) : items[0]
  const xColumn = anchor
    ? chartXAxisOf(anchor, config?.xColumn)
    : (config?.xColumn ?? null)
  const placements = items.map((item) => {
    const isAnchor = item === anchor
    const ownX = isAnchor ? xColumn : item.inferredXColumn
    const compatible =
      !anchor ||
      isAnchor ||
      canCombineXAxis(anchor.columns, xColumn, item.columns, ownX)
    return {
      item,
      ownX,
      compatible,
      included: anchor != null && compatible && (isAnchor || enabled(item)),
    }
  })
  return { anchor, xColumn, placements, allowAnchorExclusion }
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
  const yColumns = Array.isArray(qc.yColumns) ? qc.yColumns : []
  const next: QueryChart = {
    ...qc,
    // A heatmap only maps the first column. Do not silently demote a missing
    // value to another series retained from an earlier chart type.
    yColumns:
      qc.type === "heatmap" && !names.has(yColumns[0])
        ? []
        : yColumns.filter((n) => names.has(n)),
  }
  if (next.partitionByColumn && !names.has(next.partitionByColumn))
    delete next.partitionByColumn
  return next
}

// Partitioning by the x column yields one series per x value, each holding a
// single point: nothing to connect, and every tooltip lists all series.
const dropPartitionOnX = (
  qc: QueryChart,
  xColumn: string | null,
): QueryChart => {
  if (qc.partitionByColumn !== xColumn) return qc
  const { partitionByColumn: _dropped, ...rest } = qc
  return rest
}

// Resolves the cell's queries into everything the chart + drawer need: matches
// each successful result to its statement (stable index, tolerant of failures),
// merges saved config with per-query inference, picks the anchor x-axis, and
// flags x-incompatible queries. Pure so it can be memoized and tested.
export const resolveDraw = (
  statements: string[],
  results: (QueryExecResult &
    Partial<Pick<PositionedResult, "statementIndex">>)[],
  config: ChartConfig | undefined,
): DrawResolution => {
  const used = new Set(results.flatMap((r) => r.statementIndex ?? []))
  const items = results.map((r) => {
    // Standalone callers (such as Editor Result) can still pass unindexed rows.
    const idx =
      r.statementIndex ??
      statements.findIndex(
        (statement, index) => statement === r.query && !used.has(index),
      )
    if (idx >= 0) used.add(idx)
    const inferred = inferChartConfig(r.columns, r.dataset, r.query)
    const saved = idx >= 0 ? config?.queries[idx] : undefined
    return {
      index: idx,
      columns: r.columns,
      dataset: r.dataset,
      query: r.query,
      inferredXColumn: inferred.xColumn,
      inferredChart: inferred.chart,
      qc: pruneQuery(saved ?? inferred.chart, r.columns),
    }
  })

  const { xColumn, placements } = resolveQueryAxes(items, config)
  const placedItems = placements.map(({ item, ownX, included }) => ({
    ...item,
    ownX,
    included,
    qc:
      item.qc.type === "heatmap" && item.qc.enabled === false
        ? item.qc
        : dropPartitionOnX(item.qc, ownX),
  }))

  const tabs: QueryTab[] = []
  const renderQueries: ResolvedQuery[] = []
  placedItems.forEach((it) => {
    const { index, columns, ownX } = it
    if (index >= 0) {
      tabs.push({
        index,
        label: `Q${index + 1}`,
        query: it.query,
        columns,
        inferredXColumn: it.inferredXColumn,
        inferredChart: it.inferredChart,
      })
    }
    if (!it.included) return
    renderQueries.push({
      index,
      columns,
      dataset: it.dataset,
      xColumn: ownX,
      type: it.qc.type,
      yColumns: it.qc.yColumns ?? [],
      ohlc: resolveOhlc(it.qc, columns),
      partitionByColumn: it.qc.partitionByColumn,
      ...(it.qc.colorScale && { colorScale: it.qc.colorScale }),
      axis: it.qc.axis ?? "left",
      name: it.qc.name,
    })
  })

  // Dense, statement-aligned config for the drawer: a concrete QueryChart per
  // statement that ran, else the saved override, else `null` for unresolved statements.
  const denseQueries: (QueryChart | null)[] = statements.map((_stmt, i) => {
    const it = placedItems.find((x) => x.index === i)
    if (it) {
      const qc: QueryChart = { ...it.qc }
      const oh = resolveOhlc(qc, it.columns)
      if (oh) qc.ohlc = oh
      return qc
    }
    return config?.queries[i] ?? null
  })

  return {
    chart: {
      xColumn,
      rightAxis: config?.rightAxis,
      referenceLines: config?.referenceLines,
    },
    renderQueries,
    effectiveConfig: {
      xColumn,
      rightAxis: config?.rightAxis,
      ...(config?.referenceLines && { referenceLines: config.referenceLines }),
      queries: denseQueries,
    },
    tabs,
  }
}
