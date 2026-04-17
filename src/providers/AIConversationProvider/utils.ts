/**
 * Trims trailing semicolon from SQL for display purposes.
 * Also ensures the result ends with a newline for Monaco diff editor compatibility.
 */
export const trimSemicolonForDisplay = (
  sql: string | undefined | null,
): string => {
  if (!sql || typeof sql !== "string") return "\n"
  let trimmed = sql.trim()
  if (trimmed.endsWith(";")) {
    trimmed = trimmed.slice(0, -1).trim()
  }
  return trimmed + "\n"
}
