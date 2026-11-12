import { describe, expect, it } from "vitest"
import { maskSqlComments, sqlTokens } from "./sqlLexical"

describe("server SQL lexical boundaries", () => {
  it("keeps comment masking offsets and line breaks intact", () => {
    // Given a block with a nested opener hidden by a line comment
    const sql = "/* x\n-- /*\n*/ SELECT '/*', `--`, 42"

    // When
    const masked = maskSqlComments(sql)

    // Then parser offsets still address the original SQL
    expect(masked).toBe("    \n     \n   SELECT '/*', `--`, 42")
    expect(masked.indexOf("SELECT")).toBe(sql.indexOf("SELECT"))
  })

  it("keeps an unclosed outer block open after an inner closer", () => {
    // Given
    const sql = "/* outer /* inner */"

    // When / Then
    expect([...sqlTokens(sql)]).toEqual([
      { start: 0, end: sql.length, kind: "comment", closed: false },
    ])
  })

  it("keeps quoted multiline tokens across semicolons", () => {
    // Given
    const sql = "SELECT 'a;\nb', `c;d`; SELECT 42"

    // When
    const tokens = [...sqlTokens(sql)]

    // Then only the unquoted separator ends a statement
    expect(tokens.filter((token) => token.kind === "semicolon")).toEqual([
      {
        start: sql.indexOf("; SELECT"),
        end: sql.indexOf("; SELECT") + 1,
        kind: "semicolon",
        closed: true,
      },
    ])
  })
})
