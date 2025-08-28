import React, { useState, useContext } from "react"
import styled, { css, keyframes } from "styled-components"
import { Button } from "@questdb/react-components"
import { useSelector } from "react-redux"
import { useLocalStorage } from "../../../providers/LocalStorageProvider"
import { useEditor } from "../../../providers"
import type { ClaudeAPIError, GeneratedSQL } from "../../../utils/claude"
import { isClaudeError, fixQuery, createSchemaClient, formatExplanationAsComment } from "../../../utils/claude"
import { toast } from "../../../components/Toast"
import { QuestContext } from "../../../providers"
import { selectors } from "../../../store"
import { color } from "../../../utils"
import { RunningType } from "../../../store/Query/types"
import type { QueriesToRun } from "../../../store/Query/types"

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

type Props = {
  editor: any
  queriesToRun: QueriesToRun
  running: RunningType
  hasError: boolean
}

export const FixQueryButton = ({ editor, queriesToRun, running, hasError }: Props) => {
  const { aiAssistantSettings } = useLocalStorage()
  const { quest } = useContext(QuestContext)
  const { editorRef } = useEditor()
  const tables = useSelector(selectors.query.getTables)
  const activeNotification = useSelector(selectors.query.getActiveNotification)
  const [isFixing, setIsFixing] = useState(false)

  if (!aiAssistantSettings.apiKey || !hasError) {
    return null
  }

  const handleFixQuery = async () => {
    if (!editorRef.current || queriesToRun.length === 0) return
    
    // Get the last query that was run (which likely has the error)
    const queryToFix = queriesToRun[queriesToRun.length - 1]
    const queryText = queryToFix.selection ? queryToFix.selection.queryText : queryToFix.query
    
    // Extract error message from the active notification
    let errorMessage = "Query execution failed"
    if (activeNotification?.content && React.isValidElement(activeNotification.content)) {
      const content = activeNotification.content as React.ReactElement
      // Navigate through the component tree to find the error text
      const errorText = content.props?.children
      if (typeof errorText === 'string') {
        errorMessage = errorText
      }
    }
    
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
    if (!result.sql) {
      toast.error("No fixed query received from AI")
      setIsFixing(false)
      return
    }

    const model = editorRef.current.getModel()
    if (!model) return

    // Find the query in the editor
    const editorContent = model.getValue()
    const queryStartIndex = editorContent.indexOf(queryText)
    
    if (queryStartIndex === -1) {
      toast.error("Could not find query in editor")
      setIsFixing(false)
      return
    }

    const queryStartPosition = model.getPositionAt(queryStartIndex)
    const queryEndPosition = model.getPositionAt(queryStartIndex + queryText.length)
    
    // Use formatExplanationAsComment to wrap text properly
    const explanationComment = result.explanation 
      ? formatExplanationAsComment(result.explanation, "AI Fix Suggestion") + "\n"
      : "/* AI Fix Applied */\n"
    
    const fixedQueryWithComment = explanationComment + result.sql

    // Store original content for reverting
    const originalContent = model.getValue()

    // Apply the fix temporarily with decorations
    editorRef.current.executeEdits('fix-query-preview', [{
      range: {
        startLineNumber: queryStartPosition.lineNumber,
        startColumn: queryStartPosition.column,
        endLineNumber: queryEndPosition.lineNumber,
        endColumn: queryEndPosition.column
      },
      text: fixedQueryWithComment,
      forceMoveMarkers: true
    }])

    // Wait a bit for the editor to update before adding decorations
    setTimeout(() => {
      if (!editorRef.current) return
      
      // Add decorations to highlight the changed area
      const newEndOffset = queryStartIndex + fixedQueryWithComment.length
      const newEndPosition = model.getPositionAt(newEndOffset)
      
      const decorations = editorRef.current.createDecorationsCollection([
        {
          range: {
            startLineNumber: queryStartPosition.lineNumber,
            startColumn: queryStartPosition.column,
            endLineNumber: newEndPosition.lineNumber,
            endColumn: newEndPosition.column
          },
          options: {
            isWholeLine: false,
            className: 'ai-fix-suggestion',
          }
        }
      ])

      // Create content widget for inline buttons
      const contentWidget = {
        getId: () => 'fix-query-buttons',
        getDomNode: () => {
          const container = document.createElement('div')
          
          // Create Accept button
          const acceptBtn = document.createElement('button')
          acceptBtn.classList.add('fix-action-button')
          acceptBtn.classList.add('accept-fix')
          acceptBtn.innerHTML = 'Accept fix'
          acceptBtn.onclick = () => {
            // Accept the current state (including any user edits)
            editorRef.current?.removeContentWidget(contentWidget)
            decorations.clear()
            // Restore editor to be editable
            editorRef.current?.updateOptions({ readOnly: false })
            // Clean up the stored original content since we're accepting the changes
            delete (window as any).__questdb_fix_original_content
            delete (window as any).__questdb_fix_widget
          }
          
          // Create Reject button
          const rejectBtn = document.createElement('button')
          rejectBtn.classList.add('fix-action-button')
          rejectBtn.classList.add('reject-fix')
          rejectBtn.innerHTML = 'Reject fix'

          rejectBtn.onclick = () => {
            // Revert to the original content stored before the fix was applied
            const storedOriginalContent = (window as any).__questdb_fix_original_content
            editorRef.current?.removeContentWidget(contentWidget)
            if (storedOriginalContent) {
              editorRef.current?.setValue(storedOriginalContent)
            }
            decorations.clear()
            // Restore editor to be editable
            editorRef.current?.updateOptions({ readOnly: false })
            // Clean up the stored original content
            delete (window as any).__questdb_fix_original_content
            delete (window as any).__questdb_fix_widget
          }
          
          container.appendChild(acceptBtn)
          container.appendChild(rejectBtn)
          
          return container
        },
        getPosition: () => ({
          position: {
            lineNumber: queryStartPosition.lineNumber + explanationComment.split("\n").length - 1,
            column: 5
          },
          preference: [1] // EXACT preference
        })
      }
      
      editorRef.current.addContentWidget(contentWidget)
      
      // Make editor read-only while fix is pending
      editorRef.current.updateOptions({ readOnly: true })
      
      // Store widget info for cleanup and original content for reverting
      ;(window as any).__questdb_fix_widget = {
        widget: contentWidget,
        decorations
      }
      ;(window as any).__questdb_fix_original_content = originalContent
    }, 100)

    setIsFixing(false)
  }

  return (
    <StyledFixButton
      onClick={handleFixQuery}
      disabled={isFixing || running !== RunningType.NONE}
      title="Fix query with AI"
      data-hook="button-fix-query"
      $pulse={hasError && !isFixing}
    >
      {isFixing ? "Fixing..." : "Fix query with AI"}
    </StyledFixButton>
  )
}