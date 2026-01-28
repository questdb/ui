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

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor

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
): Request[] => {
  const model = editor.getModel()
  if (!model) return []

  const selection = editor.getSelection()
  const selectedText = selection ? model.getValueInRange(selection) : undefined
  if (!selection || !selectedText) {
    const queryInCursor = getQueryFromCursor(editor)
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

export const getQueriesFromPosition = (
  editor: IStandaloneCodeEditor,
  editorPosition: IPosition,
  startPosition?: IPosition,
): { sqlTextStack: SqlTextItem[]; nextSql: SqlTextItem | null } => {
  const text = editor.getValue({ preserveBOM: false, lineEnding: "\n" })

  if (!text || !stripSQLComments(text)) {
    return { sqlTextStack: [], nextSql: null }
  }

  const position = {
    row: editorPosition.lineNumber - 1,
    column: editorPosition.column,
  }

  // Calculate starting position - default to beginning if not provided
  const start = startPosition
    ? {
        row: startPosition.lineNumber - 1,
        column: startPosition.column,
      }
    : { row: 0, column: 1 }

  // Convert start position to character index
  let startCharIndex = 0
  if (startPosition) {
    const lines = text.split("\n")
    const maxRow = Math.min(start.row, lines.length - 1)
    for (let i = 0; i < maxRow; i++) {
      if (lines[i] !== undefined) {
        startCharIndex += lines[i].length + 1 // +1 for newline character
      }
    }
    if (lines[maxRow] !== undefined) {
      startCharIndex += Math.min(start.column - 1, lines[maxRow].length)
    }
  }

  let row = start.row
  let column = start.column
  const sqlTextStack = []
  let startRow = start.row
  let startCol = start.column
  let startPos = startCharIndex - 1
  let nextSql = null
  let inQuote = false
  let singleLineCommentStack: number[] = []
  let multiLineCommentStack: number[] = []
  let inSingleLineComment = false
  let inMultiLineComment = false

  while (
    startCharIndex < text.length &&
    (text[startCharIndex] === "\n" || text[startCharIndex] === " ")
  ) {
    if (text[startCharIndex] === "\n") {
      row++
      startRow++
      column = 1
      startCol = 1
    } else {
      column++
      startCol++
    }
    startCharIndex++
  }
  startPos = startCharIndex

  let i = startCharIndex
  for (; i < text.length; i++) {
    if (nextSql !== null) {
      break
    }

    const char = text[i]

    switch (char) {
      case ";": {
        if (inQuote || inSingleLineComment || inMultiLineComment) {
          column++
          break
        }

        if (
          row < position.row ||
          (row === position.row && column < position.column)
        ) {
          sqlTextStack.push({
            row: startRow,
            col: startCol,
            position: startPos,
            endRow: row,
            endCol: column,
            limit: i,
          })
          startRow = row
          startCol = column + 1
          startPos = i + 1
          column++
        } else {
          nextSql = {
            row: startRow,
            col: startCol,
            position: startPos,
            endRow: row,
            endCol: column,
            limit: i,
          }
        }
        break
      }

      case " ":
      case "\t": {
        if (startPos === i) {
          startRow = row
          startCol = column + 1
          startPos = i + 1
        }

        column++
        break
      }

      case "\n": {
        if (inSingleLineComment) {
          inSingleLineComment = false
          if (startPos === i - 1) {
            startPos = i
            startRow = row
            startCol = column
          }
        }
        row++
        column = 1
        if (startPos === i) {
          startRow = row
          startCol = column
          startPos = i + 1
        }
        break
      }

      case "'": {
        if (!inMultiLineComment && !inSingleLineComment) {
          inQuote = !inQuote
        }
        column++
        break
      }

      case "-": {
        if (!inMultiLineComment && !inQuote) {
          singleLineCommentStack.push(i)
          if (singleLineCommentStack.length === 2) {
            if (singleLineCommentStack[0] + 1 === singleLineCommentStack[1]) {
              if (startPos === i - 1) {
                startPos = i
                startRow = row
                startCol = column
              }
              singleLineCommentStack = []
              inSingleLineComment = true
            } else {
              singleLineCommentStack.shift()
            }
          }
        }
        column++
        break
      }

      case "/": {
        if (!inMultiLineComment && !inSingleLineComment && !inQuote) {
          if (multiLineCommentStack.length === 0) {
            multiLineCommentStack.push(i)
          } else {
            multiLineCommentStack = [i]
          }
        }
        if (inMultiLineComment) {
          if (
            multiLineCommentStack.length === 1 &&
            multiLineCommentStack[0] + 1 === i
          ) {
            if (startPos === i - 1) {
              startPos = i + 1
              startRow = row
              startCol = column + 1
            }
            multiLineCommentStack = []
            inMultiLineComment = false
          }
        }
        column++
        break
      }

      case "*": {
        if (!inMultiLineComment && !inSingleLineComment) {
          if (
            multiLineCommentStack.length === 1 &&
            multiLineCommentStack[0] + 1 === i
          ) {
            if (startPos === i - 1) {
              startPos = i
              startRow = row
              startCol = column
            }
            multiLineCommentStack = []
            inMultiLineComment = true
          } else if (multiLineCommentStack.length > 0) {
            multiLineCommentStack = []
          }
        }
        if (inMultiLineComment) {
          multiLineCommentStack = [i]
        }
        column++
        break
      }

      default: {
        column++
        break
      }
    }
    if ((inSingleLineComment || inMultiLineComment) && startPos === i - 1) {
      startPos = i
      startRow = row
      startCol = column
    }
  }

  // lastStackItem is the last query that is completed before the current cursor position.
  // nextSql is the next query that is not completed before the current cursor position, or started after the current cursor position.
  if (!nextSql) {
    const sqlText =
      startPos === -1
        ? text.substring(startCharIndex)
        : text.substring(startPos)
    if (sqlText.length > 0) {
      nextSql = {
        row: startRow,
        col: startCol,
        position: startPos === -1 ? startCharIndex : startPos,
        endRow: row,
        endCol: column,
        limit: i,
      }
    }
  }

  const filteredSqlTextStack = sqlTextStack.filter((item) => {
    return item.row !== item.endRow || item.col !== item.endCol
  })

  const filteredNextSql =
    nextSql &&
    (nextSql.row !== nextSql.endRow || nextSql.col !== nextSql.endCol)
      ? nextSql
      : null

  return { sqlTextStack: filteredSqlTextStack, nextSql: filteredNextSql }
}

export const getQueryFromCursor = (
  editor: IStandaloneCodeEditor,
): Request | undefined => {
  const position = editor.getPosition()
  const text = editor.getValue({ preserveBOM: false, lineEnding: "\n" })

  if (!text || !stripSQLComments(text) || !position) {
    return
  }

  const { sqlTextStack, nextSql } = getQueriesFromPosition(editor, position)

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
    const lastStackItemEndCol = lastStackItem!.endCol
    const normalizedCurrentCol = position.column
    if (normalizedCurrentCol > lastStackItemEndCol) {
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

export const getAllQueries = (editor: IStandaloneCodeEditor): Request[] => {
  const position = getLastPosition(editor)
  const text = editor.getValue({ preserveBOM: false, lineEnding: "\n" })

  if (!text || !stripSQLComments(text) || !position) {
    return []
  }

  const { sqlTextStack, nextSql } = getQueriesFromPosition(editor, position)
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
): Request[] => {
  const text = editor.getValue({ preserveBOM: false, lineEnding: "\n" })
  if (!text || !stripSQLComments(text) || !startPosition || !endPosition) {
    return []
  }

  const { sqlTextStack, nextSql } = getQueriesFromPosition(
    editor,
    endPosition,
    startPosition,
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
        endColumn: endPosition.column,
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
      const parentQuery = getQueryFromCursor(editor)
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
): Request | undefined => {
  let request: Request | undefined
  const selectedText = getSelectedText(editor)
  const strippedNormalizedSelectedText = selectedText
    ? stripSQLComments(normalizeQueryText(selectedText))
    : undefined

  if (strippedNormalizedSelectedText) {
    request = getQueryFromSelection(editor)
  } else {
    request = getQueryFromCursor(editor)
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
