import type { QueryExecResult } from "../../../hooks/useQueryExecution"
import type {
  AutoRefresh,
  AutoRefreshInterval,
  CellLayoutItem,
  CellMode,
  CellResult,
  CellType,
  NotebookCell,
  NotebookSettings,
  NotebookViewState,
  SingleQueryResult,
} from "../../../store/notebook"
import {
  AUTO_REFRESH_INTERVALS,
  createCell,
  MAX_NOTEBOOK_CELLS,
  MAX_CELL_LINES,
  exceedsCellLineLimit,
  MAX_CELL_NAME_LENGTH,
  exceedsCellNameLimit,
} from "../../../store/notebook"
import { deriveRunStatusFromResults } from "../../../utils/ai/runStatus"
import type { RunStatus } from "../../../utils/ai/runStatus"
import type { ChartConfig, QueryChart } from "./CellChart/chartTypes"
import { getQueriesFromText } from "../Monaco/utils"
import {
  HEADER_HEIGHT,
  ROW_HEIGHT,
} from "../../../components/ResultGrid/dimensions"

// Auto-refresh (draw cells): true = adaptive poll, false = off, a token like
// "5s" = fixed cadence. The cell stores this value verbatim (= the MCP wire
// form), so there is no conversion layer.
export const AUTO_REFRESH_OPTIONS: AutoRefresh[] = [
  true,
  false,
  ...(Object.keys(AUTO_REFRESH_INTERVALS) as AutoRefreshInterval[]),
]

export const autoRefreshLabel = (value: AutoRefresh): string =>
  value === true ? "Auto" : value === false ? "Off" : value

export const autoRefreshIntervalMs = (
  value: AutoRefresh,
): number | undefined =>
  typeof value === "string" ? AUTO_REFRESH_INTERVALS[value] : undefined

export const isAutoRefresh = (value: unknown): value is AutoRefresh =>
  typeof value === "boolean" ||
  (typeof value === "string" && value in AUTO_REFRESH_INTERVALS)

// What a cell currently shows in its bottom slot — drives the toolbar's
// view-switch / refresh / chart actions and their disabled states.
export type CellView = "none" | "grid" | "chart"

export const resolveCellView = (
  cell: Pick<NotebookCell, "mode" | "result">,
): CellView => {
  if (cell.mode === "draw") return "chart"
  if (cell.result != null) return "grid"
  return "none"
}

export type CellToolbarTier = "compact" | "standard" | "expanded"

export const CELL_TOOLBAR_STANDARD_MIN = 480
export const CELL_TOOLBAR_EXPANDED_MIN = 720

export const cellToolbarTier = (
  width: number,
  isMaximized: boolean,
): CellToolbarTier =>
  isMaximized || width >= CELL_TOOLBAR_EXPANDED_MIN
    ? "expanded"
    : width >= CELL_TOOLBAR_STANDARD_MIN
      ? "standard"
      : "compact"

export const singleResultFromExec = (
  exec: QueryExecResult,
  query: string,
): SingleQueryResult => {
  switch (exec.type) {
    case "dql":
      return {
        type: "dql",
        query,
        columns: exec.columns,
        dataset: exec.dataset,
        count: exec.count,
        timestamp: exec.timestamp,
        timings: exec.timings,
      }
    case "error":
      return { type: "error", query, error: exec.error ?? "Unknown error" }
    default:
      return { type: exec.type, query }
  }
}

// Notebook-scoped result caps. Rows are bounded at the fetch; the byte cap
// bounds wide results so a persisted snapshot stays small. Deliberately NOT the
// shared RESULT_DISPLAY_LIMIT (which the main Result panel uses).
export const NOTEBOOK_ROW_CAP = 10_000
export const NOTEBOOK_BYTE_CAP = 2_000_000

// Cap a DQL result's dataset to ~`maxBytes` of serialized rows. `count` is left
// as the server-returned value so the existing "X of Y rows" indicator still
// reflects that rows were dropped. Non-DQL / empty results pass through.
export const capResultBytes = (
  result: SingleQueryResult,
  maxBytes: number,
): SingleQueryResult => {
  if (result.type !== "dql" || result.dataset.length === 0) return result
  const serialized = JSON.stringify(result.dataset)
  if (serialized.length <= maxBytes) return result
  const avgRowBytes = serialized.length / result.dataset.length
  const keepRows = Math.max(1, Math.floor(maxBytes / avgRowBytes))
  if (keepRows >= result.dataset.length) return result
  return { ...result, dataset: result.dataset.slice(0, keepRows) }
}

// Cheap stable hash of a cell's SQL — a restored snapshot is only reused while
// the cell's current SQL still matches what was saved.
export const sqlHash = (value: string): string => {
  let h = 5381
  for (let i = 0; i < value.length; i++) {
    h = ((h << 5) + h) ^ value.charCodeAt(i)
  }
  return (h >>> 0).toString(36)
}

const UNVERIFIABLE_ERROR_MARKERS = [
  "Cancelled by user",
  "An error occurred, please try again",
  "Failed to read response",
  "Invalid JSON response from the server",
  "QuestDB is not reachable",
]

export const isUnverifiableExecError = (exec: {
  type: string
  error?: string
}): boolean =>
  exec.type === "error" &&
  exec.error !== undefined &&
  UNVERIFIABLE_ERROR_MARKERS.some((m) => exec.error?.includes(m) ?? false)

export const UNVERIFIED_RUN_NOTE =
  "Run outcome unverified: the request did not return a confirmation, so the " +
  "query may have committed server-side. Verify (e.g. with a SELECT, or " +
  "get_notebook_state) before re-running to avoid duplicate writes."

export const collapseResultToRunStatus = (result: CellResult): RunStatus => {
  const status = deriveRunStatusFromResults(result.results).status
  return status === "running" ? "cancelled" : status
}

// Run history must survive every path that drops the result blob (persist,
// duplicate, clone) — agents read last_run_status to decide whether a cell
// still needs an explicit run_cell.
const carriedRunStatus = (cell: NotebookCell): RunStatus | undefined =>
  cell.result ? collapseResultToRunStatus(cell.result) : cell.lastRunStatus

export const stripCellResults = (cells: NotebookCell[]): NotebookCell[] =>
  cells.map((cell) => ({
    ...cell,
    result: undefined,
    lastRunStatus: carriedRunStatus(cell),
  }))

export const buildPersistPayload = (
  cells: NotebookCell[],
  focusedCellId: string | null,
  maximizedCellId: string | null,
  settings: NotebookViewState["settings"],
): NotebookViewState => ({
  cells: stripCellResults(cells),
  focusedCellId: focusedCellId ?? undefined,
  maximizedCellId: maximizedCellId ?? undefined,
  settings,
})

type MergeLayoutOptions = {
  gridCols: number
  defaultCellH: number
  minW: number
  minH: number
}

export const mergeCellLayout = (
  savedLayout: CellLayoutItem[],
  cells: { id: string }[],
  opts: MergeLayoutOptions,
): (CellLayoutItem & { minW: number; minH: number })[] => {
  const layoutMap = new Map(savedLayout.map((l) => [l.i, l]))
  const maxY =
    savedLayout.length > 0 ? Math.max(...savedLayout.map((l) => l.y + l.h)) : 0
  let nextY = maxY
  return cells.map((cell) => {
    const existing = layoutMap.get(cell.id)
    if (existing) {
      return { ...existing, minW: opts.minW, minH: opts.minH }
    }
    const item = {
      i: cell.id,
      x: 0,
      y: nextY,
      w: opts.gridCols,
      h: opts.defaultCellH,
      minW: opts.minW,
      minH: opts.minH,
    }
    nextY += opts.defaultCellH
    return item
  })
}

export const generateDefaultLayout = (
  cells: { id: string }[],
  opts: Pick<MergeLayoutOptions, "gridCols" | "defaultCellH">,
): CellLayoutItem[] =>
  cells.map((cell, i) => ({
    i: cell.id,
    x: 0,
    y: i * opts.defaultCellH,
    w: opts.gridCols,
    h: opts.defaultCellH,
  }))

// Identity-preserving so React.memo'd siblings skip re-render when one
// cell is added or removed.
const reindex = (cells: NotebookCell[]): NotebookCell[] =>
  cells.map((c, i) => (c.position === i ? c : { ...c, position: i }))

export const insertCell = (
  cells: NotebookCell[],
  afterCellId: string | undefined,
  factory: typeof createCell = createCell,
  override?: { id?: string; value?: string; type?: CellType },
): NotebookCell[] => {
  const insertIndex =
    afterCellId !== undefined
      ? cells.findIndex((c) => c.id === afterCellId) + 1
      : cells.length
  const base = factory(insertIndex, override?.value ?? "")
  const patch: Partial<NotebookCell> = {}
  if (override?.id) patch.id = override.id
  if (override?.value !== undefined) patch.value = override.value
  if (override?.type) patch.type = override.type
  const newCell: NotebookCell =
    Object.keys(patch).length > 0 ? { ...base, ...patch } : base
  const next = [...cells]
  next.splice(insertIndex, 0, newCell)
  return reindex(next)
}

export const removeCell = (
  cells: NotebookCell[],
  cellId: string,
): NotebookCell[] => {
  if (cells.length <= 1) return cells
  const found = cells.some((c) => c.id === cellId)
  if (!found) return cells
  return reindex(cells.filter((c) => c.id !== cellId))
}

export const swapCellUp = (
  cells: NotebookCell[],
  cellId: string,
): NotebookCell[] => {
  const idx = cells.findIndex((c) => c.id === cellId)
  if (idx <= 0) return cells
  const next = [...cells]
  ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
  return reindex(next)
}

export const swapCellDown = (
  cells: NotebookCell[],
  cellId: string,
): NotebookCell[] => {
  const idx = cells.findIndex((c) => c.id === cellId)
  if (idx < 0 || idx >= cells.length - 1) return cells
  const next = [...cells]
  ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
  return reindex(next)
}

export const duplicateCellAt = (
  cells: NotebookCell[],
  cellId: string,
  newId: string,
): NotebookCell[] => {
  const idx = cells.findIndex((c) => c.id === cellId)
  if (idx < 0) return cells
  const original = cells[idx]
  const copy: NotebookCell = {
    ...original,
    id: newId,
    position: idx + 1,
    result: null,
    lastRunStatus: carriedRunStatus(original),
  }
  const next = [...cells]
  next.splice(idx + 1, 0, copy)
  return reindex(next)
}

export const setResultAt = (
  cells: NotebookCell[],
  cellId: string,
  index: number,
  result: SingleQueryResult,
  activeIndex?: number,
): NotebookCell[] =>
  cells.map((c) => {
    if (c.id !== cellId || !c.result) return c
    const results = [...c.result.results]
    results[index] = result
    const nextCellResult: CellResult = {
      ...c.result,
      results,
      ...(activeIndex !== undefined && { activeResultIndex: activeIndex }),
    }
    return { ...c, result: nextCellResult }
  })

export const cancelAllInCell = (
  cells: NotebookCell[],
  cellId: string,
): NotebookCell[] =>
  cells.map((c) => {
    if (c.id !== cellId || !c.result) return c
    return {
      ...c,
      result: {
        ...c.result,
        results: c.result.results.map((r) =>
          r.type === "running" || r.type === "queued"
            ? { type: "cancelled", query: r.query }
            : r,
        ),
      },
    }
  })

export const cancelOneInCell = (
  cells: NotebookCell[],
  cellId: string,
  index: number,
): NotebookCell[] =>
  cells.map((c) => {
    if (c.id !== cellId || !c.result) return c
    const results = [...c.result.results]
    const target = results[index]
    if (target?.type !== "running") return c
    results[index] = { type: "cancelled", query: target.query }
    return { ...c, result: { ...c.result, results } }
  })

export const buildInitialScriptResults = (
  queries: string[],
): SingleQueryResult[] =>
  queries.map((q, i) => ({
    type: i === 0 ? "running" : "queued",
    query: q,
  }))

type ApplyCellRequest = {
  id?: string | null
  name?: string | null
  value?: string | null
  preserveValue?: boolean | null
  type?: CellType | null
  mode?: CellMode | null
  autoRefresh?: AutoRefresh | null
  isChartMaximized?: boolean | null
  chartConfig?: ChartConfig | null
  grid?: { x: number; y: number; w: number; h: number } | null
}

type ApplyRequest = {
  layoutMode?: "list" | "grid" | null
  maximizedCellId?: string | null
  cells: ApplyCellRequest[]
}

type AppliedDiff = {
  added: string[]
  updated: string[]
  deleted: string[]
}

export class ApplyNotebookStateError extends Error {
  readonly field?: string
  constructor(message: string, field?: string) {
    super(message)
    this.name = "ApplyNotebookStateError"
    this.field = field
  }
}

const generateId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

export const nextCopyLabel = (label: string): string => {
  const match = label.match(/^(.*) \(copy(?: (\d+))?\)$/)
  if (!match) return `${label} (copy)`
  const n = match[2] ? parseInt(match[2], 10) : 1
  return `${match[1]} (copy ${n + 1})`
}

export const cloneNotebookViewState = (
  source: NotebookViewState,
  newId: () => string = generateId,
): NotebookViewState => {
  const idMap = new Map<string, string>()
  const cells: NotebookCell[] = source.cells.map((cell) => {
    const id = newId()
    idMap.set(cell.id, id)
    return {
      ...cell,
      id,
      result: undefined,
      lastRunStatus: carriedRunStatus(cell),
    }
  })

  const next: NotebookViewState = { cells }

  if (source.settings) {
    const settings: NotebookSettings = { ...source.settings }
    if (source.settings.layout) {
      settings.layout = source.settings.layout
        .filter((item) => idMap.has(item.i))
        .map((item) => ({ ...item, i: idMap.get(item.i) as string }))
    }
    if (source.settings.variables) {
      settings.variables = source.settings.variables.map((v) => ({ ...v }))
    }
    next.settings = settings
  }

  if (source.maximizedCellId && idMap.has(source.maximizedCellId)) {
    next.maximizedCellId = idMap.get(source.maximizedCellId)
  }
  if (source.focusedCellId && idMap.has(source.focusedCellId)) {
    next.focusedCellId = idMap.get(source.focusedCellId)
  }

  return next
}

const normalizeQueryChart = (q: QueryChart): QueryChart => {
  const next: QueryChart = { type: q.type, yColumns: q.yColumns ?? [] }
  if (q.ohlc) next.ohlc = q.ohlc
  if (q.partitionByColumn) next.partitionByColumn = q.partitionByColumn
  if (q.axis) next.axis = q.axis
  if (q.enabled === false) next.enabled = false
  if (q.name) next.name = q.name
  return next
}

const normalizeChartConfig = (
  cfg: ChartConfig | null | undefined,
): ChartConfig | undefined => {
  if (!cfg) return undefined
  const next: ChartConfig = {
    xColumn: cfg.xColumn ?? null,
    queries: cfg.queries.map((q) => (q ? normalizeQueryChart(q) : null)),
  }
  if (cfg.rightAxis) next.rightAxis = cfg.rightAxis
  if (cfg.autoRefresh !== undefined) next.autoRefresh = cfg.autoRefresh
  return next
}

export const buildAppliedCells = (
  prev: NotebookCell[],
  request: ApplyRequest,
): { nextCells: NotebookCell[]; diff: AppliedDiff } => {
  const prevById = new Map(prev.map((c) => [c.id, c]))
  const seenIds = new Set<string>()
  const added: string[] = []
  const updated: string[] = []

  const nextCells: NotebookCell[] = request.cells.map((req, index) => {
    const requestedId =
      typeof req.id === "string" && req.id.length > 0 ? req.id : undefined
    if (requestedId && seenIds.has(requestedId)) {
      throw new ApplyNotebookStateError(
        `Duplicate cell id "${requestedId}" in request.`,
        "cells",
      )
    }

    const existing = requestedId ? prevById.get(requestedId) : undefined
    if (requestedId && !existing) {
      throw new ApplyNotebookStateError(
        `Unknown cell id "${requestedId}". Omit id to create a new cell; use an id from the current notebook to update one.`,
        "cells",
      )
    }
    const id = requestedId ?? generateId()
    if (existing) seenIds.add(existing.id)
    else seenIds.add(id)

    // apply_notebook_state is a PUT: each requested cell fully describes
    // itself — the value either verbatim or as an explicit preserve.
    const preserve = req.preserveValue === true
    if (preserve && typeof req.value === "string") {
      throw new ApplyNotebookStateError(
        `Cell at index ${index} provides both value and preserve_value:true. Send exactly one per cell.`,
        "cells",
      )
    }
    if (!preserve && typeof req.value !== "string") {
      throw new ApplyNotebookStateError(
        `Cell at index ${index} has no value. Send the full SQL text, or preserve_value:true to keep an existing cell's value unchanged.`,
        "cells",
      )
    }
    const value = preserve ? existing?.value : (req.value ?? undefined)
    if (value === undefined) {
      throw new ApplyNotebookStateError(
        `Cell at index ${index} sets preserve_value:true without an existing cell id. New cells must send value.`,
        "cells",
      )
    }
    const resolvedMode: CellMode | undefined =
      req.mode === undefined || req.mode === null ? undefined : req.mode

    // PUT semantics: a non-empty string sets the name, null/"" clears it.
    const resolvedName =
      typeof req.name === "string" && req.name.length > 0 ? req.name : undefined

    if (resolvedName !== undefined && exceedsCellNameLimit(resolvedName)) {
      throw new ApplyNotebookStateError(
        `Cell at index ${index} has a ${resolvedName.length}-character name, over the ${MAX_CELL_NAME_LENGTH}-character limit.`,
        "cells",
      )
    }

    const chartConfig = normalizeChartConfig(req.chartConfig)

    // Cell kind is STICKY: omitting type preserves an existing cell's kind
    // (unlike mode, which is PUT-reset). Converting a markdown cell to SQL by
    // omission would silently turn prose into a runnable query — too surprising.
    const resolvedType: CellType | undefined =
      req.type === undefined || req.type === null ? existing?.type : req.type

    // Markdown cells hold prose, not editor SQL, so they're exempt from the cap.
    const preservesStoredSql = preserve && existing?.type !== "markdown"
    if (
      !preservesStoredSql &&
      resolvedType !== "markdown" &&
      exceedsCellLineLimit(value)
    ) {
      throw new ApplyNotebookStateError(
        `Cell at index ${index} has ${value.split("\n").length} lines, over the ${MAX_CELL_LINES}-line limit. Split it into multiple cells.`,
        "cells",
      )
    }

    if (resolvedType === "markdown") {
      if (resolvedMode !== undefined) {
        throw new ApplyNotebookStateError(
          `Cell at index ${index} is a markdown cell and cannot have a mode. Omit mode and chart_config for markdown cells.`,
          "cells",
        )
      }
      if (req.chartConfig != null) {
        throw new ApplyNotebookStateError(
          `Cell at index ${index} is a markdown cell and cannot have a chart_config.`,
          "cells",
        )
      }
    }

    if (resolvedMode === "draw" && !chartConfig) {
      throw new ApplyNotebookStateError(
        `Cell at index ${index} has mode='draw' but no chart_config. apply replaces the cell wholesale — send the full chart_config (read the current one from <notebook_context> / get_notebook_state).`,
        "cells",
      )
    }
    if (req.chartConfig && req.chartConfig.queries.length === 0) {
      throw new ApplyNotebookStateError(
        `Cell at index ${index} has a chart_config with no queries. Provide one entry per ;-split query (apply replaces the chart wholesale).`,
        "cells",
      )
    }
    if (req.chartConfig && req.chartConfig.queries.length > 0) {
      const statementCount = getQueriesFromText(value).length
      if (
        statementCount > 0 &&
        req.chartConfig.queries.length !== statementCount
      ) {
        throw new ApplyNotebookStateError(
          `Cell at index ${index} has ${req.chartConfig.queries.length} chart queries but ${statementCount} ;-split statement${statementCount === 1 ? "" : "s"}. Send exactly one entry per statement (index-aligned); apply replaces all per-query configs.`,
          "cells",
        )
      }
    }
    if (
      chartConfig?.queries.some(
        (q) => q != null && q.type === "candlestick" && !q.ohlc,
      )
    ) {
      throw new ApplyNotebookStateError(
        `Cell at index ${index} has a candlestick query with no ohlc mapping.`,
        "cells",
      )
    }

    const isDraw = resolvedMode === "draw"
    const isChartMaximized =
      req.isChartMaximized != null
        ? req.isChartMaximized
        : isDraw
          ? true
          : undefined
    const autoRefresh =
      req.autoRefresh != null ? req.autoRefresh : isDraw ? true : undefined

    if (existing) {
      updated.push(existing.id)
      const valueChanged = existing.value !== value
      const next: NotebookCell = {
        ...existing,
        id: existing.id,
        position: index,
        value,
        result: valueChanged ? null : existing.result,
      }
      if (valueChanged && existing.result) {
        next.lastRunStatus = collapseResultToRunStatus(existing.result)
      }
      if (resolvedMode !== undefined) next.mode = resolvedMode
      else delete next.mode
      if (chartConfig !== undefined) next.chartConfig = chartConfig
      else delete next.chartConfig
      if (autoRefresh !== undefined) next.autoRefresh = autoRefresh
      else delete next.autoRefresh
      if (isChartMaximized !== undefined)
        next.isChartMaximized = isChartMaximized
      else delete next.isChartMaximized
      if (resolvedType === "markdown") {
        // Markdown cells carry none of the SQL/chart sub-state.
        next.type = "markdown"
        next.result = null
        delete next.mode
        delete next.chartConfig
        delete next.autoRefresh
        delete next.isChartMaximized
        delete next.bottomHeight
        delete next.lastRunStatus
      } else {
        delete next.type
      }
      if (resolvedName !== undefined) next.name = resolvedName
      else delete next.name
      return next
    }

    added.push(id)
    const created: NotebookCell = {
      id,
      position: index,
      value,
    }
    if (resolvedName !== undefined) created.name = resolvedName
    if (resolvedType === "markdown") {
      created.type = "markdown"
      return created
    }
    if (resolvedMode !== undefined) created.mode = resolvedMode
    if (chartConfig !== undefined) created.chartConfig = chartConfig
    if (autoRefresh !== undefined) created.autoRefresh = autoRefresh
    if (isChartMaximized !== undefined)
      created.isChartMaximized = isChartMaximized
    // Draw cells are double-view from creation (chart visible immediately),
    // so seed bottomHeight with the chart default. Run cells stay single-
    // view (no bottomHeight) until the user runs them.
    if (resolvedMode === "draw") {
      created.bottomHeight = DEFAULT_CHART_BOTTOM_HEIGHT
    }
    return created
  })

  if (nextCells.length === 0) {
    throw new ApplyNotebookStateError(
      "Request cells array is empty; a notebook must have at least one cell.",
      "cells",
    )
  }

  if (nextCells.length > MAX_NOTEBOOK_CELLS) {
    throw new ApplyNotebookStateError(
      `Request would result in ${nextCells.length} cells; a notebook can have at most ${MAX_NOTEBOOK_CELLS}.`,
      "cells",
    )
  }

  const deleted = prev.filter((c) => !seenIds.has(c.id)).map((c) => c.id)

  return { nextCells, diff: { added, updated, deleted } }
}

// === Cell sizing model ======================================================
// Cells are in one of two view states:
//
//   - Single-view: only the editor (or only the expanded chart) is visible.
//     Total cell height = topHeight + chrome.
//   - Double-view: editor on top + result/chart on bottom.
//     Total cell height = topHeight + bottomHeight + chrome.
//
// `topHeight` and `bottomHeight` live on NotebookCell; they replace the four
// `custom*Height` fields from the old model. In grid mode, the grid h (rows)
// is *derived* from topHeight + bottomHeight on every render.
// ============================================================================

// Approximate fixed chrome around the editor in a cell, in pixels.
// Breakdown:
//   - RunBar: 40 px (1rem vertical padding + ~24 px button glyph)
//   - CellWrapper top/bottom border: 2 px
//   - Inner-top ResizeHandle (only when double-view): 10 px
//   - Safety margin for sub-pixel rounding, grid row bottom-border,
//     and any single-pixel adornments inside the result panel: 4 px
// Stays a single conservative constant rather than state-aware: the
// extra ~14 px in single-view is at most a half-row of trailing
// whitespace at our 10 px grid granularity — invisible — but avoids
// the "row cut by 2-3 px" symptom in double-view cells.
export const CELL_CHROME_PX = 56

// Default editor height for a newly-created cell, before any content arrives.
// Matches MIN_EDITOR_HEIGHT used by Monaco; kept here so layout math doesn't
// need to import Cell.tsx constants.
export const DEFAULT_TOP_HEIGHT = 72

// Default chart height for draw mode (experimental — per user spec).
export const DEFAULT_CHART_BOTTOM_HEIGHT = 350

export const MIN_BOTTOM_HEIGHT_PX = 88

// Pixel sizes of the result panel's chrome. Kept in sync with the styled-
// components in result-table/styles.ts; if those constants change, update
// here.
const TAB_BAR_PX = 40 // TabBarWrapper height = 4rem
const NOTIFICATION_PX = 44 // StatusNotification (compact=true → 4rem + 1-2 px borders)
const RESULT_ACTIONS_BAR_PX = 36 // ResultActionsBar height = 3.6rem (shown with the grid)
const MAX_RESERVED_ROWS = 10 // cap for "tight-fit" single-query results

// Height to reserve for a run cell's result area while its snapshot hydrates —
// the same max single-statement grid height `computeResultBottomHeight` settles
// to for a ≥10-row result, so the grid drops in without a height jump. Mirrors
// how draw reserves a fixed DEFAULT_CHART_BOTTOM_HEIGHT before its data lands.
export const RESERVED_RESULT_BOTTOM_HEIGHT =
  NOTIFICATION_PX +
  RESULT_ACTIONS_BAR_PX +
  HEADER_HEIGHT +
  MAX_RESERVED_ROWS * ROW_HEIGHT

export const isExpectingResult = (
  cell: NotebookCell,
  isHydrating: boolean,
): boolean =>
  isHydrating &&
  cell.mode !== "draw" &&
  cell.lastRunStatus != null &&
  cell.lastRunStatus !== "none" &&
  cell.result == null

const isDqlWithRows = (r: SingleQueryResult): boolean =>
  r.type === "dql" && r.dataset.length > 0

const dqlRowCount = (r: SingleQueryResult): number =>
  r.type === "dql" ? r.dataset.length : 0

// Computes the bottom slot height for a result based on its content.
//
// Rules:
//   1. Single-statement, no data (error / DDL / DML / notice / 0-row DQL):
//      just the notification bar — no wasted blank space.
//   2. Single-statement DQL with N rows: notification + grid header + min(N, 10)
//      rows. Shrinks for small results, caps at 10 for large ones.
//   3. Multi-statement (script) run:
//      - tab bar always visible.
//      - If the first result is non-data (error / DDL / DML / notice), height
//        is just tab bar + notification (the user never saw rows).
//      - Otherwise reserve a full 10 rows worth of space regardless of how
//        many rows the active tab actually has (avoids jitter when switching
//        between tabs that have different row counts).
export const computeResultBottomHeight = (
  result: CellResult | null | undefined,
): number => {
  if (!result || result.results.length === 0) return NOTIFICATION_PX
  const isMulti = result.results.length > 1
  const tabBar = isMulti ? TAB_BAR_PX : 0

  if (isMulti) {
    const first = result.results[0]
    if (!first || !isDqlWithRows(first)) {
      // First query failed / wasn't DQL — we never saw any rows, no point
      // reserving 10 rows of space. The tab bar still shows so the user can
      // click through other tabs.
      return tabBar + NOTIFICATION_PX
    }
    return (
      tabBar +
      NOTIFICATION_PX +
      RESULT_ACTIONS_BAR_PX +
      HEADER_HEIGHT +
      MAX_RESERVED_ROWS * ROW_HEIGHT
    )
  }

  // Single-statement: tight-fit up to 10 rows.
  const only = result.results[0]
  if (!only || !isDqlWithRows(only)) {
    return NOTIFICATION_PX
  }
  const rows = Math.min(MAX_RESERVED_ROWS, dqlRowCount(only))
  return (
    NOTIFICATION_PX + RESULT_ACTIONS_BAR_PX + HEADER_HEIGHT + rows * ROW_HEIGHT
  )
}

// Returns the appropriate default bottom-slot height for a cell, based on
// what the bottom slot will contain. Used as the render-time fallback when
// cell.bottomHeight is undefined (first paint of a freshly-loaded cell).
// Always agrees with what runCell would have written into cell.bottomHeight.
export const defaultBottomHeightFor = (cell: NotebookCell): number =>
  cell.mode === "draw"
    ? DEFAULT_CHART_BOTTOM_HEIGHT
    : computeResultBottomHeight(cell.result)

// True iff this cell occupies vertical space for a bottom slot — i.e. its
// total height includes bottomHeight. This includes the chart-expanded case
// (chart fills both slots; the cell footprint still spans topHeight +
// bottomHeight).
export const isDoubleView = (cell: NotebookCell): boolean => {
  if (cell.mode === "draw") return true
  return cell.result != null
}

// Resolves a cell's editor (top) and bottom-slot heights — shared by the
// rendered cell (Cell.tsx, with live drag overrides) and computeCellGridH.
export const computeCellHeights = (
  cell: NotebookCell,
  opts: {
    liveTopHeight?: number | null
    liveBottomHeight?: number | null
    expectingResult?: boolean
  } = {},
): { topHeight: number; bottomHeight: number } => {
  const topHeight = opts.liveTopHeight ?? cell.topHeight ?? DEFAULT_TOP_HEIGHT
  const bottomHeight = isDoubleView(cell)
    ? (opts.liveBottomHeight ??
      cell.bottomHeight ??
      defaultBottomHeightFor(cell))
    : opts.expectingResult === true
      ? (opts.liveBottomHeight ??
        cell.bottomHeight ??
        RESERVED_RESULT_BOTTOM_HEIGHT)
      : 0
  return { topHeight, bottomHeight }
}

// Derives the react-grid-layout `h` (row count) for a cell from its
// topHeight + bottomHeight + chrome. Recomputed at render time on every
// state change.
//
// react-grid-layout inserts `marginY` BETWEEN rows, so the actual
// rendered px of an h-row cell is `h * rowHeight + (h - 1) * marginY`,
// NOT `h * rowHeight`. To fit a content of `totalPx` we therefore need
// `ceil((totalPx + marginY) / (rowHeight + marginY))` rows. Forgetting
// the marginY term inflated cell heights by ~3× at rowHeight=10,
// marginY=20 (a 500-px content asked for 50 rows that rendered as
// ~1480 px). Default marginY=0 keeps backwards-compat for tests/callers
// that ignore margins.
export const computeCellGridH = (
  cell: NotebookCell,
  rowHeight: number,
  marginY: number = 0,
  expectingResult: boolean = false,
): number => {
  const { topHeight, bottomHeight } = computeCellHeights(cell, {
    expectingResult,
  })
  const totalPx = CELL_CHROME_PX + topHeight + bottomHeight
  return Math.max(1, Math.ceil((totalPx + marginY) / (rowHeight + marginY)))
}

export const partitionCellHeights = (
  sum: number,
  requestedTop: number,
  minTop: number,
  minBottom: number,
): { top: number; bottom: number } => {
  let top = Math.max(minTop, requestedTop)
  let bottom = sum - top
  if (bottom < minBottom) {
    bottom = minBottom
    top = sum - bottom
  }
  return { top, bottom }
}

export const scaleCellHeights = (
  oldTop: number,
  oldBottom: number,
  newContent: number,
  minTop: number,
  minBottom: number,
): { top: number; bottom: number } => {
  const oldContent = oldTop + oldBottom
  const clampedContent = Math.max(minTop + minBottom, newContent)
  const scale = oldContent > 0 ? clampedContent / oldContent : 1
  let top = Math.round(oldTop * scale)
  let bottom = clampedContent - top
  if (top < minTop) {
    top = minTop
    bottom = clampedContent - top
  }
  if (bottom < minBottom) {
    bottom = minBottom
    top = clampedContent - bottom
  }
  return { top, bottom }
}

export const buildAppliedLayout = (
  request: ApplyRequest,
  nextCells: NotebookCell[],
  prevLayout: CellLayoutItem[] | undefined,
  defaults: { gridCols: number; rowHeight: number; marginY?: number },
): CellLayoutItem[] => {
  const prevById = new Map((prevLayout ?? []).map((l) => [l.i, l]))
  let nextY = 0
  return nextCells.map((cell, i) => {
    const req = request.cells[i]
    if (req?.grid) {
      const item = { i: cell.id, ...req.grid }
      nextY = Math.max(nextY, req.grid.y + req.grid.h)
      return item
    }
    const existing = prevById.get(cell.id)
    if (existing) {
      nextY = Math.max(nextY, existing.y + existing.h)
      return existing
    }
    const cellH = computeCellGridH(cell, defaults.rowHeight, defaults.marginY)
    const item: CellLayoutItem = {
      i: cell.id,
      x: 0,
      y: nextY,
      w: defaults.gridCols,
      h: cellH,
    }
    nextY += cellH
    return item
  })
}

export const attachScriptSummary = (
  cells: NotebookCell[],
  cellId: string,
  summary: NonNullable<CellResult["script"]>,
): NotebookCell[] =>
  cells.map((c) => {
    if (c.id !== cellId || !c.result) return c
    return { ...c, result: { ...c.result, script: summary } }
  })
