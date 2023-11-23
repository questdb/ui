import { Table, uniq } from "../../../../utils"
import * as monaco from "monaco-editor"
import { InformationSchemaColumn } from "./types"
import { editor, IRange } from "monaco-editor"
import { languages } from "monaco-editor"
import IStandaloneCodeEditor = editor.IStandaloneCodeEditor
import { findMatches, getQueryFromCursor } from "../utils"

const getColumnCompletion = (
  column: InformationSchemaColumn,
  range: IRange,
  withTableName?: boolean,
) => ({
  label: {
    label: withTableName
      ? `${column.table_name}.${column.column_name}`
      : column.column_name,
    detail: withTableName ? "" : ` (${column.table_name})`,
    description: column.data_type,
  },
  kind: languages.CompletionItemKind.Enum,
  insertText: withTableName
    ? `${column.table_name}.${column.column_name}`
    : column.column_name,
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
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz\n ."'.split(""),
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)

      const queryAtCursor = getQueryFromCursor(editor)

      let tableContext: string[] = []

      if (queryAtCursor) {
        const matches = findMatches(model, queryAtCursor.query)
        if (matches.length > 0) {
          const cursorMatch = matches.find(
            (m) => m.range.startLineNumber === queryAtCursor.row + 1,
          )

          const fromMatch = queryAtCursor.query.match(/(?<=FROM\s)([^ )]+)/gim)
          const joinMatch = queryAtCursor.query.match(/(JOIN)\s+([^ ]+)/)
          const alterTableMatch = queryAtCursor.query.match(
            /(ALTER TABLE)\s+([^ ]+)/,
          )
          if (fromMatch) {
            tableContext = uniq(fromMatch)
          } else if (alterTableMatch && alterTableMatch[2]) {
            tableContext.push(alterTableMatch[2])
          }
          if (joinMatch && joinMatch[2]) {
            tableContext.push(joinMatch[2])
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
              kind: languages.CompletionItemKind.Class,
              insertText: openQuote
                ? item.table_name + (nextCharQuote ? "" : '"')
                : /^[a-z0-9_]+$/i.test(item.table_name)
                ? item.table_name
                : `"${item.table_name}"`,
              range,
            }
          })

          if (
            /(FROM|INTO|(ALTER|BACKUP|DROP|REINDEX|RENAME|TRUNCATE|VACUUM) TABLE|JOIN|UPDATE)\s$/gim.test(
              textUntilPosition,
            ) ||
            (/'$/gim.test(textUntilPosition) &&
              !textUntilPosition.endsWith("= '"))
          ) {
            return {
              suggestions: tableSuggestions,
            }
          }

          if (
            /(?:SELECT.*?(?:(?:,(?:COLUMN )?)|(?:ALTER COLUMN ))?(?:WHERE )?(?: BY )?(?: ON )?$|ALTER COLUMN )/gim.test(
              textUntilPosition,
            ) &&
            position.column !== 1
          ) {
            if (tableContext.length > 0) {
              const withTableName =
                textUntilPosition.match(/\sON\s/gim) !== null
              return {
                suggestions: informationSchemaColumns
                  .filter((item) => tableContext.includes(item.table_name))
                  .map((item) =>
                    getColumnCompletion(item, range, withTableName),
                  ),
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

          if (word.word) {
            return {
              suggestions: tableSuggestions,
            }
          }
        }
      }
    },
  }

  return completionProvider
}
