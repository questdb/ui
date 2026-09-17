import type { DeclareEntry } from "../../../../../store/notebook"
import { executeSingleRaw } from "../../../../../utils/executeSingleRaw"
import type { Client } from "../../../../../utils/questdb/client"
import { referencedDeclareEntries } from "../references"
import { classifyOptionQuery } from "./classifyOptionQuery"
import { MAX_OPTIONS, type QueryRows } from "./normalizeQueryOptions"

export type QueryRowsResult =
  | { kind: "rows"; rows: QueryRows }
  | { kind: "error"; error: string }

export const fetchQueryRows = async (
  quest: Client,
  sql: string,
  entriesAbove: DeclareEntry[],
  signal: AbortSignal,
): Promise<QueryRowsResult> => {
  const entries = referencedDeclareEntries(sql, entriesAbove)
  try {
    const verdict = await classifyOptionQuery(sql, entries, (text) =>
      quest.validateQuery(text, signal),
    )
    if (!verdict.ok) return { kind: "error", error: verdict.error }
  } catch {
    return { kind: "error", error: "Could not validate the query." }
  }
  const result = await executeSingleRaw(
    quest,
    sql,
    entries,
    signal,
    MAX_OPTIONS + 1,
  )
  if (result.type === "error") {
    return { kind: "error", error: result.error ?? "Query failed" }
  }
  if (result.type !== "dql") {
    return { kind: "error", error: "The option query must be a SELECT." }
  }
  return {
    kind: "rows",
    rows: {
      columns: result.columns,
      rows: result.dataset.slice(0, MAX_OPTIONS),
      truncated: result.dataset.length > MAX_OPTIONS,
    },
  }
}
