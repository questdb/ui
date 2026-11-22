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

/** A report in the agent wire's snake case. */
export const renderReportWire = (report: RenderReport) => ({
  kind: report.kind,
  drawn: report.drawn,
  problems: report.problems,
  seconds_ago: Math.round((Date.now() - report.at) / 1000),
})
