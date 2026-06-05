import type { QueryExecResult } from "../../../hooks/useQueryExecution"
import type {
  CellLayoutItem,
  CellMode,
  CellResult,
  NotebookCell,
  NotebookSettings,
  NotebookViewState,
  SingleQueryResult,
} from "../../../store/notebook"
import { createCell } from "../../../store/notebook"
import type { ChartConfig, QueryChart } from "./CellChart/chartTypes"
import { getQueriesFromText } from "../Monaco/utils"

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
        timings: exec.timings,
      }
    case "error":
      return { type: "error", query, error: exec.error ?? "Unknown error" }
    default:
      return { type: exec.type, query }
  }
}

export const stripCellResults = (cells: NotebookCell[]): NotebookCell[] =>
  cells.map((cell) => ({ ...cell, result: undefined }))

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
  override?: { id?: string; value?: string },
): NotebookCell[] => {
  const insertIndex =
    afterCellId !== undefined
      ? cells.findIndex((c) => c.id === afterCellId) + 1
      : cells.length
  const base = factory(insertIndex, override?.value ?? "")
  const patch: Partial<NotebookCell> = {}
  if (override?.id) patch.id = override.id
  if (override?.value !== undefined) patch.value = override.value
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
  value: string
  mode?: CellMode | null
  autoRefresh?: boolean | null
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
    return { ...cell, id, result: undefined }
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
  if (cfg.name) next.name = cfg.name
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

    // apply_notebook_state is a PUT: each requested cell fully describes itself.
    const resolvedMode: CellMode | undefined =
      req.mode === undefined || req.mode === null ? undefined : req.mode

    const chartConfig = normalizeChartConfig(req.chartConfig)

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
      const statementCount = getQueriesFromText(req.value).length
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
      const valueChanged = existing.value !== req.value
      const next: NotebookCell = {
        ...existing,
        id: existing.id,
        position: index,
        value: req.value,
        result: valueChanged ? null : existing.result,
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
      return next
    }

    added.push(id)
    const created: NotebookCell = {
      id,
      position: index,
      value: req.value,
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
const GRID_HEADER_PX = 44 // result-table HEADER_HEIGHT
const GRID_ROW_PX = 28 // result-table ROW_HEIGHT
const MAX_RESERVED_ROWS = 10 // cap for "tight-fit" single-query results

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
      GRID_HEADER_PX +
      MAX_RESERVED_ROWS * GRID_ROW_PX
    )
  }

  // Single-statement: tight-fit up to 10 rows.
  const only = result.results[0]
  if (!only || !isDqlWithRows(only)) {
    return NOTIFICATION_PX
  }
  const rows = Math.min(MAX_RESERVED_ROWS, dqlRowCount(only))
  return NOTIFICATION_PX + GRID_HEADER_PX + rows * GRID_ROW_PX
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
): number => {
  const top = cell.topHeight ?? DEFAULT_TOP_HEIGHT
  const bottom = isDoubleView(cell)
    ? (cell.bottomHeight ?? defaultBottomHeightFor(cell))
    : 0
  const totalPx = CELL_CHROME_PX + top + bottom
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

export const COLUMN_SIZING_LRU_MAX = 20

export const upsertColumnSizing = (
  prev: NotebookCell["columnSizing"] | undefined,
  key: string,
  next: Record<string, number>,
  max: number = COLUMN_SIZING_LRU_MAX,
): NotebookCell["columnSizing"] => {
  const { [key]: _evicted, ...rest } = prev ?? {}
  const merged: Record<string, Record<string, number>> = {
    ...rest,
    [key]: next,
  }
  const keys = Object.keys(merged)
  if (keys.length <= max) return merged
  const dropCount = keys.length - max
  for (let i = 0; i < dropCount; i++) {
    delete merged[keys[i]]
  }
  return merged
}
