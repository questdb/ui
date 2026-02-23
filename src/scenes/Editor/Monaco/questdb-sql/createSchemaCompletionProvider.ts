import { Table, InformationSchemaColumn } from "../../../../utils"
import type { editor, languages } from "monaco-editor"
import { CompletionItemKind, CompletionItemPriority } from "./types"
import {
  createAutocompleteProvider,
  SuggestionKind,
  SuggestionPriority,
  tokenize,
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
const UPPERCASE_KINDS = new Set([
  SuggestionKind.Keyword,
  SuggestionKind.Operator,
  SuggestionKind.DataType,
])

const toCompletionItem = (
  suggestion: Suggestion,
  range: languages.CompletionItem["range"],
): languages.CompletionItem => {
  const shouldUppercase = UPPERCASE_KINDS.has(suggestion.kind)
  const label = shouldUppercase
    ? suggestion.label.toUpperCase()
    : suggestion.label
  const insertText = shouldUppercase
    ? suggestion.insertText.toUpperCase()
    : suggestion.insertText

  return {
    label:
      suggestion.detail != null || suggestion.description != null
        ? {
            label,
            detail: suggestion.detail,
            description: suggestion.description,
          }
        : label,
    kind: KIND_MAP[suggestion.kind],
    insertText,
    filterText: suggestion.filterText,
    sortText: PRIORITY_MAP[suggestion.priority],
    range,
  }
}

/**
 * Check if cursor is inside a line comment (--) or block comment.
 * The parser already handles string literals via its own guard,
 * but comments are invisible to the lexer (Lexer.SKIPPED).
 */
function isCursorInComment(text: string, cursorOffset: number): boolean {
  let i = 0
  const end = Math.min(cursorOffset, text.length)
  while (i < end) {
    const ch = text[i]
    const next = text[i + 1]
    // Line comment: -- until end of line
    if (ch === "-" && next === "-") {
      i += 2
      while (i < end && text[i] !== "\n") i++
      if (i >= cursorOffset) return true
      continue
    }
    // Block comment: /* until */
    if (ch === "/" && next === "*") {
      i += 2
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++
      if (i >= cursorOffset) return true
      i += 2 // skip */
      continue
    }
    // Skip over string literals so quotes inside comments don't confuse us
    if (ch === "'") {
      i++
      while (i < text.length && text[i] !== "'") i++
      i++ // skip closing quote
      continue
    }
    i++
  }
  return false
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
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .":'.split(""),

    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const cursorOffset = model.getOffsetAt(position)
      const fullText = model.getValue()

      // Suppress suggestions inside comments (the parser handles strings itself)
      if (isCursorInComment(fullText, cursorOffset)) {
        return null
      }

      const charBeforeCursor =
        cursorOffset > 0 ? fullText[cursorOffset - 1] : ""
      if (charBeforeCursor === "(") {
        return null
      }

      // Extract the current SQL statement for autocomplete by finding the
      // nearest semicolon before the cursor. This is more robust than using
      // the parser's statement splitting (getQueryFromCursor), which can
      // break incomplete SQL into separate statements — e.g., "select * F"
      // gets split into "select *" and "F", losing context for autocomplete.
      const tokens = tokenize(fullText).tokens

      let queryStartOffset = 0
      let queryEndOffset = fullText.length
      for (const token of tokens) {
        const tokenEnd = token.endOffset ?? token.startOffset
        if (token.tokenType.name === "Semicolon") {
          if (tokenEnd < cursorOffset) {
            queryStartOffset = tokenEnd + 1
          } else if (
            token.startOffset >= cursorOffset &&
            queryEndOffset === fullText.length
          ) {
            queryEndOffset = token.startOffset
          }
        }
      }

      // If there are no tokens between the query start and the cursor,
      // the cursor is in dead space (whitespace/comments between statements).
      // Don't suggest anything.
      const hasTokensBeforeCursor = tokens.some(
        (t) =>
          t.startOffset >= queryStartOffset && t.startOffset < cursorOffset,
      )
      if (!hasTokensBeforeCursor) {
        return null
      }

      // Pass the full statement (including text after cursor) so the parser
      // can detect when the cursor is inside a string literal or comment.
      const query = fullText.substring(queryStartOffset, queryEndOffset)

      const relativeCursorOffset = cursorOffset - queryStartOffset

      // Get suggestions from the parser-based provider.
      // Filter out punctuation-only suggestions (e.g. "(", ")", ";") —
      // the parser may suggest structural tokens as the next expected symbol,
      // but autocompleting them causes issues (e.g. accepting "(" via Enter
      // when the user just wants a newline).
      const suggestions = autocompleteProvider
        .getSuggestions(query, relativeCursorOffset)
        .filter((s) => /[a-zA-Z0-9_]/.test(s.insertText))

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
        incomplete: true,
        suggestions: suggestions.map((s) => toCompletionItem(s, range)),
      }
    },
  }

  return completionProvider
}
