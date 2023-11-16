import { Table } from "../../../../utils"
import * as monaco from "monaco-editor"
import { CompletionItemKind, Column } from "./types"

export const createSchemaCompletionProvider = (
  tables: Table[] = [],
  informationSchemaColumns: Column[] = [],
) => {
  const completionProvider: monaco.languages.CompletionItemProvider = {
    triggerCharacters:
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz "'.split(""),
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)

      const textUntilPosition = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: word.startColumn,
      })

      const textAfterPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: word.endColumn,
        endLineNumber: position.lineNumber,
        endColumn: model.getLineMaxColumn(position.lineNumber),
      })

      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      const nextChar = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: word.endColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn + 1,
      })

      if (/SELECT\s$/gim.test(textUntilPosition)) {
        if (/ FROM \S*$/gim.test(textAfterPosition)) {
          console.log("columns from table")
        } else {
          console.log("all column")
        }
      }

      if (
        word.word ||
        /(FROM|INTO|TABLE) $/gim.test(textUntilPosition) ||
        (/'$/gim.test(textUntilPosition) && !textUntilPosition.endsWith("= '"))
      ) {
        const openQuote = textUntilPosition.substr(-1) === '"'
        const nextCharQuote = nextChar == '"'
        return {
          suggestions: tables.map((item) => {
            return {
              label: item.table_name,
              kind: CompletionItemKind.Class,
              insertText: openQuote
                ? item.table_name + (nextCharQuote ? "" : '"')
                : /^[a-z0-9_]+$/i.test(item.table_name)
                ? item.table_name
                : `"${item.table_name}"`,
              range,
            }
          }),
        }
      }
    },
  }

  return completionProvider
}
