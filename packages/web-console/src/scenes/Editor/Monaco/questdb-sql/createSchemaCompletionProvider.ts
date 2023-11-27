import { Table, uniq } from "../../../../utils"
import * as monaco from "monaco-editor"
import { InformationSchemaColumn } from "./types"
import { editor, IRange } from "monaco-editor"
import { languages } from "monaco-editor"
import IStandaloneCodeEditor = editor.IStandaloneCodeEditor
import { findMatches, getQueryFromCursor } from "../utils"
import { operators } from "./operators"
import { dataTypes, functions, keywords } from "@questdb/sql-grammar"

const getLanguageCompletions = (range: IRange) => [
  ...functions.map((qdbFunction) => {
    return {
      label: qdbFunction,
      kind: languages.CompletionItemKind.Function,
      insertText: qdbFunction,
      range,
    }
  }),
  ...dataTypes.map((item) => {
    return {
      label: item,
      kind: languages.CompletionItemKind.Keyword,
      insertText: item,
      range,
    }
  }),
  ...keywords.map((item) => {
    const keyword = item.toUpperCase()
    return {
      label: keyword,
      kind: languages.CompletionItemKind.Keyword,
      insertText: keyword,
      range,
    }
  }),
  ...operators.map((item) => {
    const operator = item.toUpperCase()
    return {
      label: operator,
      kind: languages.CompletionItemKind.Operator,
      insertText: operator.toUpperCase(),
      range,
    }
  }),
]

export const getColumnCompletions = (
  columns: InformationSchemaColumn[],
  range: IRange,
  withTableName?: boolean,
) => {
  // For JOIN ON ... completions, return `table.column` text
  if (withTableName) {
    return columns.map((item) => ({
      label: {
        label: `${item.table_name}.${item.column_name}`,
        detail: "",
        description: item.data_type,
      },
      kind: languages.CompletionItemKind.Enum,
      insertText: `${item.table_name}.${item.column_name}`,
      sortText: "1",
      range,
    }))
    // For everything else, return a list of unique column names.
  } else {
    return uniq(columns.map((item) => item.column_name)).map((columnName) => {
      const tableNames = columns
        .filter((item) => item.column_name === columnName)
        .map((item) => item.table_name)
      return {
        label: {
          label: columnName,
          detail: ` (${tableNames.sort().join(", ")})`,
          // If the column is present in multiple tables, show their list here, otherwise return the column type.
          description:
            tableNames.length > 1
              ? ""
              : columns.find((item) => item.column_name === columnName)
                  ?.data_type,
        },
        kind: languages.CompletionItemKind.Enum,
        insertText: columnName,
        sortText: "1",
        range,
      }
    })
  }
}

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
              sortText: "1",
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
            /(?:(SELECT|UPDATE).*?(?:(?:,(?:COLUMN )?)|(?:ALTER COLUMN ))?(?:WHERE )?(?: BY )?(?: ON )?(?: SET )?$|ALTER COLUMN )/gim.test(
              textUntilPosition,
            ) &&
            position.column !== 1
          ) {
            if (tableContext.length > 0) {
              const withTableName =
                textUntilPosition.match(/\sON\s/gim) !== null
              return {
                suggestions: [
                  ...getColumnCompletions(
                    informationSchemaColumns.filter((item) =>
                      tableContext.includes(item.table_name),
                    ),
                    range,
                    withTableName,
                  ),
                  ...getLanguageCompletions(range),
                ],
              }
            } else {
              return {
                suggestions: [
                  ...getColumnCompletions(informationSchemaColumns, range),
                  ...tableSuggestions,
                  ...getLanguageCompletions(range),
                ],
              }
            }
          }

          if (word.word) {
            return {
              suggestions: [
                ...tableSuggestions,
                ...getLanguageCompletions(range),
              ],
            }
          }
        }
      }
    },
  }

  return completionProvider
}
