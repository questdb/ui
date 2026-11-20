import { isValidVariableName } from "../scenes/Editor/Notebook/variableName"
import type {
  ChartSync,
  CellInteractions,
  GridMode,
  NotebookChartType,
  NotebookViewState,
} from "./notebook"
import {
  STATE_SEVERITIES,
  VISUAL_TYPES,
  type CustomChartConfig,
  type StateSeverity,
  type EventColumns,
  type VisualColumns,
  type VisualConfig,
} from "../scenes/Editor/Notebook/CellChart/chartTypes"

// The notebook format version, and the steps that bring an older state up to
// it. A state is read through `migrateNotebookFormat` on load and on import;
// the persist path writes the current version.
//
// Version history:
//   1  (no `formatVersion`) everything before dashboards.
//   2  cell formats, interactions and grid modes; chart visuals, custom
//      ECharts options and event queries; notebook chart types and chart sync.

export const NOTEBOOK_FORMAT_VERSION = 2

type Migration = {
  to: number
  migrate: (state: NotebookViewState) => NotebookViewState
}

// Each step takes a state at `to - 1` to `to`. Version 2 only adds optional
// fields, so a version 1 state is already valid.
const MIGRATIONS: Migration[] = [{ to: 2, migrate: (state) => state }]

export type FormatMigration = {
  state: NotebookViewState
  // Written by a newer console: kept as it is, but parts may not show.
  newer: boolean
}

export const migrateNotebookFormat = (
  state: NotebookViewState,
): FormatMigration => {
  const from =
    typeof state.formatVersion === "number" && state.formatVersion >= 1
      ? Math.floor(state.formatVersion)
      : 1
  if (from > NOTEBOOK_FORMAT_VERSION) return { state, newer: true }
  let next = state
  for (const step of MIGRATIONS) {
    if (step.to > from) next = step.migrate(next)
  }
  return {
    state:
      next.formatVersion === NOTEBOOK_FORMAT_VERSION
        ? next
        : { ...next, formatVersion: NOTEBOOK_FORMAT_VERSION },
    newer: false,
  }
}

// ── Sanitizers for the version 2 fields, used on import ───────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isName = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200

const ROLE_KEYS: (keyof VisualColumns)[] = [
  "value",
  "label",
  "caption",
  "change",
  "target",
  "time",
  "end",
  "lane",
  "state",
  "from",
  "to",
  "lat",
  "lon",
  "region",
  "price",
  "size",
  "buy",
  "sell",
  "text",
]

export const sanitizeVisualConfig = (
  value: unknown,
): VisualConfig | undefined => {
  if (!isRecord(value)) return undefined
  if (!(VISUAL_TYPES as readonly unknown[]).includes(value.type))
    return undefined
  const visual: VisualConfig = { type: value.type as VisualConfig["type"] }
  if (isRecord(value.columns)) {
    const columns: VisualColumns = {}
    for (const key of ROLE_KEYS) {
      const column = value.columns[key]
      if (isName(column)) (columns as Record<string, string>)[key] = column
    }
    if (Array.isArray(value.columns.path)) {
      const path = value.columns.path.filter(isName).slice(0, 8)
      if (path.length > 0) columns.path = path
    }
    if (Object.keys(columns).length > 0) visual.columns = columns
  }
  if (typeof value.min === "number" && Number.isFinite(value.min))
    visual.min = value.min
  if (typeof value.max === "number" && Number.isFinite(value.max))
    visual.max = value.max
  if (
    typeof value.sparklineQuery === "number" &&
    Number.isInteger(value.sparklineQuery) &&
    value.sparklineQuery >= 0
  )
    visual.sparklineQuery = value.sparklineQuery
  if (
    typeof value.buckets === "number" &&
    Number.isInteger(value.buckets) &&
    value.buckets >= 1
  )
    visual.buckets = Math.min(Math.max(value.buckets, 10), 365)
  if (isRecord(value.severity)) {
    const severity: Record<string, StateSeverity> = {}
    for (const [state, level] of Object.entries(value.severity).slice(0, 50))
      if (
        state.length <= 200 &&
        (STATE_SEVERITIES as readonly unknown[]).includes(level)
      )
        severity[state] = level as StateSeverity
    if (Object.keys(severity).length > 0) visual.severity = severity
  }
  return visual
}

export const sanitizeEventColumns = (
  value: unknown,
): EventColumns | undefined => {
  if (!isRecord(value)) return undefined
  const out: EventColumns = {}
  for (const key of ["time", "end", "label", "tone"] as const) {
    if (isName(value[key])) out[key] = value[key]
  }
  return out
}

export const MAX_OPTION_DEPTH = 32
export const MAX_OPTION_NODES = 20_000

/**
 * A deep copy of a JSON-like option, or undefined when it is not plain data
 * (functions, cycles) or too large. Rendering sanitizes it again.
 */
export const copyPlainOption = (
  value: unknown,
): Record<string, unknown> | undefined => {
  let nodes = 0
  const copy = (node: unknown, depth: number): unknown => {
    if (++nodes > MAX_OPTION_NODES || depth > MAX_OPTION_DEPTH)
      throw new Error("too large")
    if (node === null) return null
    switch (typeof node) {
      case "string":
      case "boolean":
        return node
      case "number":
        return Number.isFinite(node) ? node : null
      case "object":
        if (Array.isArray(node)) return node.map((n) => copy(n, depth + 1))
        return Object.fromEntries(
          Object.entries(node as Record<string, unknown>)
            .filter(
              ([key]) =>
                key !== "__proto__" &&
                key !== "constructor" &&
                key !== "prototype",
            )
            .map(([key, n]) => [key, copy(n, depth + 1)]),
        )
      default:
        throw new Error("not plain data")
    }
  }
  if (!isRecord(value)) return undefined
  try {
    return copy(value, 0) as Record<string, unknown>
  } catch {
    return undefined
  }
}

export const sanitizeCustomChart = (
  value: unknown,
): CustomChartConfig | undefined => {
  if (!isRecord(value)) return undefined
  const option = copyPlainOption(value.option)
  return option ? { option } : undefined
}

/** A variable name as notebooks allow it, at most 64 characters. */
export const isVariableName = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 64 && isValidVariableName(value)

export const sanitizeInteractions = (
  value: unknown,
): CellInteractions | undefined => {
  if (!isRecord(value)) return undefined
  const out: CellInteractions = {}
  if (isRecord(value.click) && isVariableName(value.click.variable)) {
    out.click = { variable: value.click.variable }
    if (isName(value.click.column)) out.click.column = value.click.column
  }
  if (
    isRecord(value.brush) &&
    isVariableName(value.brush.from) &&
    isVariableName(value.brush.to)
  ) {
    out.brush = { from: value.brush.from, to: value.brush.to }
  }
  return out.click || out.brush ? out : undefined
}

export const sanitizeGridMode = (value: unknown): GridMode | undefined =>
  value === "stable" || value === "stream" ? value : undefined

const CHART_TYPE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
const MAX_RENDER_ITEM = 20_000
const MAX_CHART_TYPES = 32

export const isChartTypeName = (value: unknown): value is string =>
  typeof value === "string" && CHART_TYPE_NAME.test(value)

export const sanitizeChartTypes = (
  value: unknown,
): NotebookChartType[] | undefined => {
  if (!Array.isArray(value)) return undefined
  const seen = new Set<string>()
  const out: NotebookChartType[] = []
  for (const item of value) {
    if (!isRecord(item) || !isChartTypeName(item.name)) continue
    if (typeof item.renderItem !== "string") continue
    if (item.renderItem.length > MAX_RENDER_ITEM) continue
    if (seen.has(item.name)) continue
    seen.add(item.name)
    const type: NotebookChartType = {
      name: item.name,
      renderItem: item.renderItem,
    }
    if (typeof item.description === "string" && item.description.trim())
      type.description = item.description.trim().slice(0, 500)
    out.push(type)
    if (out.length >= MAX_CHART_TYPES) break
  }
  return out.length > 0 ? out : undefined
}

export const sanitizeChartSync = (value: unknown): ChartSync | undefined => {
  if (!isRecord(value)) return undefined
  const crosshair =
    value.crosshair === "line" || value.crosshair === "tooltip"
      ? value.crosshair
      : "off"
  const zoom = value.zoom === true
  return crosshair === "off" && !zoom ? undefined : { crosshair, zoom }
}
