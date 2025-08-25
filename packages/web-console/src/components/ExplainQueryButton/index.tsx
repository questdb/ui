import React, { useState, useContext } from "react"
import styled from "styled-components"
import { Button, Loader } from "@questdb/react-components"
import { Lightbulb } from "@styled-icons/remix-fill"
import { useSelector } from "react-redux"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import type { ClaudeAPIError, ClaudeExplanation } from "../../utils/claude"
import { explainQuery, formatExplanationAsComment, createSchemaClient, isClaudeError } from "../../utils/claude"
import { toast } from "../Toast"
import type { editor } from "monaco-editor"
import { getQueryFromCursor, normalizeQueryText } from "../../scenes/Editor/Monaco/utils"
import { QuestContext } from "../../providers"
import { selectors } from "../../store"

const ExplainButton = styled(Button)`
  background-color: ${({ theme }) => theme.color.orange};
  border-color: ${({ theme }) => theme.color.orange};
  color: ${({ theme }) => theme.color.foreground};

  &:hover:not(:disabled) {
    background-color: ${({ theme }) => theme.color.orange};
    border-color: ${({ theme }) => theme.color.orange};
    filter: brightness(1.2);
  }

  &:disabled {
    background-color: ${({ theme }) => theme.color.orange};
    border-color: ${({ theme }) => theme.color.orange};
    opacity: 0.6;
  }

  svg {
    color: ${({ theme }) => theme.color.foreground};
  }
`

type Props = {
  editor: editor.IStandaloneCodeEditor | null
  disabled?: boolean
}

export const ExplainQueryButton = ({ editor, disabled }: Props) => {
  const { aiAssistantSettings } = useLocalStorage()
  const { quest } = useContext(QuestContext)
  const tables = useSelector(selectors.query.getTables)
  const [isExplaining, setIsExplaining] = useState(false)

  const handleExplainQuery = async () => {
    if (!editor) return
    const queryRequest = getQueryFromCursor(editor)
    if (!queryRequest) {
      toast.error("No query found at cursor position")
      return
    }

    const queryText = normalizeQueryText(queryRequest.query)
    if (!queryText) {
      toast.error("No valid query found")
      return
    }

    setIsExplaining(true)

    try {
      const schemaClient = aiAssistantSettings.grantSchemaAccess ? createSchemaClient(tables, quest) : undefined
      const response = await explainQuery(queryText, aiAssistantSettings, schemaClient)

      if (isClaudeError(response)) {
        const error = response as ClaudeAPIError
        toast.error(error.message)
        return
      }

      const result = response as ClaudeExplanation
      if (!result.explanation) {
        toast.error("No explanation received from Claude API")
        return
      }

      const model = editor.getModel()
      if (!model) return

      const commentBlock = formatExplanationAsComment(result.explanation)
      const queryStartLine = queryRequest.row + 1
      
      // Find a good position to insert the comment
      // Look for existing comments or empty lines above the query
      let insertLine = queryStartLine
      let insertColumn = 1
      
      // Check if there's already an AI explanation comment above
      const lineAbove = Math.max(1, queryStartLine - 1)
      const lineAboveContent = model.getLineContent(lineAbove).trim()
      
      if (lineAboveContent.includes("AI Explanation:")) {
        // Replace existing AI explanation
        let startLine = lineAbove
        let endLine = queryStartLine - 1
        
        // Find the start of the comment block
        for (let i = lineAbove; i >= 1; i--) {
          const content = model.getLineContent(i).trim()
          if (content.startsWith("/*")) {
            startLine = i
            break
          }
        }
        
        // Find the end of the comment block
        for (let i = lineAbove; i < queryStartLine; i++) {
          const content = model.getLineContent(i).trim()
          if (content.endsWith("*/")) {
            endLine = i
            break
          }
        }
        
        editor.executeEdits("explain-query", [{
          range: {
            startLineNumber: startLine,
            startColumn: 1,
            endLineNumber: endLine,
            endColumn: model.getLineContent(endLine).length + 1
          },
          text: commentBlock
        }])
      } else {
        // Insert new comment above the query
        const insertText = commentBlock + "\n"
        
        editor.executeEdits("explain-query", [{
          range: {
            startLineNumber: insertLine,
            startColumn: insertColumn,
            endLineNumber: insertLine,
            endColumn: insertColumn
          },
          text: insertText
        }])
      }

      toast.success("Query explanation added!")

    } catch (error) {
      toast.error("Failed to get query explanation")
    } finally {
      setIsExplaining(false)
    }
  }

  if (!aiAssistantSettings.apiKey) {
    return null
  }

  return (
    <ExplainButton
      size="sm"
      onClick={handleExplainQuery}
      disabled={disabled || isExplaining || !editor}
      prefixIcon={isExplaining ? <Loader size="14px" /> : <Lightbulb size="16px" />}
      title="Explain query with AI (requires Anthropic API key)"
      data-hook="button-explain-query"
    >
      {isExplaining ? "Explaining..." : "Explain"}
    </ExplainButton>
  )
}