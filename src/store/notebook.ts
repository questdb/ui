import type { editor } from "monaco-editor"
import type { ColumnDefinition, Timings } from "../utils/questdb/types"
import type { ChartConfig } from "../scenes/Editor/Notebook/CellChart/chartTypes"

export type CellMode = "run" | "draw"

// Persisted JSON from the multi-kind era may still carry a `type` field;
// it is tolerated at runtime.
export type NotebookCell = {
  id: string
  position: number
  value: string
  editorViewState?: editor.ICodeEditorViewState
  result?: CellResult | null
  topHeight?: number
  bottomHeight?: number
  topResized?: boolean
  spotlightEditorRatio?: number
  mode?: CellMode
  chartConfig?: ChartConfig
  autoRefresh?: boolean
  isChartMaximized?: boolean
  columnSizing?: Record<string, Record<string, number>>
}

export type DqlQueryResult = {
  type: "dql"
  query: string
  columns: ColumnDefinition[]
  dataset: (boolean | string | number | null)[][]
  count: number
  timings?: Timings
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
  type: "running" | "queued" | "cancelled"
  query: string
}

export type SingleQueryResult =
  | DqlQueryResult
  | DdlDmlQueryResult
  | ErrorQueryResult
  | TransientQueryResult

export type CellResult = {
  results: SingleQueryResult[]
  activeResultIndex: number
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

export type NotebookSettings = {
  layoutMode?: NotebookLayoutMode
  layout?: CellLayoutItem[]
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
