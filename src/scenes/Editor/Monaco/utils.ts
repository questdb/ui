/*******************************************************************************
 *     ___                  _   ____  ____
 *    / _ \ _   _  ___  ___| |_|  _ \| __ )
 *   | | | | | | |/ _ \/ __| __| | | |  _ \
 *   | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *    \__\_\\__,_|\___||___/\__|____/|____/
 *
 *  Copyright (c) 2014-2019 Appsicle
 *  Copyright (c) 2019-2022 QuestDB
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 ******************************************************************************/
import type { editor, IPosition, IRange } from "monaco-editor"
import type { Monaco } from "@monaco-editor/react"
import type { ErrorResult } from "../../../utils"
import { hashString } from "../../../utils"
import { parse } from "@questdb/sql-parser"

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor
type ITextModel = editor.ITextModel

export const QuestDBLanguageName: string = "questdb-sql"

export type QueryKey = `${string}@${number}-${number}`

export type Request = Readonly<{
  query: string
  row: number
  column: number
  endRow: number
  endColumn: number
  selection?: {
    startOffset: number
    endOffset: number
    queryText: string
  }
}>

type SqlTextItem = {
  row: number
  col: number
  position: number
  endRow: number
  endCol: number
  limit: number
}

export const stripSQLComments = (text: string): string =>
  text.replace(/(?<!["'`])(--\s?.*$)/gm, (match, group: string) => {
    if (group) {
      const groupLines = group.split("\n")
      if (group.startsWith("--") && groupLines.length > 1) {
        return "\n" + stripSQLComments(groupLines[1])
      }
      return ""
    }
    return match
  })

export const getSelectedText = (
  editor: IStandaloneCodeEditor,
): string | undefined => {
  const model = editor.getModel()
  const selection = editor.getSelection()
  return model && selection ? model.getValueInRange(selection) : undefined
}

export const getQueriesToRun = (
  editor: IStandaloneCodeEditor,
  queryOffsets: { startOffset: number; endOffset: number }[],
  bufferId?: number,
): Request[] => {
  const model = editor.getModel()
  if (!model) return []

  const selection = editor.getSelection()
  const selectedText = selection ? model.getValueInRange(selection) : undefined
  if (!selection || !selectedText) {
    const queryInCursor = getQueryFromCursor(editor, bufferId)
    if (queryInCursor) {
      return [queryInCursor]
    }
    return []
  }
  let selectionStartOffset = model.getOffsetAt(selection.getStartPosition())
  let selectionEndOffset = model.getOffsetAt(selection.getEndPosition())

  const normalizedSelectedText = normalizeQueryText(selectedText)

  if (stripSQLComments(normalizedSelectedText).length > 0) {
    selectionStartOffset += selectedText.indexOf(normalizedSelectedText)
    selectionEndOffset = selectionStartOffset + normalizedSelectedText.length
  }

  const firstQueryOffsets = queryOffsets.find(
    (offset) => offset.endOffset >= selectionStartOffset,
  )
  const lastQueryOffsets = queryOffsets
    .filter((offset) => offset.startOffset <= selectionEndOffset)
    .pop()

  if (!firstQueryOffsets || !lastQueryOffsets) {
    return []
  }

  const queries = getQueriesInRange(
    editor,
    model.getPositionAt(firstQueryOffsets.startOffset),
    model.getPositionAt(lastQueryOffsets.endOffset),
    bufferId,
  )
  const requests = queries.map((query) => {
    const clampedSelection = clampRange(model, selection, {
      startOffset: model.getOffsetAt({
        lineNumber: query.row + 1,
        column: query.column,
      }),
      endOffset: model.getOffsetAt({
        lineNumber: query.endRow + 1,
        column: query.endColumn,
      }),
    })
    const clampedSelectionText = model.getValueInRange(clampedSelection)
    return stripSQLComments(normalizeQueryText(clampedSelectionText))
      ? {
          query: query.query,
          row: query.row,
          column: query.column,
          endRow: query.endRow,
          endColumn: query.endColumn,
          selection: {
            startOffset: model.getOffsetAt({
              lineNumber: clampedSelection.startLineNumber,
              column: clampedSelection.startColumn,
            }),
            endOffset: model.getOffsetAt({
              lineNumber: clampedSelection.endLineNumber,
              column: clampedSelection.endColumn,
            }),
            queryText: clampedSelectionText,
          },
        }
      : undefined
  })
  return requests.filter(Boolean) as Request[]
}

type CSTNode = {
  children?: Record<string, CSTNode[]>
  image?: string
  startOffset?: number
  endOffset?: number
  startLine?: number
  endLine?: number
  startColumn?: number
  endColumn?: number
}

type StatementBoundary = {
  startOffset: number
  endOffset: number
}

let _boundariesCache: {
  bufferId: number
  version: number
  rangeKey: string
  boundaries: StatementBoundary[]
} | null = null

const getTokenBoundaries = (
  node: CSTNode,
): { first: CSTNode | null; last: CSTNode | null } => {
  if (!node || typeof node !== "object") return { first: null, last: null }
  if (node.image !== undefined && node.startOffset !== undefined) {
    return { first: node, last: node }
  }
  if (node.children) {
    let earliest: CSTNode | null = null
    let latest: CSTNode | null = null
    for (const key of Object.keys(node.children)) {
      const children = node.children[key]
      if (Array.isArray(children)) {
        for (const child of children) {
          const { first, last } = getTokenBoundaries(child)
          if (
            first &&
            (earliest === null || first.startOffset! < earliest.startOffset!)
          ) {
            earliest = first
          }
          if (
            last &&
            (latest === null || last.endOffset! > latest.endOffset!)
          ) {
            latest = last
          }
        }
      }
    }
    return { first: earliest, last: latest }
  }
  return { first: null, last: null }
}

/**
 * Extract statement boundaries from a parse result (with recovery enabled).
 *
 * The parser uses Chevrotain's error recovery (`recoveryEnabled: true`),
 * which means it can produce a partial CST even when some statements have
 * syntax errors. Failed statements are marked with `recoveredNode: true`.
 *
 * This function:
 * 1. Extracts boundaries from each CST statement node
 * 2. Merges consecutive recovered (error) nodes into a single statement
 * 3. Extends recovered regions to cover any tokens skipped during re-sync
 */
const extractStatements = (
  text: string,
  result: ReturnType<typeof parse>,
): StatementBoundary[] => {
  const stmts: (CSTNode & { recoveredNode?: boolean })[] =
    (result.cst as CSTNode)?.children?.statement ?? []

  if (stmts.length === 0) return []

  // Extract raw boundaries with recovery flag
  const raw = stmts
    .map((stmt) => {
      const { first, last } = getTokenBoundaries(stmt)
      if (first && last) {
        return {
          startOffset: first.startOffset!,
          endOffset: last.endOffset ?? last.startOffset!,
          recovered: !!stmt.recoveredNode,
        }
      }
      return null
    })
    .filter(
      (
        s,
      ): s is { startOffset: number; endOffset: number; recovered: boolean } =>
        s !== null,
    )

  if (raw.length === 0) return []

  // Merge consecutive recovered nodes and fill gaps to next clean statement
  const merged: StatementBoundary[] = []
  let i = 0
  while (i < raw.length) {
    if (!raw[i].recovered) {
      merged.push(raw[i])
      i++
    } else {
      // Merge consecutive recovered nodes
      const startOffset = raw[i].startOffset
      let endOffset = raw[i].endOffset

      while (i + 1 < raw.length && raw[i + 1].recovered) {
        i++
        endOffset = Math.max(endOffset, raw[i].endOffset)
      }

      // Extend to cover gap before next clean statement
      if (i + 1 < raw.length) {
        const gapEnd = raw[i + 1].startOffset - 1
        if (gapEnd > endOffset) {
          // Trim trailing whitespace from the gap
          let trimEnd = gapEnd
          while (trimEnd > endOffset && /\s/.test(text[trimEnd])) {
            trimEnd--
          }
          if (trimEnd > endOffset) {
            endOffset = trimEnd
          }
        }
      }

      merged.push({ startOffset, endOffset })
      i++
    }
  }

  return merged
}

/**
 * Get all statement boundaries from text using the parser with error recovery.
 *
 * The parser uses Chevrotain's built-in error recovery, which means:
 * - Valid SQL: statements are extracted directly from the CST
 * - Invalid SQL: the parser recovers by skipping bad tokens and continues,
 *   producing a partial CST with `recoveredNode` markers
 *
 * No hardcoded keyword lists or manual splitting heuristics needed.
 */
type ParseRange = { startOffset: number; endOffset: number }

export const computeParseRange = (
  editor: IStandaloneCodeEditor,
): ParseRange | null => {
  const model = editor.getModel()
  if (!model) return null

  const visibleRanges = editor.getVisibleRanges()
  if (visibleRanges.length === 0) return null

  const totalLines = model.getLineCount()
  const startLine = Math.max(1, visibleRanges[0].startLineNumber - 500)
  const endLine = Math.min(totalLines, visibleRanges[0].endLineNumber + 500)
  return {
    startOffset: model.getOffsetAt({ lineNumber: startLine, column: 1 }),
    endOffset: model.getOffsetAt({
      lineNumber: endLine,
      column: model.getLineMaxColumn(endLine),
    }),
  }
}

const getStatementBoundariesForRange = (
  text: string,
  startOffset: number,
  endOffset: number,
): StatementBoundary[] => {
  const substring = text.substring(startOffset, endOffset)
  if (!substring.trim()) return []

  const atDocStart = startOffset === 0
  const atDocEnd = endOffset >= text.length

  const raw = extractStatements(substring, parse(substring))

  // Shift offsets to be document-relative and drop recovered edge statements
  const shifted: StatementBoundary[] = []
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i]
    const touchesStart = b.startOffset === 0
    const touchesEnd = b.endOffset >= substring.length - 1

    // Drop statements that touch a cut edge (not at document boundary)
    // and are the first/last statement — these are likely truncated
    if (touchesStart && !atDocStart && i === 0) {
      continue
    }
    if (touchesEnd && !atDocEnd && i === raw.length - 1) {
      continue
    }

    shifted.push({
      startOffset: b.startOffset + startOffset,
      endOffset: b.endOffset + startOffset,
    })
  }

  return shifted
}

const getStatementBoundaries = (
  text: string,
  parseRange?: ParseRange | null,
  modelVersion?: number,
  bufferId?: number,
): StatementBoundary[] => {
  if (!text.trim()) return []

  const rangeKey = parseRange
    ? `${parseRange.startOffset}-${parseRange.endOffset}`
    : "full"

  if (
    modelVersion !== undefined &&
    bufferId !== undefined &&
    _boundariesCache &&
    _boundariesCache.bufferId === bufferId &&
    _boundariesCache.version === modelVersion &&
    _boundariesCache.rangeKey === rangeKey
  ) {
    return _boundariesCache.boundaries
  }

  // Viewport-scoped parsing
  let boundaries: StatementBoundary[]
  if (parseRange) {
    boundaries = getStatementBoundariesForRange(
      text,
      parseRange.startOffset,
      parseRange.endOffset,
    )
  } else {
    // Full parse (fallback when no viewport is set)
    boundaries = extractStatements(text, parse(text))
  }

  if (modelVersion !== undefined && bufferId !== undefined) {
    _boundariesCache = { bufferId, version: modelVersion, rangeKey, boundaries }
  }

  return boundaries
}

/**
 * Identify queries in text using the parser, splitting them relative to a cursor position.
 *
 * @param model - Monaco text model (used for offset↔position conversions)
 * @param position - Cursor position (0-based row, 1-based column)
 * @param start - Optional start position to filter from (0-based row, 1-based column)
 */
export const getQueriesFromModel = (
  model: ITextModel,
  position: { row: number; column: number },
  start?: { row: number; column: number },
  parseRange?: ParseRange | null,
  bufferId?: number,
): { sqlTextStack: SqlTextItem[]; nextSql: SqlTextItem | null } => {
  const text = model.getValue()
  if (!text.trim()) {
    return { sqlTextStack: [], nextSql: null }
  }

  // Get all statement boundaries from the parser (cached by model version + buffer id)
  const boundaries = getStatementBoundaries(
    text,
    parseRange,
    model.getVersionId(),
    bufferId,
  )

  if (boundaries.length === 0) {
    return { sqlTextStack: [], nextSql: null }
  }

  // Convert cursor position to offset (row is 0-based, lineNumber is 1-based)
  const cursorOffset = model.getOffsetAt({
    lineNumber: position.row + 1,
    column: position.column,
  })

  // Convert start position to offset (if provided)
  let startOffset = 0
  if (start) {
    startOffset = model.getOffsetAt({
      lineNumber: start.row + 1,
      column: start.column,
    })
  }

  // Convert boundaries to SqlTextItems, filtering by start position
  const items: SqlTextItem[] = boundaries
    .filter((b) => b.endOffset >= startOffset)
    .map((b) => {
      const startPos = model.getPositionAt(b.startOffset)
      const endPos = model.getPositionAt(b.endOffset)
      return {
        row: startPos.lineNumber - 1,
        col: startPos.column,
        position: b.startOffset,
        endRow: endPos.lineNumber - 1,
        endCol: endPos.column,
        limit: b.endOffset + 1, // limit is exclusive (for text.substring)
      }
    })
    .filter(
      (item) =>
        item.row !== item.endRow ||
        item.col !== item.endCol ||
        item.limit >= item.position + 1,
    )

  // Split into sqlTextStack (before cursor) and nextSql (at/after cursor).
  //
  // - Queries whose end is strictly before the cursor go into sqlTextStack
  // - The first query that the cursor is within or on goes into nextSql
  // - If the cursor is past all queries, the last query becomes nextSql

  let nextSqlIndex = -1
  for (let i = 0; i < items.length; i++) {
    if (cursorOffset < items[i].limit) {
      nextSqlIndex = i
      break
    }
  }

  // If no query contains/follows cursor, the last query is nextSql
  if (nextSqlIndex === -1 && items.length > 0) {
    nextSqlIndex = items.length - 1
  }

  const sqlTextStack = nextSqlIndex > 0 ? items.slice(0, nextSqlIndex) : []
  const nextSql = nextSqlIndex >= 0 ? items[nextSqlIndex] : null

  return { sqlTextStack, nextSql }
}

export const getQueriesFromPosition = (
  editor: IStandaloneCodeEditor,
  editorPosition: IPosition,
  startPosition?: IPosition,
  bufferId?: number,
): { sqlTextStack: SqlTextItem[]; nextSql: SqlTextItem | null } => {
  const model = editor.getModel()
  if (!model) {
    return { sqlTextStack: [], nextSql: null }
  }

  const position = {
    row: editorPosition.lineNumber - 1,
    column: editorPosition.column,
  }

  const start = startPosition
    ? { row: startPosition.lineNumber - 1, column: startPosition.column }
    : undefined

  return getQueriesFromModel(
    model,
    position,
    start,
    computeParseRange(editor),
    bufferId,
  )
}

export const getQueryFromCursor = (
  editor: IStandaloneCodeEditor,
  bufferId?: number,
): Request | undefined => {
  const position = editor.getPosition()
  const text = editor.getValue({ preserveBOM: false, lineEnding: "\n" })

  if (!text.trim() || !position) {
    return
  }

  const { sqlTextStack, nextSql } = getQueriesFromPosition(
    editor,
    position,
    undefined,
    bufferId,
  )

  const normalizedCurrentRow = position.lineNumber - 1
  const lastStackItem =
    sqlTextStack.length > 0 ? sqlTextStack[sqlTextStack.length - 1] : null

  const lastStackItemRowRange = lastStackItem
    ? {
        start: lastStackItem.row,
        end: lastStackItem.endRow,
      }
    : null
  const nextSqlRowRange = nextSql
    ? {
        start: nextSql.row,
        end: nextSql.endRow,
      }
    : null
  const isInLastStackItemRowRange =
    lastStackItemRowRange &&
    normalizedCurrentRow >= lastStackItemRowRange.start &&
    normalizedCurrentRow <= lastStackItemRowRange.end
  const isInNextSqlRowRange =
    nextSqlRowRange &&
    normalizedCurrentRow >= nextSqlRowRange.start &&
    normalizedCurrentRow <= nextSqlRowRange.end

  if (isInLastStackItemRowRange && !isInNextSqlRowRange) {
    return {
      query: text.substring(lastStackItem!.position, lastStackItem!.limit),
      row: lastStackItem!.row,
      column: lastStackItem!.col,
      endRow: lastStackItem!.endRow,
      endColumn: lastStackItem!.endCol,
    }
  } else if (isInNextSqlRowRange && !isInLastStackItemRowRange) {
    return {
      query: text.substring(nextSql!.position, nextSql!.limit),
      row: nextSql!.row,
      column: nextSql!.col,
      endRow: nextSql!.endRow,
      endColumn: nextSql!.endCol,
    }
  } else if (isInLastStackItemRowRange && isInNextSqlRowRange) {
    const nextSqlStartCol = nextSql!.col
    const normalizedCurrentCol = position.column
    if (normalizedCurrentCol >= nextSqlStartCol) {
      return {
        query: text.substring(nextSql!.position, nextSql!.limit),
        row: nextSql!.row,
        column: nextSql!.col,
        endRow: nextSql!.endRow,
        endColumn: nextSql!.endCol,
      }
    }
    return {
      query: text.substring(lastStackItem!.position, lastStackItem!.limit),
      row: lastStackItem!.row,
      column: lastStackItem!.col,
      endRow: lastStackItem!.endRow,
      endColumn: lastStackItem!.endCol,
    }
  }
}

export const getAllQueries = (
  editor: IStandaloneCodeEditor,
  bufferId?: number,
): Request[] => {
  const model = editor.getModel()
  const position = getLastPosition(editor)
  const text = editor.getValue({ preserveBOM: false, lineEnding: "\n" })

  if (!model || !text.trim() || !position) {
    return []
  }

  // Full document parse — no viewport scoping
  const { sqlTextStack, nextSql } = getQueriesFromModel(
    model,
    { row: position.lineNumber - 1, column: position.column },
    undefined,
    null,
    bufferId,
  )
  const stackQueries = sqlTextStack.map((item) => ({
    query: text.substring(item.position, item.limit),
    row: item.row,
    column: item.col,
    endRow: item.endRow,
    endColumn: item.endCol,
  }))
  const nextSqlQuery = nextSql
    ? {
        query: text.substring(nextSql.position, nextSql.limit),
        row: nextSql.row,
        column: nextSql.col,
        endRow: nextSql.endRow,
        endColumn: nextSql.endCol,
      }
    : null
  return [...stackQueries, ...(nextSqlQuery ? [nextSqlQuery] : [])]
}

export const getQueriesInRange = (
  editor: IStandaloneCodeEditor,
  startPosition: IPosition,
  endPosition: IPosition,
  bufferId?: number,
): Request[] => {
  const text = editor.getValue({ preserveBOM: false, lineEnding: "\n" })
  if (!text.trim() || !startPosition || !endPosition) {
    return []
  }

  const { sqlTextStack, nextSql } = getQueriesFromPosition(
    editor,
    endPosition,
    startPosition,
    bufferId,
  )

  const stackQueries = sqlTextStack.map((item) => ({
    query: text.substring(item.position, item.limit),
    row: item.row,
    column: item.col,
    endRow: item.endRow,
    endColumn: item.endCol,
  }))

  const nextSqlQuery = nextSql
    ? {
        query: text.substring(nextSql.position, nextSql.limit),
        row: nextSql.row,
        column: nextSql.col,
        endRow: nextSql.endRow,
        endColumn: nextSql.endCol,
      }
    : null

  return [...stackQueries, ...(nextSqlQuery ? [nextSqlQuery] : [])]
}

export const getQueriesStartingFromLine = (
  editor: IStandaloneCodeEditor,
  lineNumber: number,
  queryOffsets: { startOffset: number; endOffset: number }[],
): Request[] => {
  const model = editor.getModel()
  if (!model || !queryOffsets) return []

  const queries: Request[] = []

  for (const offset of queryOffsets) {
    const startPosition = model.getPositionAt(offset.startOffset)
    if (startPosition.lineNumber === lineNumber) {
      const endPosition = model.getPositionAt(offset.endOffset)
      const queryText = model.getValueInRange({
        startLineNumber: startPosition.lineNumber,
        startColumn: startPosition.column,
        endLineNumber: endPosition.lineNumber,
        endColumn: endPosition.column + 1,
      })

      queries.push({
        query: queryText,
        row: startPosition.lineNumber - 1,
        column: startPosition.column,
        endRow: endPosition.lineNumber - 1,
        endColumn: endPosition.column,
      })
    }
  }

  return queries
}

export const getQueryFromSelection = (
  editor: IStandaloneCodeEditor,
  bufferId?: number,
): Request | undefined => {
  const model = editor.getModel()
  if (!model) return

  const selection = editor.getSelection()
  const selectedText = getSelectedText(editor)

  if (selection && selectedText) {
    let selectionStartOffset = model.getOffsetAt(selection.getStartPosition())
    let selectionEndOffset = model.getOffsetAt(selection.getEndPosition())

    const normalizedSelectedText = normalizeQueryText(selectedText)

    if (stripSQLComments(normalizedSelectedText).length > 0) {
      selectionStartOffset += selectedText.indexOf(normalizedSelectedText)
      selectionEndOffset = selectionStartOffset + normalizedSelectedText.length
      const startPos = model.getPositionAt(selectionStartOffset)
      const endPos = model.getPositionAt(selectionEndOffset)
      editor.setSelection({
        startLineNumber: startPos.lineNumber,
        endLineNumber: endPos.lineNumber,
        startColumn: startPos.column,
        endColumn: endPos.column,
      })
      const parentQuery = getQueryFromCursor(editor, bufferId)
      if (parentQuery) {
        return {
          ...parentQuery,
          selection: {
            startOffset: selectionStartOffset,
            endOffset: selectionEndOffset,
            queryText: normalizedSelectedText,
          },
        }
      }
    }
  }
}

export const getQueryRequestFromEditor = (
  editor: IStandaloneCodeEditor,
  bufferId?: number,
): Request | undefined => {
  let request: Request | undefined
  const selectedText = getSelectedText(editor)
  const strippedNormalizedSelectedText = selectedText
    ? stripSQLComments(normalizeQueryText(selectedText))
    : undefined

  if (strippedNormalizedSelectedText) {
    request = getQueryFromSelection(editor, bufferId)
  } else {
    request = getQueryFromCursor(editor, bufferId)
  }

  if (!request) return

  let normalizedRequest: Request | undefined

  if (request.selection) {
    normalizedRequest = {
      ...request,
      selection: {
        ...request.selection,
        queryText: normalizeQueryText(request.selection.queryText),
      },
    }
  } else {
    normalizedRequest = {
      ...request,
      query: normalizeQueryText(request.query),
    }
  }

  return normalizedRequest
}

export const getQueryRequestFromLastExecutedQuery = (
  query: string,
): Request | undefined => {
  return {
    query,
    row: 0,
    column: 1,
    endRow: 0,
    endColumn: 1,
  }
}

// Creates a Request from an AI suggestion, using the original query's start offset
// so that the queryKey matches the original query position in the editor
export const getQueryRequestFromAISuggestion = (
  editor: IStandaloneCodeEditor,
  aiSuggestion: { query: string; startOffset: number },
): Request | undefined => {
  const model = editor.getModel()
  if (!model) return undefined

  // Convert the startOffset back to row/column position
  const position = model.getPositionAt(aiSuggestion.startOffset)

  // Calculate end position from query length
  const lines = aiSuggestion.query.split("\n")
  const endRow = lines.length
  const endColumn = lines[lines.length - 1].length + 1

  return {
    query: aiSuggestion.query,
    // row is 0-indexed for Request, but position.lineNumber is 1-indexed
    row: position.lineNumber - 1,
    column: position.column,
    endRow: position.lineNumber - 1 + endRow - 1,
    endColumn: endRow === 1 ? position.column + endColumn - 1 : endColumn,
  }
}

export const getErrorRange = (
  editor: IStandaloneCodeEditor,
  request: Request,
  errorPosition: number,
): IRange | null => {
  const isErrorAtEnd = errorPosition === request.query.length
  if (isErrorAtEnd) {
    const lastPosition = request.query.trimEnd().length
    const position = toTextPosition(request, lastPosition)
    return {
      startColumn: position.column,
      endColumn: position.column,
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
    }
  }
  const position = toTextPosition(request, errorPosition)
  const model = editor.getModel()
  if (model) {
    const wordAtPosition = model.getWordAtPosition(position)
    if (wordAtPosition) {
      return {
        startColumn: wordAtPosition.startColumn,
        endColumn: wordAtPosition.endColumn,
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
      }
    }
  }
  return null
}

export const clampRange = (
  model: editor.ITextModel,
  range: IRange,
  selection: { startOffset: number; endOffset: number },
) => {
  const rangeStartOffset = model.getOffsetAt({
    lineNumber: range.startLineNumber,
    column: range.startColumn,
  })
  const rangeEndOffset = model.getOffsetAt({
    lineNumber: range.endLineNumber,
    column: range.endColumn,
  })

  const clampedStartOffset = Math.max(rangeStartOffset, selection.startOffset)
  const clampedEndOffset = Math.min(rangeEndOffset, selection.endOffset)

  const clampedStartPosition = model.getPositionAt(clampedStartOffset)
  const clampedEndPosition = model.getPositionAt(clampedEndOffset)

  return {
    startLineNumber: clampedStartPosition.lineNumber,
    endLineNumber: clampedEndPosition.lineNumber,
    startColumn: clampedStartPosition.column,
    endColumn: clampedEndPosition.column,
  }
}

export const insertTextAtCursor = (
  editor: IStandaloneCodeEditor,
  text: string,
) => {
  editor.trigger("keyboard", "type", { text })
  editor.focus()
}

const insertText = ({
  editor,
  lineNumber,
  column,
  text,
}: {
  editor: IStandaloneCodeEditor
  lineNumber: number
  column: number
  text: string
}) => {
  editor.executeEdits("", [
    {
      range: {
        startLineNumber: lineNumber,
        startColumn: column,
        endLineNumber: lineNumber,
        endColumn: column,
      },
      text,
    },
  ])
}

/** `getTextFixes` is used to create correct prefix and suffix for the text that is inserted in the editor.
 * When inserting text, we want it to be neatly aligned with surrounding empty lines.
 * For example, appending text at the last line should add one new line, whereas in other cases it should add two.
 * This function defines these rules.
 */
const getTextFixes = ({
  appendAt,
  model,
  position,
}: {
  appendAt: AppendQueryOptions["appendAt"]
  model: ReturnType<typeof editor.getModel>
  position: IPosition
}): {
  prefix: number
  suffix: number
  lineStartOffset: number
  selectStartOffset: number
} => {
  const isFirstLine = position.lineNumber === 1
  const isLastLine =
    position.lineNumber === model?.getValue().split("\n").length
  const lineAtCursor = model?.getLineContent(position.lineNumber)
  const nextLine = isLastLine
    ? undefined
    : model?.getLineContent(position.lineNumber + 1)
  const inMiddle = !isFirstLine && !isLastLine

  type Rule = {
    when: () => boolean
    then: () => {
      prefix?: number
      suffix?: number
      lineStartOffset?: number
      selectStartOffset?: number
    }
  }

  const defaultResult = {
    prefix: 1,
    suffix: 2,
    lineStartOffset: 1,
    selectStartOffset: 0,
  }

  const rules: { [key in AppendQueryOptions["appendAt"]]: Rule[] } = {
    end: [
      {
        when: () => isFirstLine,
        then: () => ({ prefix: 1, suffix: 0 }),
      },

      {
        // default case
        when: () => true,
        then: () => ({ prefix: 2, suffix: 0, selectStartOffset: 1 }),
      },
    ],

    cursor: [
      {
        when: () => model?.getValue() === "",
        then: () => ({ prefix: 0, suffix: 1, lineStartOffset: 0 }),
      },

      {
        when: () => isFirstLine && lineAtCursor === "",
        then: () => ({
          prefix: 0,
          lineStartOffset: 0,
          suffix: nextLine === "" ? 0 : 1,
        }),
      },

      {
        when: () => isFirstLine && lineAtCursor !== "",
        then: () => ({
          prefix: nextLine === "" ? 1 : 2,
          suffix: 1,
          selectStartOffset: 1,
        }),
      },

      {
        when: () => inMiddle && lineAtCursor === "",
        then: () => ({
          prefix: 0,
          suffix: nextLine === "" ? 1 : 2,
        }),
      },

      {
        when: () => inMiddle && lineAtCursor !== "" && nextLine !== "",
        then: () => ({ prefix: 1, suffix: 2 }),
      },

      {
        when: () => inMiddle && lineAtCursor !== "" && nextLine === "",
        then: () => ({ prefix: 1, suffix: 1, selectStartOffset: 1 }),
      },

      {
        when: () => isLastLine,
        then: () => ({
          prefix: lineAtCursor === "" ? 1 : 2,
          suffix: 1,
          lineStartOffset: 1,
          selectStartOffset: lineAtCursor === "" ? 0 : 1,
        }),
      },
    ],
  }

  const result = (
    rules[appendAt].find(({ when }) => when()) ?? { then: () => defaultResult }
  ).then()

  return {
    ...defaultResult,
    ...result,
  }
}

const getInsertPosition = ({
  model,
  position,
  lineStartOffset,
  newQueryLines,
  appendAt,
}: {
  model: ReturnType<typeof editor.getModel>
  position: IPosition
  lineStartOffset: number
  appendAt: AppendQueryOptions["appendAt"]
  newQueryLines: string[]
}): {
  lineStart: number
  lineEnd: number
  columnStart: number
  columnEnd: number
} => {
  if (appendAt === "cursor") {
    return {
      lineStart: position.lineNumber + lineStartOffset,
      lineEnd: position.lineNumber + newQueryLines.length,
      columnStart: 1,
      columnEnd: newQueryLines[newQueryLines.length - 1].length + 1,
    }
  }

  const lineStart =
    (model?.getValue().split("\n").length ?? 0) + lineStartOffset
  return {
    lineStart,
    lineEnd: lineStart + newQueryLines.length,
    columnStart: 1,
    columnEnd: newQueryLines[newQueryLines.length - 1].length + 1,
  }
}

export type AppendQueryOptions = {
  appendAt: "cursor" | "end"
}

export const appendQuery = (
  editor: IStandaloneCodeEditor,
  query: string,
  options: AppendQueryOptions = { appendAt: "cursor" },
) => {
  const model = editor.getModel()

  if (model) {
    const position = editor.getPosition()

    if (position) {
      const newQueryLines = query.split("\n")

      const { prefix, suffix, lineStartOffset, selectStartOffset } =
        getTextFixes({
          appendAt: options.appendAt,
          model,
          position,
        })

      const positionInsert = getInsertPosition({
        model,
        position,
        lineStartOffset,
        appendAt: options.appendAt,
        newQueryLines,
      })

      const positionSelect = {
        lineStart: positionInsert.lineStart + selectStartOffset,
        lineEnd:
          positionInsert.lineStart +
          selectStartOffset +
          (newQueryLines.length - 1),
        columnStart: 1,
        columnEnd: positionInsert.columnEnd,
      }

      insertText({
        editor,
        lineNumber: positionInsert.lineStart,
        column: positionInsert.columnStart,
        text: `${"\n".repeat(prefix)}${query}${"\n".repeat(suffix)}`,
      })

      editor.setSelection({
        startLineNumber: positionSelect.lineStart,
        endLineNumber: positionSelect.lineEnd,
        startColumn: positionSelect.columnStart,
        endColumn: positionSelect.columnEnd,
      })
    }

    editor.focus()

    if (options.appendAt === "end") {
      editor.revealLine(model.getLineCount())
    }
  }
}

export const clearModelMarkers = (
  monaco: Monaco,
  editor: IStandaloneCodeEditor,
) => {
  const model = editor.getModel()

  if (model) {
    monaco.editor.setModelMarkers(model, QuestDBLanguageName, [])
  }
}

export const toTextPosition = (
  request: Request,
  position: number,
): IPosition => {
  const end = Math.min(position, request.query.length)
  let row = 0
  let column = 1

  for (let i = 0; i < end; i++) {
    if (request.query.charAt(i) === "\n") {
      row++
      column = 1
    } else {
      column++
    }
  }

  return {
    lineNumber: row + 1 + request.row,
    column: row === 0 ? column + request.column : column,
  }
}

export const normalizeQueryText = (query: string) => {
  let result = query.trim()
  if (result.endsWith(";")) {
    result = result.slice(0, -1)
  }
  return result.trim()
}

export const findMatches = (model: editor.ITextModel, needle: string) =>
  model.findMatches(
    needle /* searchString */,
    true /* searchOnlyEditableRange */,
    false /* isRegex */,
    true /* matchCase */,
    null /* wordSeparators */,
    true /* captureMatches */,
  ) ?? null

export const getLastPosition = (
  editor: IStandaloneCodeEditor,
): IPosition | undefined => {
  const model = editor.getModel()
  if (!model) return undefined

  const lastLineNumber = model.getLineCount()
  const lastLineContent = model.getLineContent(lastLineNumber)

  return {
    lineNumber: lastLineNumber,
    column: lastLineContent.length + 1,
  }
}

export const getQueryStartOffset = (
  editor: IStandaloneCodeEditor,
  request: Request,
): number => {
  const model = editor.getModel()
  if (!model) return 0

  return model.getOffsetAt({
    lineNumber: request.row + 1,
    column: request.column,
  })
}

export const createQueryKey = (
  queryText: string,
  startOffset: number,
): QueryKey => {
  const normalizedText = normalizeQueryText(queryText)
  return `${normalizedText}@${startOffset}-${startOffset + normalizedText.length}`
}

export const parseQueryKey = (
  queryKey: QueryKey,
): { queryText: string; startOffset: number; endOffset: number } => {
  const separatorIndex = queryKey.lastIndexOf("@")

  const queryText = queryKey.slice(0, separatorIndex)
  const offsets = queryKey.slice(separatorIndex + 1)

  const [startOffset, endOffset] = offsets.split("-")
  return {
    queryText,
    startOffset: parseInt(startOffset, 10),
    endOffset: parseInt(endOffset, 10),
  }
}

export const getQueryInfoFromKey = (
  queryKey?: QueryKey,
): { queryText: string; startOffset: number; endOffset: number } => {
  if (!queryKey) return { queryText: "", startOffset: 0, endOffset: 0 }
  return parseQueryKey(queryKey)
}

export const shiftQueryKey = (
  queryKey: QueryKey,
  changeOffset: number,
  delta: number,
): QueryKey => {
  const { queryText, startOffset } = parseQueryKey(queryKey)
  const newStartOffset = shiftOffset(startOffset, changeOffset, delta)
  return createQueryKey(queryText, newStartOffset)
}

export const shiftOffset = (
  offset: number,
  changeOffset: number,
  delta: number,
): number => {
  return offset >= changeOffset ? offset + delta : offset
}

export const validateQueryAtOffset = (
  editor: IStandaloneCodeEditor,
  queryText: string,
  offset: number,
  bufferId?: number,
): boolean => {
  const model = editor.getModel()
  if (!model) return false

  const totalLength = model.getValueLength()
  if (offset < 0 || offset >= totalLength) return false

  const offsetPosition = model.getPositionAt(offset)

  const queryInEditor = getQueriesInRange(
    editor,
    offsetPosition,
    offsetPosition,
    bufferId,
  )[0]
  if (!queryInEditor) return false

  return (
    normalizeQueryText(queryInEditor.query) === normalizeQueryText(queryText)
  )
}

export const createQueryKeyFromRequest = (
  editor: IStandaloneCodeEditor,
  request: Request,
): QueryKey => {
  const startOffset = getQueryStartOffset(editor, request)
  return createQueryKey(request.query, startOffset)
}

export const setErrorMarkerForQuery = (
  monaco: Monaco,
  editor: IStandaloneCodeEditor,
  bufferExecutions: Record<
    QueryKey,
    {
      error?: ErrorResult
      success?: boolean
      selection?: { startOffset: number; endOffset: number }
      queryText: string
      startOffset: number
      endOffset: number
    }
  >,
  query?: Request,
) => {
  const model = editor.getModel()
  if (!model) return

  const markers: editor.IMarkerData[] = []

  if (query) {
    const queryKey = createQueryKeyFromRequest(editor, query)
    const executionData = bufferExecutions[queryKey]

    if (executionData && executionData.error) {
      const { error, selection } = executionData

      const errorRange = getErrorRange(editor, query, error.position)

      if (errorRange) {
        const clampedErrorRange = selection
          ? clampRange(model, errorRange, selection)
          : errorRange

        markers.push({
          message: error.error,
          severity: monaco.MarkerSeverity.Error,
          startLineNumber: clampedErrorRange.startLineNumber,
          endLineNumber: clampedErrorRange.endLineNumber,
          startColumn: clampedErrorRange.startColumn,
          endColumn: clampedErrorRange.endColumn,
        })
      } else {
        const errorPos = toTextPosition(query, error.position)
        markers.push({
          message: error.error,
          severity: monaco.MarkerSeverity.Error,
          startLineNumber: errorPos.lineNumber,
          endLineNumber: errorPos.lineNumber,
          startColumn: errorPos.column,
          endColumn: errorPos.column,
        })
      }
    }
  }

  monaco.editor.setModelMarkers(model, QuestDBLanguageName, markers)
}

// Creates a QueryKey for schema explanation conversations
// Uses DDL hash so same schema = same queryKey = cached conversation
export const createSchemaQueryKey = (
  tableName: string,
  ddl: string,
): QueryKey => {
  const ddlHash = hashString(ddl)
  return `schema:${tableName}:${ddlHash}@0-0` as QueryKey
}
