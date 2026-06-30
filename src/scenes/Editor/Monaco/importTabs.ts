import {
  Buffer,
  defaultEditorViewState,
  Metric,
  MetricsViewState,
} from "../../../store/buffers"
import {
  MetricType,
  MetricViewMode,
  SampleBy,
  RefreshRate,
} from "../Metrics/utils"
import type {
  CellLayoutItem,
  NotebookCell,
  NotebookSettings,
  NotebookVariable,
  NotebookViewState,
} from "../../../store/notebook"
import type { ChartConfig, QueryChart } from "../Notebook/CellChart/chartTypes"
import { isAutoRefresh } from "../Notebook/notebookUtils"
import { LINE_NUMBER_HARD_LIMIT } from "./index"
import {
  MAX_NOTEBOOK_CELLS,
  MAX_CELL_LINES,
  exceedsCellLineLimit,
} from "../../../store/notebook"

type ValidationResult = true | string

const METRIC_TYPES = Object.values(MetricType)
const METRIC_VIEW_MODES = Object.values(MetricViewMode)
const SAMPLE_BY_VALUES = Object.values(SampleBy)
const REFRESH_RATE_VALUES = Object.values(RefreshRate)

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"])

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/
export const DEFAULT_METRIC_COLOR = "#FF6B6B"

const validateMetric = (item: unknown, index: number): ValidationResult => {
  if (typeof item !== "object" || item === null)
    return `metrics[${index}]: must be an object`
  const obj = item as Record<string, unknown>

  if (obj.tableId !== undefined && typeof obj.tableId !== "number")
    return `metrics[${index}].tableId: must be a number`
  if (!METRIC_TYPES.includes(obj.metricType as MetricType))
    return `metrics[${index}].metricType: invalid value "${obj.metricType}"`
  if (typeof obj.position !== "number")
    return `metrics[${index}].position: must be a number`
  if (typeof obj.color !== "string")
    return `metrics[${index}].color: must be a string`
  if (obj.removed !== undefined && typeof obj.removed !== "boolean")
    return `metrics[${index}].removed: must be a boolean`

  return true
}

const validateMetricsViewState = (item: unknown): ValidationResult => {
  if (typeof item !== "object" || item === null)
    return "metricsViewState: must be an object"
  const obj = item as Record<string, unknown>

  if (obj.dateFrom !== undefined && typeof obj.dateFrom !== "string")
    return "metricsViewState.dateFrom: must be a string"
  if (obj.dateTo !== undefined && typeof obj.dateTo !== "string")
    return "metricsViewState.dateTo: must be a string"
  if (
    obj.refreshRate !== undefined &&
    !REFRESH_RATE_VALUES.includes(obj.refreshRate as RefreshRate)
  )
    return `metricsViewState.refreshRate: invalid value ${JSON.stringify(obj.refreshRate)}`
  if (
    obj.sampleBy !== undefined &&
    !SAMPLE_BY_VALUES.includes(obj.sampleBy as SampleBy)
  )
    return `metricsViewState.sampleBy: invalid value ${JSON.stringify(obj.sampleBy)}`
  if (
    obj.viewMode !== undefined &&
    !METRIC_VIEW_MODES.includes(obj.viewMode as MetricViewMode)
  )
    return `metricsViewState.viewMode: invalid value ${JSON.stringify(obj.viewMode)}`
  if (obj.metrics !== undefined) {
    if (!Array.isArray(obj.metrics))
      return "metricsViewState.metrics: must be an array"
    for (let i = 0; i < obj.metrics.length; i++) {
      const result = validateMetric(obj.metrics[i], i)
      if (result !== true) return `metricsViewState.${result}`
    }
  }

  return true
}

const validateNotebookCell = (
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

const validateNotebookViewState = (item: unknown): ValidationResult => {
  if (typeof item !== "object" || item === null)
    return "notebookViewState: must be an object"
  const obj = item as Record<string, unknown>

  if (!Array.isArray(obj.cells))
    return "notebookViewState.cells: must be an array"
  if (obj.cells.length > MAX_NOTEBOOK_CELLS)
    return `notebookViewState.cells: exceeds cell limit (${obj.cells.length} > ${MAX_NOTEBOOK_CELLS})`
  const ids = new Set<string>()
  for (let i = 0; i < obj.cells.length; i++) {
    const result = validateNotebookCell(obj.cells[i], i)
    if (result !== true) return `notebookViewState.${result}`
    const id = (obj.cells[i] as Record<string, unknown>).id as string
    if (ids.has(id))
      return `notebookViewState.cells[${i}].id: duplicate "${id}"`
    ids.add(id)
  }

  return true
}

export const validateBufferItem = (item: unknown): ValidationResult => {
  if (typeof item !== "object" || item === null) return "must be an object"
  const obj = item as Record<string, unknown>

  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) {
      return `contains forbidden key "${key}"`
    }
  }

  if (typeof obj.label !== "string") return "label must be a string"
  if (typeof obj.value !== "string") return "value must be a string"
  const lineCount = obj.value.split("\n").length
  if (lineCount > LINE_NUMBER_HARD_LIMIT)
    return `exceeds line limit (line count > ${LINE_NUMBER_HARD_LIMIT})`
  if (typeof obj.position !== "number") return "position must be a number"

  const hasEditorViewState = obj.editorViewState !== undefined
  const hasMetricsViewState = obj.metricsViewState !== undefined
  const hasNotebookViewState = obj.notebookViewState !== undefined
  if (!hasEditorViewState && !hasMetricsViewState && !hasNotebookViewState)
    return "must have editorViewState, metricsViewState, or notebookViewState"

  if (hasMetricsViewState) {
    const result = validateMetricsViewState(obj.metricsViewState)
    if (result !== true) return result
  }

  if (hasNotebookViewState) {
    const result = validateNotebookViewState(obj.notebookViewState)
    if (result !== true) return result
  }

  return true
}

const sanitizeMetric = (item: Record<string, unknown>): Metric => {
  const color =
    typeof item.color === "string" && HEX_COLOR_REGEX.test(item.color)
      ? item.color
      : DEFAULT_METRIC_COLOR

  const metric: Metric = {
    metricType: item.metricType as MetricType,
    position: item.position as number,
    color,
    removed: (item.removed as boolean) ?? false,
  }
  if (item.tableId !== undefined) {
    metric.tableId = item.tableId as number
  }
  return metric
}

const sanitizeMetricsViewState = (
  item: Record<string, unknown>,
): MetricsViewState => {
  const state: MetricsViewState = {}

  if (item.dateFrom !== undefined) {
    state.dateFrom = item.dateFrom as string
  }
  if (item.dateTo !== undefined) {
    state.dateTo = item.dateTo as string
  }
  if (item.refreshRate !== undefined) {
    state.refreshRate = item.refreshRate as RefreshRate
  }
  if (item.sampleBy !== undefined) {
    state.sampleBy = item.sampleBy as SampleBy
  }
  if (item.viewMode !== undefined) {
    state.viewMode = item.viewMode as MetricViewMode
  }
  if (item.metrics !== undefined && Array.isArray(item.metrics)) {
    state.metrics = item.metrics.map((m) =>
      sanitizeMetric(m as Record<string, unknown>),
    )
  }

  return state
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
  if (typeof obj.autoRefresh === "boolean") config.autoRefresh = obj.autoRefresh
  if (typeof obj.rightAxis === "object" && obj.rightAxis !== null)
    config.rightAxis = obj.rightAxis as ChartConfig["rightAxis"]
  return config
}

// Whitelists notebook content fields; session/display state (results,
// editorViewState) is intentionally dropped so an imported notebook starts
// fresh and malformed payloads can't crash the renderers.
const sanitizeNotebookCell = (
  item: Record<string, unknown>,
  index: number,
): NotebookCell => {
  const cell: NotebookCell = {
    id: item.id as string,
    position: index,
    value: item.value as string,
  }
  // Cell name, with a fallback to the legacy chart title (chartConfig.name).
  const legacyChartName = (item.chartConfig as { name?: unknown } | undefined)
    ?.name
  if (typeof item.name === "string") cell.name = item.name
  else if (typeof legacyChartName === "string") cell.name = legacyChartName
  // Whitelist the kind so a hand-crafted import can't smuggle a bogus type
  // (anything other than "markdown" collapses to the SQL default).
  if (item.type === "markdown") cell.type = "markdown"
  if (item.mode === "run" || item.mode === "draw") cell.mode = item.mode
  const chartConfig = sanitizeChartConfig(item.chartConfig)
  if (chartConfig) cell.chartConfig = chartConfig
  if (isAutoRefresh(item.autoRefresh)) cell.autoRefresh = item.autoRefresh
  if (typeof item.isViewMaximized === "boolean")
    cell.isViewMaximized = item.isViewMaximized
  if (typeof item.topHeight === "number") cell.topHeight = item.topHeight
  if (typeof item.bottomHeight === "number")
    cell.bottomHeight = item.bottomHeight
  if (typeof item.topResized === "boolean") cell.topResized = item.topResized
  if (typeof item.bottomResized === "boolean")
    cell.bottomResized = item.bottomResized
  if (typeof item.spotlightEditorRatio === "number")
    cell.spotlightEditorRatio = item.spotlightEditorRatio
  return cell
}

const sanitizeNotebookSettings = (
  item: Record<string, unknown>,
): NotebookSettings => {
  const settings: NotebookSettings = {}
  if (item.layoutMode === "list" || item.layoutMode === "grid")
    settings.layoutMode = item.layoutMode
  if (Array.isArray(item.layout)) {
    settings.layout = item.layout.filter((l): l is CellLayoutItem => {
      if (typeof l !== "object" || l === null) return false
      const o = l as Record<string, unknown>
      return (
        typeof o.i === "string" &&
        typeof o.x === "number" &&
        typeof o.y === "number" &&
        typeof o.w === "number" &&
        typeof o.h === "number"
      )
    })
  }
  if (Array.isArray(item.variables)) {
    settings.variables = item.variables.filter((v): v is NotebookVariable => {
      if (typeof v !== "object" || v === null) return false
      const o = v as Record<string, unknown>
      return typeof o.name === "string" && typeof o.value === "string"
    })
  }
  return settings
}

const sanitizeNotebookViewState = (
  item: Record<string, unknown>,
): NotebookViewState => {
  const cells = (item.cells as unknown[]).map((c, i) =>
    sanitizeNotebookCell(c as Record<string, unknown>, i),
  )
  const state: NotebookViewState = { cells }
  if (
    typeof item.maximizedCellId === "string" &&
    cells.some((c) => c.id === item.maximizedCellId)
  )
    state.maximizedCellId = item.maximizedCellId
  if (typeof item.settings === "object" && item.settings !== null)
    state.settings = sanitizeNotebookSettings(
      item.settings as Record<string, unknown>,
    )
  return state
}

export const sanitizeBuffer = (
  item: Record<string, unknown>,
): Omit<Buffer, "id"> => {
  const hasMetricsViewState = item.metricsViewState !== undefined
  const hasNotebookViewState = item.notebookViewState !== undefined

  const sanitized: Omit<Buffer, "id"> = {
    label: item.label as string,
    value: item.value as string,
    position: item.position as number,
  }

  if (hasNotebookViewState) {
    sanitized.notebookViewState = sanitizeNotebookViewState(
      item.notebookViewState as Record<string, unknown>,
    )
  } else if (hasMetricsViewState) {
    sanitized.metricsViewState = sanitizeMetricsViewState(
      item.metricsViewState as Record<string, unknown>,
    )
  } else {
    sanitized.editorViewState = defaultEditorViewState
  }

  if (item.archived === true) {
    sanitized.archived = true
  }
  if (typeof item.archivedAt === "number") {
    sanitized.archivedAt = item.archivedAt
  }

  return sanitized
}

export const validateBufferSchema = (data: unknown): ValidationResult => {
  if (!Array.isArray(data)) return "Data must be an array"
  if (data.length === 0) return "File contains no tabs"

  for (let i = 0; i < data.length; i++) {
    const result = validateBufferItem(data[i])
    if (result !== true) return `Item [${i}]: ${result}`
  }

  return true
}

export const createBufferContentKey = (
  buffer: Pick<
    Buffer,
    "label" | "value" | "metricsViewState" | "notebookViewState"
  >,
): string => {
  if (buffer.notebookViewState) {
    const cellValues = buffer.notebookViewState.cells?.map((c) => c.value) ?? []
    return `${buffer.label}|${JSON.stringify(cellValues)}`
  }
  if (buffer.metricsViewState) {
    return `${buffer.label}|${JSON.stringify(buffer.metricsViewState)}`
  }
  return `${buffer.label}|${buffer.value}`
}
