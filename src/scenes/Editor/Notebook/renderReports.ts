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

/** The key of a cell across notebooks, for per-cell registries. */
export const cellKey = (bufferId: number, cellId: string) =>
  `${bufferId}:${cellId}`

export const setRenderReport = (
  bufferId: number,
  cellId: string,
  report: Omit<RenderReport, "at">,
): void => {
  reports.set(cellKey(bufferId, cellId), { ...report, at: Date.now() })
}

export const getRenderReport = (
  bufferId: number,
  cellId: string,
): RenderReport | undefined => reports.get(cellKey(bufferId, cellId))

export const clearRenderReport = (bufferId: number, cellId: string): void => {
  reports.delete(cellKey(bufferId, cellId))
}

/**
 * Stands in for the report when the agent may not see query results (no
 * 'read' permission): the report describes the results a chart drew.
 */
export const RENDER_REPORT_NEEDS_READ =
  "Read access not granted: render_report describes the query results a " +
  "chart drew, so it is withheld. Without it you cannot check what this " +
  "cell draws or the data problems found while drawing it. Ask the user to " +
  "grant the 'read' permission in the QuestDB console (footer → MCP popover " +
  "or AI Assistant settings)."

/** A report in the agent wire's snake case, for a reader allowed results. */
export const renderReportWire = (report: RenderReport) => ({
  kind: report.kind,
  drawn: report.drawn,
  problems: report.problems,
  seconds_ago: Math.round((Date.now() - report.at) / 1000),
})
