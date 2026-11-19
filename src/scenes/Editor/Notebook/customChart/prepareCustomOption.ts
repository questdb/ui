import type { ColorShape } from "../../../../types/styled"
import type { NotebookChartType } from "../../../../store/notebook"
import type { StatementRows } from "../visuals/statementRows"
import type { RenderProblem } from "../renderReports"
import { sanitizeOption, type SanitizedOption } from "./sanitizeOption"
import { buildCustomOption, type BuiltCustomOption } from "./buildCustomOption"
import {
  resolveChartTypes,
  type ChartTypeResolution,
} from "./chartTypeRegistry"
import { MAP_NAMES } from "./maps"

const MAPS = new Set<string>(MAP_NAMES)

export type PreparedCustomOption = {
  resolution: ChartTypeResolution
  sanitized: SanitizedOption
  built: BuiltCustomOption
}

/**
 * An option as it is drawn: made safe and on-style, with the cell's
 * statements filled in. The chart draws `built.option`; the settings drawer
 * shows `problemsOf` for an option the user is still writing.
 */
export const prepareCustomOption = (
  raw: Record<string, unknown>,
  context: {
    bufferId: number
    colors: ColorShape
    chartTypes: NotebookChartType[] | undefined
    statements: (StatementRows | null)[]
    live: boolean
  },
): PreparedCustomOption => {
  const resolution = resolveChartTypes(context.bufferId, context.chartTypes)
  const sanitized = sanitizeOption(raw, {
    colors: context.colors,
    renderItems: resolution.renderItems,
    maps: MAPS,
  })
  const built = buildCustomOption(
    sanitized.option,
    context.statements,
    context.live,
  )
  return { resolution, sanitized, built }
}

/** What the sanitizer changed, data that did not bind, and broken chart types. */
export const problemsOf = ({
  resolution,
  sanitized,
  built,
}: PreparedCustomOption): RenderProblem[] => [
  ...sanitized.problems,
  ...built.problems,
  ...[...resolution.errors.values()].map((message) => ({
    message,
    severity: "error" as const,
  })),
]
