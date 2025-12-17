import type { MutableRefObject } from "react"
import type { editor } from "monaco-editor"
import type { ExecutionRefs } from "./index"
import { parseQueryKey, type QueryKey } from "./Monaco/utils"

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor

export const extractErrorByQueryKey = (
  queryKey: QueryKey,
  bufferId: string | number,
  executionRefs: MutableRefObject<ExecutionRefs> | undefined,
  editorRef: MutableRefObject<IStandaloneCodeEditor | null>,
): {
  errorMessage: string
  fixStart: number
  fixEnd: number
  queryText: string
  word: string | null
} | null => {
  if (!executionRefs?.current || !editorRef.current) {
    return null
  }
  const model = editorRef.current.getModel()
  if (!model) {
    return null
  }

  const bufferExecutions = executionRefs.current[bufferId.toString()]
  if (!bufferExecutions) {
    return null
  }

  const execution = bufferExecutions[queryKey]

  if (!execution || !execution.error) {
    return null
  }

  const fixStart = execution.selection
    ? execution.selection.startOffset
    : execution.startOffset

  const fixEnd = execution.selection
    ? execution.selection.endOffset
    : execution.endOffset

  const startPosition = model.getPositionAt(fixStart)
  const errorWordPosition = model.getPositionAt(
    fixStart + execution.error.position,
  )
  const errorWord = model.getWordAtPosition(errorWordPosition)
  const endPosition = model.getPositionAt(fixEnd)

  const queryText = execution.selection
    ? model.getValueInRange({
        startLineNumber: startPosition.lineNumber,
        startColumn: startPosition.column,
        endLineNumber: endPosition.lineNumber,
        endColumn: endPosition.column,
      })
    : (() => {
        // Fallback: parse queryKey to get query text
        const parsed = parseQueryKey(queryKey)
        return parsed.queryText
      })()

  return {
    errorMessage: execution.error.error || "Query execution failed",
    word: errorWord ? errorWord.word : null,
    fixStart,
    fixEnd,
    queryText,
  }
}
