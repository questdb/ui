import type { EChartsOption } from "echarts"
import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import type { CellInteractions } from "../../../../store/notebook"
import type { ColumnFormats } from "../../../../utils/formats/columnFormat"
import type { ChartConfig } from "../CellChart/chartTypes"
import {
  buildEchartsOption,
  sharesProblem,
  type ChartContext,
} from "../CellChart/buildEchartsOption"
import { withBrush } from "../interactions/chartInteractions"
import {
  NO_ROWS,
  drawnOutcome,
  leading,
  notDrawn,
  queryFailed,
  withLeftOutStatements,
  type DrawOutcome,
} from "../drawOutcome"
import { drawProblems, type DrawResolution } from "./drawCanvasUtils"

export const NOTHING_TO_DRAW =
  "Nothing to draw: the chart settings select no column of the result."

// Series a preset chart adds around the data: they draw no rows of their own.
const DECORATIONS = new Set(["Events", "Thresholds"])

export type PresetDrawInput = {
  // The statements that returned rows, and each statement's error (null for
  // one that succeeded).
  results: QueryExecResult[]
  statementErrors: (string | null)[] | undefined
  resolution: DrawResolution
  config: ChartConfig | undefined
  formats: ColumnFormats
  context: Omit<ChartContext, "formats">
  interactions: CellInteractions | undefined
}

/** A preset chart's option, and what drawing it shows: the pane and report. */
export const presetDraw = (
  input: PresetDrawInput,
): { option: EChartsOption; outcome: DrawOutcome } => {
  const drawn = draw(input)
  return {
    ...drawn,
    outcome: withLeftOutStatements(drawn.outcome, input.statementErrors),
  }
}

const draw = ({
  results,
  statementErrors,
  resolution,
  config,
  formats,
  context,
  interactions,
}: PresetDrawInput): { option: EChartsOption; outcome: DrawOutcome } => {
  const error = statementErrors?.find((e): e is string => e !== null)
  const option = withBrush(
    buildEchartsOption(resolution.chart, resolution.renderQueries, {
      ...context,
      formats,
    }),
    interactions,
  )
  if (results.length === 0)
    return {
      option,
      outcome: error
        ? notDrawn("failed", queryFailed(error))
        : notDrawn("empty", NO_ROWS),
    }
  const problems = drawProblems(resolution, config, formats)
  // A share of a row-capped result, or a stack too large: refused in one
  // place (sharesProblem), for the pane and the report.
  const stack = sharesProblem(resolution.renderQueries)
  if (stack) {
    const lead = problems.find((p) => p.message === stack) ?? {
      message: stack,
      severity: "error" as const,
    }
    return {
      option,
      outcome: notDrawn("refused", stack, {
        first: lead,
        rest: problems.filter((p) => p !== lead),
      }),
    }
  }
  const series = (Array.isArray(option.series) ? option.series : []) as {
    name?: string
    data?: unknown[]
  }[]
  const dataSeries = series.filter((s) => !DECORATIONS.has(s.name ?? ""))
  // Rows, but no mark drawn from them: a column the settings name is not in
  // the result, or no statement draws a series. A failed statement is the
  // likelier reason when there is one.
  if (dataSeries.every((s) => (s.data?.length ?? 0) === 0)) {
    if (error)
      return {
        option,
        outcome: notDrawn("failed", queryFailed(error), { rest: problems }),
      }
    const lead = problems.find((p) => p.severity === "error") ??
      problems[0] ?? { message: NOTHING_TO_DRAW, severity: "error" as const }
    return {
      option,
      outcome: notDrawn("refused", lead.message, {
        first: lead,
        rest: leading(lead, problems).slice(1),
      }),
    }
  }
  return {
    option,
    outcome: drawnOutcome(
      {
        series: dataSeries.length,
        points: series.reduce((n, s) => n + (s.data?.length ?? 0), 0),
        events: (resolution.chart.events ?? []).reduce(
          (n, e) => n + e.dataset.length,
          0,
        ),
      },
      problems,
    ),
  }
}
