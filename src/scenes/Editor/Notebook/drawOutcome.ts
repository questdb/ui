import { useLayoutEffect } from "react"
import type { VisualConfig } from "./CellChart/chartTypes"
import type { CellClassifyBlock } from "./cellRefresh/cellRefreshEngine"
import {
  setRenderReport,
  type RenderProblem,
  type RenderReport,
} from "./renderReports"

// What happened when a draw cell was drawn, decided once: the pane renders
// from it and the agent's render report is written from it, so the two
// cannot disagree. Each kind of drawing (preset chart, visual, custom option)
// derives its outcome in one pure function, after the canvas has ruled out
// the states every kind shares (fetchOutcome).

export type DrawStatus =
  // No settled result for the SQL the cell holds now (debounce, loading, map
  // loading).
  | "waiting"
  // The draw refuses the SQL itself (write query, classification failed).
  | "blocked"
  // The user stopped the fetch.
  | "cancelled"
  // A statement the drawing needs failed, or a needed resource (world map).
  | "failed"
  // Settled, succeeded, and the rows the drawing needs are empty.
  | "empty"
  // Rows present, but the drawing cannot or will not draw them (missing
  // columns, a row-capped result it refuses, a builder's "cannot draw").
  | "refused"
  // Something is on screen; it may still carry warnings.
  | "drawn"

export type DrawOutcome = {
  status: DrawStatus
  // The sentence the pane shows when status !== "drawn" (and the first
  // problem otherwise). It is the report's first problem.
  message?: string
  problems: RenderProblem[]
  drawn: Record<string, number | string | boolean>
}

export const NO_ROWS = "The query returned no rows."
export const MAP_LOAD_FAILED =
  "Could not load the world map. Reload the console to try again."
export const LOADING_MAP = "Loading map…"
export const LOADING_CHART_DATA = "Loading chart data"
export const DRAWING = "Drawing…"
export const DRAW_CANCELLED = "Chart loading was cancelled."
export const TYPE_A_QUERY = "Type a query to draw."

export const queryFailed = (error: string) => `Query failed: ${error}`

const SEVERITY: Record<
  Exclude<DrawStatus, "drawn" | "waiting">,
  RenderProblem["severity"]
> = {
  blocked: "error",
  cancelled: "warning",
  failed: "error",
  empty: "warning",
  refused: "error",
}

/**
 * Nothing drawn, and why: the pane's sentence leads the problems. `first`
 * replaces that problem when it carries more (a path); `rest` follows it.
 * Waiting has no problems: a draw is pending, nothing went wrong.
 */
export const notDrawn = (
  status: Exclude<DrawStatus, "drawn">,
  message: string,
  {
    drawn = {},
    first,
    rest = [],
  }: {
    drawn?: DrawOutcome["drawn"]
    first?: RenderProblem
    rest?: RenderProblem[]
  } = {},
): DrawOutcome => ({
  status,
  message,
  problems:
    status === "waiting"
      ? []
      : [first ?? { message, severity: SEVERITY[status] }, ...rest],
  drawn,
})

export const drawnOutcome = (
  drawn: DrawOutcome["drawn"],
  problems: RenderProblem[],
): DrawOutcome => ({
  status: "drawn",
  message: problems[0]?.message,
  problems,
  drawn,
})

/** `problems` with `lead` first, as the pane's sentence. */
export const leading = (
  lead: RenderProblem,
  problems: RenderProblem[],
): RenderProblem[] => [lead, ...problems.filter((p) => p !== lead)]

export type DrawFetch = {
  statementCount: number
  classifyBlock: CellClassifyBlock | null
  loading: boolean
  // The user stopped the fetch and nothing is drawn.
  cancelled: boolean
  // A settled result for the cell's statements, possibly for older SQL.
  hasFrame: boolean
  // The settled result is for the SQL the cell holds now.
  settledForCurrentSql: boolean
}

/**
 * The states every kind of drawing shares, decided by the canvas before a
 * chart or component is drawn: null when there are settled rows to draw.
 */
export const fetchOutcome = (
  fetch: DrawFetch,
  drawn: DrawOutcome["drawn"] = {},
): DrawOutcome | null => {
  const block = fetch.classifyBlock
  if (block?.kind === "write")
    return notDrawn(
      "blocked",
      `Cannot draw a write query ('${block.queryType}'). Switch to Run mode to execute this SQL.`,
      { drawn },
    )
  if (block?.kind === "failed")
    return notDrawn(
      "blocked",
      `Cannot classify cell SQL (${block.message}). Refusing to draw until the query can be classified safely.`,
      { drawn },
    )
  if (fetch.statementCount === 0)
    return notDrawn("empty", TYPE_A_QUERY, { drawn })
  if (fetch.loading) return notDrawn("waiting", LOADING_CHART_DATA, { drawn })
  if (fetch.cancelled) return notDrawn("cancelled", DRAW_CANCELLED, { drawn })
  // The engine takes up edited SQL after a short debounce; until then its
  // settled answer is for the old SQL, not for what the cell holds.
  if (!fetch.hasFrame && !fetch.settledForCurrentSql)
    return notDrawn("waiting", DRAWING, { drawn })
  return null
}

/**
 * Writes the agent's render report from the outcome the pane renders, each
 * time it changes, in the same commit as the pane (a layout effect), so no
 * reader sees the pane ahead of the report. A null outcome writes nothing:
 * another part of the canvas reports.
 */
export const useReportOutcome = (
  bufferId: number,
  cellId: string,
  kind: RenderReport["kind"],
  outcome: DrawOutcome | null,
  visualConfig?: VisualConfig,
): void => {
  useLayoutEffect(() => {
    if (!outcome) return
    setRenderReport(bufferId, cellId, {
      kind,
      ...(visualConfig ? { visualConfig } : {}),
      status: outcome.status,
      drawn: outcome.drawn,
      problems: outcome.problems,
    })
  }, [bufferId, cellId, kind, outcome, visualConfig])
}
