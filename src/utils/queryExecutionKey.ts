import { sha256 } from "js-sha256"
import { tokenize } from "@questdb/sql-parser"
import { normalizeQueryText } from "../scenes/Editor/Monaco/utils"
import { maskParserBlockComments } from "./parserSql"

// Keep bounded session counters, not another store of the user's SQL text.
// Preserve literals and identifiers; only trim the editor's outer delimiter.
export const queryExecutionKey = (sql: string): string =>
  sha256(normalizeQueryText(sql))

export const MAX_TRACKED_QUERY_EXECUTIONS = 100

// A query plan is not data to monitor. The SQL lexer skips leading comments,
// as it does for the notebook's DECLARE handling.
export const isExplainQuery = (sql: string): boolean =>
  tokenize(maskParserBlockComments(sql)).tokens[0]?.tokenType.name === "Explain"
