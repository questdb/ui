import { format, FormatOptions } from "sql-formatter"

export const formatSql = (statement: string, options?: FormatOptions) => {
  return format(statement, {
    language: "mysql",
    ...options,
  })
}

export const normalizeSql = (sql: string, insertSemicolon: boolean = true) => {
  if (!sql) return ""
  let result = sql.trim()
  if (result.endsWith(";")) {
    result = result.slice(0, -1)
  }
  return formatSql(result) + (insertSemicolon ? ";" : "")
}
