import { Table } from "../../../../utils"
import * as monaco from "monaco-editor"
import { CompletionItemKind, InformationSchemaColumn } from "./types"

export const createSchemaCompletionProvider = (
  tables: Table[] = [],
  informationSchemaColumns: InformationSchemaColumn[] = [],
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

      const tableContext = textAfterPosition
        .replace(/FROM /gim, "")
        .replace(" ", "")
        .replace(";", "")

      if (
        word.word ||
        /(FROM|INTO|TABLE)\s$/gim.test(textUntilPosition) ||
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

      if (/SELECT.*(?:,.*)?$/gim.test(textUntilPosition)) {
        if (tableContext !== "") {
          return {
            suggestions: informationSchemaColumns
              .filter((item) => item.table_name === tableContext)
              .map((item) => {
                return {
                  label: {
                    label: item.column_name,
                    detail: ` (${item.data_type})`,
                  },
                  kind: CompletionItemKind.Class,
                  insertText: item.column_name,
                  range,
                }
              }),
          }
        } else {
          return {
            suggestions: informationSchemaColumns.map((item) => {
              return {
                label: {
                  label: item.column_name,
                  detail: ` (${item.table_name}, ${item.data_type})`,
                },
                kind: CompletionItemKind.Class,
                insertText: item.column_name,
                sortText: item.table_name,
                range,
              }
            }),
          }
        }
      }
    },
  }

  return completionProvider
}
