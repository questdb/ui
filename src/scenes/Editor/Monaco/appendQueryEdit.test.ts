import { describe, expect, it } from "vitest"
import { appendQueryEdit } from "./appendQueryEdit"

const query = "select 42;"
describe("append SQL edit", () => {
  it.each([
    ["empty first line", "\n--b", 1, false, "\n--b\nselect 42;", 3],
    ["occupied first line", "--a", 1, false, "--a\nselect 42;", 2],
    [
      "first line before other content",
      "--a\n\n--b",
      1,
      false,
      "--a\n\n--b\nselect 42;",
      4,
    ],
    [
      "empty middle line",
      "--a\n\n--b",
      2,
      false,
      "--a\n\n--b\n\nselect 42;",
      5,
    ],
    ["last occupied line", "--a\n--b", 2, false, "--a\n--b\n\nselect 42;", 4],
    ["empty last line", "--a\n", 2, false, "--a\n\n\nselect 42;", 4],
    [
      "middle of occupied line",
      "--a\n--b\n\n--c",
      2,
      false,
      "--a\n--b\n\n--c\n\nselect 42;",
      6,
    ],
    ["unterminated SQL", "select 1", 1, true, "select 1;\nselect 42;", 2],
  ] as const)(
    "appends after %s and selects only the inserted query",
    (_, source, line, needsSemicolon, expected, selectedLine) => {
      // Given / When
      const edit = appendQueryEdit(source, line, query, needsSemicolon)
      // Then
      expect(source + edit.text).toBe(expected)
      expect(edit.lineStart).toBe(source.split("\n").length + 1)
      expect(edit.selection).toEqual({
        startLineNumber: selectedLine,
        endLineNumber: selectedLine,
        startColumn: 1,
        endColumn: 11,
      })
      expect(expected.split("\n")[selectedLine - 1]).toBe(query)
    },
  )
  it("selects every inserted line after a second append", () => {
    // Given
    const first = appendQueryEdit("\n--b", 1, "first query;", false)
    const source = "\n--b" + first.text
    // When
    const edit = appendQueryEdit(
      source,
      first.selection.startLineNumber,
      "multi\nline\nquery;",
      false,
    )
    // Then
    expect(source + edit.text).toBe(
      "\n--b\nfirst query;\n\nmulti\nline\nquery;",
    )
    expect(edit.selection).toEqual({
      startLineNumber: 5,
      endLineNumber: 7,
      startColumn: 1,
      endColumn: 7,
    })
  })
})
