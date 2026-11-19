import {
  CELL_VISUALS,
  FORMAT_KINDS,
  TONES,
  isTone,
  type ColumnFormat,
  type ColumnFormats,
} from "../formats/columnFormat"
import {
  STATE_SEVERITIES,
  VISUAL_TYPES,
  type EventColumns,
  type StateSeverity,
  type VisualColumns,
  type VisualConfig,
} from "../../scenes/Editor/Notebook/CellChart/chartTypes"
import type {
  CellInteractions,
  ChartSync,
  GridMode,
  NotebookCell,
  NotebookChartType,
} from "../../store/notebook"
import {
  copyPlainOption,
  isChartTypeName,
  isVariableName,
} from "../../store/notebookFormat"

// Snake-case shapes of the dashboard features on the agent tools, and their
// mapping to and from the notebook's camelCase model. Shared by the per-cell
// tools, apply_notebook_state and get_cell.

export class WireError extends Error {}

const fail = (message: string): never => {
  throw new WireError(message)
}

// ── Visuals ───────────────────────────────────────────────────────────────

export type VisualColumnsWire = {
  [K in Exclude<keyof VisualColumns, "path">]?: string | null
} & { path?: string[] | null }

export type VisualWire = {
  type: string
  columns?: VisualColumnsWire | null
  min?: number | null
  max?: number | null
  sparkline_query?: number | null
  buckets?: number | null
  severity?: { state: string; level: string }[] | null
}

export const parseVisual = (wire: VisualWire, at: string): VisualConfig => {
  if (!(VISUAL_TYPES as readonly string[]).includes(wire.type))
    fail(`${at}.type must be one of ${VISUAL_TYPES.join(", ")}.`)
  const visual: VisualConfig = { type: wire.type as VisualConfig["type"] }
  if (wire.columns) {
    const columns: VisualColumns = {}
    for (const [key, value] of Object.entries(wire.columns)) {
      if (value === null || value === undefined) continue
      if (key === "path") {
        if (!Array.isArray(value) || value.some((v) => typeof v !== "string"))
          fail(`${at}.columns.path must be an array of column names.`)
        if ((value as string[]).length > 0) columns.path = value as string[]
      } else if (typeof value === "string" && value.length > 0) {
        ;(columns as Record<string, string>)[key] = value
      }
    }
    if (Object.keys(columns).length > 0) visual.columns = columns
  }
  if (typeof wire.min === "number") visual.min = wire.min
  if (typeof wire.max === "number") visual.max = wire.max
  if (
    typeof wire.min === "number" &&
    typeof wire.max === "number" &&
    wire.min >= wire.max
  )
    fail(`${at}: min must be below max.`)
  if (typeof wire.sparkline_query === "number") {
    if (!Number.isInteger(wire.sparkline_query) || wire.sparkline_query < 0)
      fail(`${at}.sparkline_query must be a statement index (0-based).`)
    visual.sparklineQuery = wire.sparkline_query
  }
  if (typeof wire.buckets === "number") {
    if (
      !Number.isInteger(wire.buckets) ||
      wire.buckets < 10 ||
      wire.buckets > 365
    )
      fail(`${at}.buckets must be a whole number from 10 to 365.`)
    visual.buckets = wire.buckets
  }
  if (Array.isArray(wire.severity) && wire.severity.length > 0) {
    const severity: Record<string, StateSeverity> = {}
    wire.severity.forEach((item, i) => {
      if (
        typeof item?.state !== "string" ||
        !(STATE_SEVERITIES as readonly string[]).includes(item.level)
      )
        fail(
          `${at}.severity[${i}] needs a state and a level (${STATE_SEVERITIES.join(", ")}).`,
        )
      severity[item.state] = item.level as StateSeverity
    })
    visual.severity = severity
  }
  return visual
}

export const visualToWire = (visual: VisualConfig) => ({
  type: visual.type,
  columns: visual.columns ?? null,
  min: visual.min ?? null,
  max: visual.max ?? null,
  sparkline_query: visual.sparklineQuery ?? null,
  buckets: visual.buckets ?? null,
  severity: visual.severity
    ? Object.entries(visual.severity).map(([state, level]) => ({
        state,
        level,
      }))
    : null,
})

// ── Custom ECharts options ────────────────────────────────────────────────

export const parseCustomOption = (
  json: string,
  at: string,
): Record<string, unknown> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    fail(
      `${at} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
  const option = copyPlainOption(parsed)
  if (!option)
    fail(
      `${at} must be a JSON object (an ECharts option), at most 20,000 values.`,
    )
  return option as Record<string, unknown>
}

// ── Formats ───────────────────────────────────────────────────────────────

export type FormatWire = {
  column: string
  kind?: string | null
  decimals?: number | null
  compact?: boolean | null
  prefix?: string | null
  suffix?: string | null
  thresholds?: { value: number; tone: string }[] | null
  base_tone?: string | null
  sign_tone?: boolean | null
  visual?: string | null
}

export const parseFormats = (wire: FormatWire[], at: string): ColumnFormats => {
  const formats: ColumnFormats = {}
  wire.forEach((f, i) => {
    const here = `${at}[${i}]`
    if (typeof f.column !== "string" || f.column.length === 0)
      fail(`${here}.column is required.`)
    const format: ColumnFormat = {}
    if (f.kind != null) {
      if (!(FORMAT_KINDS as readonly string[]).includes(f.kind))
        fail(`${here}.kind must be one of ${FORMAT_KINDS.join(", ")}.`)
      format.kind = f.kind as ColumnFormat["kind"]
    }
    if (f.decimals != null) {
      if (!Number.isInteger(f.decimals) || f.decimals < 0 || f.decimals > 12)
        fail(`${here}.decimals must be an integer from 0 to 12.`)
      format.decimals = f.decimals
    }
    if (f.compact) format.compact = true
    if (f.prefix) format.prefix = f.prefix.slice(0, 16)
    if (f.suffix) format.suffix = f.suffix.slice(0, 16)
    if (f.thresholds && f.thresholds.length > 0) {
      for (const t of f.thresholds) {
        if (typeof t.value !== "number" || !isTone(t.tone))
          fail(
            `${here}.thresholds: each needs a numeric value and a tone (${TONES.join(", ")}).`,
          )
      }
      format.thresholds = [...f.thresholds]
        .map((t) => ({
          value: t.value,
          tone: t.tone as ColumnFormat["baseTone"] & string,
        }))
        .sort((a, b) => a.value - b.value) as ColumnFormat["thresholds"]
    }
    if (f.base_tone != null) {
      if (!isTone(f.base_tone))
        fail(`${here}.base_tone must be one of ${TONES.join(", ")}.`)
      format.baseTone = f.base_tone as ColumnFormat["baseTone"]
    }
    if (f.sign_tone) format.signTone = true
    if (f.visual != null) {
      if (!(CELL_VISUALS as readonly string[]).includes(f.visual))
        fail(`${here}.visual must be one of ${CELL_VISUALS.join(", ")}.`)
      format.visual = f.visual as ColumnFormat["visual"]
    }
    formats[f.column] = format
  })
  return formats
}

export const formatsToWire = (formats: ColumnFormats): FormatWire[] =>
  Object.entries(formats).map(([column, f]) => ({
    column,
    kind: f.kind ?? null,
    decimals: f.decimals ?? null,
    compact: f.compact ?? null,
    prefix: f.prefix ?? null,
    suffix: f.suffix ?? null,
    thresholds: f.thresholds ?? null,
    base_tone: f.baseTone ?? null,
    sign_tone: f.signTone ?? null,
    visual: f.visual ?? null,
  }))

// ── Interactions and grid mode ────────────────────────────────────────────

export type InteractionsWire = {
  click?: { variable: string; column?: string | null } | null
  brush?: { from_variable: string; to_variable: string } | null
}

export const parseInteractions = (
  wire: InteractionsWire,
  at: string,
): CellInteractions | undefined => {
  const out: CellInteractions = {}
  if (wire.click) {
    const variable = wire.click.variable.replace(/^@/, "")
    if (!isVariableName(variable))
      fail(`${at}.click.variable must be a variable name (letters, digits, _).`)
    out.click = { variable }
    if (wire.click.column) out.click.column = wire.click.column
  }
  if (wire.brush) {
    const from = wire.brush.from_variable.replace(/^@/, "")
    const to = wire.brush.to_variable.replace(/^@/, "")
    if (!isVariableName(from) || !isVariableName(to))
      fail(`${at}.brush variables must be variable names (letters, digits, _).`)
    out.brush = { from, to }
  }
  return out.click || out.brush ? out : undefined
}

export const interactionsToWire = (i: CellInteractions) => ({
  click: i.click
    ? { variable: i.click.variable, column: i.click.column ?? null }
    : null,
  brush: i.brush
    ? { from_variable: i.brush.from, to_variable: i.brush.to }
    : null,
})

export const parseGridMode = (
  wire: string | null | undefined,
  at: string,
): GridMode | undefined => {
  if (wire == null || wire === "default") return undefined
  if (wire !== "stable" && wire !== "stream")
    fail(`${at} must be "default", "stable" or "stream".`)
  return wire as GridMode
}

// ── Event queries ─────────────────────────────────────────────────────────

export type EventsWire = {
  time?: string | null
  end?: string | null
  label?: string | null
  tone?: string | null
}

export const parseEvents = (wire: EventsWire): EventColumns => {
  const out: EventColumns = {}
  for (const key of ["time", "end", "label", "tone"] as const) {
    const value = wire[key]
    if (typeof value === "string" && value.length > 0) out[key] = value
  }
  return out
}

// ── Notebook chart types and chart sync ───────────────────────────────────

export type ChartTypeWire = {
  name: string
  render_item: string
  description?: string | null
}

export const parseChartType = (
  wire: ChartTypeWire,
  at: string,
): NotebookChartType => {
  if (!isChartTypeName(wire.name))
    fail(
      `${at}.name must start with a letter and use letters, digits or _ (at most 64).`,
    )
  if (typeof wire.render_item !== "string" || wire.render_item.trim() === "")
    fail(`${at}.render_item is required.`)
  if (wire.render_item.length > 20_000)
    fail(`${at}.render_item is over 20,000 characters.`)
  const type: NotebookChartType = {
    name: wire.name,
    renderItem: wire.render_item,
  }
  if (wire.description) type.description = wire.description.slice(0, 500)
  return type
}

export const parseChartSync = (wire: {
  crosshair?: string | null
  zoom?: boolean | null
}): ChartSync => {
  const crosshair =
    wire.crosshair === "line" || wire.crosshair === "tooltip"
      ? wire.crosshair
      : "off"
  return { crosshair, zoom: wire.zoom === true }
}

/** The dashboard fields of a cell, for get_cell and the notebook snapshot. */
export const cellDashboardWire = (cell: NotebookCell) => {
  const out: Record<string, unknown> = {}
  if (cell.formats) out.formats = formatsToWire(cell.formats)
  if (cell.interactions)
    out.interactions = interactionsToWire(cell.interactions)
  if (cell.gridMode) out.grid_mode = cell.gridMode
  return out
}
