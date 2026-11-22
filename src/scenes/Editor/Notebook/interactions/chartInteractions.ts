import type { EChartsOption, EChartsType } from "echarts"
import type { CellInteractions } from "../../../../store/notebook"
import type { ChartEventHandler } from "../CellChart/ChartRenderer"

// Clicking and dragging on a chart sets notebook variables: a click sets the
// clicked item's value, a drag across a time chart sets a time window. Values
// become SQL literals, since a variable holds an expression.

/** A value as a SQL literal: numbers as they are, text quoted. */
export const sqlLiteral = (value: unknown): string => {
  if (value === null || value === undefined) return "null"
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "null"
  if (typeof value === "boolean") return value ? "true" : "false"
  const text = typeof value === "string" ? value : JSON.stringify(value)
  return `'${text.replace(/'/g, "''")}'`
}

/** A time as a quoted ISO timestamp QuestDB compares with timestamps. */
export const timeLiteral = (ms: number): string =>
  `'${new Date(ms).toISOString()}'`

type ClickParams = {
  name?: unknown
  value?: unknown
  data?: unknown
  dimensionNames?: string[]
  componentType?: string
}

/** The value a click sets: `column` of the clicked row, else its name. */
export const clickedValue = (
  params: ClickParams,
  column: string | undefined,
  requireSourceColumn = false,
): unknown => {
  if (column !== undefined) {
    const data = params.data
    // Items built from rows carry them by column name (heatmap, boxplot).
    const columns = (data as { columns?: unknown } | null)?.columns
    if (
      typeof columns === "object" &&
      columns !== null &&
      Object.hasOwn(columns, column)
    )
      return (columns as Record<string, unknown>)[column]
    // An aggregate node's name and value describe the drawing, not a row.
    if (requireSourceColumn) return undefined
    if (
      typeof data === "object" &&
      data !== null &&
      !Array.isArray(data) &&
      Object.hasOwn(data, column)
    )
      return (data as Record<string, unknown>)[column]
    const dims = params.dimensionNames
    if (Array.isArray(params.value) && Array.isArray(dims)) {
      const i = dims.indexOf(column)
      if (i >= 0) return (params.value as unknown[])[i]
    }
    return undefined
  }
  if (params.name !== undefined && params.name !== "") return params.name
  return Array.isArray(params.value) ? params.value[0] : params.value
}

export type SetVariables = (values: Record<string, string>) => void

/** ECharts event handlers for a cell's interactions. */
export const interactionEvents = (
  interactions: CellInteractions | undefined,
  setVariables: SetVariables,
  requireSourceColumn = false,
): Record<string, ChartEventHandler> => {
  const events: Record<string, ChartEventHandler> = {}
  const click = interactions?.click
  if (click) {
    events.click = (params) => {
      const p = params as ClickParams
      // Mark lines and areas (events) are not data.
      if (p.componentType === "markLine" || p.componentType === "markArea")
        return
      const value = clickedValue(p, click.column, requireSourceColumn)
      if (click.column !== undefined && value === undefined) return
      setVariables({ [click.variable]: sqlLiteral(value) })
    }
  }
  const brush = interactions?.brush
  if (brush) {
    events.brushEnd = (params, instance) => {
      const areas = (params as { areas?: { coordRange?: unknown }[] }).areas
      const range = areas?.[0]?.coordRange
      if (!Array.isArray(range) || range.length < 2) return
      const [from, to] = range as [unknown, unknown]
      if (typeof from !== "number" || typeof to !== "number") return
      setVariables({
        [brush.from]: timeLiteral(Math.min(from, to)),
        [brush.to]: timeLiteral(Math.max(from, to)),
      })
      instance.dispatchAction({ type: "brush", areas: [] })
    }
  }
  return events
}

/** Adds the brush a drag needs to a time chart's option. */
export const withBrush = (
  option: EChartsOption,
  interactions: CellInteractions | undefined,
): EChartsOption => {
  if (!interactions?.brush) return option
  const x = Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis
  if ((x as { type?: string } | undefined)?.type !== "time") return option
  const zooms = Array.isArray(option.dataZoom)
    ? option.dataZoom
    : option.dataZoom
      ? [option.dataZoom]
      : []
  return {
    ...option,
    // The brush's own toolbar buttons are not needed: dragging selects.
    toolbox: { show: false },
    brush: {
      toolbox: [],
      xAxisIndex: 0,
      brushType: "lineX",
      brushMode: "single",
      transformable: false,
      throttleType: "debounce",
      throttleDelay: 100,
      outOfBrush: { colorAlpha: 0.35 },
    },
    // Dragging selects instead of panning; the wheel still zooms.
    dataZoom: zooms.map((z) =>
      (z as { type?: string }).type === "inside"
        ? { ...z, moveOnMouseMove: false }
        : z,
    ),
  }
}

/** Turns the drag cursor into the brush once the chart has mounted. */
export const armBrush = (
  instance: EChartsType,
  interactions: CellInteractions | undefined,
): void => {
  if (!interactions?.brush) return
  instance.dispatchAction({
    type: "takeGlobalCursor",
    key: "brush",
    brushOption: { brushType: "lineX", brushMode: "single" },
  })
}
