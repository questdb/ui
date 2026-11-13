import { describe, expect, it } from "vitest"
import { tokenize } from "@questdb/sql-parser"
import { getParserQuoteAtCursor, maskParserBlockComments } from "./parserSql"

describe("main-compatible parser comments", () => {
  it.each([
    "/* '/*' */",
    "/* 'a\n/* b' */",
    "/* disabled:\nSELECT 1 -- see /* below\n*/",
  ])("keeps live SQL visible after %s", (comment) => {
    // Given a closed comment accepted by main and the server
    const sql = `${comment}\nSELECT 42;`

    // When analyzing the compatibility input
    const masked = maskParserBlockComments(sql)

    // Then live tokens retain their original offsets and comment SQL is absent
    const { tokens } = tokenize(masked)
    expect(tokens.map((token) => token.image)).toEqual(["SELECT", "42", ";"])
    expect(tokens[0].startOffset).toBe(comment.length + 1)
  })

  it.each([
    "SELECT '/* text */'",
    "SELECT 'it''s /* text */'",
    'SELECT "a""/* text */"',
    "SELECT `a``/* text */`",
    "SELECT 'unfinished /* text */",
    'SELECT "unfinished /* text */',
    "SELECT `unfinished /* text */",
    "-- /* comment markers */\nSELECT 1",
    "/* unfinished SELECT 1",
  ])("leaves quoted, line-comment or unfinished text intact: %s", (sql) => {
    expect(maskParserBlockComments(sql)).toBe(sql)
  })

  it("preserves CRLF, UTF-16 positions, and original quoted values", () => {
    // Given a non-BMP character and several kinds of line endings
    const comment = "/* 😀;\r\nSELECT 0;\n */"
    const suffix = "\r\nSELECT '😀 /* keep */';"

    // When
    const masked = maskParserBlockComments(comment + suffix)

    // Then offsets can still be used to edit the original SQL
    expect(masked.length).toBe((comment + suffix).length)
    expect(masked.slice(comment.length)).toBe(suffix)
    expect(masked.match(/[\r\n]/g)).toEqual((comment + suffix).match(/[\r\n]/g))
    expect(tokenize(masked).tokens[0].startOffset).toBe(comment.length + 2)
  })

  it("deliberately keeps main's first-closing-delimiter limitation", () => {
    // Given an outer block that remains open after an inner block closes
    const sql = "/* outer /* inner */ SELECT 1"

    // When / Then: compatibility does not promise nested-comment analysis
    expect(
      tokenize(maskParserBlockComments(sql)).tokens.map((t) => t.image),
    ).toEqual(["SELECT", "1"])
  })
})

describe("quote context for completion", () => {
  it.each([
    ["SELECT 'pr|'", "'"],
    ["SELECT 'pr|", "'"],
    ["SELECT 'it''|s'", "'"],
    ["SELECT 'it''|", "'"],
    ["SELECT E'pr|", "'"],
    ["SELECT 'line\n/* text */ ; pr|", "'"],
    ['SELECT * FROM "my ta|"', '"'],
    ["SELECT * FROM `my ta|`", "`"],
    ["SELECT * FROM `my ' ta|`", "`"],
  ])("detects the quote in %s", (input, quote) => {
    const cursor = input.indexOf("|")
    const sql = input.replace("|", "")
    expect(getParserQuoteAtCursor(sql, cursor)?.quote).toBe(quote)
  })

  it.each([
    "SELECT 'pr'|",
    "SELECT 'it'''|",
    "SELECT 'pr' AS |",
    "-- 'pr|",
    "/* 'pr| */ SELECT 1",
    "/* 'pr|",
    "/* '/*' */ SELECT |",
    'SELECT * FROM "my table" |',
  ])("does not treat %s as quoted text", (input) => {
    expect(
      getParserQuoteAtCursor(input.replace("|", ""), input.indexOf("|")),
    ).toBeNull()
  })
})
