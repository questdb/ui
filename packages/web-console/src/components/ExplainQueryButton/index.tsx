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

import React, { useState } from "react"
import styled from "styled-components"
import { Button, Loader } from "@questdb/react-components"
import { Lightbulb } from "@styled-icons/remix-fill"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { explainQuery, formatExplanationAsComment } from "../../utils/claude"
import { toast } from "../Toast"
import type { editor } from "monaco-editor"
import { getQueryFromCursor, normalizeQueryText } from "../../scenes/Editor/Monaco/utils"

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
  const { claudeApiKey } = useLocalStorage()
  const [isExplaining, setIsExplaining] = useState(false)

  const handleExplainQuery = async () => {
    if (!editor || !claudeApiKey) return

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
      const result = await explainQuery(queryText, claudeApiKey)

      if (result.error) {
        let errorMessage = result.error.message
        
        if (result.error.type === 'rate_limit') {
          errorMessage = "Rate limit exceeded. Please wait before trying again."
        } else if (result.error.type === 'invalid_key') {
          errorMessage = "Invalid API key. Please check your Claude API settings."
        }
        
        toast.error(errorMessage, { autoClose: 5000 })
        return
      }

      if (!result.explanation) {
        toast.error("No explanation received from Claude API")
        return
      }

      // Insert the explanation as a comment above the query
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
      console.error("Failed to explain query:", error)
      toast.error("Failed to get query explanation")
    } finally {
      setIsExplaining(false)
    }
  }

  if (!claudeApiKey) {
    return null
  }

  return (
    <ExplainButton
      size="sm"
      onClick={handleExplainQuery}
      disabled={disabled || isExplaining || !editor}
      prefixIcon={isExplaining ? <Loader size="14px" /> : <Lightbulb size="16px" />}
      title="Explain query with AI (requires Claude API key)"
      data-hook="button-explain-query"
    >
      {isExplaining ? "Explaining..." : "Explain"}
    </ExplainButton>
  )
}