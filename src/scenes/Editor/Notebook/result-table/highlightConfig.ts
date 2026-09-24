import type {
  DqlQueryResult,
  NotebookCell,
  NotebookViewState,
} from "../../../../store/notebook"
import {
  defaultIdentityColumns,
  type HighlightConfig,
} from "../../../../components/ResultGrid/highlight"
import { queryKeyFor } from "../queryKey"
import { getQueriesFromText } from "../../Monaco/utils"

export type HighlightConfigs = NonNullable<NotebookCell["highlightConfigs"]>

export const resolveHighlightConfig = (
  configs: HighlightConfigs | undefined,
  statementIndex: number,
  result: DqlQueryResult,
): HighlightConfig =>
  configs?.[statementIndex] ?? {
    identityColumns: defaultIdentityColumns(
      result.columns,
      result.timestamp ?? -1,
    ),
    rules: [],
  }

const trimTrailingNulls = <T>(entries: (T | null)[]): (T | null)[] => {
  let end = entries.length
  while (end > 0 && entries[end - 1] === null) end--
  return entries.slice(0, end)
}

// Bound to the statement's position, so an edit to its text keeps the rules,
// the same way chartConfig.queries follows a statement.
export const withHighlightConfig = (
  cell: NotebookCell,
  statementIndex: number,
  config: HighlightConfig | null,
): NotebookCell => {
  const next = [...(cell.highlightConfigs ?? [])]
  while (next.length <= statementIndex) next.push(null)
  next[statementIndex] = config
  const trimmed = trimTrailingNulls(next)
  if (trimmed.length === 0) {
    const { highlightConfigs: _dropped, ...rest } = cell
    return rest
  }
  return { ...cell, highlightConfigs: trimmed }
}

export const isKeyedHighlightConfigs = (
  configs: unknown,
): configs is Record<string, unknown> =>
  typeof configs === "object" && configs !== null && !Array.isArray(configs)

// Notebooks saved before the index binding keyed configs by a hash of the
// statement text. Each key is paired with the statement that still hashes to
// it; keys of statements that left the cell have nothing to attach to.
export const indexHighlightConfigsByStatement = (
  configs: Record<string, unknown>,
  value: string,
): unknown[] =>
  getQueriesFromText(value).map((statement) => {
    const config = configs[queryKeyFor(statement)]
    return config === undefined ? null : config
  })

export const indexLegacyHighlightConfigs = (
  state: NotebookViewState,
): NotebookViewState => {
  const isLegacy = (cell: NotebookCell) =>
    isKeyedHighlightConfigs(cell.highlightConfigs)
  if (!state.cells.some(isLegacy)) return state
  const cells = state.cells.map((cell) => {
    const configs: unknown = cell.highlightConfigs
    if (!isKeyedHighlightConfigs(configs)) return cell
    return {
      ...cell,
      highlightConfigs: indexHighlightConfigsByStatement(
        configs,
        cell.value,
      ) as HighlightConfigs,
    }
  })
  return { ...state, cells }
}
