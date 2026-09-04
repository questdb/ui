import type { QueryExecResult } from "../../../hooks/useQueryExecution"
import type {
  AgentCellView,
  AutoRefresh,
  AutoRefreshInterval,
  CellLayoutItem,
  CellMode,
  CellPaneView,
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
  isAgentCellView,
  isCellPaneView,
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
import type { CellResultStatus } from "./resultHydration/cellResultHydration"
export type { CellResultStatus } from "./resultHydration/cellResultHydration"
import { getQueriesFromText, normalizeQueryText } from "../Monaco/utils"
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
// still needs an explicit run_cell. Recorded history wins: every run commit
// stamps it, so it is at least as fresh as any run-produced result; only
// refresh results are newer, and excluding those is the point. A draw frame
// is always refresh-produced, so it never seeds history — deriving from it
// would freeze a transient poll error into a permanent fabricated failure.
export const carriedRunStatus = (cell: NotebookCell): RunStatus | undefined =>
  cell.lastRunStatus ??
  (cell.mode !== "draw" && cell.result
    ? collapseResultToRunStatus(cell.result)
    : undefined)

// The error travels with its recorded status as one pair; derivation from the
// result happens only for records that predate stamping.
export const carriedRunError = (cell: NotebookCell): string | undefined => {
  if (cell.lastRunStatus !== undefined) return cell.lastRunError
  if (cell.mode === "draw") return undefined
  const errored = cell.result?.results.find((r) => r.type === "error")
  return errored?.type === "error" ? errored.error : undefined
}

// The stamp a run commit writes next to its result. A run without an error
// clears any previous one — history describes the last run wholesale.
export const runHistoryPatch = (
  result: CellResult,
): Pick<NotebookCell, "lastRunStatus" | "lastRunError"> => {
  const errored = result.results.find((r) => r.type === "error")
  return {
    lastRunStatus: collapseResultToRunStatus(result),
    lastRunError: errored?.type === "error" ? errored.error : undefined,
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

export const snapshotResultsMatchQueries = (
  results: SingleQueryResult[],
  queries: string[],
): boolean =>
  results.length > 0 &&
  results.length === queries.length &&
  results.every(
    (result, index) =>
      normalizeQueryText(result.query) === normalizeQueryText(queries[index]),
  )

// Statement identity across edits: normalized text plus occurrence order for
// duplicates. Results follow this key, never their position.
export type StatementKey = string

const STATEMENT_KEY_SEPARATOR = "\u0001"

export const statementKeysFor = (texts: string[]): StatementKey[] => {
  const occurrences = new Map<string, number>()
  return texts.map((text) => {
    const normalized = normalizeQueryText(text)
    const occurrence = occurrences.get(normalized) ?? 0
    occurrences.set(normalized, occurrence + 1)
    return `${normalized}${STATEMENT_KEY_SEPARATOR}${occurrence}`
  })
}

const clampIndex = (index: number, length: number): number =>
  Math.min(Math.max(index, 0), Math.max(length - 1, 0))

const nearestCarriedKey = (
  newKeyByOldIndex: Map<number, StatementKey>,
  anchor: number,
  length: number,
): StatementKey | undefined => {
  for (let distance = 0; distance < length; distance++) {
    const before = newKeyByOldIndex.get(anchor - distance)
    if (before !== undefined) return before
    const after = newKeyByOldIndex.get(anchor + distance)
    if (after !== undefined) return after
  }
  return undefined
}

export type ReconciledCellResult = {
  results: SingleQueryResult[]
  activeStatementKey: StatementKey
  activeResultIndex: number
}

export const reconcileResultsForStatements = (
  statements: string[],
  previous: CellResult,
): ReconciledCellResult | null => {
  if (statements.length === 0 || previous.results.length === 0) return null
  const slotKeys = statementKeysFor(statements)
  const resultKeys = statementKeysFor(previous.results.map((r) => r.query))
  const oldIndexByKey = new Map<StatementKey, number>()
  resultKeys.forEach((key, index) => oldIndexByKey.set(key, index))
  const survivors: SingleQueryResult[] = []
  const survivorKeys: StatementKey[] = []
  const newKeyByOldIndex = new Map<number, StatementKey>()
  for (const key of slotKeys) {
    const oldIndex = oldIndexByKey.get(key)
    if (oldIndex === undefined) continue
    const candidate = previous.results[oldIndex]
    // A placeholder is not a carryable result: carrying one would resurrect a
    // ghost "Running" slot no execution backs (e.g. from a snapshot a crash
    // left behind). The slot regenerates as "Not run" at display time.
    if (candidate.type === "running" || candidate.type === "queued") continue
    survivors.push(candidate)
    survivorKeys.push(key)
    newKeyByOldIndex.set(oldIndex, key)
  }
  if (survivors.length === 0) return null
  const carriedActiveKey =
    previous.activeStatementKey !== undefined &&
    slotKeys.includes(previous.activeStatementKey)
      ? previous.activeStatementKey
      : nearestCarriedKey(
          newKeyByOldIndex,
          clampIndex(previous.activeResultIndex, previous.results.length),
          previous.results.length,
        )
  const activeStatementKey = carriedActiveKey ?? slotKeys[0]
  return {
    results: survivors,
    activeStatementKey,
    activeResultIndex: Math.max(0, survivorKeys.indexOf(activeStatementKey)),
  }
}

// Applies the carryover to a cell's in-memory result after an SQL edit:
// unchanged statements keep their results, everything else drops. A frame
// that loses slots also loses its script summary — the counts no longer
// describe what is on screen. Zero survivors collapse the frame to null.
export const reconcileCellResultForValue = (
  result: CellResult | null | undefined,
  value: string,
): CellResult | null => {
  if (result == null) return null
  // A pending frame is run-owned: the run writes results into it by position,
  // so reshaping it here would land rows under the wrong statement. The frame
  // stays pending until the run's last slot settles, and every completion step
  // after that runs synchronously — deferring the reconcile is always safe.
  if (hasPendingResult(result)) return result
  const reconciled = reconcileResultsForStatements(
    getQueriesFromText(value),
    result,
  )
  if (!reconciled) return null
  const frameUnchanged =
    reconciled.results.length === result.results.length &&
    reconciled.results.every((r, index) => r === result.results[index])
  const next: CellResult = {
    ...result,
    results: reconciled.results,
    activeResultIndex: reconciled.activeResultIndex,
    activeStatementKey: reconciled.activeStatementKey,
  }
  if (!frameUnchanged) delete next.script
  return next
}

export type StatementSlot = {
  key: StatementKey
  sql: string
  result: SingleQueryResult | null
}

export type StatementFrame = {
  slots: StatementSlot[]
  activeSlotIndex: number
}

export const deriveStatementFrame = (
  statements: string[],
  result: CellResult | null | undefined,
): StatementFrame | null => {
  if (!result || statements.length === 0 || result.results.length === 0) {
    return null
  }
  const slotKeys = statementKeysFor(statements)
  const resultKeys = statementKeysFor(result.results.map((r) => r.query))
  const resultByKey = new Map<StatementKey, SingleQueryResult>()
  resultKeys.forEach((key, index) => {
    resultByKey.set(key, result.results[index])
  })
  const slots = slotKeys.map((key, index) => ({
    key,
    sql: statements[index],
    result: resultByKey.get(key) ?? null,
  }))
  if (slots.every((slot) => slot.result === null)) return null
  const activeKey =
    result.activeStatementKey ??
    resultKeys[clampIndex(result.activeResultIndex, resultKeys.length)]
  const activeSlotIndex = slotKeys.indexOf(activeKey)
  return {
    slots,
    activeSlotIndex: activeSlotIndex === -1 ? 0 : activeSlotIndex,
  }
}

// Fallback for a frame no statement claims: a selection or cursor-fragment
// run records the fragment it executed, so tabs follow the results
// themselves. Display-only — an edit or reload still drops the orphans.
export const derivePositionalFrame = (
  result: CellResult | null | undefined,
): StatementFrame | null => {
  if (!result || result.results.length === 0) return null
  const keys = statementKeysFor(result.results.map((r) => r.query))
  return {
    slots: result.results.map((r, index) => ({
      key: keys[index],
      sql: r.query,
      result: r,
    })),
    activeSlotIndex: clampIndex(
      result.activeResultIndex,
      result.results.length,
    ),
  }
}

// The single-run target mirrors the tab the bottom slot renders — the active
// slot carries its statement even before it has run, so a "Not run" tab
// resolves to its own SQL, never to a stale result index.
export const resolveActiveStatementSql = (
  value: string,
  result: CellResult | null | undefined,
): string | undefined => {
  const frame =
    deriveStatementFrame(getQueriesFromText(value), result) ??
    derivePositionalFrame(result)
  return frame?.slots[frame.activeSlotIndex]?.sql
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

    if (req.view != null && !isAgentCellView(req.view)) {
      throw new ApplyNotebookStateError(
        `Cell at index ${index} has an invalid view; use editor, result, or editor_result.`,
        "cells",
      )
    }
    if (req.view === "editor" && req.mode === "draw") {
      throw new ApplyNotebookStateError(
        `Cell at index ${index} combines mode "draw" with view "editor"; view editor discards the result and returns the cell to run mode. Omit mode or pick another view.`,
        "cells",
      )
    }

    const isDraw = resolvedMode === "draw"
    const dimensionCell: NotebookCell = {
      ...(existing ?? { id, position: index, value, type: resolvedType }),
      value,
      ...(resolvedMode !== undefined ? { mode: resolvedMode } : {}),
    }
    const dimensions = applicableCellDimensions(dimensionCell, {
      editorHeight: req.editorHeight,
      resultHeight: req.resultHeight,
      view: req.view,
    })
    if (
      typeof dimensions.editorHeight === "number" &&
      (!Number.isFinite(dimensions.editorHeight) ||
        dimensions.editorHeight < minTopHeightFor(dimensionCell))
    ) {
      throw new ApplyNotebookStateError(
        `Cell at index ${index} has an editor_height below its minimum.`,
        "cells",
      )
    }
    if (
      typeof dimensions.resultHeight === "number" &&
      (!Number.isFinite(dimensions.resultHeight) ||
        dimensions.resultHeight < minBottomHeightFor(dimensionCell))
    ) {
      throw new ApplyNotebookStateError(
        `Cell at index ${index} has result_height ${dimensions.resultHeight}px; minimum is ${minBottomHeightFor(dimensionCell)}px.`,
        "cells",
      )
    }
    if (
      typeof dimensions.editorHeight === "number" &&
      dimensions.editorHeight > MAX_PANE_HEIGHT_PX
    ) {
      throw new ApplyNotebookStateError(
        `Cell at index ${index} has editor_height ${dimensions.editorHeight}px; maximum is ${MAX_PANE_HEIGHT_PX}px.`,
        "cells",
      )
    }
    if (
      typeof dimensions.resultHeight === "number" &&
      dimensions.resultHeight > MAX_PANE_HEIGHT_PX
    ) {
      throw new ApplyNotebookStateError(
        `Cell at index ${index} has result_height ${dimensions.resultHeight}px; maximum is ${MAX_PANE_HEIGHT_PX}px.`,
        "cells",
      )
    }
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
      const next: NotebookCell = {
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
      if (resolvedMode !== undefined) next.mode = resolvedMode
      else delete next.mode
      if (chartConfig !== undefined) next.chartConfig = chartConfig
      else delete next.chartConfig
      if (autoRefresh !== undefined) next.autoRefresh = autoRefresh
      else delete next.autoRefresh
      if (req.view === "editor" && cellHasRunOutcome(next)) {
        Object.assign(next, discardCellResultPatch(next))
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
    if (resolvedMode !== undefined) created.mode = resolvedMode
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

// === Cell sizing model ======================================================
// Cells are in one of two view states:
//
//   - Editor visible, no result: topHeight + chrome.
//   - Editor visible with result: topHeight + bottomHeight + split chrome.
//   - Editor hidden: bottomHeight + chrome. topHeight stays persisted but does
//     not consume space, so restoring the editor expands around both panes.
//
// `topHeight` and `bottomHeight` live on NotebookCell. In grid mode, grid h is
// derived from the currently visible pane heights on every render.
// ============================================================================

// Exact fixed chrome every cell carries, in pixels:
//   - Drag header: 42 px (HeaderBar's FIXED height — its right slot swaps
//     between the neutral Run/Draw toggles and the view toggle without
//     changing cell geometry)
//   - CellWrapper top + bottom border: 1 px each
export const CELL_BASE_CHROME_PX = 44

// The in-flow editor/result divider (the split ResizeHandle's $doubleView
// variant) — rendered only when the editor and a bottom slot are both visible.
export const SPLIT_HANDLE_PX = 6

// Default editor height for a newly-created cell, before any content arrives.
// Matches MIN_EDITOR_HEIGHT used by Monaco; kept here so layout math doesn't
// need to import Cell.tsx constants.
export const DEFAULT_TOP_HEIGHT = 72

export const CELL_EDITOR_LINE_HEIGHT = 24
export const CELL_EDITOR_PADDING = { top: 4, bottom: 4 }

export const topHeightForSql = (value: string): number =>
  clampPaneHeight(
    DEFAULT_TOP_HEIGHT,
    value.split("\n").length * CELL_EDITOR_LINE_HEIGHT +
      CELL_EDITOR_PADDING.top +
      CELL_EDITOR_PADDING.bottom,
  )

// Markdown cells carry the base chrome only (they never split) and keep their
// heights on the grid-row lattice (56, 86, 116, …) so the derived cell box is
// always exact — see snapMarkdownTopHeight.
// One line of rendered prose is 34px, so 56 is the first lattice point that
// shows any content. Stored heights below it render as they are until the next
// resize writes a new value.
export const MIN_MARKDOWN_HEIGHT_PX = 56

// Default chart height for draw mode (experimental — per user spec).
export const DEFAULT_CHART_BOTTOM_HEIGHT = 350

export const MIN_BOTTOM_HEIGHT_PX = 100
// ECharts reserves roughly 96-126 px for axes, labels, and the zoom control.
// A 100 px chart pane is structurally valid but leaves no useful plot. Keep
// table results at the historical minimum while giving charts a visual floor.
export const MIN_CHART_HEIGHT_PX = 296
// One ceiling for every pane: it only stops nonsense such as multi-million
// pixel agent writes or an editor auto-grown to a hundred thousand lines.
export const MAX_PANE_HEIGHT_PX = 2400

export const clampPaneHeight = (minimum: number, px: number): number =>
  Math.min(MAX_PANE_HEIGHT_PX, Math.max(minimum, px))

export const minBottomHeightFor = (cell: NotebookCell): number =>
  cell.mode === "draw" ? MIN_CHART_HEIGHT_PX : MIN_BOTTOM_HEIGHT_PX

export type AgentHeightValue = number | "auto" | null

// Reads a cell's live snapshot-load status; the passive (unmounted) route has
// no live statuses and falls back to "unrequested", matching what the mounted
// notebook renders for a run-marked cell before its snapshot loads.
export type CellResultStatusReader = (cellId: string) => CellResultStatus

export type AgentCellDimensions = {
  editorHeight?: AgentHeightValue
  resultHeight?: AgentHeightValue
  view?: AgentCellView | null
  resultStatus?: CellResultStatus
}

export const applicableCellDimensions = (
  cell: Pick<NotebookCell, "type">,
  dimensions: AgentCellDimensions,
): AgentCellDimensions =>
  cell.type === "markdown"
    ? { ...dimensions, resultHeight: null, view: null }
    : dimensions

// The agent's view:"editor" is the toggle-off gesture, not a stored value:
// discard the run outcome and drop back to run mode, keeping the stored pane
// arrangement for the next run. Mirrors the UI's clearCellResult; callers
// delete the persisted snapshot through the transition's deleteSnapshots.
export const discardCellResultPatch = (
  cell: NotebookCell,
): Partial<NotebookCell> => ({
  result: undefined,
  lastRunStatus: undefined,
  ...(cell.mode === "draw" ? { mode: "run" as CellMode } : {}),
  ...(cell.bottomResized ? {} : { bottomHeight: undefined }),
})

// Translate the semantic agent wire model into the persisted pane model.
// `null`/omission preserves, "auto" clears the corresponding resize pin, and
// a number fixes the pane at that pixel height. view:"editor" is an action,
// not a stored value — the callers apply discardCellResultPatch for it.
export const agentCellDimensionsPatch = (
  cell: NotebookCell,
  dimensions: AgentCellDimensions,
): Partial<NotebookCell> => {
  const patch: Partial<NotebookCell> = {}
  if (dimensions.editorHeight === "auto") {
    patch.topHeight =
      cell.type === "markdown" ? undefined : topHeightForSql(cell.value)
    patch.topResized = false
  } else if (typeof dimensions.editorHeight === "number") {
    patch.topHeight = dimensions.editorHeight
    patch.topResized = true
  }
  if (dimensions.resultHeight === "auto") {
    patch.bottomHeight = undefined
    patch.bottomResized = false
  } else if (typeof dimensions.resultHeight === "number") {
    patch.bottomHeight = dimensions.resultHeight
    patch.bottomResized = true
  }
  if (isCellPaneView(dimensions.view) && cell.type !== "markdown") {
    patch.paneView = dimensions.view
  }
  return patch
}

// Pixel sizes of the result panel's chrome. Kept in sync with the styled-
// components in result-table/styles.ts; if those constants change, update
// here.
const TAB_BAR_PX = 40 // TabBarWrapper height = 4rem
const NOTIFICATION_PX = 44 // StatusNotification (compact=true → 4rem + 1-2 px borders)
const RESULT_ACTIONS_BAR_PX = 36 // ResultActionsBar height = 3.6rem (shown with the grid)
export const MAX_RESERVED_ROWS = 10 // cap for "tight-fit" single-query results

// Height to reserve for a run cell's result area while its snapshot hydrates —
// the same max single-statement grid height `computeResultBottomHeight` settles
// to for a ≥10-row result, so the grid drops in without a height jump. Mirrors
// how draw reserves a fixed DEFAULT_CHART_BOTTOM_HEIGHT before its data lands.
export const RESERVED_RESULT_BOTTOM_HEIGHT =
  NOTIFICATION_PX +
  RESULT_ACTIONS_BAR_PX +
  HEADER_HEIGHT +
  MAX_RESERVED_ROWS * ROW_HEIGHT

// A run-marked cell reserves its result area whenever the result is not in
// memory — before its snapshot is requested, while it loads, and after a far
// scroll released it. It collapses only once its own snapshot load proved
// there is nothing to restore.
export const isExpectingResult = (
  cell: NotebookCell,
  resultStatus: CellResultStatus,
): boolean =>
  cell.mode !== "draw" &&
  cell.lastRunStatus != null &&
  cell.lastRunStatus !== "none" &&
  cell.result == null &&
  resultStatus !== "missing"

// Stamps the derived bottom height when none is stored, so the released cell
// keeps the exact geometry its result rendered at — the expecting-result path
// would otherwise fall back to RESERVED_RESULT_BOTTOM_HEIGHT and jitter on
// every release/re-hydrate cycle.
export const releaseCellResultPatch = (
  cell: NotebookCell,
): Pick<
  NotebookCell,
  "result" | "lastRunStatus" | "lastRunError" | "bottomHeight"
> => ({
  result: undefined,
  lastRunStatus: carriedRunStatus(cell),
  lastRunError: carriedRunError(cell),
  ...(cell.mode !== "draw" && cell.bottomHeight == null && cell.result != null
    ? {
        bottomHeight: computeResultBottomHeight(cell.result, cell.value),
      }
    : {}),
})

const isDqlWithColumns = (r: SingleQueryResult): boolean =>
  r.type === "dql" && r.columns.length > 0

const dqlRowCount = (r: SingleQueryResult): number =>
  r.type === "dql" ? r.dataset.length : 0

// Computes the bottom slot height for the same statement frame rendered by
// InlineResultTable. `value` is the cell's current SQL; a partial run can have
// one result while still rendering multiple statement tabs (the unexecuted
// statements appear as "Not run").
//
// Rules:
//   1. Single-statement, no grid (error / DDL / DML / notice): just the
//      notification bar — no wasted blank space.
//   2. Single-statement DQL with columns: notification + actions bar + grid
//      header + min(N, 10) rows. A 0-row DQL still shows its column headers, so
//      it reserves the header with no row space. Shrinks for small results,
//      caps at 10 for large ones.
//   3. Multiple rendered statement slots add the tab bar, including when all
//      but one slot are "Not run".
//   4. Multiple executed results reserve a full 10 rows whenever any result
//      has a DQL grid (avoids clipping and jitter when switching result tabs).
//      A single executed result still tight-fits its own row count.
export const computeResultBottomHeight = (
  result: CellResult | null | undefined,
  value: string,
): number => {
  if (!result || result.results.length === 0) return NOTIFICATION_PX
  const statements = getQueriesFromText(value)
  const frame =
    deriveStatementFrame(statements, result) ?? derivePositionalFrame(result)
  if (!frame) return NOTIFICATION_PX
  const slots = frame.slots
  const hasMultipleTabs = slots.length > 1
  const hasMultipleResults = result.results.length > 1
  const tabBar = hasMultipleTabs ? TAB_BAR_PX : 0

  if (hasMultipleResults) {
    const hasGrid = slots.some(
      (slot) => slot.result && isDqlWithColumns(slot.result),
    )
    if (!hasGrid) {
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

  // Single executed result: tight-fit up to 10 rows. The tab bar is still
  // included when the editor contributes additional "Not run" slots.
  const only = frame.slots[frame.activeSlotIndex]?.result ?? result.results[0]
  if (!only || !isDqlWithColumns(only)) {
    return tabBar + NOTIFICATION_PX
  }
  const rows = Math.min(MAX_RESERVED_ROWS, dqlRowCount(only))
  return (
    tabBar +
    NOTIFICATION_PX +
    RESULT_ACTIONS_BAR_PX +
    HEADER_HEIGHT +
    rows * ROW_HEIGHT
  )
}

// Returns the appropriate default bottom-slot height for a cell, based on
// what the bottom slot will contain. Used as the render-time fallback when
// cell.bottomHeight is undefined (first paint of a freshly-loaded cell).
// Always agrees with what runCell would have written into cell.bottomHeight.
export const defaultBottomHeightFor = (cell: NotebookCell): number =>
  cell.mode === "draw"
    ? DEFAULT_CHART_BOTTOM_HEIGHT
    : computeResultBottomHeight(cell.result, cell.value)

// True iff this cell has a result slot. Visibility determines whether the
// editor allocation is added alongside that slot.
export const isDoubleView = (cell: NotebookCell): boolean => {
  if (cell.mode === "draw") return true
  return cell.result != null
}

export type CellPaneLayout = "editor" | "split" | "result"

export const storedCellPaneView = (cell: NotebookCell): CellPaneView =>
  isCellPaneView(cell.paneView) ? cell.paneView : "editor_result"

// A run outcome is anything view:"editor" would discard: an in-memory result,
// a carried run status (result on disk only), or draw mode itself.
export const cellHasRunOutcome = (cell: NotebookCell): boolean =>
  cell.mode === "draw" ||
  cell.result != null ||
  (cell.lastRunStatus != null && cell.lastRunStatus !== "none")

export type AgentCellPresentation = { view: AgentCellView | null }

// `view` reports what the cell presents: "editor" while there is nothing to
// show, the stored arrangement once a run outcome exists.
export const agentCellPresentation = (
  cell: NotebookCell,
): AgentCellPresentation => ({
  view:
    cell.type === "markdown"
      ? null
      : cellHasRunOutcome(cell)
        ? storedCellPaneView(cell)
        : "editor",
})

// A cell without a result shows the editor until one exists; that never
// rewrites its stored view.
export const resolveCellPaneLayout = (
  cell: NotebookCell,
  expectingResult: boolean = false,
): CellPaneLayout => {
  if (!isDoubleView(cell) && !expectingResult) return "editor"
  return storedCellPaneView(cell) === "result" ? "result" : "split"
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
          ? computeResultBottomHeight(cell.result, cell.value)
          : undefined,
  }
}

export const cellModeChangePatch = (
  cell: NotebookCell | undefined,
  mode: CellMode,
): Partial<NotebookCell> => modeChangeBottomHeightPatch(cell, mode)

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
    const next: NotebookCell = { ...cell, result, ...runHistoryPatch(result) }
    if (
      !cell.bottomResized &&
      cell.mode !== "draw" &&
      cell.type !== "markdown"
    ) {
      next.bottomHeight = computeResultBottomHeight(result, cell.value)
    }
    return next
  })

// Exact per-state chrome. Split cells (editor above, result/chart or its
// reserved shimmer below) add the in-flow divider; an editor-hidden cell
// carries base chrome only.
export const cellChromePx = (
  cell: NotebookCell,
  expectingResult: boolean = false,
  paneLayout: CellPaneLayout = resolveCellPaneLayout(cell, expectingResult),
): number => {
  if (cell.type === "markdown") return CELL_BASE_CHROME_PX
  return paneLayout === "split"
    ? CELL_BASE_CHROME_PX + SPLIT_HANDLE_PX
    : CELL_BASE_CHROME_PX
}

export const minTopHeightFor = (cell: NotebookCell): number =>
  cell.type === "markdown" ? MIN_MARKDOWN_HEIGHT_PX : DEFAULT_TOP_HEIGHT

const defaultTopHeightFor = (cell: NotebookCell): number =>
  cell.type === "markdown" ? MIN_MARKDOWN_HEIGHT_PX : DEFAULT_TOP_HEIGHT

export const agentCellPaneDimensions = (
  cell: NotebookCell,
): {
  editorHeight: number | "auto"
  resultHeight: number | "auto" | null
} => {
  const pinnedHeight = (
    resized: boolean | undefined,
    height: number | undefined,
    minimum: number,
  ): number | "auto" =>
    resized && typeof height === "number" && Number.isFinite(height)
      ? clampPaneHeight(minimum, height)
      : "auto"

  return {
    editorHeight: pinnedHeight(
      cell.topResized,
      cell.topHeight,
      minTopHeightFor(cell),
    ),
    resultHeight:
      cell.type === "markdown"
        ? null
        : pinnedHeight(
            cell.bottomResized,
            cell.bottomHeight,
            minBottomHeightFor(cell),
          ),
  }
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
  const topHeight =
    opts.liveTopHeight ?? cell.topHeight ?? defaultTopHeightFor(cell)
  const resolvedBottomHeight = isDoubleView(cell)
    ? (opts.liveBottomHeight ??
      cell.bottomHeight ??
      defaultBottomHeightFor(cell))
    : opts.expectingResult === true
      ? (opts.liveBottomHeight ??
        cell.bottomHeight ??
        RESERVED_RESULT_BOTTOM_HEIGHT)
      : 0
  // A visible bottom slot never renders below its pane floor (296 chart /
  // 100 result): a bare notification sits in a 100px pane rather than a
  // 44px sliver, so the rendered height, the resize bounds, and the save
  // path all share one minimum.
  const bottomHeight =
    resolvedBottomHeight === 0
      ? 0
      : Math.max(minBottomHeightFor(cell), resolvedBottomHeight)
  return { topHeight, bottomHeight }
}

// Grid geometry — shared by the renderer, the layout builder, and the agent
// snapshot so their `h` derivations agree.
export const NOTEBOOK_GRID_COLS = 12
export const NOTEBOOK_GRID_ROW_HEIGHT = 10
export const NOTEBOOK_GRID_MARGIN_Y = 20

export const cellGridBoundsError = (pos: {
  x: number
  w: number
}): string | undefined =>
  pos.x + pos.w > NOTEBOOK_GRID_COLS
    ? `x + w must be at most ${NOTEBOOK_GRID_COLS}.`
    : undefined

export type CellGridBounds = { h: number; minH: number; maxH: number }

// Derives react-grid-layout `h` and its resize bounds from the visible pane
// heights plus chrome — one computation, so the three numbers can never
// disagree and `minH ≤ h ≤ maxH` holds for every in-bounds cell state.
// Recomputed at render time on every state change.
//
// react-grid-layout inserts `marginY` BETWEEN rows, so the actual
// rendered px of an h-row cell is `h * rowHeight + (h - 1) * marginY`,
// NOT `h * rowHeight`. To fit a content of `totalPx` we therefore need
// `ceil((totalPx + marginY) / (rowHeight + marginY))` rows. Forgetting
// the marginY term inflated cell heights by ~3× at rowHeight=10,
// marginY=20 (a 500-px content asked for 50 rows that rendered as
// ~1480 px). Default marginY=0 keeps backwards-compat for tests/callers
// that ignore margins.
//
// In a split cell the south edge owns only the result pane, so the bounds
// reserve the editor's current allocation rather than merely its minimum.
// The middle handle is the only control that repartitions the two panes.
// Legacy heights stored outside the pane floors/ceiling deliberately render
// as-is; their first drag snaps them into the new bounds.
export const computeCellGridBounds = (
  cell: NotebookCell,
  rowHeight: number,
  marginY: number = 0,
  expectingResult: boolean = false,
  paneLayout: CellPaneLayout = resolveCellPaneLayout(cell, expectingResult),
): CellGridBounds => {
  const { topHeight, bottomHeight } = computeCellHeights(cell, {
    expectingResult,
  })
  const chrome = cellChromePx(cell, expectingResult, paneLayout)
  const rows = (px: number): number =>
    Math.max(1, Math.ceil((px + marginY) / (rowHeight + marginY)))
  const visibleTopHeight = paneLayout === "result" ? 0 : topHeight
  const visibleBottomHeight = paneLayout === "editor" ? 0 : bottomHeight
  const minTopPx =
    paneLayout === "result"
      ? 0
      : paneLayout === "editor"
        ? minTopHeightFor(cell)
        : Math.max(minTopHeightFor(cell), topHeight)
  const maxTopPx =
    paneLayout === "result"
      ? 0
      : paneLayout === "split"
        ? topHeight
        : MAX_PANE_HEIGHT_PX
  const minBottomPx = paneLayout === "editor" ? 0 : minBottomHeightFor(cell)
  const maxBottomPx = paneLayout === "editor" ? 0 : MAX_PANE_HEIGHT_PX
  return {
    h: rows(chrome + visibleTopHeight + visibleBottomHeight),
    minH: rows(chrome + minTopPx + minBottomPx),
    maxH: rows(chrome + maxTopPx + maxBottomPx),
  }
}

export const computeCellGridH = (
  cell: NotebookCell,
  rowHeight: number,
  marginY: number = 0,
  expectingResult: boolean = false,
  paneLayout: CellPaneLayout = resolveCellPaneLayout(cell, expectingResult),
): number =>
  computeCellGridBounds(cell, rowHeight, marginY, expectingResult, paneLayout).h

export const snapMarkdownTopHeight = (px: number): number => {
  const step = NOTEBOOK_GRID_ROW_HEIGHT + NOTEBOOK_GRID_MARGIN_Y
  const totalPx = Math.max(px, MIN_MARKDOWN_HEIGHT_PX) + CELL_BASE_CHROME_PX
  const rows = Math.ceil((totalPx + NOTEBOOK_GRID_MARGIN_Y) / step)
  return Math.min(
    MAX_PANE_HEIGHT_PX,
    rows * step - NOTEBOOK_GRID_MARGIN_Y - CELL_BASE_CHROME_PX,
  )
}

// Hydration status isn't knowable headlessly; "unrequested" (reserved space)
// matches what the notebook renders for a run-marked cell before its snapshot
// loads, so agent-visible heights agree with the screen.
export const computeAgentCellGridH = (
  cell: NotebookCell,
  expectingResult: boolean = isExpectingResult(cell, "unrequested"),
): number =>
  computeCellGridH(
    cell,
    NOTEBOOK_GRID_ROW_HEIGHT,
    NOTEBOOK_GRID_MARGIN_Y,
    expectingResult,
  )

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

// Back-solves a grid `h` into the top/bottom height patch that makes
// computeCellGridH reproduce it, pinned via *Resized like a manual drag. Empty
// patch when the rows already match the derived height — an echo of the required
// grid.h is not a resize, so auto-height stays intact.
export const paneHeightsFromGridRows = (
  cell: NotebookCell,
  rows: number,
  rowHeight: number,
  marginY: number,
  expectingResult: boolean = false,
  paneLayout: CellPaneLayout = resolveCellPaneLayout(cell, expectingResult),
): Partial<NotebookCell> => {
  if (
    rows ===
    computeCellGridH(cell, rowHeight, marginY, expectingResult, paneLayout)
  ) {
    return {}
  }
  const targetContentPx =
    rows * rowHeight +
    (rows - 1) * marginY -
    cellChromePx(cell, expectingResult, paneLayout)
  if (paneLayout === "editor") {
    return {
      topHeight: clampPaneHeight(minTopHeightFor(cell), targetContentPx),
      topResized: true,
    }
  }
  if (paneLayout === "result") {
    return {
      bottomHeight: clampPaneHeight(minBottomHeightFor(cell), targetContentPx),
      bottomResized: true,
    }
  }
  const { topHeight } = computeCellHeights(cell, { expectingResult })
  const nextBottom = clampPaneHeight(
    minBottomHeightFor(cell),
    targetContentPx - topHeight,
  )
  return {
    bottomHeight: nextBottom,
    bottomResized: true,
  }
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
