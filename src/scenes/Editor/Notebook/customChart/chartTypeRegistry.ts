import type { CustomSeriesRenderItem } from "echarts"
import { BUILTIN_CUSTOM_SERIES, echarts } from "../CellChart/echartsSetup"
import type { NotebookChartType } from "../../../../store/notebook"

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
// the type draws without one.
const drawErrors = new Map<string, string>()

const hash = (text: string): string => {
  let h = 5381
  for (let i = 0; i < text.length; i++)
    h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

const LEADING_COMMENTS = /^(?:\s*(?:\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/))*\s*/

const compile = (source: string): CustomSeriesRenderItem => {
  const trimmed = source.trim()
  // Comments above the function do not change what it is.
  const head = trimmed.replace(LEADING_COMMENTS, "")
  // A function expression (function (params, api) {…} or (params, api) => …),
  // else a function body that receives `params` and `api`.
  if (/^(async\s+)?function\b|^\(?[\w\s,]*\)?\s*=>/.test(head)) {
    // On lines of their own, so a comment after the function stays closed.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(
      `"use strict"; return (\n${trimmed}\n)`,
    )() as unknown
    if (typeof fn !== "function") throw new Error("not a function")
    return fn as CustomSeriesRenderItem
  }
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(
    "params",
    "api",
    `"use strict";\n${trimmed}`,
  ) as CustomSeriesRenderItem
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
      try {
        const out = renderItem(params, api)
        if (drawErrors.has(registeredName)) drawErrors.delete(registeredName)
        return out
      } catch (e) {
        drawErrors.set(
          registeredName,
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

/** Checks that a chart type's source compiles, without registering it. */
export const compileError = (source: string): string | null => {
  try {
    compile(source)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
