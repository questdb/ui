import type { editor } from "monaco-editor"
import type { ColumnDefinition, Timings } from "../utils/questdb/types"
import type { RunStatus } from "../utils/ai/runStatus"
import type { ChartConfig } from "../scenes/Editor/Notebook/CellChart/chartTypes"

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

export const AUTO_REFRESH_INTERVALS = {
  "1s": 1000,
  "5s": 5000,
  "10s": 10000,
  "30s": 30000,
  "1m": 60000,
} as const

export type AutoRefreshInterval = keyof typeof AUTO_REFRESH_INTERVALS
// false means "Off", true means "Auto" — presence checks must be `!== undefined`.
export type AutoRefresh = boolean | AutoRefreshInterval

// Cell kind. `undefined` means "sql" everywhere — code only ever tests
// `=== "markdown"`, so old notebooks (no `type`) behave as SQL cells with no
// migration. Markdown cells hold their source in `value` and are never executed.
export type CellType = "sql" | "markdown"

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
  mode?: CellMode
  chartConfig?: ChartConfig
  autoRefresh?: AutoRefresh
  isViewMaximized?: boolean
  lastRunStatus?: RunStatus
  lastRunError?: string
}

export type DqlQueryResult = {
  type: "dql"
  query: string
  columns: ColumnDefinition[]
  dataset: (boolean | string | number | null)[][]
  count: number
  truncated?: boolean
  timestamp?: number
  timings?: Timings
  notice?: string
}

export type DdlDmlQueryResult = {
  type: "ddl" | "dml"
  query: string
}

export type ErrorQueryResult = {
  type: "error"
  query: string
  error: string
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
}

export type SingleQueryResult =
  | DqlQueryResult
  | DdlDmlQueryResult
  | ErrorQueryResult
  | TransientQueryResult
  | CancelledQueryResult

export type CellResult = {
  results: SingleQueryResult[]
  activeResultIndex: number
  activeStatementKey?: string
  error?: string
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

export type NotebookVariable = {
  name: string
  value: string
}

export type NotebookSettings = {
  layoutMode?: NotebookLayoutMode
  layout?: CellLayoutItem[]
  variables?: NotebookVariable[]
  autoRefreshDefault?: AutoRefresh
  autoRefreshMigrated?: true
}

export type NotebookViewState = {
  cells: NotebookCell[]
  focusedCellId?: string
  maximizedCellId?: string
  settings?: NotebookSettings
}

export const createCell = (position: number, value = ""): NotebookCell => ({
  id: crypto.randomUUID(),
  position,
  value,
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

// Nothing polls unless the cell or the notebook says so — but charts are born
// live: entering draw mode stamps an explicit Auto onto the cell. A stored
// notebook default (even Off) is the user's notebook-wide intent, so the
// stamp yields to it and the chart inherits instead.
export const chartAutoRefreshStamp = (
  cell: Pick<NotebookCell, "mode" | "autoRefresh">,
  autoRefreshDefault: AutoRefresh | undefined,
): Partial<NotebookCell> =>
  cell.mode === "draw" &&
  cell.autoRefresh === undefined &&
  autoRefreshDefault === undefined
    ? { autoRefresh: true }
    : {}

// A stamped chart carries the same `autoRefresh: true` a user override would;
// this tells the two apart so born-live charts don't read as user overrides.
export const isChartAutoRefreshStamp = (
  cell: Pick<NotebookCell, "mode" | "autoRefresh">,
  autoRefreshDefault: AutoRefresh | undefined,
): boolean =>
  cell.mode === "draw" &&
  cell.autoRefresh === true &&
  autoRefreshDefault === undefined

// Charts drawn before the uniform-Off fallback polled through an implicit
// per-view Auto. The stamp makes that liveness explicit so they keep polling;
// grids never polled, and stay off. No notebook default is ever synthesized.
// The marker makes the stamp one-time: on a migrated view an undefined
// autoRefresh is a deliberate "inherit", and re-stamping it would silently
// revert a cleared chart to Auto.
export const migrateImplicitChartAutoRefresh = (
  state: NotebookViewState,
): NotebookViewState => {
  if (state.settings?.autoRefreshMigrated) return state
  const autoRefreshDefault = state.settings?.autoRefreshDefault
  const needsStamp = (cell: NotebookCell) =>
    Object.keys(chartAutoRefreshStamp(cell, autoRefreshDefault)).length > 0
  const cells = state.cells.some(needsStamp)
    ? state.cells.map((cell) =>
        needsStamp(cell) ? { ...cell, autoRefresh: true as const } : cell,
      )
    : state.cells
  return {
    ...state,
    cells,
    settings: { ...state.settings, autoRefreshMigrated: true },
  }
}
