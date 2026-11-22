import type { CustomSeriesRenderItem } from "echarts"
import { BUILTIN_CUSTOM_SERIES, echarts } from "../CellChart/echartsSetup"
import type { NotebookChartType } from "../../../../store/notebook"
import { compile } from "./chartTypeCompile"

// Notebook chart types: ECharts custom series whose `renderItem` an agent
// wrote as JavaScript. Each is compiled once and registered with ECharts under
// a name unique to its notebook and source, so options reference it by the
// short name the notebook gave it.
//
// EXPERIMENTAL: the function runs in the console page with the console's
// privileges. Production should run these charts in a sandboxed iframe.

type Compiled = {
  registeredName: string
  error: string | null
}

const compiled = new Map<string, Compiled>()
// Errors a chart type threw while drawing, by registered name. Cleared when
// a whole draw of a series runs without one.
const drawErrors = new Map<string, string>()
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

const setDrawError = (registeredName: string, error: string | null) => {
  if ((drawErrors.get(registeredName) ?? null) === error) return
  if (error === null) drawErrors.delete(registeredName)
  else drawErrors.set(registeredName, error)
  noteDrawErrorsChanged()
}

/** Calls `listener` after the draw errors of chart types change. */
export const subscribeDrawErrors = (listener: () => void): (() => void) => {
  drawErrorListeners.add(listener)
  return () => {
    drawErrorListeners.delete(listener)
  }
}

// ECharts shares `params.context` across one series draw: the first item of a
// draw clears the type's error, so a throw on any item of it stays reported.
const PASS = Symbol("chartTypePass")

const hash = (text: string): string => {
  let h = 5381
  for (let i = 0; i < text.length; i++)
    h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

const ensureRegistered = (
  bufferId: number,
  type: NotebookChartType,
): Compiled => {
  const registeredName = `nb${bufferId}_${type.name}_${hash(type.renderItem)}`
  const known = compiled.get(registeredName)
  if (known) return known
  let entry: Compiled
  try {
    const renderItem = compile(type.renderItem)
    const guarded: CustomSeriesRenderItem = (params, api) => {
      const pass = params.context as Record<symbol, boolean> | undefined
      let threw: string | null = null
      let out: ReturnType<CustomSeriesRenderItem>
      try {
        out = renderItem(params, api)
      } catch (e) {
        threw = e instanceof Error ? e.message : String(e)
        out = null as unknown as ReturnType<CustomSeriesRenderItem>
      }
      if (threw !== null) {
        setDrawError(registeredName, threw)
        if (pass) pass[PASS] = true
      } else if (!pass || !pass[PASS]) {
        // The first item of a draw, or no draw context: a clean call.
        if (pass) pass[PASS] = true
        setDrawError(registeredName, null)
      }
      return out
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

/** The custom series names an option in this notebook may use. */
export const resolveChartTypes = (
  bufferId: number,
  types: NotebookChartType[] | undefined,
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
    const entry = ensureRegistered(bufferId, type)
    if (entry.error) errors.set(type.name, entry.error)
    else renderItems.set(type.name, entry.registeredName)
  }
  return { renderItems, errors }
}

/** Errors thrown while drawing, by the notebook's name for the type. */
export const drawErrorsOf = (
  resolution: ChartTypeResolution,
  used: string[],
): Map<string, string> => {
  const out = new Map<string, string>()
  for (const name of used) {
    const registered = resolution.renderItems.get(name)
    const error = registered ? drawErrors.get(registered) : undefined
    if (error) out.set(name, error)
  }
  return out
}

export { compileError } from "./chartTypeCompile"
