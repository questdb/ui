const parserSqlParts =
  /'(?:''|[^'])*('|$)|"(?:""|[^"])*("|$)|`[^`]*(`|$)|--[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)/g

/**
 * Keep main's non-nested block-comment rules for parser analysis. Parser 0.1.22
 * otherwise treats some previously accepted comment prefixes as an unclosed
 * nested comment, hiding the live SQL from completion, globals and chart hints.
 * Preserve offsets and line endings; callers still edit/send the original SQL.
 * This intentionally retains main's limitations for genuinely nested comments.
 */
export const maskParserBlockComments = (sql: string): string => {
  if (!sql.includes("/*")) return sql
  return sql.replace(parserSqlParts, (part) =>
    part.startsWith("/*") && part.endsWith("*/")
      ? part.replace(/[^\r\n]/g, " ")
      : part,
  )
}

// Reuse the same quoted spans for completion, including unfinished literals.
export const getParserQuoteAtCursor = (sql: string, cursorOffset: number) => {
  for (const part of sql.matchAll(parserSqlParts)) {
    if (part.index >= cursorOffset) break
    const quote = part[0][0]
    if (quote !== "'" && quote !== '"' && quote !== "`") continue
    const end = part.index + part[0].length
    const closed = Boolean(part[1] || part[2] || part[3])
    if (cursorOffset < end || (cursorOffset === end && !closed)) {
      return { quote, startOffset: part.index }
    }
  }
  return null
}
