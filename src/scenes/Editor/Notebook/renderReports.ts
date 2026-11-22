// What each chart cell last drew, and what went wrong, so an agent can check
// its work: get_cell returns the cell's report as `render_report`. Memory only;
// a cell that has not drawn since the page loaded has no report.

export type RenderProblem = {
  path?: string
  message: string
  severity: "error" | "warning"
}

import type { VisualConfig } from "./CellChart/chartTypes"

export type RenderReport = {
  /** Internal provenance; not exposed on the wire. */
  visualConfig?: VisualConfig
  kind: "chart" | "custom" | "visual"
  // What was drawn, e.g. { series: 2, points: 240 } or { asks: 12, bids: 12 }.
  drawn: Record<string, number | string | boolean>
  problems: RenderProblem[]
  at: number
}

const reports = new Map<string, RenderReport>()

const keyOf = (bufferId: number, cellId: string) => `${bufferId}:${cellId}`

export const setRenderReport = (
  bufferId: number,
  cellId: string,
  report: Omit<RenderReport, "at">,
): void => {
  reports.set(keyOf(bufferId, cellId), { ...report, at: Date.now() })
}

export const getRenderReport = (
  bufferId: number,
  cellId: string,
): RenderReport | undefined => reports.get(keyOf(bufferId, cellId))

export const clearRenderReport = (bufferId: number, cellId: string): void => {
  reports.delete(keyOf(bufferId, cellId))
}

// Keys of `drawn` that say what was drawn (counts and kinds). The others,
// such as a gauge's value or a volume profile's point of control, are result
// values.
const SHAPE_KEYS = new Set([
  "type",
  "series",
  "points",
  "events",
  "datasets",
  "rows",
  "tiles",
  "bars",
  "targets",
  "lanes",
  "states",
  "segments",
  "buckets",
  "operators",
  "groups",
  "nodes",
  "links",
  "regions",
  "cells",
  "levels",
  "asks",
  "bands",
  "bids",
])

/**
 * A report in the agent wire's snake case. Without `withResultValues` (as in
 * get_cell, which never carries query result data) `drawn` keeps only what
 * was drawn, not the values drawn.
 */
export const renderReportWire = (
  report: RenderReport,
  withResultValues = false,
) => ({
  kind: report.kind,
  drawn: withResultValues
    ? report.drawn
    : Object.fromEntries(
        Object.entries(report.drawn).filter(([key]) => SHAPE_KEYS.has(key)),
      ),
  problems: report.problems,
  seconds_ago: Math.round((Date.now() - report.at) / 1000),
})
