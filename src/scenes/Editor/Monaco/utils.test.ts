import { describe, it, expect } from "vitest"
import type { editor } from "monaco-editor"
import {
  getQueriesFromText,
  isCursorInComment,
  isCursorInQuotedIdentifier,
  getQueriesToRun,
  getQueryRequestFromEditor,
  getQueryFromCursor,
  isQueryTextAtOffset,
  createInflightQuery,
  shiftInflightQuery,
  isInflightQueryStillInPlace,
  shiftSelection,
} from "./utils"

type SingleLineSelection = { startColumn: number; endColumn: number }

const makeSingleLineEditor = (
  text: string,
  cursorColumn: number,
  selection: SingleLineSelection | null,
) => {
  let currentSelection = selection

  const toSelection = (sel: SingleLineSelection) => ({
    startLineNumber: 1,
    startColumn: sel.startColumn,
    endLineNumber: 1,
    endColumn: sel.endColumn,
    getStartPosition: () => ({ lineNumber: 1, column: sel.startColumn }),
    getEndPosition: () => ({ lineNumber: 1, column: sel.endColumn }),
    isEmpty: () => sel.startColumn === sel.endColumn,
  })

  const model = {
    getValueInRange: (range: { startColumn: number; endColumn: number }) =>
      text.substring(range.startColumn - 1, range.endColumn - 1),
    getOffsetAt: (position: { column: number }) => position.column - 1,
    getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }),
  }

  return {
    getModel: () => model,
    getValue: () => text,
    getPosition: () => ({ lineNumber: 1, column: cursorColumn }),
    getSelection: () =>
      currentSelection ? toSelection(currentSelection) : null,
    setSelection: (range: { startColumn: number; endColumn: number }) => {
      currentSelection = {
        startColumn: range.startColumn,
        endColumn: range.endColumn,
      }
    },
  } as unknown as editor.IStandaloneCodeEditor
}

describe("getQueriesFromText", () => {
  it("splits two simple statements", () => {
    expect(getQueriesFromText("SELECT 1; SELECT 2;")).toEqual([
      "SELECT 1",
      "SELECT 2",
    ])
  })

  it("returns empty for empty input", () => {
    expect(getQueriesFromText("")).toEqual([])
    expect(getQueriesFromText("   \n  ")).toEqual([])
  })

  it("ignores semicolons inside strings", () => {
    expect(getQueriesFromText("SELECT ';'; SELECT 'a;b'")).toEqual([
      "SELECT ';'",
      "SELECT 'a;b'",
    ])
  })

  it("ignores semicolons in line comments", () => {
    expect(
      getQueriesFromText("SELECT 1 -- comment with ;\n; SELECT 2"),
    ).toEqual(["SELECT 1 -- comment with ;", "SELECT 2"])
  })

  it("ignores semicolons in block comments", () => {
    expect(getQueriesFromText("SELECT 1 /* a; b; */; SELECT 2")).toEqual([
      "SELECT 1 /* a; b; */",
      "SELECT 2",
    ])
  })

  it("handles trailing statement with no semicolon", () => {
    expect(getQueriesFromText("SELECT 1;\nSELECT 2")).toEqual([
      "SELECT 1",
      "SELECT 2",
    ])
  })

  it("drops a trailing line-comment-only segment", () => {
    expect(getQueriesFromText("select 1; -- note")).toEqual(["select 1"])
  })

  it("drops a trailing block-comment-only segment", () => {
    expect(getQueriesFromText("select 1; /* note */")).toEqual(["select 1"])
  })

  it("drops standalone comment-only segments after the last statement", () => {
    expect(
      getQueriesFromText(
        "--comment;\nselect 1;\n-- select /* comment */ 2;\n-- -- comment;",
      ),
    ).toEqual(["select 1"])
  })

  it("strips a leading comment but keeps a following statement", () => {
    expect(
      getQueriesFromText("--some comment;\nselect 1;\nselect /*comment*/ 2;\n"),
    ).toEqual(["select 1", "select /*comment*/ 2"])
  })

  it("returns empty for comment-only input", () => {
    expect(getQueriesFromText("-- just a comment")).toEqual([])
    expect(getQueriesFromText("/* block only */")).toEqual([])
  })

  it("preserves WITH..SELECT and DECLARE prefixes (VWAP example)", () => {
    const sql = `declare
  @symbol := 'BTC-USDT'
WITH sampled AS (SELECT 1 FROM trades)
SELECT * FROM sampled;
declare
  @symbol := 'ETH-USDT'
WITH sampled AS (SELECT 2 FROM trades)
SELECT * FROM sampled;`
    const out = getQueriesFromText(sql)
    expect(out).toHaveLength(2)
    expect(out[0]).toContain("BTC-USDT")
    expect(out[0]).toContain("WITH sampled")
    expect(out[1]).toContain("ETH-USDT")
  })
})

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

describe("run with selection gating", () => {
  // "SELECT 11" spans columns 1..10 on the single line; the cursor sits inside it.
  const TEXT = "SELECT 11; SELECT 22"
  const FIRST_STATEMENT_SELECTION = { startColumn: 1, endColumn: 10 }
  const QUERY_OFFSETS = [
    { startOffset: 0, endOffset: 9 },
    { startOffset: 11, endOffset: 20 },
  ]

  describe("getQueriesToRun", () => {
    it("runs only the selected text when enabled", () => {
      // Given the first statement is selected and running with selection is enabled
      const editor = makeSingleLineEditor(TEXT, 3, FIRST_STATEMENT_SELECTION)

      // When resolving the queries to run
      const result = getQueriesToRun(editor, QUERY_OFFSETS, true)

      // Then the run carries the selection
      expect(result.length).toBeGreaterThan(0)
      expect(result.some((request) => request.selection)).toBe(true)
    })

    it("ignores the selection and runs the cursor query when disabled", () => {
      // Given the first statement is selected but running with selection is disabled
      const editor = makeSingleLineEditor(TEXT, 3, FIRST_STATEMENT_SELECTION)

      // When resolving the queries to run
      const result = getQueriesToRun(editor, QUERY_OFFSETS, false)

      // Then it falls back to the cursor query with no selection attached
      expect(result).toEqual([getQueryFromCursor(editor)])
      expect(result.every((request) => !request.selection)).toBe(true)
    })
  })

  describe("getQueryRequestFromEditor", () => {
    it("builds a selection request when enabled", () => {
      // Given the first statement is selected and running with selection is enabled
      const editor = makeSingleLineEditor(TEXT, 3, FIRST_STATEMENT_SELECTION)

      // When building the request from the editor
      const request = getQueryRequestFromEditor(editor, true)

      // Then the request carries the selection
      expect(request?.selection).toBeDefined()
    })

    it("ignores the selection and uses the cursor query when disabled", () => {
      // Given the first statement is selected but running with selection is disabled
      const editor = makeSingleLineEditor(TEXT, 3, FIRST_STATEMENT_SELECTION)

      // When building the request from the editor
      const request = getQueryRequestFromEditor(editor, false)

      // Then the request has no selection
      expect(request?.selection).toBeUndefined()
    })
  })
})

describe("isQueryTextAtOffset", () => {
  it("matches when the query is still at its offset", () => {
    // Given a buffer holding the query at a known offset
    const text = "SELECT a FROM t;\nSELECT b FROM u;"

    // When checking the second query at its start offset
    const result = isQueryTextAtOffset(text, 17, "SELECT b FROM u")

    // Then it reports the query is still in place
    expect(result).toBe(true)
  })

  it("does not match when text was inserted so the offset points elsewhere", () => {
    // Given text inserted above shifts the query past its original offset
    const text = "-- note\nSELECT a FROM t;"

    // When checking at the offset the query used to start at
    const result = isQueryTextAtOffset(text, 0, "SELECT a FROM t")

    // Then it reports the query is no longer in place
    expect(result).toBe(false)
  })

  it("does not match when the text at the offset was edited", () => {
    // Given the query text at the offset was changed
    const text = "SELECT z FROM t;"

    // When checking against the original query text
    const result = isQueryTextAtOffset(text, 0, "SELECT a FROM t")

    // Then it reports the query is no longer in place
    expect(result).toBe(false)
  })

  it("ignores a trailing semicolon difference", () => {
    // Given the buffer keeps a trailing semicolon the request text omits
    const text = "SELECT a FROM t;"

    // When checking against the normalized query without the semicolon
    const result = isQueryTextAtOffset(text, 0, "SELECT a FROM t")

    // Then it still reports the query is in place
    expect(result).toBe(true)
  })
})

describe("shiftInflightQuery", () => {
  // "SELECT a FROM t" is 15 chars, so the query spans offsets 20-35
  const runningQuery = () => createInflightQuery(1, "SELECT a FROM t", 20)

  it("shifts the query forward when text is inserted above it", () => {
    // Given a query running at offset 20
    const inflightQuery = runningQuery()

    // When 5 characters are inserted above the query
    const shifted = shiftInflightQuery(inflightQuery, [
      { rangeOffset: 3, rangeLength: 0, text: "hello" },
    ])

    // Then the offsets and the key move by the inserted length
    expect(shifted).toEqual({
      bufferId: 1,
      queryKey: "SELECT a FROM t@25-40",
      startOffset: 25,
      endOffset: 40,
      dislodged: false,
    })
  })

  it("shifts the query backward when text is deleted above it", () => {
    // Given a query running at offset 20
    const inflightQuery = runningQuery()

    // When 4 characters are deleted above the query
    const shifted = shiftInflightQuery(inflightQuery, [
      { rangeOffset: 0, rangeLength: 4, text: "" },
    ])

    // Then the offsets and the key move back by the deleted length
    expect(shifted.queryKey).toBe("SELECT a FROM t@16-31")
    expect(shifted.startOffset).toBe(16)
    expect(shifted.endOffset).toBe(31)
  })

  it("shifts by the net delta when a change above replaces text", () => {
    // Given a query running at offset 20
    const inflightQuery = runningQuery()

    // When 4 characters above are replaced with 2
    const shifted = shiftInflightQuery(inflightQuery, [
      { rangeOffset: 5, rangeLength: 4, text: "ab" },
    ])

    // Then the query moves back by the net difference
    expect(shifted.startOffset).toBe(18)
    expect(shifted.endOffset).toBe(33)
  })

  it("shifts when text is inserted exactly at the query start", () => {
    // Given a query running at offset 20
    const inflightQuery = runningQuery()

    // When a character is inserted at offset 20
    const shifted = shiftInflightQuery(inflightQuery, [
      { rangeOffset: 20, rangeLength: 0, text: "x" },
    ])

    // Then the query text is pushed forward intact
    expect(shifted.startOffset).toBe(21)
    expect(shifted.dislodged).toBe(false)
  })

  it("shifts when a deletion ends exactly at the query start", () => {
    // Given a query running at offsets 20-35
    const inflightQuery = runningQuery()

    // When a deletion whose range ends exactly at the query start is applied
    const shifted = shiftInflightQuery(inflightQuery, [
      { rangeOffset: 15, rangeLength: 5, text: "" },
    ])

    // Then the query shifts back rather than being dislodged
    expect(shifted.dislodged).toBe(false)
    expect(shifted.startOffset).toBe(15)
    expect(shifted.endOffset).toBe(30)
  })

  it("stays untouched when the edit is after the query end", () => {
    // Given a query running at offsets 20-35
    const inflightQuery = runningQuery()

    // When text is inserted past the query end
    const shifted = shiftInflightQuery(inflightQuery, [
      { rangeOffset: 36, rangeLength: 0, text: "x" },
    ])

    // Then nothing changes
    expect(shifted).toBe(inflightQuery)
  })

  it("stays untouched when text is deleted right at the query end", () => {
    // Given a query running at offsets 20-35
    const inflightQuery = runningQuery()

    // When text after the query is deleted starting at its end
    const shifted = shiftInflightQuery(inflightQuery, [
      { rangeOffset: 35, rangeLength: 3, text: "" },
    ])

    // Then nothing changes
    expect(shifted).toBe(inflightQuery)
  })

  it("dislodges the query when text is inserted exactly at its end", () => {
    // Given a query running at offsets 20-35
    const inflightQuery = runningQuery()

    // When text is appended right at the query end, extending the statement
    const shifted = shiftInflightQuery(inflightQuery, [
      { rangeOffset: 35, rangeLength: 0, text: " where x = 1" },
    ])

    // Then the query is dislodged
    expect(shifted.dislodged).toBe(true)
  })

  it("dislodges the query when an edit lands inside it", () => {
    // Given a query running at offsets 20-35
    const inflightQuery = runningQuery()

    // When a character is inserted in the middle of the query
    const shifted = shiftInflightQuery(inflightQuery, [
      { rangeOffset: 25, rangeLength: 0, text: "x" },
    ])

    // Then the query is dislodged and keeps its last known key
    expect(shifted.dislodged).toBe(true)
    expect(shifted.queryKey).toBe(inflightQuery.queryKey)
  })

  it("dislodges the query when a deletion straddles its start", () => {
    // Given a query running at offsets 20-35
    const inflightQuery = runningQuery()

    // When a deletion covers text above and inside the query
    const shifted = shiftInflightQuery(inflightQuery, [
      { rangeOffset: 18, rangeLength: 5, text: "" },
    ])

    // Then the query is dislodged
    expect(shifted.dislodged).toBe(true)
  })

  it("applies only the changes above the query when an event carries several", () => {
    // Given a query running at offset 20
    const inflightQuery = runningQuery()

    // When one change lands above the query and one after it
    const shifted = shiftInflightQuery(inflightQuery, [
      { rangeOffset: 0, rangeLength: 0, text: "abc" },
      { rangeOffset: 40, rangeLength: 2, text: "" },
    ])

    // Then only the change above contributes to the shift
    expect(shifted.startOffset).toBe(23)
    expect(shifted.endOffset).toBe(38)
  })

  it("accumulates the deltas of several changes above the query", () => {
    // Given a query running at offset 20
    const inflightQuery = runningQuery()

    // When two changes land above the query: +2 chars and -1 char
    const shifted = shiftInflightQuery(inflightQuery, [
      { rangeOffset: 0, rangeLength: 0, text: "ab" },
      { rangeOffset: 5, rangeLength: 1, text: "" },
    ])

    // Then the shift is the sum of both deltas
    expect(shifted.startOffset).toBe(21)
    expect(shifted.endOffset).toBe(36)
  })

  it("never shifts again once dislodged", () => {
    // Given a query that was dislodged by an inner edit
    const dislodgedQuery = shiftInflightQuery(runningQuery(), [
      { rangeOffset: 25, rangeLength: 0, text: "x" },
    ])

    // When more text is inserted above it
    const shifted = shiftInflightQuery(dislodgedQuery, [
      { rangeOffset: 0, rangeLength: 0, text: "abc" },
    ])

    // Then it stays dislodged at its last known offsets
    expect(shifted).toBe(dislodgedQuery)
  })
})

describe("isInflightQueryStillInPlace", () => {
  it("reports in place while the query text sits at the tracked offset", () => {
    // Given a query tracked at the start of the buffer
    const inflightQuery = createInflightQuery(1, "SELECT a FROM t", 0)

    // When the buffer still holds the query there
    const result = isInflightQueryStillInPlace(
      "SELECT a FROM t;",
      inflightQuery,
    )

    // Then the query is still in place
    expect(result).toBe(true)
  })

  it("reports in place at the shifted offset after edits above", () => {
    // Given a running query shifted by an insertion above it
    const inflightQuery = shiftInflightQuery(
      createInflightQuery(1, "SELECT a FROM t", 0),
      [{ rangeOffset: 0, rangeLength: 0, text: "-- note\n" }],
    )

    // When the buffer holds the query at the shifted offset
    const result = isInflightQueryStillInPlace(
      "-- note\nSELECT a FROM t;",
      inflightQuery,
    )

    // Then the query is still in place
    expect(result).toBe(true)
  })

  it("reports out of place once the query is dislodged", () => {
    // Given a query dislodged by an inner edit
    const inflightQuery = shiftInflightQuery(
      createInflightQuery(1, "SELECT a FROM t", 0),
      [{ rangeOffset: 5, rangeLength: 0, text: "x" }],
    )

    // When checking against a buffer that still matches the tracked offset
    const result = isInflightQueryStillInPlace(
      "SELECT a FROM t;",
      inflightQuery,
    )

    // Then the query is no longer trusted to be in place
    expect(result).toBe(false)
  })

  it("reports out of place when the buffer text at the offset differs", () => {
    // Given a query tracked at the start of the buffer
    const inflightQuery = createInflightQuery(1, "SELECT a FROM t", 0)

    // When the buffer content changed underneath it
    const result = isInflightQueryStillInPlace(
      "SELECT z FROM t;",
      inflightQuery,
    )

    // Then the query is no longer in place
    expect(result).toBe(false)
  })
})

describe("shiftSelection", () => {
  const selection = {
    startOffset: 20,
    endOffset: 35,
    queryText: "SELECT a FROM t",
  }

  it("moves both offsets forward by a positive delta and keeps the query text", () => {
    // Given a stored selection
    // When it is shifted forward by inserted text above it
    const shifted = shiftSelection(selection, 5)

    // Then both offsets move by the delta and the query text is preserved
    expect(shifted).toEqual({
      startOffset: 25,
      endOffset: 40,
      queryText: "SELECT a FROM t",
    })
  })

  it("moves both offsets backward by a negative delta", () => {
    // Given a stored selection
    // When it is shifted back by deleted text above it
    const shifted = shiftSelection(selection, -4)

    // Then both offsets move back by the delta
    expect(shifted.startOffset).toBe(16)
    expect(shifted.endOffset).toBe(31)
  })

  it("leaves the offsets unchanged for a zero delta", () => {
    // Given a stored selection
    // When it is shifted by nothing
    const shifted = shiftSelection(selection, 0)

    // Then the offsets are unchanged
    expect(shifted.startOffset).toBe(20)
    expect(shifted.endOffset).toBe(35)
  })
})
