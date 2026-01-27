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
import { LINE_NUMBER_HARD_LIMIT } from "./index"

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

const validateBufferItem = (item: unknown, index: number): ValidationResult => {
  if (typeof item !== "object" || item === null)
    return `Item [${index}]: must be an object`
  const obj = item as Record<string, unknown>

  // Check for prototype pollution attempts
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) {
      return `Item [${index}]: contains forbidden key "${key}"`
    }
  }

  if (typeof obj.label !== "string")
    return `Item [${index}]: label must be a string`
  if (typeof obj.value !== "string")
    return `Item [${index}]: value must be a string`
  const lineCount = obj.value.split("\n").length
  if (lineCount > LINE_NUMBER_HARD_LIMIT)
    return `Item [${index}]: exceeds line limit (line count > ${LINE_NUMBER_HARD_LIMIT})`
  if (typeof obj.position !== "number")
    return `Item [${index}]: position must be a number`

  const hasEditorViewState = obj.editorViewState !== undefined
  const hasMetricsViewState = obj.metricsViewState !== undefined
  if (!hasEditorViewState && !hasMetricsViewState)
    return `Item [${index}]: must have editorViewState or metricsViewState`

  if (hasMetricsViewState) {
    const result = validateMetricsViewState(obj.metricsViewState)
    if (result !== true) return `Item [${index}]: ${result}`
  }

  return true
}

/**
 * Sanitize a single metric object - only copy validated fields
 */
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

/**
 * Sanitize metricsViewState - only copy validated fields
 */
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

/**
 * Sanitize a buffer item - only copy validated fields to prevent injection
 * of unexpected properties. This is a security measure.
 */
export const sanitizeBuffer = (
  item: Record<string, unknown>,
): Omit<Buffer, "id"> => {
  const hasMetricsViewState = item.metricsViewState !== undefined

  const sanitized: Omit<Buffer, "id"> = {
    label: item.label as string,
    value: item.value as string,
    position: item.position as number,
  }

  if (hasMetricsViewState) {
    // Sanitize metricsViewState - only copy validated fields
    sanitized.metricsViewState = sanitizeMetricsViewState(
      item.metricsViewState as Record<string, unknown>,
    )
  } else {
    // Always use default editorViewState for security
    sanitized.editorViewState = defaultEditorViewState
  }

  // Only copy specific optional fields with type checking
  if (item.archived === true) {
    sanitized.archived = true
  }
  if (typeof item.archivedAt === "number") {
    sanitized.archivedAt = item.archivedAt
  }
  // Note: isTemporary, isPreviewBuffer, and previewContent are intentionally
  // NOT imported as they are internal state fields that should not come from
  // external sources

  return sanitized
}

export const validateBufferSchema = (data: unknown): ValidationResult => {
  if (!Array.isArray(data)) return "Data must be an array"
  if (data.length === 0) return "File contains no tabs"

  for (let i = 0; i < data.length; i++) {
    const result = validateBufferItem(data[i], i)
    if (result !== true) return result
  }

  return true
}
