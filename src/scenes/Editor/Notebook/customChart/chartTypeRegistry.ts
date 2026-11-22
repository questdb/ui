import type { CustomSeriesRenderItem } from "echarts"
import { BUILTIN_CUSTOM_SERIES, echarts } from "../CellChart/echartsSetup"
import type { NotebookChartType } from "../../../../store/notebook"
import { compile } from "./chartTypeCompile"

// Notebook chart types: ECharts custom series whose `renderItem` an agent
// wrote as JavaScript. Each is compiled once and registered with ECharts under
// a name unique to its notebook, source and (for a drawing cell) cell, so
// options reference it by the short name the notebook gave it, and each cell
// reads its own draw errors.
//
// EXPERIMENTAL: the function runs in the console page with the console's
// privileges. Production should run these charts in a sandboxed iframe.

type Compiled = {
  registeredName: string
  error: string | null
}

const compiled = new Map<string, Compiled>()
// Errors a chart type threw while drawing, by registered name and series. A
// series' error is cleared when it starts drawing again.
const drawErrors = new Map<string, Map<number, string>>()
const drawErrorListeners = new Set<() => void>()
let notifyQueued = false

// Draws happen after the chart's render report was written; tell the charts
// that read these errors, once per task.
const noteDrawErrorsChanged = () => {
  if (notifyQueued) return
  notifyQueued = true
  queueMicrotask(() => {
    notifyQueued = false
    drawErrorListeners.forEach((listener) => listener())
  })
}

const setDrawError = (
  registeredName: string,
  series: number,
  error: string | null,
) => {
  const errors = drawErrors.get(registeredName) ?? new Map<number, string>()
  if ((errors.get(series) ?? null) === error) return
  if (error === null) errors.delete(series)
  else errors.set(series, error)
  if (errors.size > 0) drawErrors.set(registeredName, errors)
  else drawErrors.delete(registeredName)
  noteDrawErrorsChanged()
}

/** Calls `listener` after the draw errors of chart types change. */
export const subscribeDrawErrors = (listener: () => void): (() => void) => {
  drawErrorListeners.add(listener)
  return () => {
    drawErrorListeners.delete(listener)
  }
}

const hash = (text: string): string => {
  let h = 5381
  for (let i = 0; i < text.length; i++)
    h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

const ensureRegistered = (
  bufferId: number,
  type: NotebookChartType,
  scope: string | undefined,
): Compiled => {
  const registeredName = `nb${bufferId}${scope === undefined ? "" : `_${scope}`}_${type.name}_${hash(type.renderItem)}`
  const known = compiled.get(registeredName)
  if (known) return known
  let entry: Compiled
  try {
    const renderItem = compile(type.renderItem)
    // A series draw starts at its first item (later progressive chunks
    // continue it): that clears the series' error, and a throw on any item
    // of the draw sets it.
    const guarded: CustomSeriesRenderItem = (params, api) => {
      const series = params.seriesIndex
      if (params.dataIndexInside === 0)
        setDrawError(registeredName, series, null)
      try {
        return renderItem(params, api)
      } catch (e) {
        setDrawError(
          registeredName,
          series,
          e instanceof Error ? e.message : String(e),
        )
        return null as unknown as ReturnType<CustomSeriesRenderItem>
      }
    }
    echarts.registerCustomSeries(registeredName, guarded)
    entry = { registeredName, error: null }
  } catch (e) {
    entry = {
      registeredName,
      error: `Chart type "${type.name}" does not compile: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
  compiled.set(registeredName, entry)
  return entry
}

export type ChartTypeResolution = {
  // Name an option may use → the name ECharts knows.
  renderItems: Map<string, string>
  // Compile errors, by the notebook's name for the type.
  errors: Map<string, string>
}

/**
 * The custom series names an option in this notebook may use; `scope` (a
 * cell) gives a drawing cell names of its own, so its draw errors are its own.
 */
export const resolveChartTypes = (
  bufferId: number,
  types: NotebookChartType[] | undefined,
  scope?: string,
): ChartTypeResolution => {
  const renderItems = new Map<string, string>(
    BUILTIN_CUSTOM_SERIES.map((name) => [name, name]),
  )
  const errors = new Map<string, string>()
  for (const type of types ?? []) {
    // Code nobody allowed does not run.
    if (type.allowed !== true) {
      errors.set(
        type.name,
        `Chart type "${type.name}" is not allowed to run yet: review and allow its code in the notebook's Chart types dialog.`,
      )
      continue
    }
    const entry = ensureRegistered(bufferId, type, scope)
    if (entry.error) errors.set(type.name, entry.error)
    else renderItems.set(type.name, entry.registeredName)
  }
  return { renderItems, errors }
}

/**
 * Errors thrown while drawing, by the notebook's name for the type. With
 * `drawing`, only series that still draw items with the type count: a series
 * removed, switched to another type or left without rows does not draw again
 * to clear its error.
 */
export const drawErrorsOf = (
  resolution: ChartTypeResolution,
  used: string[],
  drawing?: (registered: string, series: number) => boolean,
): Map<string, string> => {
  const out = new Map<string, string>()
  for (const name of used) {
    const registered = resolution.renderItems.get(name)
    if (!registered) continue
    for (const [series, error] of drawErrors.get(registered) ?? []) {
      if (drawing && !drawing(registered, series)) continue
      out.set(name, error)
      break
    }
  }
  return out
}

export { compileError } from "./chartTypeCompile"
