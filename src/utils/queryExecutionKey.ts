import { sha256 } from "js-sha256"
import { normalizeQueryText } from "../scenes/Editor/Monaco/utils"

// Keep bounded session counters, not another store of the user's SQL text.
// Preserve literals and identifiers; only trim the editor's outer delimiter.
export const queryExecutionKey = (sql: string): string =>
  sha256(normalizeQueryText(sql))

export const MAX_TRACKED_QUERY_EXECUTIONS = 100

// A query plan is not data to monitor. Leading comments are skipped.
export const isExplainQuery = (sql: string): boolean =>
  /^\s*(?:(?:--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)\s*)*explain\b/i.test(sql)
