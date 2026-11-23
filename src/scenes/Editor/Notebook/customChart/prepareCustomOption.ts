import type { ColorShape } from "../../../../types/styled"
import type { StatementRows } from "../visuals/statementRows"
import type { RenderProblem } from "../renderReports"
import { BUILTIN_RENDER_ITEMS } from "../CellChart/customSeriesNames"
import { sanitizeOption, type SanitizedOption } from "./sanitizeOption"
import { buildCustomOption, type BuiltCustomOption } from "./buildCustomOption"
import { MAP_NAMES } from "./maps"

const MAPS = new Set<string>(MAP_NAMES)

export type PreparedCustomOption = {
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
    colors: ColorShape
    statements: (StatementRows | null)[]
    live: boolean
  },
): PreparedCustomOption => {
  const sanitized = sanitizeOption(raw, {
    colors: context.colors,
    renderItems: BUILTIN_RENDER_ITEMS,
    maps: MAPS,
  })
  const built = buildCustomOption(
    sanitized.option,
    context.statements,
    context.live,
  )
  return { sanitized, built }
}

/** What the sanitizer changed, and data that did not bind. */
export const problemsOf = ({
  sanitized,
  built,
}: PreparedCustomOption): RenderProblem[] => [
  ...sanitized.problems,
  ...built.problems,
]
