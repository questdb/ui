import type { CustomSeriesRenderItem } from "echarts"

// Turns a chart type's JavaScript into a function, without ECharts, so
// checking a source (the dialog, the agent tools) does not load the charts.
//
// EXPERIMENTAL: the function runs in the console page with the console's
// privileges. Production should run these charts in a sandboxed iframe.

const LEADING_COMMENTS = /^(?:\s*(?:\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/))*\s*/

// A function expression (function (params, api) {…} or (params, api) => …),
// else a function body that receives `params` and `api`.
const isExpression = (source: string) =>
  /^(async\s+)?function\b|^\(?[\w\s,]*\)?\s*=>/.test(
    source.trim().replace(LEADING_COMMENTS, ""),
  )

// The wrapper that returns the function expression. On lines of their own,
// so a comment after the function stays closed.
const expressionWrapper = (source: string) =>
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(`"use strict"; return (\n${source.trim()}\n)`)

/**
 * The chart type's drawing function. Running the wrapper evaluates the
 * source, so only allowed chart types get here (see chartTypeRegistry).
 */
export const compile = (source: string): CustomSeriesRenderItem => {
  if (isExpression(source)) {
    const fn = expressionWrapper(source)() as unknown
    if (typeof fn !== "function") throw new Error("not a function")
    return fn as CustomSeriesRenderItem
  }
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(
    "params",
    "api",
    `"use strict";\n${source.trim()}`,
  ) as CustomSeriesRenderItem
}

/**
 * Checks that a chart type's source parses, without running any of it:
 * building a Function only parses its body.
 */
export const compileError = (source: string): string | null => {
  try {
    if (isExpression(source)) expressionWrapper(source)
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    else new Function("params", "api", `"use strict";\n${source.trim()}`)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
