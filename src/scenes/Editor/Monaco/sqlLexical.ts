export type SqlToken = {
  start: number
  end: number
  closed: boolean
  kind: "comment" | "space" | "quoted" | "text" | "semicolon"
}

export function quotedTokenEnd(text: string, start: number): number {
  const quote = text[start]
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] !== quote) continue
    if (quote !== "`" && text[i + 1] === quote) {
      i++
    } else {
      return i + 1
    }
  }
  return -1
}

export function* sqlTokens(text: string): Generator<SqlToken, void> {
  let i = 0
  while (i < text.length) {
    const start = i
    let closed = true
    let kind: SqlToken["kind"] = "text"
    if (text.startsWith("--", i)) {
      kind = "comment"
      closed = false
      i += 2
      while (i < text.length && text[i] !== "\n" && text[i] !== "\r") i++
    } else if (text.startsWith("/*", i)) {
      kind = "comment"
      let depth = 1
      i += 2
      while (i < text.length && depth > 0) {
        // SqlUtil.fetchNext skips line comments and quoted lexer tokens even
        // inside a block comment, before it counts nested block delimiters.
        if (text.startsWith("--", i)) {
          i += 2
          while (i < text.length && text[i] !== "\n" && text[i] !== "\r") i++
        } else if (text.startsWith("/*", i)) {
          depth++
          i += 2
        } else if (text.startsWith("*/", i)) {
          depth--
          i += 2
        } else if (text[i] === "'" || text[i] === '"' || text[i] === "`") {
          const end = quotedTokenEnd(text, i)
          i = end < 0 ? i + 1 : end
        } else {
          i++
        }
      }
      closed = depth === 0
    } else if (text[i] === "'" || text[i] === '"' || text[i] === "`") {
      const end = quotedTokenEnd(text, i)
      closed = end >= 0
      kind = end < 0 ? "text" : "quoted"
      i = end < 0 ? i + 1 : end
    } else if (/\s/.test(text[i])) {
      kind = "space"
      do {
        i++
      } while (i < text.length && /\s/.test(text[i]))
    } else {
      if (text[i] === ";") kind = "semicolon"
      i++
      if (kind === "text") {
        while (i < text.length && !/[\s;'"`/-]/.test(text[i])) i++
      }
    }
    yield { start, end: i, kind, closed }
  }
}

export const maskSqlComments = (text: string): string => {
  const parts: string[] = []
  for (const token of sqlTokens(text)) {
    const value = text.slice(token.start, token.end)
    parts.push(
      token.kind === "comment" ? value.replace(/[^\r\n]/g, " ") : value,
    )
  }
  return parts.join("")
}
