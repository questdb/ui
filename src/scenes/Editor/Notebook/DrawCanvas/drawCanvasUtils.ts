import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import type { CellResult, SingleQueryResult } from "../../../../store/notebook"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import { hasPendingResult } from "../statementIdentity"
import { normalizeQueryText } from "../../Monaco/utils"
import type { RenderProblem } from "../renderReports"
import type { ColumnFormats } from "../../../../utils/formats/columnFormat"
import {
  ROLE_COLUMNS,
  ROLE_FIELD,
  isRoleChartType,
  type ChartConfig,
  type QueryChart,
} from "../CellChart/chartTypes"
import {
  drawsAlone,
  thresholdSource,
  type ChartGlobals,
  type ResolvedEvents,
  type ResolvedQuery,
} from "../CellChart/buildEchartsOption"
import {
  classifyColumn,
  findOhlc,
  groupColumns,
  guessRoleColumns,
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

export type ChartResult =
  | { kind: "missing" }
  | { kind: "stale" }
  | { kind: "pending" }
  | {
      kind: "settled"
      results: QueryExecResult[]
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
    results: successResults(result.results.map(toExecResult)),
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

export type QueryTab = {
  index: number
  label: string
  query: string
  columns: ColumnDefinition[]
  xColumn: string | null
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

/**
 * The columns a heatmap, band, range bar or boxplot reads: the saved ones
 * while the result has them, else guessed from names and kinds.
 */
export const resolveRoles = (
  qc: QueryChart,
  columns: ColumnDefinition[],
  xColumn: string | null,
): Record<string, string> | undefined => {
  if (!isRoleChartType(qc.type)) return undefined
  const names = new Set(columns.map((c) => c.name))
  const saved = qc[ROLE_FIELD[qc.type]] as Record<string, string> | undefined
  const roles = ROLE_COLUMNS[qc.type].map(([role]) => role)
  if (saved && roles.every((role) => names.has(saved[role]))) return saved
  return guessRoleColumns(qc.type, columns, xColumn) as
    | Record<string, string>
    | undefined
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

  // Event statements mark the time axis; they never anchor or add series.
  const eventItems = items.filter((it) => it.qc.type === "events")
  const drawnEventItems = eventItems.filter((it) => it.qc.enabled !== false)
  const seriesItems = items.filter((it) => it.qc.type !== "events")
  const events: ResolvedEvents[] = drawnEventItems.map((it) => ({
    index: it.idx,
    columns: it.r.columns,
    dataset: it.r.dataset,
    columnsRole: it.qc.events ?? {},
  }))

  const anchor = seriesItems[0]
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

  const placedItems = seriesItems.map((it, i) => {
    const ownX = i === 0 ? anchorX : it.inferred.xColumn
    return { ...it, ownX, qc: dropPartitionOnX(it.qc, ownX) }
  })

  const tabs: QueryTab[] = []
  const renderQueries: ResolvedQuery[] = []
  placedItems.forEach((it, i) => {
    const isAnchor = i === 0
    const { ownX } = it
    const role = xRoleOf(it.r.columns, ownX)
    const compatible = isAnchor || (canCombine && role === anchorRole)
    const enabled = isAnchor ? true : (it.qc.enabled ?? true)
    if (it.idx >= 0) {
      tabs.push({
        index: it.idx,
        label: `Q${it.idx + 1}`,
        query: it.r.query,
        columns: it.r.columns,
        xColumn: ownX,
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
      roles: resolveRoles(it.qc, it.r.columns, ownX),
      percentStack: it.qc.percentStack,
      pieShape: it.qc.pieShape,
      scatter: it.qc.scatter,
      partitionByColumn: it.qc.partitionByColumn,
      axis: it.qc.axis ?? "left",
      name: it.qc.name,
    })
  })

  for (const it of eventItems) {
    if (it.idx < 0) continue
    tabs.push({
      index: it.idx,
      label: `Q${it.idx + 1}`,
      query: it.r.query,
      columns: it.r.columns,
      xColumn: it.inferred.xColumn,
      compatible: true,
      inferredChart: it.inferred.chart,
    })
  }
  tabs.sort((a, b) => a.index - b.index)

  // Dense, statement-aligned config for the drawer: a concrete QueryChart per
  // statement that ran, else the saved override, else `null` for unresolved statements.
  const denseQueries: (QueryChart | null)[] = statements.map((_stmt, i) => {
    const eventItem = eventItems.find((x) => x.idx === i)
    if (eventItem) return { ...eventItem.qc }
    const it = placedItems.find((x) => x.idx === i)
    if (it) {
      const qc: QueryChart = { ...it.qc }
      const oh = resolveOhlc(qc, it.r.columns)
      if (oh) qc.ohlc = oh
      // The drawer shows the columns the chart uses, guessed ones included.
      const roles = resolveRoles(qc, it.r.columns, it.ownX)
      if (roles && isRoleChartType(qc.type))
        Object.assign(qc, { [ROLE_FIELD[qc.type]]: roles })
      return qc
    }
    return config?.queries[i] ?? null
  })

  return {
    chart: {
      xColumn: anchorX,
      rightAxis: config?.rightAxis,
      horizontal: config?.horizontal,
      thresholds: config?.thresholds,
      ...(events.length > 0 ? { events } : {}),
    },
    renderQueries,
    effectiveConfig: {
      xColumn: anchorX,
      rightAxis: config?.rightAxis,
      ...(config?.horizontal ? { horizontal: true } : {}),
      ...(config?.thresholds ? { thresholds: config.thresholds } : {}),
      queries: denseQueries,
    },
    tabs,
  }
}

/**
 * What a preset chart left out or could not draw, for the agent's render
 * report: statements on another x-axis, missing columns, and types that draw
 * alone next to others.
 */
export const drawProblems = (
  resolution: DrawResolution,
  config: ChartConfig | undefined,
  formats: ColumnFormats = {},
): RenderProblem[] => {
  const problems: RenderProblem[] = resolution.tabs
    .filter((t) => !t.compatible)
    .map((t) => ({
      message: `${t.label} was left out: its x-axis (${t.xColumn ?? "none"}) does not match the first query's.`,
      severity: "warning" as const,
    }))
  ;(config?.queries ?? []).forEach((q, index) => {
    const tab = resolution.tabs.find((t) => t.index === index)
    if (!q || !tab || q.enabled === false) return
    const names = new Set(tab.columns.map((c) => c.name))
    // Heatmaps, box plots and range bars read their own columns, not y.
    const readsY = !isRoleChartType(q.type) || q.type === "band"
    if (readsY)
      for (const y of q.yColumns ?? [])
        if (!names.has(y))
          problems.push({
            message: `${tab.label}: column "${y}" is not in the result and was left out.`,
            severity: "warning",
          })
    if (q.type === "scatter")
      for (const c of [q.scatter?.size, q.scatter?.color])
        if (c !== undefined && !names.has(c))
          problems.push({
            message: `${tab.label}: column "${c}" for the points' size or colour is not in the result; the points draw plain.`,
            severity: "warning",
          })
    if (!isRoleChartType(q.type)) return
    const saved = q[ROLE_FIELD[q.type]] as Record<string, string> | undefined
    const missing = Object.values(saved ?? {}).filter((c) => !names.has(c))
    const drawn = resolution.renderQueries.find((r) => r.index === index)
    if (!drawn) return
    if (!drawn.roles)
      problems.push({
        message: `${tab.label}: no columns for the ${q.type} chart (${ROLE_COLUMNS[
          q.type
        ]
          .map(([role]) => role)
          .join(", ")}); nothing was drawn.`,
        severity: "error",
      })
    else if (missing.length > 0)
      problems.push({
        message: `${tab.label}: ${missing.map((c) => `"${c}"`).join(", ")} not in the result; drew ${Object.entries(
          drawn.roles,
        )
          .map(([role, c]) => `${role}=${c}`)
          .join(", ")} instead.`,
        severity: "warning",
      })
  })
  const drawnQueries = resolution.renderQueries
  const notBars = drawnQueries.filter(
    (q) => !(["bar", "stackedBar", "rangeBar"] as string[]).includes(q.type),
  )
  if (config?.horizontal && notBars.length > 0)
    problems.push({
      message: `horizontal is ignored: it lays down bars only, and ${notBars
        .map((q) => `Q${q.index + 1} is ${q.type}`)
        .join(", ")}.`,
      severity: "warning",
    })
  if (config?.thresholds && !thresholdSource(drawnQueries, formats))
    problems.push({
      message:
        "thresholds draws nothing: no column drawn on the left axis (in values, not percent_stack shares) has format thresholds (set_cell_formats).",
      severity: "warning",
    })
  // Types on axes of their own draw alone: the first query decides.
  const [anchor, ...rest] = resolution.renderQueries
  const labelOf = (index: number) =>
    resolution.tabs.find((t) => t.index === index)?.label ?? `Q${index + 1}`
  // A pie draws alone only as the only query; next to others it is left out.
  const anchorAlone =
    anchor !== undefined &&
    drawsAlone(anchor) &&
    (anchor.type !== "pie" || rest.length === 0)
  if (anchorAlone)
    for (const q of rest)
      problems.push({
        message: `${labelOf(q.index)} was left out: the ${anchor.type} chart of ${labelOf(anchor.index)} draws alone.`,
        severity: "warning",
      })
  else
    for (const q of resolution.renderQueries)
      if (drawsAlone(q))
        problems.push({
          message:
            q.type === "pie"
              ? `${labelOf(q.index)} was left out: a pie chart only shows as the only query.`
              : `${labelOf(q.index)} was left out: a ${q.type} chart draws alone, so it only shows as the first query.`,
          severity: "warning",
        })
  return problems
}
