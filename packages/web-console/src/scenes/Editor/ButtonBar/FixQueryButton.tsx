import React, { useState, useContext, MutableRefObject } from "react"
import styled, { css, keyframes } from "styled-components"
import { Button } from "@questdb/react-components"
import { useSelector } from "react-redux"
import { useLocalStorage } from "../../../providers/LocalStorageProvider"
import { useEditor } from "../../../providers"
import type { ClaudeAPIError, GeneratedSQL } from "../../../utils/claude"
import { isClaudeError, createSchemaClient, fixQuery } from "../../../utils/claude"
import { toast } from "../../../components/Toast"
import { QuestContext } from "../../../providers"
import { selectors } from "../../../store"
import { color } from "../../../utils"
import { RunningType } from "../../../store/Query/types"
import { formatExplanationAsComment } from "../../../utils/claude"
import { createQueryKeyFromRequest, getQueryStartOffset } from "../../../scenes/Editor/Monaco/utils"
import type { ExecutionRefs } from "../../../scenes/Editor"
import type { Request } from "../../../scenes/Editor/Monaco/utils"
import type { editor } from "monaco-editor"

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor

const pulse = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(255, 85, 85, 0.7);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(255, 85, 85, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 85, 85, 0);
  }
`

const StyledFixButton = styled(Button)<{ $pulse?: boolean }>`
  background-color: ${color("redDark")};
  border-color: ${color("redDark")};
  color: ${color("foreground")};
  
  ${({ $pulse }) => $pulse && css`
    animation: ${pulse} 1.5s infinite;
  `}

  &:hover:not(:disabled) {
    background-color: ${color("red")};
    border-color: ${color("red")};
    color: ${color("foreground")};
  }

  &:disabled {
    background-color: ${color("redDark")};
    border-color: ${color("redDark")};
    opacity: 0.6;
  }

  svg {
    color: ${color("foreground")};
  }
`

const extractError = (
  queryToFix: Request,
  executionRefs: React.MutableRefObject<ExecutionRefs> | undefined,
  activeBufferId: string | number | undefined,
  editorRef: MutableRefObject<IStandaloneCodeEditor | null>
): { errorMessage: string; fixStart: number; queryText: string } | null => {
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
  const endPosition = model.getPositionAt(execution.selection?.endOffset ?? execution.startOffset)
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
    fixStart,
    queryText,
  }
}

type Props = {
  executionRefs?: React.MutableRefObject<ExecutionRefs>
  onBufferContentChange?: (value?: string) => void
}

export const FixQueryButton = ({ executionRefs, onBufferContentChange }: Props) => {
  const { aiAssistantSettings } = useLocalStorage()
  const { quest } = useContext(QuestContext)
  const { editorRef, activeBuffer, addBuffer } = useEditor()
  const tables = useSelector(selectors.query.getTables)
  const running = useSelector(selectors.query.getRunning)
  const queriesToRun = useSelector(selectors.query.getQueriesToRun)
  const [isFixing, setIsFixing] = useState(false)

  if (!aiAssistantSettings.apiKey) {
    return null
  }

  const handleFixQuery = async () => {
    if (!editorRef.current || queriesToRun.length !== 1) return
    const model = editorRef.current.getModel()
    if (!model) return
    
    const queryToFix = queriesToRun[0]
    const errorInfo = extractError(queryToFix, executionRefs, activeBuffer.id, editorRef)
    if (!errorInfo) {
      toast.error("Unable to retrieve error information")
      return
    }
    const { errorMessage, fixStart, queryText } = errorInfo
    const fixStartPosition = model.getPositionAt(fixStart)
    const schemaClient = aiAssistantSettings.grantSchemaAccess ? createSchemaClient(tables, quest) : undefined

    setIsFixing(true)
    const response = await fixQuery(queryText, errorMessage, aiAssistantSettings, schemaClient)

    if (isClaudeError(response)) {
      const error = response as ClaudeAPIError   
      toast.error(error.message)
      setIsFixing(false)
      return
    }

    const result = response as GeneratedSQL
    
    if (!result.sql && result.explanation) {
      const model = editorRef.current.getModel()
      if (!model) {
        setIsFixing(false)
        return
      }

      const commentBlock = formatExplanationAsComment(result.explanation, "AI Error Explanation")
      const insertText = commentBlock + "\n"
      
      editorRef.current.executeEdits("fix-query-explanation", [{
        range: {
          startLineNumber: fixStartPosition.lineNumber,
          startColumn: 1,
          endLineNumber: fixStartPosition.lineNumber,
          endColumn: 1
        },
        text: insertText
      }])
      
      if (onBufferContentChange) {
        onBufferContentChange(editorRef.current.getValue())
      }
      
      editorRef.current.revealPositionNearTop(fixStartPosition)
      editorRef.current.setPosition(fixStartPosition)
      
      const explanationEndLine = fixStartPosition.lineNumber + insertText.split("\n").length - 1
      const highlightDecorations = editorRef.current.getModel()?.deltaDecorations([], [{
        range: {
          startLineNumber: fixStartPosition.lineNumber,
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
        editorRef.current?.getModel()?.deltaDecorations(highlightDecorations, [])
      }, 1000)
      
      toast.success("Error explanation added!")
      setIsFixing(false)
      return
    }
    
    if (!result.sql) {
      toast.error("No fixed query or explanation received from AI")
      setIsFixing(false)
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
        originalQuery: queryText
      }
    })
    
    setIsFixing(false)
  }

  return (
    <StyledFixButton
      onClick={handleFixQuery}
      disabled={isFixing || running !== RunningType.NONE}
      title="Fix query with AI"
      data-hook="button-fix-query"
      $pulse={!isFixing}
    >
      {isFixing ? "Fixing..." : "Fix query with AI"}
    </StyledFixButton>
  )
}