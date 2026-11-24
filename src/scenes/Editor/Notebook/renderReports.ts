// What each chart cell last drew, and what went wrong, so an agent can check
// its work: get_cell returns the cell's report as `render_report`. Memory only;
// a cell that has not drawn since the page loaded has no report.

export type RenderProblem = {
  path?: string
  message: string
  severity: "error" | "warning"
}

import type { VisualConfig } from "./CellChart/chartTypes"
import type { DrawStatus } from "./drawOutcome"

export type RenderReport = {
  /** Internal provenance; not exposed on the wire. */
  visualConfig?: VisualConfig
  kind: "chart" | "custom" | "visual"
  // What the pane shows: drawn, or why not (see drawOutcome.ts).
  status: DrawStatus
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
 * Stands in for `drawn` when the agent may not see query results (no 'read'
 * permission): `drawn` describes the results a chart drew. The problems stay;
 * they are about the cell's columns and settings.
 */
export const DRAWN_NEEDS_READ =
  "Read access not granted: `drawn` describes the query results the chart " +
  "drew, so it is withheld. `problems` still lists what went wrong while " +
  "drawing. To check what the chart shows, ask the user to grant the 'read' " +
  "permission in the QuestDB console (footer → MCP popover or AI Assistant " +
  "settings)."

export type RenderReportWire = {
  kind: RenderReport["kind"]
  status: DrawStatus
  drawn?: RenderReport["drawn"]
  drawn_withheld?: string
  problems: RenderProblem[]
  seconds_ago: number
}

/**
 * A report in the agent wire's snake case. A reader not allowed query results
 * gets everything but `drawn`.
 */
export const renderReportWire = (
  report: RenderReport,
  canReadResults: boolean,
): RenderReportWire => ({
  kind: report.kind,
  status: report.status,
  ...(canReadResults
    ? { drawn: report.drawn }
    : { drawn_withheld: DRAWN_NEEDS_READ }),
  problems: report.problems,
  seconds_ago: Math.round((Date.now() - report.at) / 1000),
})
