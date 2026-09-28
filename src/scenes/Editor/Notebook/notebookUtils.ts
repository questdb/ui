import type { QueryExecResult } from "../../../hooks/useQueryExecution"
import type {
  AgentCellView,
  AutoRefresh,
  AutoRefreshInterval,
  CellLayoutItem,
  CellMode,
  CellResult,
  CellType,
  ErrorQueryResult,
  NotebookCell,
  NotebookSettings,
  NotebookVariable,
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
import { sanitizeForPromptContext } from "../../../utils/ai/sanitizeForPromptContext"
import type { ChartConfig, QueryChart } from "./CellChart/chartTypes"
export type { CellResultStatus } from "./resultHydration/cellResultHydration"
import { getQueriesFromText } from "../Monaco/utils"
import type { RunCancellation } from "./runCancellation"
import { reconcileCellResultForValue } from "./statementIdentity"
import { carriedRunError, carriedRunStatus } from "./runHistory"
import {
  type CellResultStatusReader,
  DEFAULT_CHART_BOTTOM_HEIGHT,
  NOTEBOOK_GRID_COLS,
  NOTEBOOK_GRID_MARGIN_Y,
  NOTEBOOK_GRID_ROW_HEIGHT,
  agentCellDimensionsPatch,
  cellGridBoundsError,
  cellHasRunOutcome,
  cellModeChangePatch,
  computeCellGridH,
  discardCellResult,
  hasExplicitModeForEditor,
  isExpectingResult,
  topHeightForSql,
  validateAgentCellDimensions,
} from "./cellSizing"

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
  (typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(AUTO_REFRESH_INTERVALS, value))

// Terminal fallback is Off for every view: nothing polls unless the cell or
// the notebook says so.
export const resolveAutoRefresh = (
  cellValue: AutoRefresh | undefined,
  notebookDefault: AutoRefresh | undefined,
): AutoRefresh => cellValue ?? notebookDefault ?? false

export const countAutoRefreshOverrides = (cells: NotebookCell[]): number =>
  cells.filter((cell) => cell.autoRefresh !== undefined).length

export const countActiveAutoRefreshOverrides = (
  cells: NotebookCell[],
): number =>
  cells.filter(
    (cell) =>
      resolveCellView(cell) !== "none" && cell.autoRefresh !== undefined,
  ).length

export const clearCellAutoRefresh = (cell: NotebookCell): NotebookCell => {
  if (cell.autoRefresh === undefined) return cell
  const { autoRefresh: _, ...rest } = cell
  return rest
}

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

type RunActionPlan = { kind: "chart" | "noop" | "run-all" | "run-single" }

export const resolveRunAction = (
  cell: Pick<NotebookCell, "mode">,
  opts: { intent: "all" | "single" },
): RunActionPlan =>
  cell.mode === "draw"
    ? { kind: opts.intent === "all" ? "chart" : "noop" }
    : { kind: opts.intent === "all" ? "run-all" : "run-single" }

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

export type CellToolbarMenuFlags = {
  showViewTable: boolean
  showViewChart: boolean
  showEditorToggleItem: boolean
  showResetZoom: boolean
  showAutoRefreshItem: boolean
  showRefreshItem: boolean
  showChartSettings: boolean
  showMoveUp: boolean
  showMoveDown: boolean
  showDuplicate: boolean
  showDelete: boolean
  groupAHasItems: boolean
  groupBHasItems: boolean
}

// Which items the "more actions" menu shows. An item appears only when it is
// applicable to the current state AND not already a visible toolbar button for
// this tier/view, so the menu never duplicates an inline control or offers a
// disabled/greyed action. The compact tier has no inline view controls, so the
// menu carries the same three controls the wider tiers show in the header:
// the table/chart segments and the editor toggle, as checkable items.
// Markdown cells (no run/draw views) keep just the move/duplicate/delete items.
export const cellToolbarMenuFlags = (params: {
  tier: CellToolbarTier
  view: CellView
  isMarkdown: boolean
  chartZoomed: boolean
  isGridMode: boolean
  cellIndex: number
  totalCells: number
}): CellToolbarMenuFlags => {
  const {
    tier,
    view,
    isMarkdown,
    chartZoomed,
    isGridMode,
    cellIndex,
    totalCells,
  } = params
  const isCompact = tier === "compact"
  const isChartView = view === "chart"
  const isNoneView = view === "none"
  const hasToolbarRefresh = tier === "expanded" && !isNoneView
  // The inline interval control rides on the refresh split-button, which the
  // expanded tier renders for grids as well as charts.
  const hasToolbarInterval = hasToolbarRefresh

  const showViewTable = isCompact && !isMarkdown
  const showViewChart = isCompact && !isMarkdown
  const showEditorToggleItem = isCompact && !isNoneView && !isMarkdown
  const showResetZoom = isCompact && isChartView && chartZoomed
  // Auto-refresh applies to any cell showing a view, not just charts.
  const showAutoRefreshItem = !hasToolbarInterval && !isNoneView
  const showRefreshItem = !hasToolbarRefresh && !isNoneView
  const showChartSettings = isChartView
  const showMoveUp = !isGridMode && cellIndex > 0
  const showMoveDown = !isGridMode && cellIndex < totalCells - 1
  const showDuplicate = totalCells < MAX_NOTEBOOK_CELLS
  const showDelete = totalCells > 1

  return {
    showViewTable,
    showViewChart,
    showEditorToggleItem,
    showResetZoom,
    showAutoRefreshItem,
    showRefreshItem,
    showChartSettings,
    showMoveUp,
    showMoveDown,
    showDuplicate,
    showDelete,
    groupAHasItems: showViewTable || showViewChart || showEditorToggleItem,
    groupBHasItems:
      showResetZoom ||
      showAutoRefreshItem ||
      showRefreshItem ||
      showChartSettings,
  }
}

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
        ...(exec.notice !== undefined ? { notice: exec.notice } : {}),
        fetchedAt: Date.now(),
      }
    case "error":
      return errorResult(query, exec.error ?? "Unknown error")
    default:
      return { type: exec.type, query, fetchedAt: Date.now() }
  }
}

export const errorResult = (
  query: string,
  error: string,
): ErrorQueryResult => ({
  type: "error",
  query,
  error,
  fetchedAt: Date.now(),
})

// The newest fetch time among a frame's results: the freshness a poll
// schedule starts from after a reveal or a reload.
export const frameFetchedAt = (results: SingleQueryResult[]): number =>
  results.reduce(
    (latest, result) =>
      "fetchedAt" in result && result.fetchedAt !== undefined
        ? Math.max(latest, result.fetchedAt)
        : latest,
    0,
  )

// Notebook-scoped result caps. Rows are bounded at the fetch; the byte cap
// bounds wide results so a persisted snapshot stays small. Deliberately NOT the
// shared RESULT_DISPLAY_LIMIT (which the main Result panel uses).
export const NOTEBOOK_ROW_CAP = 10_000
export const NOTEBOOK_BYTE_CAP = 2_000_000

// Cap a DQL result's dataset to ~`maxBytes` of serialized rows. `count` is left
// as the server-returned value so the existing "X of Y rows" indicator still
// reflects that rows were dropped, while `truncated` prevents draw mode from
// mistaking the retained prefix for a complete chart frame. Non-DQL / empty
// results pass through.
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
  return {
    ...result,
    dataset: result.dataset.slice(0, keepRows),
    truncated: true,
  }
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

export const MOUNTED_MID_RUN_NOTE =
  "Run completed, but the user opened this notebook while it was running, so " +
  "the result was not recorded. Call get_notebook_state to see the current " +
  "cell state, and verify before re-running anything with side effects."

export const USER_CHANGED_MID_RUN_NOTE =
  "Run completed, but the user changed this notebook while it was running, so " +
  "the result was not recorded. Call get_notebook_state to see the current " +
  "cell state, and verify before re-running anything with side effects."

export const CELL_CHANGED_MID_RUN_NOTE =
  "Run completed, but the cell's SQL was changed while it was running, so " +
  "the result was not recorded. Call get_notebook_state to see the current " +
  "cell state, and verify before re-running anything with side effects."

export const CELL_CHANGED_BEFORE_RUN_NOTE =
  "Run NOT started: the cell's SQL changed between reading it and running " +
  "it, so nothing was executed. Call get_notebook_state to see the current " +
  "cell state; it is safe to re-run with the fresh value."

export const STORAGE_FULL_RUN_NOTE =
  "Run completed, but the result could not be saved because the browser's " +
  "local storage limit is exceeded, so it was NOT recorded. Tell the user to " +
  "free up space (clear old query history or notebooks), and verify before " +
  "re-running anything with side effects."

export const RESULT_NOT_SAVED_RUN_NOTE =
  "Run completed and recorded, but its result rows couldn't be saved to local " +
  "storage (the limit is exceeded), so the result grid may not reappear if the " +
  "notebook is reloaded. Tell the user to free up space (clear old query " +
  "history or notebooks). No re-run is needed."

// The outcome of a live cell run. `superseded` is true when a newer run (or a
// cancel) discarded this run's result before it could be recorded, so the cell
// now holds someone else's result — the agent route must not read it back as
// its own (see notebookController's live runCell). Agent runs
// (expectFullValue) never record a result they can no longer attribute. User
// runs keep their result when the user edits during execution, but roll back
// when an external transition changed the SQL and cleared the in-flight result.
export type CellRunOutcome = {
  ok: boolean
  superseded: boolean
  cellChanged?: boolean
  notStarted?: boolean
  resultCleared?: boolean
  // Why a cancelled run stopped. With notStarted it was stopped before any
  // SQL launched; otherwise the result was discarded at commit.
  cancelled?: RunCancellation
  // Barrier decisions for gated (agent) runs: a permission denial or an
  // auto-run write skip. Nothing executed when either is set.
  denied?: string
  skipped?: string
  // The result THIS run produced, set only when it committed. Consumers that
  // report the run's output must read this instead of cell.result — a draw
  // cell's auto-refresh replaces cell.result independently of the run.
  result?: CellResult
}

export type RunCompletionDecision = "commit" | "cell_changed" | "result_cleared"

export const resolveRunCompletion = (
  cell: Pick<NotebookCell, "value" | "result">,
  valueAtRunStart: string | undefined,
  expectFullValue: boolean,
): RunCompletionDecision => {
  if (expectFullValue && !cell.result) return "result_cleared"
  if (cell.value !== valueAtRunStart && (expectFullValue || !cell.result)) {
    return "cell_changed"
  }
  return "commit"
}

const trimForSummary = (text: string): string =>
  text.length > 200 ? `${text.slice(0, 197)}...` : text

export const summarizeCellResults = (cell: NotebookCell | undefined) => {
  const freshResult = cell?.result
  if (!freshResult) {
    return { success: false, queryCount: 0, results: [] }
  }

  const results = freshResult.results.map((r) => {
    if (r.type === "cancelled") return "cancelled"
    if (r.type === "running" || r.type === "queued") return "pending"
    if (r.type === "error") {
      return `ERROR: ${sanitizeForPromptContext(trimForSummary(r.error))}`
    }
    if (r.type === "dql" && r.notice !== undefined) {
      return `success (NOTICE: ${sanitizeForPromptContext(trimForSummary(r.notice))})`
    }
    return "success"
  })

  const unverified = freshResult.results.some((r) => isUnverifiableExecError(r))
  return {
    success:
      results.length > 0 && results.every((r) => r.startsWith("success")),
    queryCount: results.length,
    results,
    ...(unverified
      ? {
          unverified: true,
          note: UNVERIFIED_RUN_NOTE,
        }
      : {}),
  }
}

export const stripCellResults = (cells: NotebookCell[]): NotebookCell[] =>
  cells.map((cell) => {
    const persisted: NotebookCell = {
      ...cell,
      result: undefined,
      lastRunStatus: carriedRunStatus(cell),
      lastRunError: carriedRunError(cell),
    }
    if (cell.type === "markdown") delete persisted.paneView
    else persisted.paneView = cell.paneView ?? "editor_result"
    const canonical = persisted as NotebookCell & Record<string, unknown>
    if (canonical.mode !== "draw") delete canonical.mode
    delete canonical.isViewMaximized
    return persisted
  })

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

export type CellGridPosition = { x: number; y: number; w: number; h: number }

// Fresh grid cells land below everything else. h = 1 is a sentinel; the
// rendered height is derived at render time via computeCellGridH.
export const nextGridSeedPosition = (
  layout: CellLayoutItem[] | undefined,
): CellGridPosition => {
  const items = layout ?? []
  const maxY = items.length > 0 ? Math.max(...items.map((l) => l.y + l.h)) : 0
  return { x: 0, y: maxY, w: 12, h: 1 }
}

export const upsertCellLayout = (
  layout: CellLayoutItem[] | undefined,
  cellId: string,
  pos: CellGridPosition,
): CellLayoutItem[] => {
  const items = layout ?? []
  return items.some((l) => l.i === cellId)
    ? items.map((l) => (l.i === cellId ? { ...l, ...pos } : l))
    : [...items, { i: cellId, ...pos }]
}

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
  const created: NotebookCell =
    Object.keys(patch).length > 0 ? { ...base, ...patch } : base
  if (created.type === "markdown") delete created.paneView
  const newCell: NotebookCell =
    created.type === "markdown" || created.topHeight !== undefined
      ? created
      : { ...created, topHeight: topHeightForSql(created.value) }
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
    lastRunError: carriedRunError(original),
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
  editorHeight?: number | "auto" | null
  resultHeight?: number | "auto" | null
  view?: AgentCellView | null
  chartConfig?: ChartConfig | null
  grid?: { x: number; y: number; w: number } | null
}

type ApplyRequest = {
  layoutMode?: "list" | "grid" | null
  autoRefreshDefault?: AutoRefresh | null
  maximizedCellId?: string | null
  variables?: NotebookVariable[] | null
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

export const generateId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

export const nextCopyLabel = (label: string): string => {
  const match = label.match(/^(.*) \(copy(?: (\d+))?\)$/)
  if (!match) return `${label} (copy)`
  const n = match[2] ? parseInt(match[2], 10) : 1
  return `${match[1]} (copy ${n + 1})`
}

export const cloneNotebookViewStateWithCellIdMap = (
  source: NotebookViewState,
  newId: () => string = generateId,
): {
  notebookViewState: NotebookViewState
  cellIdMap: ReadonlyMap<string, string>
} => {
  const idMap = new Map<string, string>()
  const cells: NotebookCell[] = source.cells.map((cell) => {
    const id = newId()
    idMap.set(cell.id, id)
    return {
      ...cell,
      id,
      result: undefined,
      lastRunStatus: carriedRunStatus(cell),
      lastRunError: carriedRunError(cell),
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

  return { notebookViewState: next, cellIdMap: idMap }
}

export const cloneNotebookViewState = (
  source: NotebookViewState,
  newId: () => string = generateId,
): NotebookViewState =>
  cloneNotebookViewStateWithCellIdMap(source, newId).notebookViewState

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
  return next
}

export const buildAppliedCells = (
  prev: NotebookCell[],
  request: ApplyRequest,
): {
  nextCells: NotebookCell[]
  diff: AppliedDiff
  resultsCleared: string[]
} => {
  const prevById = new Map(prev.map((c) => [c.id, c]))
  const seenIds = new Set<string>()
  const added: string[] = []
  const updated: string[] = []
  const resultsCleared: string[] = []

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
    const existingKind: CellType = existing?.type ?? "sql"
    if (existing && req.type != null && req.type !== existingKind) {
      throw new ApplyNotebookStateError(
        `Cell "${existing.id}" is ${existingKind}; cell kind cannot change. Delete it and add a new cell.`,
        "cells",
      )
    }
    const resolvedType: CellType | undefined = existing
      ? existing.type
      : (req.type ?? undefined)

    // A markdown cell can carry a stored mode only through legacy import
    // leakage; inheriting it would make every apply that preserves the cell
    // fail on advice the agent already followed. Dropping it heals the cell
    // on write — only an explicitly requested mode is the agent's error.
    const resolvedMode: CellMode | undefined =
      resolvedType === "markdown"
        ? undefined
        : req.view === "editor"
          ? undefined
          : req.mode === undefined || req.mode === null
            ? existing?.mode
            : req.mode

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

    // Markdown cells hold prose, not editor SQL, so they're exempt from the cap.
    if (
      !preserve &&
      resolvedType !== "markdown" &&
      exceedsCellLineLimit(value)
    ) {
      throw new ApplyNotebookStateError(
        `Cell at index ${index} has ${value.split("\n").length} lines, over the ${MAX_CELL_LINES}-line limit. Split it into multiple cells.`,
        "cells",
      )
    }

    if (resolvedType === "markdown") {
      if (req.mode != null) {
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

    if (hasExplicitModeForEditor(req.mode, req.view)) {
      throw new ApplyNotebookStateError(
        `Cell at index ${index} combines an explicit mode with view "editor". Editor view clears the stored result and hides the result pane. Set mode to null to request an editor-only view.`,
        "cells",
      )
    }

    const isDraw = resolvedMode === "draw"
    const dimensionCell: NotebookCell = {
      ...(existing ?? { id, position: index, value, type: resolvedType }),
      value,
    }
    if (isDraw) dimensionCell.mode = "draw"
    else delete dimensionCell.mode
    const validation = validateAgentCellDimensions(dimensionCell, {
      editorHeight: req.editorHeight,
      resultHeight: req.resultHeight,
      view: req.view,
    })
    if (!validation.ok) {
      const { issue } = validation
      if (issue.reason === "invalid_view") {
        throw new ApplyNotebookStateError(
          `Cell at index ${index} has an invalid view; use editor, result, or editor_result.`,
          "cells",
        )
      }
      if (issue.reason === "invalid_type") {
        throw new ApplyNotebookStateError(
          `Cell at index ${index} has an invalid ${issue.field}; use a number, auto, or null.`,
          "cells",
        )
      }
      if (issue.reason === "below_minimum") {
        const message =
          issue.field === "editor_height"
            ? `Cell at index ${index} has an editor_height below its minimum.`
            : `Cell at index ${index} has result_height ${issue.value}px; minimum is ${issue.limit}px.`
        throw new ApplyNotebookStateError(message, "cells")
      }
      throw new ApplyNotebookStateError(
        `Cell at index ${index} has ${issue.field} ${issue.value}px; maximum is ${issue.limit}px.`,
        "cells",
      )
    }
    const { dimensions } = validation
    const dimensionsPatch = agentCellDimensionsPatch(dimensionCell, dimensions)
    if (req.view == null && !existing && isDraw) {
      dimensionsPatch.paneView = "result"
    }
    const autoRefresh =
      req.autoRefresh != null && resolvedType !== "markdown"
        ? req.autoRefresh
        : undefined

    if (req.grid) {
      const gridError = cellGridBoundsError(req.grid)
      if (gridError) {
        throw new ApplyNotebookStateError(
          `Cell at index ${index} has invalid grid placement: ${gridError}`,
          "cells",
        )
      }
    }

    if (existing) {
      updated.push(existing.id)
      const valueChanged = existing.value !== value
      // Results carry over by statement content: unchanged statements keep
      // theirs, zero survivors collapse the frame. A released cell (result on
      // disk only) keeps its snapshot — hydration reconciles it on load.
      let next: NotebookCell = {
        ...existing,
        id: existing.id,
        position: index,
        value,
        result: valueChanged
          ? reconcileCellResultForValue(existing.result, value)
          : existing.result,
      }
      const resultDropped =
        valueChanged && existing.result != null && next.result === null
      if (resultDropped) {
        // The whole frame is gone — collapse the run outcome into recorded
        // history the way a release would. The record describes the last run
        // that actually happened; only a run rewrites it.
        const carried = carriedRunStatus(existing)
        const carriedError = carriedRunError(existing)
        if (carried !== undefined) next.lastRunStatus = carried
        if (carriedError !== undefined) next.lastRunError = carriedError
        else delete next.lastRunError
        resultsCleared.push(existing.id)
      }
      if (isDraw) next.mode = "draw"
      else delete next.mode
      if ((existing.mode === "draw") !== isDraw) {
        Object.assign(next, cellModeChangePatch(next, resolvedMode ?? "run"))
      }
      if (chartConfig !== undefined) next.chartConfig = chartConfig
      else delete next.chartConfig
      if (autoRefresh !== undefined) next.autoRefresh = autoRefresh
      else delete next.autoRefresh
      if (req.view === "editor" && cellHasRunOutcome(existing)) {
        next = discardCellResult(next)
        if (!resultsCleared.includes(existing.id)) {
          resultsCleared.push(existing.id)
        }
      }
      Object.assign(next, dimensionsPatch)
      if (resolvedType !== "markdown") {
        next.paneView ??= "editor_result"
        if (valueChanged && !next.topResized) {
          const estimated = topHeightForSql(value)
          if (
            existing.topHeight == null ||
            estimated !== topHeightForSql(existing.value)
          ) {
            next.topHeight = estimated
          }
        }
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
      Object.assign(created, dimensionsPatch)
      return created
    }
    created.topHeight = topHeightForSql(value)
    created.paneView = "editor_result"
    if (resolvedMode === "draw") created.mode = "draw"
    if (chartConfig !== undefined) created.chartConfig = chartConfig
    if (autoRefresh !== undefined) created.autoRefresh = autoRefresh
    // Draw cells are double-view from creation (chart visible immediately),
    // so seed bottomHeight with the chart default. Run cells stay single-
    // view (no bottomHeight) until the user runs them.
    if (resolvedMode === "draw") {
      created.bottomHeight = DEFAULT_CHART_BOTTOM_HEIGHT
    }
    Object.assign(created, dimensionsPatch)
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

  return { nextCells, diff: { added, updated, deleted }, resultsCleared }
}

export const buildAppliedLayout = (
  request: ApplyRequest,
  nextCells: NotebookCell[],
  prevLayout: CellLayoutItem[] | undefined,
  defaults: { gridCols: number; rowHeight: number; marginY?: number },
  resultStatusOf: CellResultStatusReader = () => "unrequested",
): CellLayoutItem[] => {
  const prevById = new Map((prevLayout ?? []).map((l) => [l.i, l]))
  let nextY = 0
  return nextCells.map((cell, i) => {
    const req = request.cells[i]
    if (req?.grid) {
      const h = computeCellGridH(
        cell,
        defaults.rowHeight,
        defaults.marginY,
        isExpectingResult(cell, resultStatusOf(cell.id)),
      )
      const item = {
        i: cell.id,
        x: req.grid.x,
        y: req.grid.y,
        w: req.grid.w,
        h,
      }
      nextY = Math.max(nextY, req.grid.y + h)
      return item
    }
    const existing = prevById.get(cell.id)
    if (existing) {
      const h = computeCellGridH(
        cell,
        defaults.rowHeight,
        defaults.marginY,
        isExpectingResult(cell, resultStatusOf(cell.id)),
      )
      nextY = Math.max(nextY, existing.y + h)
      return existing.h === h ? existing : { ...existing, h }
    }
    const cellH = computeCellGridH(
      cell,
      defaults.rowHeight,
      defaults.marginY,
      isExpectingResult(cell, resultStatusOf(cell.id)),
    )
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

export type NotebookDocumentState = {
  cells: NotebookCell[]
  settings: NotebookSettings
  maximizedCellId: string | null
}

export const buildAppliedNotebookState = (
  current: NotebookDocumentState,
  request: ApplyRequest,
  resultStatusOf: CellResultStatusReader = () => "unrequested",
): NotebookDocumentState & { diff: AppliedDiff; resultsCleared: string[] } => {
  const { nextCells, diff, resultsCleared } = buildAppliedCells(
    current.cells,
    request,
  )
  const targetLayoutMode =
    request.layoutMode === undefined || request.layoutMode === null
      ? current.settings.layoutMode
      : request.layoutMode

  let nextSettings = current.settings
  if (targetLayoutMode === "grid") {
    nextSettings = {
      ...nextSettings,
      layoutMode: "grid",
      layout: buildAppliedLayout(
        request,
        nextCells,
        current.settings.layout,
        {
          gridCols: NOTEBOOK_GRID_COLS,
          rowHeight: NOTEBOOK_GRID_ROW_HEIGHT,
          marginY: NOTEBOOK_GRID_MARGIN_Y,
        },
        resultStatusOf,
      ),
    }
  } else if (request.layoutMode !== undefined && request.layoutMode !== null) {
    nextSettings = { ...nextSettings, layoutMode: request.layoutMode }
  }
  if (
    request.autoRefreshDefault !== undefined &&
    request.autoRefreshDefault !== null
  ) {
    nextSettings = {
      ...nextSettings,
      autoRefreshDefault: request.autoRefreshDefault,
    }
  }
  if (request.variables !== undefined) {
    nextSettings = { ...nextSettings, variables: request.variables ?? [] }
  }

  let nextMaximizedCellId = current.maximizedCellId
  if (request.maximizedCellId !== undefined) {
    const id = request.maximizedCellId
    nextMaximizedCellId = id && nextCells.some((c) => c.id === id) ? id : null
  } else if (
    nextMaximizedCellId &&
    !nextCells.some((c) => c.id === nextMaximizedCellId)
  ) {
    nextMaximizedCellId = null
  }

  return {
    cells: nextCells,
    settings: nextSettings,
    maximizedCellId: nextMaximizedCellId,
    diff,
    resultsCleared,
  }
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
