import type {
  DqlQueryResult,
  NotebookCell,
  SingleQueryResult,
} from "../../../../store/notebook"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import {
  defaultIdentityColumns,
  type HighlightConfig,
} from "../../../../components/ResultGrid/highlight"

export const resolveHighlightConfig = (
  config: HighlightConfig | undefined,
  result: DqlQueryResult,
): HighlightConfig =>
  config ?? {
    identityColumns: defaultIdentityColumns(
      result.columns,
      result.timestamp ?? -1,
    ),
    rules: [],
  }

export const withHighlightConfig = (
  cell: NotebookCell,
  config: HighlightConfig | null,
): NotebookCell => {
  if (config) return { ...cell, highlightConfig: config }
  const { highlightConfig: _dropped, ...rest } = cell
  return rest
}

// Every column any result of the cell has, once by name, so a rule can target
// a column of any statement.
export const cellColumnsOf = (
  results: (SingleQueryResult | null)[],
): ColumnDefinition[] => {
  const seen = new Set<string>()
  const columns: ColumnDefinition[] = []
  for (const result of results) {
    if (result?.type !== "dql") continue
    for (const column of result.columns) {
      if (seen.has(column.name)) continue
      seen.add(column.name)
      columns.push(column)
    }
  }
  return columns
}
