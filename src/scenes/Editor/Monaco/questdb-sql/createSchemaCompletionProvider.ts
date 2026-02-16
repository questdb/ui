import { Table, InformationSchemaColumn } from "../../../../utils"
import type { editor, languages } from "monaco-editor"
import { CompletionItemKind, CompletionItemPriority } from "./types"
import { findMatches, getQueryFromCursor } from "../utils"
import {
  createAutocompleteProvider,
  SuggestionKind,
  SuggestionPriority,
  type SchemaInfo,
  type Suggestion,
} from "@questdb/sql-parser"

/**
 * Map parser's SuggestionKind to Monaco's CompletionItemKind
 */
const KIND_MAP: Record<SuggestionKind, CompletionItemKind> = {
  [SuggestionKind.Keyword]: CompletionItemKind.Keyword,
  [SuggestionKind.Function]: CompletionItemKind.Function,
  [SuggestionKind.Table]: CompletionItemKind.Class,
  [SuggestionKind.Column]: CompletionItemKind.Field,
  [SuggestionKind.Operator]: CompletionItemKind.Operator,
  [SuggestionKind.DataType]: CompletionItemKind.TypeParameter,
}

/**
 * Map parser's SuggestionPriority to Monaco's sortText
 */
const PRIORITY_MAP: Record<SuggestionPriority, CompletionItemPriority> = {
  [SuggestionPriority.High]: CompletionItemPriority.High,
  [SuggestionPriority.Medium]: CompletionItemPriority.Medium,
  [SuggestionPriority.MediumLow]: CompletionItemPriority.MediumLow,
  [SuggestionPriority.Low]: CompletionItemPriority.Low,
}

/**
 * Convert UI schema format to parser's SchemaInfo format
 */
const convertToSchemaInfo = (
  tables: Table[],
  informationSchemaColumns: Record<string, InformationSchemaColumn[]>,
): SchemaInfo => ({
  tables: tables.map((t) => ({
    name: t.table_name,
    designatedTimestamp: t.designatedTimestamp,
  })),
  columns: Object.fromEntries(
    Object.entries(informationSchemaColumns).map(([tableName, cols]) => [
      tableName.toLowerCase(),
      cols.map((c) => ({
        name: c.column_name,
        type: c.data_type,
      })),
    ]),
  ),
})

/**
 * Convert parser's Suggestion to Monaco's CompletionItem.
 * For columns, uses CompletionItemLabel to show table names inline
 * and data type on the right side.
 */
const toCompletionItem = (
  suggestion: Suggestion,
  range: languages.CompletionItem["range"],
): languages.CompletionItem => {
  return {
    label:
      suggestion.detail != null || suggestion.description != null
        ? {
            label: suggestion.label,
            detail: suggestion.detail,
            description: suggestion.description,
          }
        : suggestion.label,
    kind: KIND_MAP[suggestion.kind],
    insertText: suggestion.insertText,
    filterText: suggestion.filterText,
    sortText: PRIORITY_MAP[suggestion.priority],
    range,
  }
}

export const createSchemaCompletionProvider = (
  editor: editor.IStandaloneCodeEditor,
  tables: Table[] = [],
  informationSchemaColumns: Record<string, InformationSchemaColumn[]> = {},
) => {
  // Convert UI schema to parser format and create provider
  const schema = convertToSchemaInfo(tables, informationSchemaColumns)
  const autocompleteProvider = createAutocompleteProvider(schema)

  const completionProvider: languages.CompletionItemProvider = {
    triggerCharacters:
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz\n .":'.split(""),

    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)

      // Get text value in the current line
      const textInLine = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })

      const isWhitespaceOnly = /^\s*$/.test(textInLine)
      const isLineComment = /(-- |--|\/\/ |\/\/)$/gim.test(textInLine)

      if (isWhitespaceOnly || isLineComment) {
        return null
      }

      const queryAtCursor = getQueryFromCursor(editor)

      if (queryAtCursor) {
        const matches = findMatches(model, queryAtCursor.query)
        if (matches.length > 0) {
          const cursorMatch = matches.find(
            (m) => m.range.startLineNumber === queryAtCursor.row + 1,
          )

          // Calculate cursor offset within the current query
          const queryStartOffset = model.getOffsetAt({
            lineNumber: cursorMatch?.range.startLineNumber ?? 1,
            column: cursorMatch?.range.startColumn ?? 1,
          })
          const cursorOffset = model.getOffsetAt(position)
          const relativeCursorOffset = cursorOffset - queryStartOffset

          // Get suggestions from the parser-based provider
          const suggestions = autocompleteProvider.getSuggestions(
            queryAtCursor.query,
            relativeCursorOffset,
          )

          // When the "word" at cursor is an operator (e.g. :: from type cast),
          // don't replace it — insert after it instead.
          const isOperatorWord =
            word.word.length > 0 && !/[a-zA-Z0-9_]/.test(word.word[0])

          // When the word contains a dot (qualified reference like "t." or "t.col"),
          // only replace after the last dot. The prefix before the dot is the
          // table/alias qualifier and should be kept. Without this, Monaco filters
          // suggestions against "t." and nothing matches.
          const dotIndex = word.word.lastIndexOf(".")
          const startColumn = isOperatorWord
            ? position.column
            : dotIndex >= 0
              ? word.startColumn + dotIndex + 1
              : word.startColumn

          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn,
            endColumn: word.endColumn,
          }

          return {
            suggestions: suggestions.map((s) => toCompletionItem(s, range)),
          }
        }
      }

      return null
    },
  }

  return completionProvider
}
