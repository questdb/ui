import { sha256 } from "js-sha256"
import { normalizeQueryText } from "../scenes/Editor/Monaco/utils"

// Keep bounded session counters, not another store of the user's SQL text.
// Preserve literals and identifiers; only trim the editor's outer delimiter.
export const queryExecutionKey = (sql: string): string =>
  sha256(normalizeQueryText(sql))

export const MAX_TRACKED_QUERY_EXECUTIONS = 100

const WHITESPACE = /\s/
const EXPLAIN = /^explain\b/i

// A query plan is not data to monitor. Leading comments are skipped with a
// linear scan: a block comment ends at its first "*/", as in SQL.
export const isExplainQuery = (sql: string): boolean => {
  let i = 0
  while (i < sql.length) {
    if (WHITESPACE.test(sql.charAt(i))) {
      i++
    } else if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i + 2)
      if (end === -1) return false
      i = end + 1
    } else if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2)
      if (end === -1) return false
      i = end + 2
    } else {
      return EXPLAIN.test(sql.slice(i))
    }
  }
  return false
}
