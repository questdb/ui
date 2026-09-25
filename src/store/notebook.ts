import type { editor } from "monaco-editor"
import type { ColumnDefinition, Timings } from "../utils/questdb/types"
import type { RunStatus } from "../utils/ai/runStatus"
import type { ChartConfig } from "../scenes/Editor/Notebook/CellChart/chartTypes"
import type { HighlightConfig } from "../components/ResultGrid/highlight/types"

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
  // One set of rules for every result grid of the cell, by column name; an
  // edit to the SQL never touches it.
  highlightConfig?: HighlightConfig
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

const RULE_KINDS = new Set(["previous", "value", "steps"])

const isHighlightConfig = (value: unknown): value is HighlightConfig => {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<HighlightConfig>
  return (
    Array.isArray(candidate.identityColumns) &&
    candidate.identityColumns.every((name) => typeof name === "string") &&
    Array.isArray(candidate.rules) &&
    candidate.rules.every(
      (rule) =>
        typeof rule === "object" &&
        rule !== null &&
        RULE_KINDS.has((rule as { kind?: string }).kind ?? ""),
    )
  )
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
