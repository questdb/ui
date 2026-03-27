import { Table, InformationSchemaColumn } from "../../../../utils"
import type { languages, IRange } from "monaco-editor"
import { CompletionItemKind, CompletionItemPriority } from "./types"
import {
  createAutocompleteProvider,
  SuggestionKind,
  SuggestionPriority,
  tokenize,
  type SchemaInfo,
  type Suggestion,
} from "@questdb/sql-parser"
import { isCursorInComment, isCursorInQuotedIdentifier } from "../utils"

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

const QUOTABLE_KINDS = new Set([SuggestionKind.Table, SuggestionKind.Column])

// Standalone identifiers must start with a letter or '_', followed by letters, digits, '_' or '$'.
function needsQuoting(name: string): boolean {
  return !/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(name)
}

const UPPERCASE_KINDS = new Set([
  SuggestionKind.Keyword,
  SuggestionKind.Operator,
  SuggestionKind.DataType,
])

const toCompletionItem = (
  suggestion: Suggestion,
  range: languages.CompletionItem["range"],
  isInsideQuotedIdentifier?: boolean,
): languages.CompletionItem => {
  const shouldUppercase = UPPERCASE_KINDS.has(suggestion.kind)
  const label = shouldUppercase
    ? suggestion.label.toUpperCase()
    : suggestion.label
  const insertText = shouldUppercase
    ? suggestion.insertText.toUpperCase()
    : suggestion.insertText

  const isFunction = suggestion.kind === SuggestionKind.Function
  const isQuotable = QUOTABLE_KINDS.has(suggestion.kind)

  // When outside quotes and the identifier contains special characters,
  // wrap it in double quotes so the resulting SQL is valid.
  const shouldAutoQuote =
    !isInsideQuotedIdentifier && isQuotable && needsQuoting(insertText)

  const quotedInsertText = shouldAutoQuote ? '"' + insertText + '"' : insertText

  // Inside a quoted identifier, the range covers content + closing quote,
  // so we append '" ' to close the identifier and add a trailing space.
  const suffix = isFunction
    ? "($0)"
    : isInsideQuotedIdentifier
      ? '"' + " "
      : " "

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
    insertText: quotedInsertText + suffix,
    insertTextRules: isFunction ? 4 : undefined, // CompletionItemInsertTextRule.InsertAsSnippet
    filterText: suggestion.filterText,
    sortText: PRIORITY_MAP[suggestion.priority] + label.toLowerCase(),
    range,
    command: isFunction
      ? undefined
      : {
          id: "editor.action.triggerSuggest",
          title: "Re-trigger suggestions",
        },
  }
}

export const createSchemaCompletionProvider = (
  tables: Table[] = [],
  informationSchemaColumns: Record<string, InformationSchemaColumn[]> = {},
) => {
  // Convert UI schema to parser format and create provider
  const schema = convertToSchemaInfo(tables, informationSchemaColumns)
  const autocompleteProvider = createAutocompleteProvider(schema)

  const completionProvider: languages.CompletionItemProvider = {
    triggerCharacters:
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .":('.split(""),

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

      const openQuoteOffset = isCursorInQuotedIdentifier(
        fullText,
        queryStartOffset,
        cursorOffset,
      )
      const isInsideQuotedIdentifier = openQuoteOffset >= 0

      // When inside a quoted identifier, the parser suppresses suggestions.
      // Work around this by positioning the cursor at the opening " so the
      // parser sees e.g. "SELECT * FROM" and returns table suggestions.
      const relativeCursorOffset = isInsideQuotedIdentifier
        ? openQuoteOffset - queryStartOffset
        : cursorOffset - queryStartOffset

      const suggestions = autocompleteProvider.getSuggestions(
        query,
        relativeCursorOffset,
      )

      // When the "word" at cursor is an operator (e.g. :: from type cast),
      // don't replace it — insert after it instead.
      const isOperatorWord =
        !isInsideQuotedIdentifier &&
        word.word.length > 0 &&
        !/[a-zA-Z0-9_]/.test(word.word[0])

      // When the word contains a dot (qualified reference like "t." or "t.col"),
      // only replace after the last dot. The prefix before the dot is the
      // table/alias qualifier and should be kept. Without this, Monaco filters
      // suggestions against "t." and nothing matches.
      const dotIndex = word.word.lastIndexOf(".")

      let range: IRange

      if (isInsideQuotedIdentifier) {
        // Range covers content between quotes AND the closing quote,
        // so we can replace it all and append '" ' (close quote + space).
        const contentStart = model.getPositionAt(openQuoteOffset + 1)
        const lineContent = model.getLineContent(position.lineNumber)
        const closingIdx = lineContent.indexOf('"', position.column - 1)
        range = {
          startLineNumber: contentStart.lineNumber,
          startColumn: contentStart.column,
          endLineNumber: position.lineNumber,
          // Include the closing " if found, otherwise end at cursor
          endColumn: closingIdx >= 0 ? closingIdx + 2 : position.column,
        }
      } else {
        const startColumn = isOperatorWord
          ? position.column
          : dotIndex >= 0
            ? word.startColumn + dotIndex + 1
            : word.startColumn
        range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn,
          endColumn: word.endColumn,
        }
      }

      // Filter out suggestions that exactly match the word already typed,
      // e.g. don't suggest "FROM" when cursor is right after "FROM".
      const currentWord = isInsideQuotedIdentifier
        ? fullText.substring(openQuoteOffset + 1, cursorOffset)
        : isOperatorWord
          ? ""
          : dotIndex >= 0
            ? word.word.substring(dotIndex + 1)
            : word.word

      const filtered = suggestions.filter(
        (s) => s.insertText.toUpperCase() !== currentWord.toUpperCase(),
      )

      return {
        incomplete: true,
        suggestions: filtered.map((s) =>
          toCompletionItem(s, range, isInsideQuotedIdentifier),
        ),
      }
    },
  }

  return completionProvider
}
