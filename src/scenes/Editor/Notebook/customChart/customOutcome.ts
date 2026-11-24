import type { RenderProblem } from "../renderReports"
import type { StatementRows } from "../visuals/statementRows"
import {
  LOADING_MAP,
  MAP_LOAD_FAILED,
  NO_ROWS,
  drawnOutcome,
  notDrawn,
  queryFailed,
  type DrawOutcome,
} from "../drawOutcome"
import { customSeriesCount, partialDatasetWarnings } from "./buildCustomOption"
import { problemsOf, type PreparedCustomOption } from "./prepareCustomOption"
import type { OptionProblem } from "./sanitizeOption"

export type CustomDraw = {
  outcome: DrawOutcome
  // Statements drawn from a row-capped result: a notice above a drawn chart.
  partial: OptionProblem[]
}

/**
 * What an agent-written option shows over the cell's statements: the outcome
 * the pane renders and the report carries. The option drawn is
 * `prepared.built.option`.
 */
export const customDraw = ({
  prepared,
  statements,
  statementErrors,
  mapStatus,
}: {
  prepared: PreparedCustomOption
  statements: (StatementRows | null)[]
  statementErrors?: (string | null)[]
  // The maps the option draws on.
  mapStatus: "ready" | "loading" | "error"
}): CustomDraw => {
  const { sanitized, built } = prepared
  const problems: RenderProblem[] = problemsOf(prepared)
  const partial = partialDatasetWarnings(statements)
  // No statement settled with rows or none: the first failure says why.
  const error = statements.every((s) => s === null)
    ? statementErrors?.find((e): e is string => e != null)
    : undefined
  if (error)
    return {
      outcome: notDrawn("failed", queryFailed(error), { rest: problems }),
      partial,
    }
  const fatal = [...sanitized.problems, ...built.problems].find(
    (problem) => problem.severity === "error" && problem.path === "",
  )
  if (fatal)
    return {
      outcome: notDrawn("refused", fatal.message, {
        first: fatal,
        rest: problems.filter((p) => p !== fatal),
      }),
      partial,
    }
  if (mapStatus === "error") {
    const mapProblem: RenderProblem = {
      path: "",
      message: MAP_LOAD_FAILED,
      severity: "error",
    }
    return {
      outcome: notDrawn("failed", MAP_LOAD_FAILED, {
        first: mapProblem,
        rest: problems,
      }),
      partial,
    }
  }
  if (mapStatus === "loading")
    return { outcome: notDrawn("waiting", LOADING_MAP), partial }
  if (statements.every((s) => !s || s.rows.length === 0))
    return { outcome: notDrawn("empty", NO_ROWS, { rest: problems }), partial }
  return {
    outcome: drawnOutcome(
      {
        series: customSeriesCount(built.option),
        datasets: statements.length,
        rows: statements.reduce((n, s) => n + (s?.rows.length ?? 0), 0),
      },
      problems,
    ),
    partial,
  }
}
