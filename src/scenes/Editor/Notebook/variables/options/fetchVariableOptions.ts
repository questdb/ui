import type {
  DeclareEntry,
  ListVariable,
  NotebookVariable,
  VariableOption,
} from "../../../../../store/notebook"
import type { Client } from "../../../../../utils/questdb/client"
import { referencedDeclareEntries, referencesAny } from "../references"
import { TIME_VARIABLE_NAMES } from "../timeRange"
import { fetchQueryRows } from "./fetchQueryRows"
import { normalizeQueryOptions } from "./normalizeQueryOptions"

export type QueryListVariable = ListVariable & { source: { type: "query" } }

export const isQueryList = (
  variable: NotebookVariable,
): variable is QueryListVariable =>
  variable.kind === "list" && variable.source.type === "query"

export const TIME_RANGE_REQUIRED = "Set a time range first."

export const requiresTimeRange = (variable: QueryListVariable): boolean =>
  referencesAny(variable.source.query, TIME_VARIABLE_NAMES)

export type FetchedVariableOptions = {
  options: VariableOption[]
  columns: string[]
  truncated: boolean
  warnings: string[]
  fetchedAt: number
  context?: string
}

export type PrefetchedVariableOptions = Record<string, FetchedVariableOptions>

export type VariableValuesEntry =
  | { name: string; count: number; fetched_at: number }
  | { name: string; error: string }

export const fetchedValuesEntry = (
  name: string,
  fetched: FetchedVariableOptions,
): VariableValuesEntry => ({
  name,
  count: fetched.options.length,
  fetched_at: fetched.fetchedAt,
})

export type FetchVariableOptionsResult =
  | { kind: "ready"; fetched: FetchedVariableOptions }
  | { kind: "error"; error: string }

// Include the resolved dependency values, not just the shared variable name.
export const variableOptionsContext = (
  variable: QueryListVariable,
  entriesAbove: DeclareEntry[],
): string =>
  JSON.stringify({
    source: variable.source,
    sort: variable.sort,
    entries: referencedDeclareEntries(variable.source.query, entriesAbove),
  })

export const fetchVariableOptions = async (
  quest: Client,
  variable: QueryListVariable,
  entriesAbove: DeclareEntry[],
  signal: AbortSignal,
): Promise<FetchVariableOptionsResult> => {
  const result = await fetchQueryRows(
    quest,
    variable.source.query,
    entriesAbove,
    signal,
  )
  if (result.kind === "error") return result
  const normalized = await normalizeQueryOptions(result.rows, variable, signal)
  if (normalized.kind === "error") return normalized
  return {
    kind: "ready",
    fetched: {
      options: normalized.options,
      columns: result.rows.columns.map((column) => column.name),
      truncated: result.rows.truncated,
      warnings: normalized.warnings,
      fetchedAt: Date.now(),
      context: variableOptionsContext(variable, entriesAbove),
    },
  }
}
