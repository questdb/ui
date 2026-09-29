import { format, FormatOptions } from "@questdb/sql-parser"
import { getValue } from "./localStorage"
import { StoreKey } from "./localStorage/types"

export type { FormatOptions }

const isCapitalizeKeywordsOnFormatEnabled = () =>
  getValue(StoreKey.CAPITALIZE_KEYWORDS_ON_FORMAT) === "true"

export const formatSql = (statement: string, options: FormatOptions = {}) =>
  format(statement, {
    capitalize: isCapitalizeKeywordsOnFormatEnabled(),
    ...options,
  })

export const normalizeSql = (
  sql: string,
  insertSemicolon: boolean = true,
  options: FormatOptions = {},
) => {
  if (!sql) return ""
  let result = sql.trim()
  if (result.endsWith(";")) {
    result = result.slice(0, -1)
  }
  return formatSql(result, options) + (insertSemicolon ? ";" : "")
}
