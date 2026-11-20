import type { CustomSeriesRenderItem } from "echarts"

// Turns a chart type's JavaScript into a function, without ECharts, so
// checking a source (the dialog, the agent tools) does not load the charts.
//
// EXPERIMENTAL: the function runs in the console page with the console's
// privileges. Production should run these charts in a sandboxed iframe.

const LEADING_COMMENTS = /^(?:\s*(?:\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/))*\s*/

export const compile = (source: string): CustomSeriesRenderItem => {
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

/** Checks that a chart type's source compiles, without registering it. */
export const compileError = (source: string): string | null => {
  try {
    compile(source)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
