import {
  exceedsCellLineLimit,
  isCellPaneView,
  MAX_CELL_LINES,
  MAX_CELL_NAME_LENGTH,
  sanitizeHighlightConfig,
  type NotebookCell,
} from "../../../store/notebook"
import type { ChartConfig, QueryChart } from "./CellChart/chartTypes"
import { isAutoRefresh } from "./notebookUtils"
import {
  clampPaneHeight,
  foldLegacyMaximizedHeights,
  minBottomHeightFor,
  minTopHeightFor,
} from "./cellSizing"

export type ValidationResult = true | string

export const validateNotebookCell = (
  item: unknown,
  index: number,
): ValidationResult => {
  if (typeof item !== "object" || item === null)
    return `cells[${index}]: must be an object`
  const obj = item as Record<string, unknown>

  if (typeof obj.id !== "string" || obj.id.length === 0)
    return `cells[${index}].id: must be a non-empty string`
  if (typeof obj.value !== "string")
    return `cells[${index}].value: must be a string`
  if (obj.type !== "markdown" && exceedsCellLineLimit(obj.value))
    return `cells[${index}].value: exceeds line limit (line count > ${MAX_CELL_LINES})`
  if (obj.type !== undefined && obj.type !== "sql" && obj.type !== "markdown")
    return `cells[${index}].type: invalid value ${JSON.stringify(obj.type)}`
  if (obj.mode !== undefined && obj.mode !== "run" && obj.mode !== "draw")
    return `cells[${index}].mode: invalid value ${JSON.stringify(obj.mode)}`

  return true
}

const sanitizeChartConfig = (item: unknown): ChartConfig | undefined => {
  if (typeof item !== "object" || item === null) return undefined
  const obj = item as Record<string, unknown>
  // Legacy (pre-`queries`) configs are dropped on load anyway.
  if (!Array.isArray(obj.queries)) return undefined

  const config: ChartConfig = {
    xColumn: typeof obj.xColumn === "string" ? obj.xColumn : null,
    queries: obj.queries.map((q) =>
      typeof q === "object" && q !== null ? (q as QueryChart) : null,
    ),
  }
  if (typeof obj.rightAxis === "object" && obj.rightAxis !== null)
    config.rightAxis = obj.rightAxis as ChartConfig["rightAxis"]
  return config
}

// The same pane floors and ceiling every UI writer enforces, so a hand-authored
// file can't pin an invisible editor or an overlapping pane.
const clampPaneHeights = (cell: NotebookCell): NotebookCell => ({
  ...cell,
  ...(cell.topHeight !== undefined
    ? { topHeight: clampPaneHeight(minTopHeightFor(cell), cell.topHeight) }
    : {}),
  ...(cell.bottomHeight !== undefined
    ? {
        bottomHeight: clampPaneHeight(
          minBottomHeightFor(cell),
          cell.bottomHeight,
        ),
      }
    : {}),
})

// Whitelists notebook content fields; session/display state (results,
// editorViewState) is intentionally dropped so an imported notebook starts
// fresh and malformed payloads can't crash the renderers.
export const sanitizeNotebookCell = (
  item: Record<string, unknown>,
  index: number,
): NotebookCell => {
  const cell: NotebookCell = {
    id: item.id as string,
    position: index,
    value: item.value as string,
  }
  // Cell name, with a fallback to the legacy chart title (chartConfig.name),
  // capped to the same length the UI and MCP tools enforce.
  const legacyChartName = (item.chartConfig as { name?: unknown } | undefined)
    ?.name
  const rawName =
    typeof item.name === "string"
      ? item.name
      : typeof legacyChartName === "string"
        ? legacyChartName
        : undefined
  if (rawName !== undefined) cell.name = rawName.slice(0, MAX_CELL_NAME_LENGTH)
  // Whitelist the kind so a hand-crafted import can't smuggle a bogus type
  // (anything other than "markdown" collapses to the SQL default).
  if (item.type === "markdown") cell.type = "markdown"
  // Markdown cells carry no run/draw sub-state — gating it here keeps a
  // hand-crafted import from producing a cell apply_notebook_state rejects.
  const inferredMaximized =
    item.type !== "markdown" &&
    !isCellPaneView(item.paneView) &&
    item.isViewMaximized === true
  if (item.type !== "markdown") {
    if (item.mode === "draw") cell.mode = "draw"
    const chartConfig = sanitizeChartConfig(item.chartConfig)
    if (chartConfig) cell.chartConfig = chartConfig
    const highlightConfig = sanitizeHighlightConfig(item.highlightConfig)
    if (highlightConfig) cell.highlightConfig = highlightConfig
    if (isAutoRefresh(item.autoRefresh)) cell.autoRefresh = item.autoRefresh
    cell.paneView = isCellPaneView(item.paneView)
      ? item.paneView
      : inferredMaximized
        ? "result"
        : "editor_result"
  }
  if (typeof item.topHeight === "number" && Number.isFinite(item.topHeight))
    cell.topHeight = item.topHeight
  if (
    typeof item.bottomHeight === "number" &&
    Number.isFinite(item.bottomHeight)
  )
    cell.bottomHeight = item.bottomHeight
  if (typeof item.topResized === "boolean") cell.topResized = item.topResized
  if (typeof item.bottomResized === "boolean")
    cell.bottomResized = item.bottomResized
  if (typeof item.spotlightEditorRatio === "number")
    cell.spotlightEditorRatio = item.spotlightEditorRatio
  // Fold the raw legacy heights before the clamp, as the in-place read does,
  // so an import lands at the same size as opening the notebook.
  return clampPaneHeights(
    inferredMaximized ? foldLegacyMaximizedHeights(cell) : cell,
  )
}
