import { describe, it, expect } from "vitest"
import { isCursorInComment, isCursorInQuotedIdentifier } from "./utils"

describe("isCursorInComment", () => {
  it("returns false when cursor is in normal SQL", () => {
    const text = "SELECT * FROM table"
    expect(isCursorInComment(text, 7)).toBe(false)
  })

  it("detects cursor inside a line comment", () => {
    const text = "SELECT * -- this is a comment\nFROM table"
    // cursor inside "this is a comment"
    expect(isCursorInComment(text, 15)).toBe(true)
  })

  it("returns false after a line comment ends (next line)", () => {
    const text = "SELECT * -- comment\nFROM table"
    // cursor at "FROM"
    expect(isCursorInComment(text, 24)).toBe(false)
  })

  it("detects cursor inside a block comment", () => {
    const text = "SELECT /* block comment */ * FROM table"
    expect(isCursorInComment(text, 15)).toBe(true)
  })

  it("returns false after a block comment closes", () => {
    const text = "SELECT /* block */ * FROM table"
    // cursor at "* FROM"
    expect(isCursorInComment(text, 20)).toBe(false)
  })

  it("handles multi-line block comment", () => {
    const text = "SELECT /*\n  multi\n  line\n*/ * FROM table"
    // cursor inside the block comment
    expect(isCursorInComment(text, 15)).toBe(true)
    // cursor after the block comment
    expect(isCursorInComment(text, 30)).toBe(false)
  })

  it("does not treat -- inside a single-quoted string as a comment", () => {
    const text = "SELECT '--not a comment' FROM table"
    expect(isCursorInComment(text, 12)).toBe(false)
  })

  it("does not treat -- inside a double-quoted identifier as a comment", () => {
    const text = 'SELECT * FROM "my--table"'
    expect(isCursorInComment(text, 18)).toBe(false)
  })

  it("detects comment after a quoted string", () => {
    const text = "SELECT 'value' -- comment here"
    expect(isCursorInComment(text, 25)).toBe(true)
  })

  it("handles cursor at the very start of a line comment", () => {
    const text = "SELECT * --comment"
    // cursor right at the first "-"
    expect(isCursorInComment(text, 9)).toBe(false)
    // cursor right after "--"
    expect(isCursorInComment(text, 11)).toBe(true)
  })

  it("handles cursor at the start/end of block comment delimiters", () => {
    const text = "SELECT /* comment */ FROM"
    // cursor at the "/" of "/*"
    expect(isCursorInComment(text, 7)).toBe(false)
    // cursor right after "/*"
    expect(isCursorInComment(text, 9)).toBe(true)
    // cursor right after "*/"
    expect(isCursorInComment(text, 20)).toBe(false)
  })

  it("handles multiple comments in sequence", () => {
    const text = "SELECT -- first\n* /* second */ FROM -- third\ntable"
    // inside first comment
    expect(isCursorInComment(text, 12)).toBe(true)
    // between first and second comment (at "*")
    expect(isCursorInComment(text, 17)).toBe(false)
    // inside second comment
    expect(isCursorInComment(text, 22)).toBe(true)
    // after second comment, at "FROM"
    expect(isCursorInComment(text, 35)).toBe(false)
    // inside third comment
    expect(isCursorInComment(text, 42)).toBe(true)
  })

  it("handles empty text", () => {
    expect(isCursorInComment("", 0)).toBe(false)
  })

  it("handles unclosed single-quoted string before a real comment", () => {
    // An unclosed string could swallow a subsequent comment marker
    // if quote handling scans past cursorOffset.
    const text = "SELECT 'unclosed -- real comment?"
    // cursor inside -- area, which is inside the unclosed string
    // so it should NOT be a comment
    const cursor = text.indexOf("-- real") + 3
    expect(isCursorInComment(text, cursor)).toBe(false)
  })

  it("handles unclosed double-quoted identifier before a real comment", () => {
    const text = 'SELECT "unclosed -- real comment?'
    const cursor = text.indexOf("-- real") + 3
    // -- is inside the unclosed identifier, not a comment
    expect(isCursorInComment(text, cursor)).toBe(false)
  })
})

describe("isCursorInQuotedIdentifier", () => {
  it("returns -1 when cursor is in normal SQL", () => {
    const text = "SELECT * FROM table"
    expect(isCursorInQuotedIdentifier(text, 0, 7)).toBe(-1)
  })

  it("detects cursor inside a double-quoted identifier", () => {
    const text = 'SELECT * FROM "my_table"'
    // cursor inside "my_table"
    const offset = text.indexOf("my_table")
    expect(
      isCursorInQuotedIdentifier(text, 0, offset + 3),
    ).toBeGreaterThanOrEqual(0)
  })

  it("returns the offset of the opening quote", () => {
    const text = 'SELECT * FROM "my_table"'
    const openQuote = text.indexOf('"')
    const cursor = text.indexOf("my_table") + 3
    expect(isCursorInQuotedIdentifier(text, 0, cursor)).toBe(openQuote)
  })

  it("returns -1 when cursor is after a closed quoted identifier", () => {
    const text = 'SELECT * FROM "my_table" WHERE'
    const cursor = text.indexOf(" WHERE")
    expect(isCursorInQuotedIdentifier(text, 0, cursor)).toBe(-1)
  })

  it("detects cursor inside an unclosed quoted identifier", () => {
    const text = 'SELECT * FROM "my_table'
    const cursor = text.length
    expect(isCursorInQuotedIdentifier(text, 0, cursor)).toBe(text.indexOf('"'))
  })

  it("handles identifier with dashes", () => {
    const text = 'SELECT * FROM "quoted-table"'
    // cursor after the dash
    const cursor = text.indexOf("-") + 1
    expect(isCursorInQuotedIdentifier(text, 0, cursor)).toBe(text.indexOf('"'))
  })

  it("handles identifier with dots", () => {
    const text = 'SELECT * FROM "table.with.dots"'
    const cursor = text.indexOf("with")
    expect(isCursorInQuotedIdentifier(text, 0, cursor)).toBe(text.indexOf('"'))
  })

  it("does not confuse single-quoted strings with double-quoted identifiers", () => {
    const text = "SELECT 'hello' FROM table"
    // cursor inside 'hello'
    const cursor = text.indexOf("hello") + 2
    expect(isCursorInQuotedIdentifier(text, 0, cursor)).toBe(-1)
  })

  it("does not confuse double quote inside single-quoted string", () => {
    const text = `SELECT 'has "quotes" inside' FROM table`
    // cursor inside the single-quoted string where " appears
    const cursor = text.indexOf('"quotes"') + 1
    expect(isCursorInQuotedIdentifier(text, 0, cursor)).toBe(-1)
  })

  it("handles escaped double quotes inside identifier", () => {
    const text = 'SELECT * FROM "has""escaped"'
    // cursor between the escaped ""
    const cursor = text.indexOf('""') + 2
    // should still be inside the identifier (escaped quote doesn't close it)
    expect(isCursorInQuotedIdentifier(text, 0, cursor)).toBe(text.indexOf('"'))
  })

  it("handles escaped single quotes inside string (not a quoted identifier)", () => {
    const text = "SELECT 'it''s fine' FROM table"
    // cursor inside the single-quoted string
    const cursor = text.indexOf("s fine")
    expect(isCursorInQuotedIdentifier(text, 0, cursor)).toBe(-1)
  })

  it("handles multiple quoted identifiers — cursor in second", () => {
    const text = 'SELECT "col1" FROM "my_table"'
    // cursor inside "my_table"
    const openingQuote = text.indexOf('"', text.indexOf("my_table") - 1)
    const cursor = text.indexOf("my_table") + 2
    expect(isCursorInQuotedIdentifier(text, 0, cursor)).toBe(openingQuote)
  })

  it("handles multiple quoted identifiers — cursor after both", () => {
    const text = 'SELECT "col1" FROM "my_table" WHERE'
    const cursor = text.indexOf(" WHERE")
    expect(isCursorInQuotedIdentifier(text, 0, cursor)).toBe(-1)
  })

  it("respects startOffset parameter", () => {
    const text = 'SELECT "col1"; SELECT * FROM "tbl"'
    // start scanning from the second statement
    const secondStart = text.indexOf(";") + 1
    const cursor = text.indexOf("tbl") + 1
    expect(isCursorInQuotedIdentifier(text, secondStart, cursor)).toBe(
      text.lastIndexOf('"', cursor - 1),
    )
  })

  it("handles mix of comments and quoted identifiers", () => {
    const text = 'SELECT * -- "not an identifier\nFROM "real_id"'
    // cursor inside "real_id" — the " inside the comment is skipped
    const cursor = text.indexOf("real_id") + 3
    const openingQuote = text.indexOf('"', text.indexOf("FROM"))
    expect(isCursorInQuotedIdentifier(text, 0, cursor)).toBe(openingQuote)
  })

  it("works with multi-line quoted identifier", () => {
    const text = 'SELECT * FROM "multi\nline"'
    const cursor = text.indexOf("line")
    expect(isCursorInQuotedIdentifier(text, 0, cursor)).toBe(text.indexOf('"'))
  })

  it("handles empty text", () => {
    expect(isCursorInQuotedIdentifier("", 0, 0)).toBe(-1)
  })

  it("cursor right after opening quote", () => {
    const text = 'SELECT * FROM "'
    expect(isCursorInQuotedIdentifier(text, 0, text.length)).toBe(
      text.indexOf('"'),
    )
  })

  it("cursor right at closing quote position", () => {
    const text = 'SELECT * FROM "tbl"'
    // cursor at the closing " (still inside)
    const cursor = text.lastIndexOf('"')
    expect(isCursorInQuotedIdentifier(text, 0, cursor)).toBe(text.indexOf('"'))
  })
})
