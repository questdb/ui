import React, { useContext, useEffect, useRef, useCallback } from "react"
import styled, { css } from "styled-components"
import { Button, Box } from "../../components"
import { platform } from "../../utils"
import { useSelector } from "react-redux"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { useEditor } from "../../providers/EditorProvider"
import type {
  AiAssistantAPIError,
  AiAssistantExplanation,
} from "../../utils/aiAssistant"
import {
  explainQuery,
  formatExplanationAsComment,
  createSchemaClient,
  isAiAssistantError,
} from "../../utils/aiAssistant"
import { toast } from "../Toast"
import { QuestContext } from "../../providers"
import { selectors } from "../../store"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { RunningType } from "../../store/Query/types"
import {
  useAIStatus,
  isBlockingAIStatus,
} from "../../providers/AIStatusProvider"

const Key = styled(Box).attrs({ alignItems: "center" })`
  padding: 0 0.4rem;
  background: ${({ theme }) => theme.color.selectionDarker};
  border-radius: 0.2rem;
  font-size: 1.2rem;
  height: 1.8rem;
  color: inherit;

  &:not(:last-child) {
    margin-right: 0.25rem;
  }
`

const KeyBinding = styled(Box).attrs({ alignItems: "center", gap: "0" })<{
  $disabled: boolean
}>`
  margin-left: 1rem;
  color: ${({ theme }) => theme.color.pinkPrimary};
  ${({ $disabled, theme }) =>
    $disabled &&
    css`
      color: ${theme.color.gray1};
    `}
`

type Props = {
  onBufferContentChange?: (value?: string) => void
}

const ctrlCmd = platform.isMacintosh || platform.isIOS ? "⌘" : "Ctrl"

const shortcutTitle =
  platform.isMacintosh || platform.isIOS ? "Cmd+E" : "Ctrl+E"

export const ExplainQueryButton = ({ onBufferContentChange }: Props) => {
  const { aiAssistantSettings } = useLocalStorage()
  const { quest } = useContext(QuestContext)
  const { editorRef } = useEditor()
  const tables = useSelector(selectors.query.getTables)
  const running = useSelector(selectors.query.getRunning)
  const queriesToRun = useSelector(selectors.query.getQueriesToRun)
  const { status: aiStatus, setStatus, abortController } = useAIStatus()
  const highlightDecorationsRef = useRef<string[]>([])
  const disabled =
    running !== RunningType.NONE ||
    queriesToRun.length !== 1 ||
    isBlockingAIStatus(aiStatus)
  const isSelection = queriesToRun.length === 1 && queriesToRun[0].selection

  const handleExplainQuery = useCallback(async () => {
    if (!editorRef.current || disabled) return
    const model = editorRef.current.getModel()
    if (!model) return

    editorRef.current?.updateOptions({
      readOnly: true,
      readOnlyMessage: {
        value: "Query explanation in progress",
      },
    })
    const schemaClient = aiAssistantSettings.grantSchemaAccess
      ? createSchemaClient(tables, quest)
      : undefined
    const response = await explainQuery({
      query: queriesToRun[0],
      settings: aiAssistantSettings,
      schemaClient,
      setStatus,
      abortSignal: abortController?.signal,
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

    const result = response as AiAssistantExplanation
    if (!result.explanation) {
      toast.error("No explanation received from AI Assistant", {
        autoClose: 10000,
      })
      editorRef.current?.updateOptions({
        readOnly: false,
        readOnlyMessage: undefined,
      })
      return
    }

    const commentBlock = formatExplanationAsComment(result.explanation)
    const isSelection = !!queriesToRun[0].selection

    const queryStartLine = isSelection
      ? model.getPositionAt(queriesToRun[0].selection!.startOffset).lineNumber
      : queriesToRun[0].row + 1

    const insertText = commentBlock + "\n"
    const explanationEndLine =
      queryStartLine + insertText.split("\n").length - 1

    editorRef.current?.updateOptions({
      readOnly: false,
      readOnlyMessage: undefined,
    })
    editorRef.current.executeEdits("explain-query", [
      {
        range: {
          startLineNumber: queryStartLine,
          startColumn: 1,
          endLineNumber: queryStartLine,
          endColumn: 1,
        },
        text: insertText,
      },
    ])

    if (onBufferContentChange) {
      onBufferContentChange(editorRef.current.getValue())
    }
    editorRef.current.revealPositionNearTop({
      lineNumber: queryStartLine,
      column: 1,
    })
    editorRef.current.setPosition({ lineNumber: queryStartLine, column: 1 })
    highlightDecorationsRef.current =
      editorRef.current
        .getModel()
        ?.deltaDecorations(highlightDecorationsRef.current, [
          {
            range: {
              startLineNumber: queryStartLine,
              startColumn: 1,
              endLineNumber: explanationEndLine,
              endColumn: 1,
            },
            options: {
              className: "aiQueryHighlight",
              isWholeLine: false,
            },
          },
        ]) ?? []
    setTimeout(() => {
      highlightDecorationsRef.current =
        editorRef.current
          ?.getModel()
          ?.deltaDecorations(highlightDecorationsRef.current, []) ?? []
    }, 1000)

    toast.success("Query explanation added!")
  }, [
    disabled,
    onBufferContentChange,
    queriesToRun,
    aiAssistantSettings,
    tables,
    quest,
    setStatus,
    abortController,
  ])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && (e.key === "e" || e.key === "E"))) {
        return
      }
      e.preventDefault()
      void handleExplainQuery()
    },
    [handleExplainQuery],
  )

  useEffect(() => {
    eventBus.subscribe(EventType.EXPLAIN_QUERY_EXEC, handleExplainQuery)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      eventBus.unsubscribe(EventType.EXPLAIN_QUERY_EXEC, handleExplainQuery)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleExplainQuery])

  if (!aiAssistantSettings.apiKey) {
    return null
  }

  return (
    <Button
      skin="gradient"
      gradientWeight="thin"
      onClick={handleExplainQuery}
      disabled={disabled}
      title={`Explain query with AI Assistant (${shortcutTitle})`}
      data-hook="button-explain-query"
    >
      {isSelection ? "Explain selected query" : "Explain query"}
      <KeyBinding $disabled={disabled}>
        <Key>{ctrlCmd}</Key>
        <Key>E</Key>
      </KeyBinding>
    </Button>
  )
}
