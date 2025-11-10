import React, { useContext, MutableRefObject } from "react"
import { Button } from "../../../components"
import { useSelector } from "react-redux"
import { useLocalStorage } from "../../../providers/LocalStorageProvider"
import { useEditor } from "../../../providers"
import type {
  AiAssistantAPIError,
  GeneratedSQL,
} from "../../../utils/aiAssistant"
import {
  isAiAssistantError,
  createSchemaClient,
  fixQuery,
} from "../../../utils/aiAssistant"
import { toast } from "../../../components/Toast"
import { QuestContext } from "../../../providers"
import { selectors } from "../../../store"
import { RunningType } from "../../../store/Query/types"
import { formatExplanationAsComment } from "../../../utils/aiAssistant"
import { createQueryKeyFromRequest } from "../../../scenes/Editor/Monaco/utils"
import type { ExecutionRefs } from "../../../scenes/Editor"
import type { Request } from "../../../scenes/Editor/Monaco/utils"
import type { editor } from "monaco-editor"
import {
  isBlockingAIStatus,
  useAIStatus,
} from "../../../providers/AIStatusProvider"

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor

const extractError = (
  queryToFix: Request,
  executionRefs: React.MutableRefObject<ExecutionRefs> | undefined,
  activeBufferId: string | number | undefined,
  editorRef: MutableRefObject<IStandaloneCodeEditor | null>,
): {
  errorMessage: string
  fixStart: number
  queryText: string
  word: string | null
} | null => {
  if (!executionRefs?.current || !activeBufferId || !editorRef.current) {
    return null
  }
  const model = editorRef.current.getModel()
  if (!model) {
    return null
  }

  const bufferExecutions = executionRefs.current[activeBufferId as number]
  if (!bufferExecutions) {
    return null
  }

  const queryKey = createQueryKeyFromRequest(editorRef.current, queryToFix)
  const execution = bufferExecutions[queryKey]

  if (!execution || !execution.error) {
    return null
  }
  const fixStart = execution.selection
    ? execution.selection.startOffset
    : execution.startOffset

  const startPosition = model.getPositionAt(fixStart)
  const errorWordPosition = model.getPositionAt(
    fixStart + execution.error.position,
  )
  const errorWord = model.getWordAtPosition(errorWordPosition)
  const endPosition = model.getPositionAt(
    execution.selection?.endOffset ?? execution.startOffset,
  )
  const queryText = execution.selection
    ? model.getValueInRange({
        startLineNumber: startPosition.lineNumber,
        startColumn: startPosition.column,
        endLineNumber: endPosition.lineNumber,
        endColumn: endPosition.column,
      })
    : queryToFix.query

  return {
    errorMessage: execution.error.error || "Query execution failed",
    word: errorWord ? errorWord.word : null,
    fixStart,
    queryText,
  }
}

type Props = {
  executionRefs?: React.MutableRefObject<ExecutionRefs>
  onBufferContentChange?: (value?: string) => void
}

export const FixQueryButton = ({
  executionRefs,
  onBufferContentChange,
}: Props) => {
  const { aiAssistantSettings } = useLocalStorage()
  const { quest } = useContext(QuestContext)
  const { editorRef, activeBuffer, addBuffer } = useEditor()
  const tables = useSelector(selectors.query.getTables)
  const running = useSelector(selectors.query.getRunning)
  const queriesToRun = useSelector(selectors.query.getQueriesToRun)
  const { status: aiStatus, setStatus, abortController } = useAIStatus()

  if (!aiAssistantSettings.apiKey) {
    return null
  }

  const handleFixQuery = async () => {
    if (!editorRef.current || queriesToRun.length !== 1) return
    const model = editorRef.current.getModel()
    if (!model) return

    const queryToFix = queriesToRun[0]
    const errorInfo = extractError(
      queryToFix,
      executionRefs,
      activeBuffer.id,
      editorRef,
    )
    if (!errorInfo) {
      toast.error("Unable to retrieve error information from the editor", {
        autoClose: 10000,
      })
      return
    }
    const { errorMessage, fixStart, queryText, word } = errorInfo
    const fixStartPosition = model.getPositionAt(fixStart)
    editorRef.current?.updateOptions({
      readOnly: true,
      readOnlyMessage: {
        value: "Query fix in progress",
      },
    })
    const schemaClient = aiAssistantSettings.grantSchemaAccess
      ? createSchemaClient(tables, quest)
      : undefined

    const response = await fixQuery({
      query: queryText,
      errorMessage,
      settings: aiAssistantSettings,
      schemaClient,
      setStatus,
      abortSignal: abortController?.signal,
      word,
    })

    if (isAiAssistantError(response)) {
      const error = response as AiAssistantAPIError
      if (error.type !== "aborted") {
        toast.error(error.message, { autoClose: 10000 })
      }
      editorRef.current?.updateOptions({
        readOnly: false,
        readOnlyMessage: undefined,
      })
      return
    }

    const result = response as GeneratedSQL

    if (!result.sql && result.explanation) {
      const commentBlock = formatExplanationAsComment(
        result.explanation,
        "AI Error Explanation",
      )
      const insertText = commentBlock + "\n"

      editorRef.current?.updateOptions({
        readOnly: false,
        readOnlyMessage: undefined,
      })
      editorRef.current.executeEdits("fix-query-explanation", [
        {
          range: {
            startLineNumber: fixStartPosition.lineNumber,
            startColumn: 1,
            endLineNumber: fixStartPosition.lineNumber,
            endColumn: 1,
          },
          text: insertText,
        },
      ])

      if (onBufferContentChange) {
        onBufferContentChange(editorRef.current.getValue())
      }

      editorRef.current.revealPositionNearTop(fixStartPosition)
      editorRef.current.setPosition(fixStartPosition)

      const explanationEndLine =
        fixStartPosition.lineNumber + insertText.split("\n").length - 1
      const highlightDecorations =
        editorRef.current.getModel()?.deltaDecorations(
          [],
          [
            {
              range: {
                startLineNumber: fixStartPosition.lineNumber,
                startColumn: 1,
                endLineNumber: explanationEndLine,
                endColumn: 1,
              },
              options: {
                className: "aiQueryHighlight",
                isWholeLine: false,
              },
            },
          ],
        ) ?? []

      setTimeout(() => {
        editorRef.current
          ?.getModel()
          ?.deltaDecorations(highlightDecorations, [])
      }, 1000)

      toast.success("Error explanation added!")
      return
    }

    editorRef.current?.updateOptions({
      readOnly: false,
      readOnlyMessage: undefined,
    })

    if (!result.sql) {
      toast.error("No fixed query or explanation received from AI Assistant", {
        autoClose: 10000,
      })
      return
    }

    await addBuffer({
      label: `${activeBuffer.label} (Fix Preview)`,
      value: "",
      isDiffBuffer: true,
      originalBufferId: activeBuffer.id,
      diffContent: {
        original: queryText,
        modified: result.sql,
        explanation: result.explanation || "AI suggested fix for the SQL query",
        queryStartOffset: fixStart,
        originalQuery: queryText,
      },
    })
  }

  return (
    <Button
      skin="gradient"
      gradientWeight="thin"
      onClick={handleFixQuery}
      disabled={running !== RunningType.NONE || isBlockingAIStatus(aiStatus)}
      title="Fix query with AI Assistant"
      data-hook="button-fix-query"
    >
      Fix query with AI
    </Button>
  )
}
