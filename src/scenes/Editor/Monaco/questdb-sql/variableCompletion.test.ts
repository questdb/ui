import { describe, it, expect, afterEach } from "vitest"
import "./monacoPolyfill"
import * as monaco from "monaco-editor/esm/vs/editor/editor.api"
import type { languages, CancellationToken } from "monaco-editor"
import type { Table, InformationSchemaColumn } from "../../../../utils"
import { createSchemaCompletionProvider } from "./createSchemaCompletionProvider"
import { registerVariableModel } from "./variableCompletion"
import { CompletionItemKind } from "./types"
import { conf } from "./conf"

monaco.languages.register({ id: "questdb-sql" })
monaco.languages.setLanguageConfiguration("questdb-sql", conf)

const tables = [
  {
    id: 1,
    table_name: "fx_trades",
    partitionBy: "DAY",
    designatedTimestamp: "timestamp",
    walEnabled: true,
  },
]

const columns: Record<string, InformationSchemaColumn[]> = {
  fx_trades: [
    {
      table_name: "fx_trades",
      ordinal_position: 1,
      column_name: "symbol",
      data_type: "SYMBOL",
    },
    {
      table_name: "fx_trades",
      ordinal_position: 2,
      column_name: "timestamp",
      data_type: "TIMESTAMP",
    },
  ],
}

const variables = [
  { name: "tbl", value: "fx_trades", description: "This notebook" },
  { name: "col", value: "'symbol'", description: "All notebooks" },
  { name: "pair", value: "('EURUSD', 'GBPUSD')" },
  { name: "empty", value: undefined },
]

const provider = createSchemaCompletionProvider(
  tables as unknown as Table[],
  columns,
)

const models: monaco.editor.ITextModel[] = []

afterEach(() => {
  models.forEach((m) => m.dispose())
  models.length = 0
})

const complete = (text: string, withVariables = true) => {
  const model = monaco.editor.createModel(text, "questdb-sql")
  models.push(model)
  if (withVariables) registerVariableModel(model, () => variables)
  const position = model.getPositionAt(text.length)
  const result = provider.provideCompletionItems(
    model,
    position,
    {} as languages.CompletionContext,
    {} as CancellationToken,
  ) as languages.CompletionList | null
  return result?.suggestions ?? []
}

const labelOf = (item: languages.CompletionItem) =>
  typeof item.label === "string" ? item.label : item.label.label

const detailOf = (item: languages.CompletionItem) =>
  typeof item.label === "string" ? undefined : item.label.detail?.trim()

describe("variable completion", () => {
  it("lists every registered variable with its value after an @", () => {
    // Given a cell where the user typed an @
    const items = complete("SELECT * FROM fx_trades WHERE symbol = @")

    // Then every variable is offered with its current value, or "no value"
    expect(items.map(labelOf)).toEqual(["@tbl", "@col", "@pair", "@empty"])
    expect(items.map(detailOf)).toEqual([
      "fx_trades",
      "'symbol'",
      "('EURUSD', 'GBPUSD')",
      "no value",
    ])
    expect(
      items.every((item) => item.kind === CompletionItemKind.Variable),
    ).toBe(true)
  })

  it("replaces the @ and the typed prefix when a variable is picked", () => {
    // Given the user typed part of a name
    const text = "SELECT * FROM fx_trades WHERE symbol = @pa"
    const items = complete(text)

    // Then the inserted text covers "@pa" and appends a space
    const pair = items.find((item) => labelOf(item) === "@pair")
    expect(pair?.insertText).toBe("@pair ")
    expect(pair?.range).toEqual({
      startLineNumber: 1,
      endLineNumber: 1,
      startColumn: text.length - 2,
      endColumn: text.length + 1,
    })
  })

  it("offers a variable next to the table its value names", () => {
    // Given a cursor in table position
    const items = complete("SELECT * FROM ")

    // Then @tbl follows fx_trades, filters on the table name, and inserts the reference
    const labels = items.map(labelOf)
    const tableAt = labels.indexOf("fx_trades")
    expect(tableAt).toBeGreaterThanOrEqual(0)
    expect(labels[tableAt + 1]).toBe("@tbl")
    const item = items[tableAt + 1]
    expect(item.filterText).toBe("fx_trades")
    expect(item.insertText).toBe("@tbl ")
    expect(detailOf(item)).toBe("fx_trades")
    expect(item.sortText).toBe(`${items[tableAt].sortText} `)
  })

  it("offers a quoted variable next to the column its value names", () => {
    // Given a cursor in column position
    const items = complete("SELECT * FROM fx_trades WHERE ")

    // Then @col follows symbol because its value is 'symbol'
    const labels = items.map(labelOf)
    const columnAt = labels.indexOf("symbol")
    expect(columnAt).toBeGreaterThanOrEqual(0)
    expect(labels[columnAt + 1]).toBe("@col")
  })

  it("adds nothing for a model that registered no variables", () => {
    // Given the main SQL editor
    const items = complete("SELECT * FROM ", false)
    const afterAt = complete("SELECT * FROM fx_trades WHERE symbol = @", false)

    // Then the suggestions carry no variable items
    expect(items.some((item) => labelOf(item).startsWith("@"))).toBe(false)
    expect(afterAt.some((item) => labelOf(item).startsWith("@"))).toBe(false)
  })
})
