import { describe, it, expect, afterEach } from "vitest"
import "./monacoPolyfill"
import * as monaco from "monaco-editor/esm/vs/editor/editor.api"
import { createSchemaCompletionProvider } from "./createSchemaCompletionProvider"
import type { Table, InformationSchemaColumn } from "../../../../utils"
import type { languages, IRange, CancellationToken } from "monaco-editor"
import { CompletionItemKind } from "./types"
import { conf } from "./conf"

monaco.languages.register({ id: "questdb-sql" })
monaco.languages.setLanguageConfiguration("questdb-sql", conf)

type TestProvider = Omit<
  languages.CompletionItemProvider,
  "provideCompletionItems"
> & {
  provideCompletionItems(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
  ): ReturnType<languages.CompletionItemProvider["provideCompletionItems"]>
}

function wrapProvider(p: languages.CompletionItemProvider): TestProvider {
  const original = p.provideCompletionItems.bind(p)
  return {
    ...p,
    provideCompletionItems: (model, position) =>
      original(
        model,
        position,
        {} as languages.CompletionContext,
        {} as CancellationToken,
      ),
  }
}
const tables = [
  {
    id: 1,
    table_name: "trades",
    partitionBy: "DAY",
    designatedTimestamp: "ts",
    walEnabled: true,
  },
  {
    id: 2,
    table_name: "sensors",
    partitionBy: "DAY",
    designatedTimestamp: "timestamp",
    walEnabled: true,
  },
  {
    id: 3,
    table_name: "quoted-table.1",
    partitionBy: "NONE",
    designatedTimestamp: "",
    walEnabled: false,
  },
  {
    id: 4,
    table_name: "my table",
    partitionBy: "NONE",
    designatedTimestamp: "",
    walEnabled: false,
  },
  {
    id: 5,
    table_name: "123numeric",
    partitionBy: "NONE",
    designatedTimestamp: "",
    walEnabled: false,
  },
  {
    id: 6,
    table_name: "_valid$name",
    partitionBy: "NONE",
    designatedTimestamp: "",
    walEnabled: false,
  },
]

const informationSchemaColumns: Record<string, InformationSchemaColumn[]> = {
  trades: [
    {
      table_name: "trades",
      ordinal_position: 1,
      column_name: "symbol",
      data_type: "SYMBOL",
    },
    {
      table_name: "trades",
      ordinal_position: 2,
      column_name: "price",
      data_type: "DOUBLE",
    },
    {
      table_name: "trades",
      ordinal_position: 3,
      column_name: "ts",
      data_type: "TIMESTAMP",
    },
  ],
  sensors: [
    {
      table_name: "sensors",
      ordinal_position: 1,
      column_name: "temperature",
      data_type: "DOUBLE",
    },
    {
      table_name: "sensors",
      ordinal_position: 2,
      column_name: "timestamp",
      data_type: "TIMESTAMP",
    },
  ],
  "quoted-table.1": [
    {
      table_name: "quoted-table.1",
      ordinal_position: 1,
      column_name: "value",
      data_type: "DOUBLE",
    },
  ],
}

type CompletionResult = languages.CompletionList | null | undefined

const models: monaco.editor.ITextModel[] = []

afterEach(() => {
  models.forEach((m) => m.dispose())
  models.length = 0
})

function createModel(text: string) {
  const model = monaco.editor.createModel(text, "questdb-sql")
  models.push(model)
  return model
}

function getSuggestions(result: CompletionResult): languages.CompletionItem[] {
  return result?.suggestions ?? []
}

function getLabels(result: CompletionResult): string[] {
  return getSuggestions(result).map((s) => {
    if (typeof s.label === "string") return s.label
    return s.label.label
  })
}

function cursorInput(sql: string) {
  const cursorIndex = sql.indexOf("|")
  if (cursorIndex < 0) throw new Error("SQL string must contain a | cursor")
  const text = sql.slice(0, cursorIndex) + sql.slice(cursorIndex + 1)
  const model = createModel(text)
  const position = model.getPositionAt(cursorIndex)
  return { model, position }
}

describe("createSchemaCompletionProvider", () => {
  const provider = wrapProvider(
    createSchemaCompletionProvider(tables as Table[], informationSchemaColumns),
  )

  describe("basic keyword suggestions", () => {
    it("suggests keywords and columns after SELECT", () => {
      const { model, position } = cursorInput("SELECT |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels.length).toBeGreaterThan(0)
    })

    it("suggests FROM after column list", () => {
      const { model, position } = cursorInput("SELECT symbol |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).toContain("FROM")
    })

    it("suggests table names after FROM", () => {
      const { model, position } = cursorInput("SELECT * FROM |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).toContain("trades")
      expect(labels).toContain("sensors")
    })

    it("suggests WHERE after table name", () => {
      const { model, position } = cursorInput("SELECT * FROM trades |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).toContain("WHERE")
    })
  })

  describe("column suggestions", () => {
    it("suggests columns for a table after WHERE", () => {
      const { model, position } = cursorInput("SELECT * FROM trades WHERE |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).toContain("symbol")
      expect(labels).toContain("price")
      expect(labels).toContain("ts")
    })

    it("suggests columns in SELECT clause when table is known", () => {
      const { model, position } = cursorInput("SELECT | FROM trades")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).toContain("symbol")
      expect(labels).toContain("price")
    })
  })

  describe("keyword uppercasing", () => {
    it("uppercases keywords in insertText", () => {
      const { model, position } = cursorInput("SELECT * FROM trades |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const whereItem = items.find((s) => {
        const label = typeof s.label === "string" ? s.label : s.label.label
        return label === "WHERE"
      })
      expect(whereItem).toBeDefined()
      expect(whereItem!.insertText.startsWith("WHERE")).toBe(true)
    })

    it("does not uppercase table names", () => {
      const { model, position } = cursorInput("SELECT * FROM |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const tradesItem = items.find((s) => {
        const label = typeof s.label === "string" ? s.label : s.label.label
        return label === "trades"
      })
      expect(tradesItem).toBeDefined()
      expect(tradesItem!.insertText.startsWith("trades")).toBe(true)
    })
  })

  describe("trailing space / re-trigger", () => {
    it("appends trailing space to keyword insertText", () => {
      const { model, position } = cursorInput("SELECT * FROM trades |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const whereItem = items.find((s) => {
        const label = typeof s.label === "string" ? s.label : s.label.label
        return label === "WHERE"
      })
      expect(whereItem).toBeDefined()
      expect(whereItem!.insertText.endsWith(" ")).toBe(true)
    })

    it("appends trailing space to table insertText", () => {
      const { model, position } = cursorInput("SELECT * FROM |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const tradesItem = items.find((s) => {
        const label = typeof s.label === "string" ? s.label : s.label.label
        return label === "trades"
      })
      expect(tradesItem).toBeDefined()
      expect(tradesItem!.insertText.endsWith(" ")).toBe(true)
    })

    it("sets re-trigger command on non-function items", () => {
      const { model, position } = cursorInput("SELECT * FROM |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const tradesItem = items.find((s) => {
        const label = typeof s.label === "string" ? s.label : s.label.label
        return label === "trades"
      })
      expect(tradesItem?.command?.id).toBe("editor.action.triggerSuggest")
    })
  })

  describe("function suggestions", () => {
    it("appends ($0) snippet to function insertText", () => {
      const { model, position } = cursorInput("SELECT | FROM trades")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const funcItem = items.find((s) => s.kind === CompletionItemKind.Function)
      if (funcItem) {
        expect(funcItem.insertText.endsWith("($0)")).toBe(true)
        // InsertAsSnippet = 4
        expect(funcItem.insertTextRules).toBe(4)
      }
    })

    it("does not set re-trigger command on function items", () => {
      const { model, position } = cursorInput("SELECT | FROM trades")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const funcItem = items.find((s) => s.kind === CompletionItemKind.Function)
      if (funcItem) {
        expect(funcItem.command).toBeUndefined()
      }
    })
  })

  describe("filtering duplicate suggestions", () => {
    it("does not suggest the word already typed", () => {
      const { model, position } = cursorInput("SELECT * FROM trades|")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).not.toContain("trades")
    })

    it("filters case-insensitively", () => {
      const { model, position } = cursorInput("select * from TRADES|")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).not.toContain("trades")
    })
  })

  describe("comment suppression", () => {
    it("returns null when cursor is inside a line comment", () => {
      const { model, position } = cursorInput("SELECT * -- comment |")
      const result = provider.provideCompletionItems(model, position)
      expect(result).toBeNull()
    })

    it("returns null when cursor is inside a block comment", () => {
      const { model, position } = cursorInput("SELECT /* block | */")
      const result = provider.provideCompletionItems(model, position)
      expect(result).toBeNull()
    })

    it("returns suggestions after a block comment ends", () => {
      const { model, position } = cursorInput("SELECT /* comment */ * FROM |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).toContain("trades")
    })
  })

  describe("parenthesis suppression", () => {
    it("returns null when character before cursor is (", () => {
      const { model, position } = cursorInput("SELECT count(|")
      const result = provider.provideCompletionItems(model, position)
      expect(result).toBeNull()
    })
  })

  describe("multi-statement support", () => {
    it("suggests for the current statement only", () => {
      const { model, position } = cursorInput(
        "SELECT * FROM trades; SELECT * FROM |",
      )
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).toContain("trades")
      expect(labels).toContain("sensors")
    })

    it("returns null in dead space between statements", () => {
      const { model, position } = cursorInput(
        "SELECT * FROM trades;   |  SELECT * FROM sensors",
      )
      const result = provider.provideCompletionItems(model, position)
      expect(result).toBeNull()
    })

    it("works with cursor in the first of multiple statements", () => {
      const { model, position } = cursorInput(
        "SELECT * FROM |; SELECT * FROM sensors",
      )
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).toContain("trades")
    })
  })

  describe("multi-line queries", () => {
    it("works across line breaks", () => {
      const { model, position } = cursorInput("SELECT *\nFROM |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).toContain("trades")
    })

    it("handles comment on previous line", () => {
      const { model, position } = cursorInput(
        "-- this is a comment\nSELECT * FROM |",
      )
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).toContain("trades")
    })
  })

  describe("operator word handling", () => {
    it("suggests after :: type cast operator", () => {
      const { model, position } = cursorInput("SELECT price::| FROM trades")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      expect(getSuggestions(result).length).toBeGreaterThan(0)
    })

    it("range starts at cursor position for operator words", () => {
      const { model, position } = cursorInput("SELECT price::| FROM trades")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      if (items.length > 0) {
        const range = items[0].range as IRange
        expect(range.startColumn).toBe(position.column)
      }
    })

    it("uppercases data type suggestions", () => {
      const { model, position } = cursorInput("SELECT price::| FROM trades")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const dataTypeItem = items.find(
        (s) => s.kind === CompletionItemKind.TypeParameter,
      )
      if (dataTypeItem) {
        const label =
          typeof dataTypeItem.label === "string"
            ? dataTypeItem.label
            : dataTypeItem.label.label
        expect(label).toBe(label.toUpperCase())
      }
    })
  })

  describe("dot-qualified references", () => {
    it("suggests columns after table.prefix", () => {
      const { model, position } = cursorInput("SELECT trades.| FROM trades")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).toContain("symbol")
      expect(labels).toContain("price")
      expect(labels).toContain("ts")
    })

    it("filters columns after partial typing", () => {
      const { model, position } = cursorInput("SELECT trades.pr| FROM trades")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).toContain("price")
    })
  })

  describe("quoted identifier support", () => {
    it("suggests table names inside double quotes", () => {
      const { model, position } = cursorInput('SELECT * FROM "q|"')
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).toContain("quoted-table.1")
    })

    it("appends closing quote and space to insertText inside quotes", () => {
      const { model, position } = cursorInput('SELECT * FROM "|"')
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const tableItem = items.find((s) => {
        const label = typeof s.label === "string" ? s.label : s.label.label
        return label === "trades"
      })
      expect(tableItem).toBeDefined()
      expect(tableItem!.insertText.endsWith('" ')).toBe(true)
    })

    it("suggests inside unclosed double quotes", () => {
      const { model, position } = cursorInput('SELECT * FROM "|')
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels.length).toBeGreaterThan(0)
      expect(labels).toContain("trades")
    })

    it("range covers content between quotes and closing quote", () => {
      const text = 'SELECT * FROM "tra"'
      const cursorIndex = text.indexOf("tra") + 2
      const model = createModel(text)
      const position = model.getPositionAt(cursorIndex)
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      if (items.length > 0) {
        const range = items[0].range as IRange
        const openQuote = text.indexOf('"')
        expect(range.startColumn).toBe(openQuote + 2)
        const closingQuote = text.lastIndexOf('"')
        expect(range.endColumn).toBe(closingQuote + 2)
      }
    })

    it("does not trigger inside single-quoted strings", () => {
      const { model, position } = cursorInput("SELECT 'tra|' FROM trades")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const insertTexts = items.map((s) => s.insertText)
      expect(insertTexts.every((t) => !t.endsWith('" '))).toBe(true)
    })

    it("range ends at cursor when quote is unclosed", () => {
      const text = 'SELECT * FROM "tra'
      const model = createModel(text)
      const position = model.getPositionAt(text.length)
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      if (items.length > 0) {
        const range = items[0].range as IRange
        expect(range.endColumn).toBe(position.column)
      }
    })

    it("filters out the already-typed text inside quotes", () => {
      const { model, position } = cursorInput('SELECT * FROM "trades|"')
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).not.toContain("trades")
    })
  })

  describe("sortText and priority", () => {
    it("prefixes sortText with priority code", () => {
      const { model, position } = cursorInput("SELECT * FROM |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      expect(items.length).toBeGreaterThan(0)
      for (const item of items) {
        expect(item.sortText).toMatch(/^[1-5]/)
      }
    })
  })

  describe("CompletionItemLabel with detail/description", () => {
    it("uses CompletionItemLabel when detail is present", () => {
      const { model, position } = cursorInput("SELECT | FROM trades")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const columnItem = items.find((s) => s.kind === CompletionItemKind.Field)
      if (columnItem) {
        expect(typeof columnItem.label).toBe("object")
        const label = columnItem.label as languages.CompletionItemLabel
        expect(label.label).toBeDefined()
      }
    })

    it("uses plain string label when no detail or description", () => {
      const { model, position } = cursorInput("SELECT * FROM trades |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const keywordItem = items.find(
        (s) => s.kind === CompletionItemKind.Keyword,
      )
      if (keywordItem) {
        expect(typeof keywordItem.label).toBe("string")
      }
    })
  })

  describe("completion item kinds", () => {
    it("maps table suggestions to Class kind", () => {
      const { model, position } = cursorInput("SELECT * FROM |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const tableItem = items.find((s) => {
        const label = typeof s.label === "string" ? s.label : s.label.label
        return label === "trades"
      })
      expect(tableItem?.kind).toBe(CompletionItemKind.Class)
    })

    it("maps keyword suggestions to Keyword kind", () => {
      const { model, position } = cursorInput("SELECT * FROM trades |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const whereItem = items.find((s) => {
        const label = typeof s.label === "string" ? s.label : s.label.label
        return label === "WHERE"
      })
      expect(whereItem?.kind).toBe(CompletionItemKind.Keyword)
    })

    it("maps column suggestions to Field kind", () => {
      const { model, position } = cursorInput("SELECT | FROM trades")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const colItem = items.find((s) => {
        const label = typeof s.label === "string" ? s.label : s.label.label
        return label === "symbol"
      })
      expect(colItem?.kind).toBe(CompletionItemKind.Field)
    })
  })

  describe("incomplete flag", () => {
    it("marks result as incomplete", () => {
      const { model, position } = cursorInput("SELECT * FROM |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      expect(result?.incomplete).toBe(true)
    })
  })

  describe("range calculation", () => {
    it("range starts at word start for partial typing", () => {
      const { model, position } = cursorInput("SELECT * FROM tra|")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      if (items.length > 0) {
        const range = items[0].range as IRange
        expect(range.startColumn).toBe(15)
        expect(range.endColumn).toBe(18)
      }
    })

    it("range covers only after dot for qualified refs", () => {
      const { model, position } = cursorInput("SELECT trades.pr| FROM trades")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      if (items.length > 0) {
        const range = items[0].range as IRange
        const dotPos = "SELECT trades.".length
        expect(range.startColumn).toBe(dotPos + 1)
      }
    })
  })

  describe("trigger characters", () => {
    it("includes letters, space, dot, quote, colon, and open paren", () => {
      const triggerChars = provider.triggerCharacters!
      expect(triggerChars).toContain(" ")
      expect(triggerChars).toContain(".")
      expect(triggerChars).toContain('"')
      expect(triggerChars).toContain(":")
      expect(triggerChars).toContain("(")
      expect(triggerChars).toContain("a")
      expect(triggerChars).toContain("Z")
    })
  })

  describe("empty schema", () => {
    it("works with no tables or columns", () => {
      const emptyProvider = wrapProvider(createSchemaCompletionProvider([], {}))
      const { model, position } = cursorInput("SELECT |")
      const result = emptyProvider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels.length).toBeGreaterThan(0)
    })
  })

  describe("edge cases", () => {
    it("handles cursor at the very beginning", () => {
      const { model, position } = cursorInput("|SELECT * FROM trades")
      const result = provider.provideCompletionItems(model, position)
      expect(result).toBeNull()
    })

    it("handles empty text", () => {
      const { model, position } = cursorInput("|")
      const result = provider.provideCompletionItems(model, position)
      expect(result).toBeNull()
    })

    it("handles cursor right after semicolon with no following tokens", () => {
      const { model, position } = cursorInput("SELECT * FROM trades;|")
      const result = provider.provideCompletionItems(model, position)
      expect(result).toBeNull()
    })

    it("works with multiple line breaks", () => {
      const { model, position } = cursorInput("SELECT\n  *\nFROM\n  |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).toContain("trades")
    })

    it("handles cursor in whitespace after a keyword", () => {
      const { model, position } = cursorInput("SELECT  |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      expect(getSuggestions(result).length).toBeGreaterThan(0)
    })

    it("handles three statements with cursor in the middle one", () => {
      const { model, position } = cursorInput(
        "SELECT 1; SELECT * FROM |; SELECT 2",
      )
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).toContain("trades")
    })

    it("handles comment between semicolons", () => {
      const { model, position } = cursorInput(
        "SELECT 1; -- comment\nSELECT * FROM |",
      )
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const labels = getLabels(result)
      expect(labels).toContain("trades")
    })

    it("does not suggest inside block comment spanning multiple lines", () => {
      const { model, position } = cursorInput(
        "SELECT * FROM /*\n  |  \n*/ trades",
      )
      const result = provider.provideCompletionItems(model, position)
      expect(result).toBeNull()
    })

    it("uses default empty arrays when called with no arguments", () => {
      const defaultProvider = wrapProvider(createSchemaCompletionProvider())
      const { model, position } = cursorInput("SELECT |")
      const result = defaultProvider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      expect(getSuggestions(result).length).toBeGreaterThan(0)
    })
  })

  describe("auto-quoting identifiers with special characters", () => {
    it("wraps table names with special chars in double quotes", () => {
      const { model, position } = cursorInput("SELECT * FROM |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const specialItem = items.find((s) => {
        const label = typeof s.label === "string" ? s.label : s.label.label
        return label === "quoted-table.1"
      })
      expect(specialItem).toBeDefined()
      expect(specialItem!.insertText).toBe('"quoted-table.1" ')
    })

    it("wraps table names with spaces in double quotes", () => {
      const { model, position } = cursorInput("SELECT * FROM |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const spaceItem = items.find((s) => {
        const label = typeof s.label === "string" ? s.label : s.label.label
        return label === "my table"
      })
      expect(spaceItem).toBeDefined()
      expect(spaceItem!.insertText).toBe('"my table" ')
    })

    it("does not quote normal identifiers", () => {
      const { model, position } = cursorInput("SELECT * FROM |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const tradesItem = items.find((s) => {
        const label = typeof s.label === "string" ? s.label : s.label.label
        return label === "trades"
      })
      expect(tradesItem).toBeDefined()
      expect(tradesItem!.insertText).toBe("trades ")
    })

    it("does not double-quote when already inside a quoted identifier", () => {
      const { model, position } = cursorInput('SELECT * FROM "|"')
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const specialItem = items.find((s) => {
        const label = typeof s.label === "string" ? s.label : s.label.label
        return label === "quoted-table.1"
      })
      expect(specialItem).toBeDefined()
      // Inside quotes: just the name + closing quote + space, no extra wrapping
      expect(specialItem!.insertText).toBe('quoted-table.1" ')
    })

    it("does not quote keywords", () => {
      const { model, position } = cursorInput("SELECT * FROM trades |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const whereItem = items.find((s) => {
        const label = typeof s.label === "string" ? s.label : s.label.label
        return label === "WHERE"
      })
      expect(whereItem).toBeDefined()
      expect(whereItem!.insertText).toBe("WHERE ")
    })

    it("quotes identifiers starting with a digit", () => {
      const { model, position } = cursorInput("SELECT * FROM |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const numericItem = items.find((s) => {
        const label = typeof s.label === "string" ? s.label : s.label.label
        return label === "123numeric"
      })
      expect(numericItem).toBeDefined()
      expect(numericItem!.insertText).toBe('"123numeric" ')
    })

    it("does not quote identifiers with only valid chars (underscore, dollar, alphanumeric)", () => {
      const { model, position } = cursorInput("SELECT * FROM |")
      const result = provider.provideCompletionItems(
        model,
        position,
      ) as CompletionResult
      const items = getSuggestions(result)
      const validItem = items.find((s) => {
        const label = typeof s.label === "string" ? s.label : s.label.label
        return label === "_valid$name"
      })
      expect(validItem).toBeDefined()
      expect(validItem!.insertText).toBe("_valid$name ")
    })
  })
})
