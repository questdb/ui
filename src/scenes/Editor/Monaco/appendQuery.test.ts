import { describe, expect, it } from "vitest"
import type { editor, IPosition, IRange } from "monaco-editor"
import { appendQuery } from "./utils"

// A model-faithful stand-in for the editor: `executeEdits` applies the single
// insertion `appendQuery` makes, so the resulting text and selection can be
// compared exactly. Scenarios mirror what the former Example queries e2e suite
// drove through the UI: cursor on the first/middle/last line, empty or not,
// and an unterminated last statement.
const makeEditor = (initial: string, cursor?: IPosition) => {
  let text = initial
  let selection: IRange | null = null
  const lines = () => text.split("\n")
  const offsetAt = ({ lineNumber, column }: IPosition) =>
    lines()
      .slice(0, lineNumber - 1)
      .reduce((offset, line) => offset + line.length + 1, 0) +
    column -
    1
  const positionAt = (offset: number): IPosition => {
    let remaining = offset
    const all = lines()
    for (let index = 0; index < all.length; index++) {
      if (remaining <= all[index].length) {
        return { lineNumber: index + 1, column: remaining + 1 }
      }
      remaining -= all[index].length + 1
    }
    return { lineNumber: all.length, column: all[all.length - 1].length + 1 }
  }
  const model = {
    getValue: () => text,
    getLineCount: () => lines().length,
    getLineContent: (lineNumber: number) => lines()[lineNumber - 1],
    getOffsetAt: offsetAt,
    getPositionAt: positionAt,
    getValueInRange: (range: IRange) =>
      text.substring(
        offsetAt({
          lineNumber: range.startLineNumber,
          column: range.startColumn,
        }),
        offsetAt({ lineNumber: range.endLineNumber, column: range.endColumn }),
      ),
  }
  const fake = {
    getModel: () => model,
    getValue: () => text,
    getPosition: () => cursor ?? positionAt(text.length),
    getSelection: () => null,
    executeEdits: (
      _source: string,
      edits: Array<{ range: IRange; text: string }>,
    ) => {
      for (const edit of edits) {
        // Insertions past the last line land at the end of the text.
        const at = Math.min(
          offsetAt({
            lineNumber: edit.range.startLineNumber,
            column: edit.range.startColumn,
          }),
          text.length,
        )
        text = text.slice(0, at) + edit.text + text.slice(at)
      }
    },
    setSelection: (range: IRange) => {
      selection = range
    },
    focus: () => undefined,
    revealLine: () => undefined,
  } as unknown as editor.IStandaloneCodeEditor
  return {
    editor: fake,
    text: () => text,
    selectedLines: () =>
      selection ? selection.endLineNumber - selection.startLineNumber + 1 : 0,
    selectedText: () =>
      selection
        ? text.substring(
            offsetAt({
              lineNumber: selection.startLineNumber,
              column: selection.startColumn,
            }),
            offsetAt({
              lineNumber: selection.endLineNumber,
              column: selection.endColumn,
            }),
          )
        : "",
  }
}

const first = "first query;"
const second = "second query;"
const multi = "multi\nline\nquery;"

describe("appendQuery", () => {
  it("appends to an empty editor and selects the query", () => {
    const e = makeEditor("")
    appendQuery(e.editor, first)
    expect(e.text()).toBe(`\n${first}`)
    expect(e.selectedLines()).toBe(1)
    expect(e.selectedText()).toBe(first)
  })

  it("selects every line of a multiline query", () => {
    const e = makeEditor("")
    appendQuery(e.editor, multi)
    expect(e.text()).toBe(`\n${multi}`)
    expect(e.selectedLines()).toBe(3)
    expect(e.selectedText()).toBe(multi)
  })

  it("separates consecutive appends with a blank line", () => {
    const e = makeEditor("")
    appendQuery(e.editor, second)
    appendQuery(e.editor, second)
    appendQuery(e.editor, multi)
    expect(e.text()).toBe(`\n${second}\n\n${second}\n\n${multi}`)
    expect(e.selectedText()).toBe(multi)
  })

  it("cursor on an empty first line with content below", () => {
    const e = makeEditor("\n--b", { lineNumber: 1, column: 1 })
    appendQuery(e.editor, first)
    expect(e.text()).toBe(`\n--b\n${first}`)
    expect(e.selectedText()).toBe(first)
  })

  it("cursor on a non-empty first line", () => {
    const e = makeEditor("--a", { lineNumber: 1, column: 4 })
    appendQuery(e.editor, first)
    expect(e.text()).toBe(`--a\n${first}`)
    expect(e.selectedText()).toBe(first)
  })

  it("cursor on a non-empty first line with more content after", () => {
    const e = makeEditor("--a\n\n--b", { lineNumber: 1, column: 1 })
    appendQuery(e.editor, first)
    expect(e.text()).toBe(`--a\n\n--b\n${first}`)
    expect(e.selectedText()).toBe(first)
  })

  it("cursor on an empty middle line", () => {
    const e = makeEditor("--a\n\n--b", { lineNumber: 2, column: 1 })
    appendQuery(e.editor, first)
    expect(e.text()).toBe(`--a\n\n--b\n\n${first}`)
    expect(e.selectedText()).toBe(first)
  })

  it("cursor at the end of the last line", () => {
    const e = makeEditor("--a\n--b", { lineNumber: 2, column: 4 })
    appendQuery(e.editor, first)
    expect(e.text()).toBe(`--a\n--b\n\n${first}`)
    expect(e.selectedText()).toBe(first)
  })

  it("cursor on an empty last line", () => {
    const e = makeEditor("--a\n", { lineNumber: 2, column: 1 })
    appendQuery(e.editor, first)
    expect(e.text()).toBe(`--a\n\n\n${first}`)
    expect(e.selectedText()).toBe(first)
  })

  it("cursor mid-document, non-empty line followed by an empty one", () => {
    const e = makeEditor("--a\n--b\n\n--c", { lineNumber: 2, column: 2 })
    appendQuery(e.editor, first)
    expect(e.text()).toBe(`--a\n--b\n\n--c\n\n${first}`)
    expect(e.selectedText()).toBe(first)
  })

  it("injects a semicolon when the existing query is unterminated", () => {
    const e = makeEditor("select 1", { lineNumber: 1, column: 9 })
    appendQuery(e.editor, first)
    expect(e.text()).toBe(`select 1;\n${first}`)
    expect(e.selectedText()).toBe(first)
  })
})
