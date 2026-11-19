import type {
  CellInteractions,
  NotebookVariable,
} from "../../../../store/notebook"
import type { ColumnFormats } from "../../../../utils/formats/columnFormat"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type { ChartConfig, QueryChart, VisualConfig } from "./chartTypes"
import { classifyColumn } from "./inferChartConfig"
import { tidyFormats } from "../CellFormats/formatSummary"
import type { VariableSlot } from "../interactions/InteractionsEditor"

// What the chart settings drawer edits: everything a draw cell shows, saved in
// one update. A draw cell is drawn as one of three kinds: a preset chart, a
// component (a visual), or a custom ECharts option. The preset settings stay
// in the config whichever kind is drawn, so switching back restores them.

export type DrawKind = "chart" | "component" | "custom"

export const DRAW_KINDS: { kind: DrawKind; label: string }[] = [
  { kind: "chart", label: "Chart" },
  { kind: "component", label: "Component" },
  { kind: "custom", label: "Custom" },
]

/** The saved settings of a draw cell. */
export type DrawSettings = {
  chartConfig: ChartConfig
  formats?: ColumnFormats
  interactions?: CellInteractions
}

/** The drawer's working copy: every kind's settings, until save. */
export type DrawDraft = {
  kind: DrawKind
  // The preset chart, without `visual` or `custom`: what the cell resolves
  // to, with inferred defaults filled in.
  chart: ChartConfig
  // Whether the user changed the preset chart. A component or custom cell
  // whose preset was not touched keeps its saved preset (often none), so
  // inferred defaults are not frozen into it.
  chartEdited: boolean
  savedChart: ChartConfig
  visual: VisualConfig | null
  // The custom option as the user types it, so it can be invalid JSON while
  // they edit.
  customJson: string
  formats?: ColumnFormats
  interactions?: CellInteractions
  // Variables the Interactions section creates, by the slot using them.
  created: Partial<Record<VariableSlot, NotebookVariable>>
}

/** The same saved settings: each field the same object as before. */
export const sameDrawSettings = (
  a: DrawSettings | undefined,
  b: DrawSettings | undefined,
): boolean =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    a.chartConfig === b.chartConfig &&
    a.formats === b.formats &&
    a.interactions === b.interactions)

export const kindOf = (config: ChartConfig | undefined): DrawKind =>
  config?.visual ? "component" : config?.custom ? "custom" : "chart"

const presetOnly = (config: ChartConfig): ChartConfig => {
  const chart = { ...config }
  delete chart.visual
  delete chart.custom
  return chart
}

/**
 * The draft for a cell. `effective` is the preset chart the cell resolves to
 * (with inferred defaults filled in); `saved` carries the visual and custom
 * option.
 */
export const draftOf = (
  saved: DrawSettings,
  effective: ChartConfig,
): DrawDraft => {
  const custom = saved.chartConfig.custom
  return {
    kind: kindOf(saved.chartConfig),
    chart: presetOnly(effective),
    chartEdited: false,
    savedChart: presetOnly(saved.chartConfig),
    visual: saved.chartConfig.visual ?? null,
    customJson: custom ? JSON.stringify(custom.option, null, 2) : "",
    formats: saved.formats,
    interactions: saved.interactions,
    created: {},
  }
}

export type CustomParse =
  | { ok: true; option: Record<string, unknown> }
  | { ok: false; error: string }

export const parseCustomJson = (text: string): CustomParse => {
  if (text.trim() === "")
    return { ok: false, error: "Write an ECharts option as a JSON object." }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "This is not valid JSON.",
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return { ok: false, error: "The option must be a JSON object: { … }." }
  return { ok: true, option: value as Record<string, unknown> }
}

export type SaveResult =
  | { ok: true; settings: DrawSettings }
  | { ok: false; error: string }

/** The settings a save stores: the chosen kind only. */
export const settingsOf = (draft: DrawDraft): SaveResult => {
  const chartConfig: ChartConfig = presetOnly(
    draft.kind === "chart" || draft.chartEdited
      ? draft.chart
      : draft.savedChart,
  )
  if (draft.kind === "component") {
    if (!draft.visual)
      return { ok: false, error: "Choose a component to draw." }
    chartConfig.visual = draft.visual
  } else if (draft.kind === "custom") {
    const parsed = parseCustomJson(draft.customJson)
    if (!parsed.ok) return parsed
    chartConfig.custom = { option: parsed.option }
  }
  const formats = tidyFormats(draft.formats)
  return {
    ok: true,
    settings: {
      chartConfig,
      ...(formats ? { formats } : {}),
      ...(draft.interactions ? { interactions: draft.interactions } : {}),
    },
  }
}

type ColumnsOf = { index: number; columns: ColumnDefinition[] }

const yColumnsOf = (query: QueryChart | null | undefined): string[] =>
  query?.yColumns ?? []

/**
 * A custom option that draws what the preset chart draws now, as a place to
 * start: the first statement's series over its x column.
 */
export const starterCustomOption = (
  chart: ChartConfig,
  statements: ColumnsOf[],
): Record<string, unknown> => {
  const first = statements[0]
  const query = first ? chart.queries[first.index] : undefined
  const x = chart.xColumn ?? first?.columns[0]?.name
  const xColumn = first?.columns.find((c) => c.name === x)
  const xRole = xColumn ? classifyColumn(xColumn) : "other"
  const numeric = (first?.columns ?? []).filter(
    (c) => classifyColumn(c) === "numeric" && c.name !== x,
  )
  const ys =
    yColumnsOf(query).length > 0
      ? yColumnsOf(query)
      : numeric.slice(0, 1).map((c) => c.name)
  const dataset = `q${first?.index ?? 0}`
  return {
    tooltip: { trigger: "axis" },
    xAxis: {
      type:
        xRole === "temporal"
          ? "time"
          : xRole === "numeric"
            ? "value"
            : "category",
    },
    yAxis: { type: "value" },
    series: ys.map((y) => ({
      type:
        query?.type === "bar" || query?.type === "stackedBar" ? "bar" : "line",
      name: y,
      datasetId: dataset,
      encode: { x, y },
      showSymbol: false,
    })),
  }
}
