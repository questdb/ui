import React, { useState, useContext, useEffect, useRef } from "react"
import styled from "styled-components"
import { Button, Loader, Box } from "@questdb/react-components"
import { platform } from "../../utils"
import { useSelector } from "react-redux"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import type { ClaudeAPIError, ClaudeExplanation } from "../../utils/claude"
import { explainQuery, formatExplanationAsComment, createSchemaClient, isClaudeError } from "../../utils/claude"
import { toast } from "../Toast"
import type { editor } from "monaco-editor"
import { getQueryFromCursor, normalizeQueryText } from "../../scenes/Editor/Monaco/utils"
import { QuestContext } from "../../providers"
import { selectors } from "../../store"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { QueriesToRun, RunningType } from "../../store/Query/types"

const ExplainButton = styled(Button)`
  background-color: ${({ theme }) => theme.color.orangeDark};
  border-color: ${({ theme }) => theme.color.orangeDark};
  color: ${({ theme }) => theme.color.foreground};

  &:hover:not(:disabled) {
    background-color: ${({ theme }) => theme.color.orangeDark};
    border-color: ${({ theme }) => theme.color.orangeDark};
    filter: brightness(1.2);
  }

  &:disabled {
    background-color: ${({ theme }) => theme.color.orangeDark};
    border-color: ${({ theme }) => theme.color.orangeDark};
    color: ${({ theme }) => theme.color.foreground};
    opacity: .6;
  }

  svg {
    color: ${({ theme }) => theme.color.foreground};
  }
`

const Key = styled(Box).attrs({ alignItems: "center" })`
  padding: 0 0.4rem;
  background: ${({ theme }) => theme.color.gray1};
  border-radius: 0.2rem;
  font-size: 1.2rem;
  height: 1.8rem;
  color: ${({ theme }) => theme.color.orangeDark};

  &:not(:last-child) {
    margin-right: 0.25rem;
  }
`

const KeyBinding = styled(Box).attrs({ alignItems: "center", gap: "0" })`
  margin-left: 1rem;
`

type Props = {
  editor: editor.IStandaloneCodeEditor | null
  queriesToRun: QueriesToRun
  running: RunningType
}

const ctrlCmd = platform.isMacintosh || platform.isIOS ? "⌘" : "Ctrl"

const shortcutTitle = platform.isMacintosh || platform.isIOS ? "Cmd+E" : "Ctrl+E"

export const ExplainQueryButton = ({ editor, queriesToRun, running }: Props) => {
  const { aiAssistantSettings } = useLocalStorage()
  const { quest } = useContext(QuestContext)
  const tables = useSelector(selectors.query.getTables)
  const [isExplaining, setIsExplaining] = useState(false)
  const highlightDecorationsRef = useRef<string[]>([])
  const disabled = running !== RunningType.NONE || queriesToRun.length !== 1 || isExplaining || !editor
  const isSelection = queriesToRun.length === 1 && queriesToRun[0].selection

  const handleExplainQuery = async () => {
    if (!editor) return
    setIsExplaining(true)

    const schemaClient = aiAssistantSettings.grantSchemaAccess ? createSchemaClient(tables, quest) : undefined
    const response = await explainQuery(queriesToRun[0], aiAssistantSettings, schemaClient)

    if (isClaudeError(response)) {
      const error = response as ClaudeAPIError
      toast.error(error.message)
      return
    }

    const result = response as ClaudeExplanation
    if (!result.explanation) {
      toast.error("No explanation received from Anthropic API")
      return
    }

    const model = editor.getModel()
    if (!model) return

    const commentBlock = formatExplanationAsComment(result.explanation)
    const isSelection = !!queriesToRun[0].selection

    const queryStartLine = isSelection
      ? model.getPositionAt(queriesToRun[0].selection!.startOffset).lineNumber
      : queriesToRun[0].row + 1
    
    const insertText = commentBlock + "\n"
    const explanationEndLine = queryStartLine + insertText.split("\n").length - 1
    
    editor.executeEdits("explain-query", [{
      range: {
        startLineNumber: queryStartLine,
        startColumn: 1,
        endLineNumber: queryStartLine,
        endColumn: 1
      },
      text: insertText
    }])
    editor.revealPositionNearTop({ lineNumber: queryStartLine, column: 1 })
    editor.setPosition({ lineNumber: queryStartLine, column: 1 })
    highlightDecorationsRef.current = editor.getModel()?.deltaDecorations(highlightDecorationsRef.current, [{
      range: {
        startLineNumber: queryStartLine,
        startColumn: 1,
        endLineNumber: explanationEndLine,
        endColumn: 1
      },
      options: {
        className: "aiQueryHighlight",
        isWholeLine: false
      }
    }]) ?? []
    setTimeout(() => {
      highlightDecorationsRef.current = editor.getModel()?.deltaDecorations(highlightDecorationsRef.current, []) ?? []
    }, 1000)

    toast.success("Query explanation added!")
    setIsExplaining(false)
  }

  useEffect(() => {
    const handleExplainQueryExec = () => {
      if (!disabled) {
        handleExplainQuery()
      }
    }

    eventBus.subscribe(EventType.EXPLAIN_QUERY_EXEC, handleExplainQueryExec)

    return () => {
      eventBus.unsubscribe(EventType.EXPLAIN_QUERY_EXEC, handleExplainQueryExec)
    }
  }, [isExplaining, editor, aiAssistantSettings.apiKey])

  if (!aiAssistantSettings.apiKey) {
    return null
  }

  return (
    <ExplainButton
      onClick={handleExplainQuery}
      disabled={disabled}
      prefixIcon={isExplaining ? <Loader size="14px" /> : undefined}
      title={`Explain query with AI Assistant (${shortcutTitle})`}
      data-hook="button-explain-query"
    >
      {isExplaining ? "Explaining..." : isSelection ? "Explain selected query" : "Explain query"}
      {!isExplaining && (
        <KeyBinding>
          <Key>{ctrlCmd}</Key>
          <Key>E</Key>
        </KeyBinding>
      )}
    </ExplainButton>
  )
}