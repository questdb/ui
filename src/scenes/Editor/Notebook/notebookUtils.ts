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
import { deriveRunStatusFromResults } from "../../../utils/ai/runStatus"
import type { RunStatus } from "../../../utils/ai/runStatus"
import { sanitizeForPromptContext } from "../../../utils/ai/sanitizeForPromptContext"
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

type RunActionPlan =
  | { kind: "chart" }
  | { kind: "noop" }
  | { kind: "run-all" | "run-single"; reveal: boolean; exitDraw: boolean }

export const resolveRunAction = (
  cell: Pick<NotebookCell, "mode" | "result">,
  opts: {
    isCompactTier: boolean
    showBottomSlot: boolean
    intent: "all" | "single"
  },
): RunActionPlan => {
  // Reveal only the compact "View SQL" collapse — in wider tiers the slot is
  // never force-hidden, so revealing there would wrongly maximize a split view.
  const reveal = opts.isCompactTier && !opts.showBottomSlot
  if (cell.mode === "draw" && !reveal) {
    return opts.intent === "all" ? { kind: "chart" } : { kind: "noop" }
  }
  // Run mode, or a draw cell collapsed behind the compact "View SQL" editor:
  // act as a grid so a shortcut never surfaces the chart from the editor. A
  // collapsed draw cell drops to run mode first, so the grid — not the chart —
  // is what appears.
  return {
    kind: opts.intent === "all" ? "run-all" : "run-single",
    reveal,
    exitDraw: cell.mode === "draw",
  }
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

export type CellToolbarMenuFlags = {
  showViewSql: boolean
  showViewTable: boolean
  showViewChart: boolean
  showSplitItem: boolean
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
// disabled/greyed action. `sqlShown` is the compact-tier "View SQL" state
// (isViewMaximized === false). Markdown cells (no run/draw views) keep just the
// move/duplicate/delete items.
export const cellToolbarMenuFlags = (params: {
  tier: CellToolbarTier
  view: CellView
  isMarkdown: boolean
  sqlShown: boolean
  chartZoomed: boolean
  isGridMode: boolean
  cellIndex: number
  totalCells: number
}): CellToolbarMenuFlags => {
  const {
    tier,
    view,
    isMarkdown,
    sqlShown,
    chartZoomed,
    isGridMode,
    cellIndex,
    totalCells,
  } = params
  const isCompact = tier === "compact"
  const isChartView = view === "chart"
  const isGridView = view === "grid"
  const isNoneView = view === "none"
  const hasToolbarSplit = tier !== "compact" && !isNoneView
  const hasToolbarRefresh = tier === "expanded" && !isNoneView
  const hasToolbarInterval = tier === "expanded" && isChartView
  const chartCollapsed = isCompact && isChartView && sqlShown

  const showViewSql = isCompact && !isNoneView && !isMarkdown && !sqlShown
  const showViewTable =
    isCompact && !isMarkdown && (isNoneView || sqlShown || isChartView)
  const showViewChart =
    isCompact && !isMarkdown && (isNoneView || sqlShown || isGridView)
  const showSplitItem = !hasToolbarSplit && !isNoneView && !isCompact
  const showResetZoom =
    isCompact && isChartView && chartZoomed && !chartCollapsed
  const showAutoRefreshItem = !hasToolbarInterval && isChartView
  const showRefreshItem = !hasToolbarRefresh && !isNoneView && !chartCollapsed
  const showChartSettings = isChartView && !chartCollapsed
  const showMoveUp = !isGridMode && cellIndex > 0
  const showMoveDown = !isGridMode && cellIndex < totalCells - 1
  const showDuplicate = totalCells < MAX_NOTEBOOK_CELLS
  const showDelete = totalCells > 1

  return {
    showViewSql,
    showViewTable,
    showViewChart,
    showSplitItem,
    showResetZoom,
    showAutoRefreshItem,
    showRefreshItem,
    showChartSettings,
    showMoveUp,
    showMoveDown,
    showDuplicate,
    showDelete,
    groupAHasItems:
      showViewSql || showViewTable || showViewChart || showSplitItem,
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

export const SUPERSEDED_RUN_NOTE =
  "Run completed, but a newer run of this cell started before the result " +
  "could be recorded, so it was discarded. The newer run's outcome is " +
  "authoritative; verify before re-running anything with side effects."

export const CELL_CHANGED_MID_RUN_NOTE =
  "Run completed, but the cell's SQL was changed while it was running, so " +
  "the result was not recorded. Call get_notebook_state to see the current " +
  "cell state, and verify before re-running anything with side effects."

export const CELL_CHANGED_BEFORE_RUN_NOTE =
  "Run NOT started: the cell's SQL changed between reading it and running " +
  "it, so nothing was executed. Call get_notebook_state to see the current " +
  "cell state; it is safe to re-run with the fresh value."

export const RESULT_CLEARED_MID_RUN_NOTE =
  "Run completed, but this cell's result was cleared while it was running " +
  "(the notebook state was replaced, or the result view was reset), so the " +
  "result was not recorded. Call get_notebook_state to see the current cell " +
  "state, and verify before re-running anything with side effects."

export const CELL_DELETED_MID_RUN_NOTE =
  "Run completed, but the cell was deleted while it was running, so the " +
  "result was not recorded. Call get_notebook_state to see the current " +
  "notebook state, and verify before re-running anything with side effects."

export const NOTEBOOK_DELETED_MID_RUN_NOTE =
  "Run completed, but the notebook was deleted while it was running, so the " +
  "result was not recorded. Call get_workspace_state to see the current " +
  "workspace, and verify before re-running anything with side effects."

export const NOTEBOOK_ARCHIVED_MID_RUN_NOTE =
  "Run completed, but the notebook was archived while it was running, so the " +
  "result was not recorded. Restore it and call get_notebook_state to see the " +
  "current cell state, and verify before re-running anything with side effects."

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

export const hasPendingResult = (
  result: CellResult | null | undefined,
): boolean =>
  result?.results.some((r) => r.type === "running" || r.type === "queued") ??
  false

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
  isViewMaximized?: boolean | null
  chartConfig?: ChartConfig | null
  grid?: { x: number; y: number; w: number; h: number } | null
}

type ApplyRequest = {
  layoutMode?: "list" | "grid" | null
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
      req.mode === undefined || req.mode === null ? existing?.mode : req.mode

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

    // Cell kind and mode are sticky: omission preserves the existing cell.
    // Converting a markdown cell to SQL by omission would silently turn prose
    // into a runnable query, so only an explicit type can do that.
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
    const isViewMaximized =
      req.isViewMaximized != null
        ? req.isViewMaximized
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
      if (valueChanged) {
        // Preserve run history so agents still see a committed write survived a
        // value edit — but an error belonged to the SQL just replaced, so
        // carrying it forward would resurrect a stale error on the fixed cell.
        const carried = carriedRunStatus(existing)
        if (carried === "error") delete next.lastRunStatus
        else if (carried !== undefined) next.lastRunStatus = carried
      }
      if (resolvedMode !== undefined) next.mode = resolvedMode
      else delete next.mode
      if (chartConfig !== undefined) next.chartConfig = chartConfig
      else delete next.chartConfig
      if (autoRefresh !== undefined) next.autoRefresh = autoRefresh
      else delete next.autoRefresh
      if (isViewMaximized !== undefined) next.isViewMaximized = isViewMaximized
      else delete next.isViewMaximized
      if (resolvedType === "markdown") {
        // Markdown cells carry none of the SQL/chart sub-state.
        next.type = "markdown"
        next.result = null
        delete next.mode
        delete next.chartConfig
        delete next.autoRefresh
        delete next.isViewMaximized
        delete next.bottomHeight
        delete next.lastRunStatus
      } else {
        delete next.type
        if (valueChanged && !existing.topResized) {
          next.topHeight = topHeightForSql(value)
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
      return created
    }
    created.topHeight = topHeightForSql(value)
    if (resolvedMode !== undefined) created.mode = resolvedMode
    if (chartConfig !== undefined) created.chartConfig = chartConfig
    if (autoRefresh !== undefined) created.autoRefresh = autoRefresh
    if (isViewMaximized !== undefined) created.isViewMaximized = isViewMaximized
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

export const CELL_EDITOR_LINE_HEIGHT = 24
export const CELL_EDITOR_PADDING = { top: 4, bottom: 4 }

export const topHeightForSql = (value: string): number =>
  Math.max(
    DEFAULT_TOP_HEIGHT,
    value.split("\n").length * CELL_EDITOR_LINE_HEIGHT +
      CELL_EDITOR_PADDING.top +
      CELL_EDITOR_PADDING.bottom,
  )

// Markdown cells carry less chrome than SQL cells (a 40px drag header plus
// 2px of wrapper borders) and keep their heights on the grid-row lattice
// (58, 88, 118, …) so the derived cell box is always exact — see
// snapMarkdownTopHeight.
export const MARKDOWN_CELL_CHROME_PX = 42
export const MARKDOWN_DEFAULT_TOP_HEIGHT = 58
export const MIN_MARKDOWN_HEIGHT_PX = 28

// Default chart height for draw mode (experimental — per user spec).
export const DEFAULT_CHART_BOTTOM_HEIGHT = 350

export const MIN_BOTTOM_HEIGHT_PX = 100

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

const isDqlWithColumns = (r: SingleQueryResult): boolean =>
  r.type === "dql" && r.columns.length > 0

const dqlRowCount = (r: SingleQueryResult): number =>
  r.type === "dql" ? r.dataset.length : 0

// Computes the bottom slot height for a result based on its content.
//
// Rules:
//   1. Single-statement, no grid (error / DDL / DML / notice): just the
//      notification bar — no wasted blank space.
//   2. Single-statement DQL with columns: notification + actions bar + grid
//      header + min(N, 10) rows. A 0-row DQL still shows its column headers, so
//      it reserves the header with no row space. Shrinks for small results,
//      caps at 10 for large ones.
//   3. Multi-statement (script) run:
//      - tab bar always visible.
//      - If the first result is non-DQL (error / DDL / DML / notice), height
//        is just tab bar + notification (no grid to show).
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
    if (!first || !isDqlWithColumns(first)) {
      // First query failed / wasn't DQL — there is no grid to show, no point
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
  if (!only || !isDqlWithColumns(only)) {
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

// bottomHeight seeding when a cell flips between run and draw. A user-resized
// bottom slot is never overridden.
export const modeChangeBottomHeightPatch = (
  cell: NotebookCell | undefined,
  mode: CellMode,
): Partial<NotebookCell> => {
  if (cell?.bottomResized) return {}
  return {
    bottomHeight:
      mode === "draw"
        ? DEFAULT_CHART_BOTTOM_HEIGHT
        : cell?.result
          ? computeResultBottomHeight(cell.result)
          : undefined,
  }
}

export const cellModeChangePatch = (
  cell: NotebookCell | undefined,
  mode: CellMode,
): Partial<NotebookCell> => ({
  ...modeChangeBottomHeightPatch(cell, mode),
  ...(mode === "draw" ? { isViewMaximized: false } : {}),
})

export const mergeCellChartConfig = (
  cell: NotebookCell,
  patch: Partial<ChartConfig>,
): ChartConfig => {
  const base: ChartConfig = cell.chartConfig ?? { xColumn: null, queries: [] }
  return { ...base, ...patch }
}

export const patchCellRunResult = (
  cells: NotebookCell[],
  cellId: string,
  result: CellResult,
): NotebookCell[] =>
  cells.map((cell) => {
    if (cell.id !== cellId) return cell
    const next: NotebookCell = { ...cell, result }
    if (
      !cell.bottomResized &&
      cell.mode !== "draw" &&
      cell.type !== "markdown"
    ) {
      next.bottomHeight = computeResultBottomHeight(result)
    }
    return next
  })

export const cellChromePx = (cell: NotebookCell): number =>
  cell.type === "markdown" ? MARKDOWN_CELL_CHROME_PX : CELL_CHROME_PX

export const minTopHeightFor = (cell: NotebookCell): number =>
  cell.type === "markdown" ? MIN_MARKDOWN_HEIGHT_PX : DEFAULT_TOP_HEIGHT

const defaultTopHeightFor = (cell: NotebookCell): number =>
  cell.type === "markdown" ? MARKDOWN_DEFAULT_TOP_HEIGHT : DEFAULT_TOP_HEIGHT

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
  const topHeight =
    opts.liveTopHeight ?? cell.topHeight ?? defaultTopHeightFor(cell)
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

// Grid geometry — shared by the renderer, the layout builder, and the agent
// snapshot so their `h` derivations agree.
export const NOTEBOOK_GRID_COLS = 12
export const NOTEBOOK_GRID_ROW_HEIGHT = 10
export const NOTEBOOK_GRID_MARGIN_Y = 20

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
  const totalPx = cellChromePx(cell) + topHeight + bottomHeight
  return Math.max(1, Math.ceil((totalPx + marginY) / (rowHeight + marginY)))
}

export const snapMarkdownTopHeight = (px: number): number => {
  const step = NOTEBOOK_GRID_ROW_HEIGHT + NOTEBOOK_GRID_MARGIN_Y
  const totalPx = Math.max(px, MIN_MARKDOWN_HEIGHT_PX) + MARKDOWN_CELL_CHROME_PX
  const rows = Math.ceil((totalPx + NOTEBOOK_GRID_MARGIN_Y) / step)
  return rows * step - NOTEBOOK_GRID_MARGIN_Y - MARKDOWN_CELL_CHROME_PX
}

export const computeAgentCellGridH = (cell: NotebookCell): number =>
  computeCellGridH(cell, NOTEBOOK_GRID_ROW_HEIGHT, NOTEBOOK_GRID_MARGIN_Y)

export const hasAgentVisibleCellHeightChanged = (
  cell: NotebookCell,
  patch: Partial<NotebookCell>,
  layoutMode: "list" | "grid",
): boolean =>
  layoutMode === "grid" &&
  computeAgentCellGridH(cell) !== computeAgentCellGridH({ ...cell, ...patch })

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

// Back-solves a grid `h` into the top/bottom height patch that makes
// computeCellGridH reproduce it, pinned via *Resized like a manual drag. Empty
// patch when the rows already match the derived height — an echo of the required
// grid.h is not a resize, so auto-height stays intact.
export const cellHeightPatchForRows = (
  cell: NotebookCell,
  rows: number,
  rowHeight: number,
  marginY: number,
): Partial<NotebookCell> => {
  if (rows === computeCellGridH(cell, rowHeight, marginY)) return {}
  const targetContentPx =
    rows * rowHeight + (rows - 1) * marginY - cellChromePx(cell)
  if (!isDoubleView(cell)) {
    return {
      topHeight: Math.max(minTopHeightFor(cell), targetContentPx),
      topResized: true,
    }
  }
  if (cell.isViewMaximized === true) {
    // Maximized hides the editor; scale both so the split survives a restore.
    const { top, bottom } = scaleCellHeights(
      cell.topHeight ?? DEFAULT_TOP_HEIGHT,
      cell.bottomHeight ?? defaultBottomHeightFor(cell),
      targetContentPx,
      DEFAULT_TOP_HEIGHT,
      MIN_BOTTOM_HEIGHT_PX,
    )
    return {
      topHeight: top,
      bottomHeight: bottom,
      topResized: true,
      bottomResized: true,
    }
  }
  const top = cell.topHeight ?? DEFAULT_TOP_HEIGHT
  const { top: nextTop, bottom: nextBottom } = partitionCellHeights(
    targetContentPx,
    top,
    DEFAULT_TOP_HEIGHT,
    MIN_BOTTOM_HEIGHT_PX,
  )
  return {
    bottomHeight: nextBottom,
    bottomResized: true,
    ...(nextTop !== top ? { topHeight: nextTop, topResized: true } : {}),
  }
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

export type NotebookDocumentState = {
  cells: NotebookCell[]
  settings: NotebookSettings
  maximizedCellId: string | null
}

export const buildAppliedNotebookState = (
  current: NotebookDocumentState,
  request: ApplyRequest,
): NotebookDocumentState & { diff: AppliedDiff } => {
  const { nextCells, diff } = buildAppliedCells(current.cells, request)
  const targetLayoutMode =
    request.layoutMode === undefined || request.layoutMode === null
      ? current.settings.layoutMode
      : request.layoutMode

  // Pin an intentionally-resized grid.h into the cell; the stored h alone is a
  // stale shadow the renderer overwrites (see cellHeightPatchForRows).
  //
  // Back-solve against the pre-apply cell, not the mutated one: the agent's h
  // was derived from the cell it read (with its result), so a value edit that
  // drops the result must not flip the cell to the single-view branch and pin
  // the editor. Evaluating on the prior cell makes an agent-sent h behave
  // exactly like the user's bottom-edge drag.
  const prevById = new Map(current.cells.map((c) => [c.id, c]))
  const cells =
    targetLayoutMode === "grid"
      ? nextCells.map((cell, i) => {
          const g = request.cells[i]?.grid
          if (!g) return cell
          const patch = cellHeightPatchForRows(
            prevById.get(cell.id) ?? cell,
            g.h,
            NOTEBOOK_GRID_ROW_HEIGHT,
            NOTEBOOK_GRID_MARGIN_Y,
          )
          return Object.keys(patch).length > 0 ? { ...cell, ...patch } : cell
        })
      : nextCells

  let nextSettings = current.settings
  if (targetLayoutMode === "grid") {
    nextSettings = {
      ...nextSettings,
      layoutMode: "grid",
      layout: buildAppliedLayout(request, cells, current.settings.layout, {
        gridCols: NOTEBOOK_GRID_COLS,
        rowHeight: NOTEBOOK_GRID_ROW_HEIGHT,
        marginY: NOTEBOOK_GRID_MARGIN_Y,
      }),
    }
  } else if (request.layoutMode !== undefined && request.layoutMode !== null) {
    nextSettings = { ...nextSettings, layoutMode: request.layoutMode }
  }
  if (request.variables !== undefined) {
    nextSettings = { ...nextSettings, variables: request.variables ?? [] }
  }

  let nextMaximizedCellId = current.maximizedCellId
  if (request.maximizedCellId !== undefined) {
    const id = request.maximizedCellId
    nextMaximizedCellId = id && cells.some((c) => c.id === id) ? id : null
  } else if (
    nextMaximizedCellId &&
    !cells.some((c) => c.id === nextMaximizedCellId)
  ) {
    nextMaximizedCellId = null
  }

  return {
    cells,
    settings: nextSettings,
    maximizedCellId: nextMaximizedCellId,
    diff,
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
