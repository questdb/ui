import { Table } from "../../../../utils"
import * as monaco from "monaco-editor"
import { CompletionItemKind, InformationSchemaColumn } from "./types"
import { editor, IRange } from "monaco-editor"
import IStandaloneCodeEditor = editor.IStandaloneCodeEditor
import { findMatches, getQueryFromCursor } from "../utils"

const getColumnCompletion = (
  column: InformationSchemaColumn,
  range: IRange,
) => ({
  label: {
    label: column.column_name,
    detail: ` (${column.table_name})`,
    description: column.data_type,
  },
  kind: CompletionItemKind.Enum,
  insertText: column.column_name,
  sortText: column.table_name,
  range,
})

export const createSchemaCompletionProvider = (
  editor: IStandaloneCodeEditor,
  tables: Table[] = [],
  informationSchemaColumns: InformationSchemaColumn[] = [],
) => {
  const completionProvider: monaco.languages.CompletionItemProvider = {
    triggerCharacters:
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz "'.split(""),
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)

      const queryAtCursor = getQueryFromCursor(editor)

      let tableContext = ""

      if (queryAtCursor) {
        const matches = findMatches(model, queryAtCursor.query)
        if (matches.length > 0) {
          const cursorMatch = matches.find(
            (m) => m.range.startLineNumber === queryAtCursor.row + 1,
          )

          const tableMatch = queryAtCursor.query.match(/FROM\s+([^ ]+)/)
          if (tableMatch && tableMatch[1]) {
            tableContext = tableMatch[1]
          }

          const textUntilPosition = model.getValueInRange({
            startLineNumber: cursorMatch?.range.startLineNumber ?? 1,
            startColumn: cursorMatch?.range.startColumn ?? 1,
            endLineNumber: position.lineNumber,
            endColumn: word.startColumn,
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

          const openQuote = textUntilPosition.substr(-1) === '"'
          const nextCharQuote = nextChar == '"'

          const tableSuggestions = tables.map((item) => {
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
          })

          if (
            /(FROM|INTO|TABLE|JOIN)\s$/gim.test(textUntilPosition) ||
            (/'$/gim.test(textUntilPosition) &&
              !textUntilPosition.endsWith("= '"))
          ) {
            return {
              suggestions: tableSuggestions,
            }
          }

          if (
            /SELECT.*?(?:,(?:COLUMN )?)?(?:WHERE )?(?: BY )?$/gim.test(
              textUntilPosition,
            )
          ) {
            if (tableContext !== "") {
              return {
                suggestions: informationSchemaColumns
                  .filter((item) => item.table_name === tableContext)
                  .map((item) => getColumnCompletion(item, range)),
              }
            } else {
              return {
                suggestions: [
                  ...informationSchemaColumns.map((item) =>
                    getColumnCompletion(item, range),
                  ),
                  ...tableSuggestions,
                ],
              }
            }
          }
        }
      }
    },
  }

  return completionProvider
}
