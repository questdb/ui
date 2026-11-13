import { Table, InformationSchemaColumn } from "../../../../utils"
import type { languages, IRange } from "monaco-editor"
import { CompletionItemKind, CompletionItemPriority } from "./types"
import {
  createAutocompleteProvider,
  SuggestionKind,
  SuggestionPriority,
  functions,
  tokenize,
  type SchemaInfo,
  type Suggestion,
} from "@questdb/sql-parser"
import { isCursorInComment } from "../utils"
import {
  getParserQuoteAtCursor,
  maskParserBlockComments,
} from "../../../../utils/parserSql"

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
const FUNCTION_NAMESPACES = new Set(
  functions
    .filter((name) => name.includes("."))
    .map((name) => name.slice(0, name.indexOf("."))),
)

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
  openQuote?: string,
): languages.CompletionItem => {
  const isInsideQuotedIdentifier = openQuote !== undefined
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
  // so we append the matching quote and a trailing space.
  const suffix = isFunction
    ? "($0)"
    : isInsideQuotedIdentifier
      ? openQuote + " "
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

      // Suppress comments and quoted values before requesting parser suggestions.
      if (isCursorInComment(fullText, cursorOffset)) {
        return null
      }

      const quoteContext = getParserQuoteAtCursor(fullText, cursorOffset)
      if (quoteContext?.quote === "'") return null

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
      const parserText = maskParserBlockComments(fullText)
      const tokens = tokenize(parserText).tokens
      const cursorTokens = tokens.filter((t) => t.startOffset < cursorOffset)
      const lastToken = cursorTokens[cursorTokens.length - 1]
      const dotIndexBeforeCursor =
        lastToken?.image === "."
          ? cursorTokens.length - 1
          : cursorTokens.length - 2
      const qualifier = cursorTokens[dotIndexBeforeCursor - 1]

      if (
        !quoteContext &&
        ((lastToken?.tokenType.name === "QuotedIdentifier" &&
          lastToken.endOffset === cursorOffset - 1) ||
          (cursorTokens[dotIndexBeforeCursor]?.image === "." &&
            qualifier?.tokenType.name === "QuotedIdentifier" &&
            FUNCTION_NAMESPACES.has(
              qualifier.image.slice(1, -1).toLowerCase(),
            )))
      ) {
        return null
      }

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
      const query = parserText.substring(queryStartOffset, queryEndOffset)

      const openQuoteOffset = quoteContext?.startOffset ?? -1
      const openQuote = quoteContext?.quote
      const isInsideQuotedIdentifier = openQuoteOffset >= 0
      const quotedPrefix = isInsideQuotedIdentifier
        ? fullText.substring(openQuoteOffset + 1, cursorOffset)
        : ""
      const quotedDotIndex = quotedPrefix.indexOf(".")
      const isQuotedNamespace =
        quotedDotIndex >= 0 &&
        FUNCTION_NAMESPACES.has(
          quotedPrefix.slice(0, quotedDotIndex).toLowerCase(),
        )
      const completionQuery = isQuotedNamespace
        ? query.slice(0, openQuoteOffset - queryStartOffset) + quotedPrefix
        : query

      // When inside a quoted identifier, the parser suppresses suggestions.
      // Work around this by positioning the cursor at the opening " so the
      // parser sees e.g. "SELECT * FROM" and returns table suggestions.
      const relativeCursorOffset = isQuotedNamespace
        ? completionQuery.length
        : isInsideQuotedIdentifier
          ? openQuoteOffset - queryStartOffset
          : cursorOffset - queryStartOffset

      const suggestions = autocompleteProvider.getSuggestions(
        completionQuery,
        relativeCursorOffset,
      )
      const prefix = tokens
        .filter(
          (token) =>
            token.startOffset >= queryStartOffset &&
            token.startOffset < cursorOffset,
        )
        .map((token) => token.image)
        .join(" ")
      const expectsNot =
        /^CREATE\s+(?:ATOMIC\s+)?(?:TABLE|(?:MATERIALIZED\s+|LIVE\s+)?VIEW)\s+IF$/i.test(
          prefix,
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
        const closingIdx = lineContent.indexOf(openQuote!, position.column - 1)
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
        (s) =>
          (!expectsNot || s.insertText.toUpperCase() === "NOT") &&
          (!isInsideQuotedIdentifier ||
            isQuotedNamespace ||
            s.kind !== SuggestionKind.Function) &&
          s.insertText.toUpperCase() !== currentWord.toUpperCase(),
      )

      return {
        incomplete: true,
        suggestions: filtered.map((suggestion) => {
          const isQuotedFunction =
            isQuotedNamespace && suggestion.kind === SuggestionKind.Function
          const replacesNamespace =
            !isInsideQuotedIdentifier &&
            !isOperatorWord &&
            dotIndex >= 0 &&
            suggestion.kind === SuggestionKind.Function &&
            suggestion.insertText.includes(".")
          const item = toCompletionItem(
            suggestion,
            isQuotedFunction
              ? { ...range, startColumn: range.startColumn - 1 }
              : replacesNamespace
                ? { ...range, startColumn: word.startColumn }
                : range,
            isQuotedFunction ? undefined : openQuote,
          )
          if (isQuotedFunction) {
            item.filterText = openQuote + suggestion.insertText
          }
          return item
        }),
      }
    },
  }

  return completionProvider
}
