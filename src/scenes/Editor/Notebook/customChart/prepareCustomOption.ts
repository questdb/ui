import type { ColorShape } from "../../../../types/styled"
import type { StatementRows } from "../visuals/statementRows"
import type { RenderProblem } from "../renderReports"
import { BUILTIN_RENDER_ITEMS } from "../CellChart/customSeriesNames"
import {
  sanitizeOption,
  type OptionProblem,
  type SanitizedOption,
} from "./sanitizeOption"
import { buildCustomOption, type BuiltCustomOption } from "./buildCustomOption"
import { MAP_NAMES } from "./maps"
import { enforceSinks } from "./sinks"

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
    // Clicks set a variable: bound items say which rows they are drawn from.
    pickable?: boolean
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
    context.pickable,
  )
  return { sanitized, built }
}

/**
 * What would be changed in an option before any rows are bound: the checks
 * an agent tool answers with when it saves one.
 */
export const checkCustomOption = (
  raw: Record<string, unknown>,
  colors: ColorShape,
): OptionProblem[] => {
  const sanitized = sanitizeOption(raw, {
    colors,
    renderItems: BUILTIN_RENDER_ITEMS,
    maps: MAPS,
  })
  const problems = [...sanitized.problems]
  enforceSinks(sanitized.option, (path, message, severity = "warning") => {
    problems.push({ path, message, severity })
  })
  return problems.slice(0, 50)
}

/** What the sanitizer changed, and data that did not bind. */
export const problemsOf = ({
  sanitized,
  built,
}: PreparedCustomOption): RenderProblem[] => [
  ...sanitized.problems,
  ...built.problems,
]
