import { describe, expect, it } from "vitest"
import "./monacoPolyfill"
import * as monaco from "monaco-editor/esm/vs/editor/editor.api"
import { language } from "./language"

const id = "questdb-grammar-highlighting-test"
monaco.languages.register({ id })
monaco.languages.setMonarchTokensProvider(id, language)
const tokens = (sql: string) => {
  const [line] = monaco.editor.tokenize(sql, id)
  return line.map((token, index) => ({
    text: sql.slice(token.offset, line[index + 1]?.offset ?? sql.length),
    type: token.type,
  }))
}

describe("released grammar token highlighting", () => {
  it.each([
    "0x1F",
    "1.5f",
    "10f",
    "1e36d",
    "10L",
    "10.5m",
    "1.5e3m",
    "100ns",
    "250ms",
    "1.5d",
    "1_000",
    "0.0",
    "3.14",
    ".5",
    "1e-3",
  ])("colors %s as one numeric token", (literal) => {
    // Given / When
    const result = tokens(`SELECT ${literal}`)

    // Then
    expect(result).toContainEqual({ text: literal, type: "number.sql" })
  })

  it("gets new grammar words and functions from the package", () => {
    // Given / When
    const result = tokens(
      "SELECT grouping_id(x), from_base64(x) FROM t GROUP BY GROUPING SETS ((x), ())",
    )

    // Then
    for (const word of ["GROUPING", "SETS"])
      expect(result).toContainEqual({ text: word, type: "keyword.sql" })
    for (const name of ["grouping_id", "from_base64"])
      expect(result).toContainEqual({ text: name, type: "predefined.sql" })
  })

  it("keeps quoted backtick contents as identifier text", () => {
    // Given / When
    const result = tokens("SELECT `order`, `my--table`, `a/*b`")

    // Then
    for (const name of ["order", "my--table", "a/*b"])
      expect(result).toContainEqual({ text: name, type: "identifier.sql" })
    expect(result.some((token) => token.type.startsWith("comment"))).toBe(false)
  })

  it("colors E strings and positional binds without changing array states", () => {
    // Given / When
    const result = tokens("SELECT E'it''s text', $1")

    // Then
    expect(result).toContainEqual({ text: "E'it''s text'", type: "string.sql" })
    expect(result).toContainEqual({ text: "$1", type: "variable.sql" })
  })

  it("preserves main's multiline comment coloring", () => {
    // Given
    const sql = "/* 'a\n/* b' */\nSELECT 42;"

    // When
    const lines = monaco.editor.tokenize(sql, id)

    // Then
    expect(lines[2][0].type).toBe("keyword.sql")
  })
})
