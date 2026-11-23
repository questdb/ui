import type { editor } from "monaco-editor"
import type {
  ColumnDefinition,
  Timings,
  SessionFailure,
} from "../utils/questdb/types"
import type { RunStatus } from "../utils/ai/runStatus"
import type { ChartConfig } from "../scenes/Editor/Notebook/CellChart/chartTypes"
import type { HighlightConfig } from "../components/ResultGrid/highlight/types"
import type { ColumnFormats } from "../utils/formats/columnFormat"
import { isHighlightConfig } from "../components/ResultGrid/highlight/isHighlightConfig"

// Virtualization + lazy hydration bound render and memory cost; the cap guards
// notebook data size and the wrapper DOM / grid-layout work that still scales
// with cell count.
export const MAX_NOTEBOOK_CELLS = 200

export const MAX_CELL_LINES = 99_999

export const exceedsCellLineLimit = (value: string): boolean =>
  value.split("\n").length > MAX_CELL_LINES

export const MAX_CELL_NAME_LENGTH = 100

export const exceedsCellNameLimit = (name: string): boolean =>
  name.length > MAX_CELL_NAME_LENGTH

export type CellMode = "run" | "draw"

export type AutoRefreshInterval = `${number}${"ms" | "s" | "m"}`
// false means "Off", true means "Auto" — presence checks must be `!== undefined`.
export type AutoRefresh = boolean | AutoRefreshInterval

// Cell kind. `undefined` means "sql" everywhere — code only ever tests
// `=== "markdown"`, so old notebooks (no `type`) behave as SQL cells with no
// migration. Markdown cells hold their source in `value` and are never executed.
export type CellType = "sql" | "markdown"

export type AgentCellView = "editor" | "result" | "editor_result"

export const isAgentCellView = (value: unknown): value is AgentCellView =>
  value === "editor" || value === "result" || value === "editor_result"

// The storable pane arrangements. "editor" exists only on the agent wire: as a
// write it discards the result (the toggle-off gesture), as a read it is the
// derived presentation of a cell with nothing to show.
export type CellPaneView = "result" | "editor_result"

export const isCellPaneView = (value: unknown): value is CellPaneView =>
  value === "result" || value === "editor_result"

export type NotebookCell = {
  id: string
  position: number
  value: string
  name?: string
  type?: CellType
  editorViewState?: editor.ICodeEditorViewState
  result?: CellResult | null
  topHeight?: number
  bottomHeight?: number
  topResized?: boolean
  bottomResized?: boolean
  spotlightEditorRatio?: number
  // Draw is persistent cell identity because it is also the marker used to
  // hydrate and refresh a chart whose result is not currently in memory.
  // Run is the absence of draw mode and must never be persisted.
  mode?: "draw"
  chartConfig?: ChartConfig
  // One set of rules for every result grid of the cell, by column name; an
  // edit to the SQL never touches it.
  highlightConfig?: HighlightConfig
  autoRefresh?: AutoRefresh
  // How the cell's columns read, by column name: number formats, colour
  // thresholds and in-cell visuals. Shared by its grid, chart and visual.
  formats?: ColumnFormats
  // What clicking or dragging on the cell's result sets.
  interactions?: CellInteractions
  // How the result grid follows refreshes: "stable" keeps each row (by its
  // identity columns) where it was; "stream" adds new rows at the top.
  gridMode?: GridMode
  // Stored pane arrangement for a cell with a result. A cell without one
  // shows only the editor; that never rewrites it.
  paneView?: CellPaneView
  lastRunStatus?: RunStatus
  lastRunError?: string
}

export type DqlQueryResult = {
  type: "dql"
  query: string
  effectiveQuery?: string
  columns: ColumnDefinition[]
  dataset: (boolean | string | number | null)[][]
  count: number
  truncated?: boolean
  timestamp?: number
  timings?: Timings
  notice?: string
  // When the rows were fetched. Every constructor stamps it; hydration folds
  // it once into results persisted before it existed.
  fetchedAt?: number
}

export type DdlDmlQueryResult = {
  type: "ddl" | "dml"
  query: string
  fetchedAt?: number
}

export type ErrorQueryResult = SessionFailure & {
  type: "error"
  query: string
  error: string
  stoppedByUser?: true
  fetchedAt?: number
}

export type TransientQueryResult = {
  type: "running" | "queued"
  query: string
}

export type CancelReason = "user" | "priorFailure"

export type CancelledQueryResult = {
  type: "cancelled"
  query: string
  reason?: CancelReason
  fetchedAt?: number
}

export type SingleQueryResult =
  | DqlQueryResult
  | DdlDmlQueryResult
  | ErrorQueryResult
  | TransientQueryResult
  | CancelledQueryResult

export const isSettledResult = (
  result: SingleQueryResult,
): result is Exclude<SingleQueryResult, TransientQueryResult> =>
  result.type !== "running" && result.type !== "queued"

export type CellResult = {
  results: SingleQueryResult[]
  activeResultIndex: number
  activeStatementKey?: string
  error?: string
  // The run token: it changes when a run replaces the frame, and the grid
  // keys its viewport on it. It is not a time — each result carries its own
  // fetchedAt. Legacy snapshots use their save time as a fallback token.
  timestamp: number
  script?: {
    successCount: number
    failedCount: number
    durationMs: number
  }
}

export type CellLayoutItem = {
  i: string
  x: number
  y: number
  w: number
  h: number
}

export type NotebookLayoutMode = "list" | "grid"

export type GridMode = "stable" | "stream"

export type CellInteractions = {
  // A click on a bar, slice, point, node or grid row sets `variable` to the
  // clicked value: the `column` value of that row, else the item's name.
  click?: { variable: string; column?: string }
  // Dragging across a time chart sets `from` and `to` to the window's bounds.
  brush?: { from: string; to: string }
}

export type ChartSync = {
  // Moving over one time chart shows the same time on the others: as a line,
  // or as a line with each chart's tooltip.
  crosshair: "off" | "line" | "tooltip"
  // Zooming one time chart zooms the others to the same time window.
  zoom: boolean
}

export type NotebookVariable = {
  name: string
  value: string
}

export type NotebookSettings = {
  layoutMode?: NotebookLayoutMode
  layout?: CellLayoutItem[]
  variables?: NotebookVariable[]
  autoRefreshDefault?: AutoRefresh
  chartSync?: ChartSync
}

export type NotebookViewState = {
  // The notebook format this state was written in; see notebookFormat.ts.
  formatVersion?: number
  cells: NotebookCell[]
  focusedCellId?: string
  maximizedCellId?: string
  settings?: NotebookSettings
}

export const createCell = (position: number, value = ""): NotebookCell => ({
  id: crypto.randomUUID(),
  position,
  value,
  paneView: "editor_result",
})

export const createDefaultNotebookViewState = (): NotebookViewState => ({
  cells: [createCell(0)],
})

const isLegacyChartConfig = (cell: NotebookCell): boolean =>
  cell.chartConfig != null && !Array.isArray(cell.chartConfig.queries)

export const dropLegacyChartConfigs = (
  state: NotebookViewState,
): NotebookViewState => {
  if (!state.cells.some(isLegacyChartConfig)) return state
  const cells = state.cells.map((cell) => {
    if (!isLegacyChartConfig(cell)) return cell
    const next = { ...cell }
    delete next.chartConfig
    return next
  })
  return { ...state, cells }
}

export const sanitizeHighlightConfig = (
  value: unknown,
): HighlightConfig | undefined => (isHighlightConfig(value) ? value : undefined)

const hasMalformedHighlightConfig = (cell: NotebookCell): boolean =>
  cell.highlightConfig != null && !isHighlightConfig(cell.highlightConfig)

export const dropMalformedHighlightConfigs = (
  state: NotebookViewState,
): NotebookViewState => {
  if (!state.cells.some(hasMalformedHighlightConfig)) return state
  const cells = state.cells.map((cell) => {
    if (!hasMalformedHighlightConfig(cell)) return cell
    const { highlightConfig: _dropped, ...rest } = cell
    return rest
  })
  return { ...state, cells }
}

// Pre-`name` notebooks stored the chart title on chartConfig.name. The name is
// now a cell-level field (the single canonical name); promote the legacy value
// and drop the old copy so the two can't diverge.
const hasLegacyChartName = (cell: NotebookCell): boolean =>
  cell.name == null &&
  typeof (cell.chartConfig as { name?: unknown } | undefined)?.name === "string"

export const migrateCellName = (cell: NotebookCell): NotebookCell => {
  if (!hasLegacyChartName(cell)) return cell
  const { name, ...chartConfig } = cell.chartConfig as ChartConfig & {
    name?: string
  }
  return { ...cell, name, chartConfig }
}

export const migrateLegacyCellNames = (
  state: NotebookViewState,
): NotebookViewState =>
  state.cells.some(hasLegacyChartName)
    ? { ...state, cells: state.cells.map(migrateCellName) }
    : state
