import React, { useCallback, useState, useContext, useEffect, useRef } from "react"
import styled, { css } from "styled-components"
import { Button, Loader, Box, Dialog, ForwardRef, Overlay } from "@questdb/react-components"
import { platform } from "../../utils"
import { useSelector } from "react-redux"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { useEditor } from "../../providers/EditorProvider"
import type { ClaudeAPIError, GeneratedSQL } from "../../utils/claude"
import { generateSQL, formatExplanationAsComment, createSchemaClient, isClaudeError } from "../../utils/claude"
import { toast } from "../Toast"
import { QuestContext } from "../../providers"
import { selectors } from "../../store"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { RunningType } from "../../store/Query/types"

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

const KeyBinding = styled(Box).attrs({ alignItems: "center", gap: "0" })<{ $disabled: boolean }>`
  margin-left: 1rem;
  ${({ $disabled, theme }) => $disabled && css`
    color: ${theme.color.gray1};
  `}
`

const StyledDialogDescription = styled(Dialog.Description)`
  font-size: 1.4rem;
  color: ${({ theme }) => theme.color.gray2};
  line-height: 1.5;
  margin-bottom: 2rem;
`

const StyledDialogButton = styled(Button)`
  padding: 1.2rem 1.6rem;
  font-size: 1.4rem;

  &:focus {
    outline: 1px solid ${({ theme }) => theme.color.foreground};
  }
`


const StyledTextArea = styled.textarea`
  width: 100%;
  min-height: 120px;
  padding: 1rem;
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 1px solid ${({ theme }) => theme.color.gray1};
  border-radius: 0.4rem;
  color: ${({ theme }) => theme.color.foreground};
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.4rem;
  resize: vertical;
  outline: none;
  margin-bottom: 2rem;

  &:focus {
    border-color: ${({ theme }) => theme.color.pink};
  }

  &::placeholder {
    color: ${({ theme }) => theme.color.gray2};
  }
`


type Props = {
  onBufferContentChange?: (value?: string) => void
}

const ctrlCmd = platform.isMacintosh || platform.isIOS ? "⌘" : "Ctrl"
const shortcutTitle = platform.isMacintosh || platform.isIOS ? "Cmd+G" : "Ctrl+G"

export const GenerateSQLButton = ({ onBufferContentChange }: Props) => {
  const { aiAssistantSettings } = useLocalStorage()
  const { quest } = useContext(QuestContext)
  const { editorRef } = useEditor()
  const tables = useSelector(selectors.query.getTables)
  const running = useSelector(selectors.query.getRunning)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [description, setDescription] = useState("")
  const highlightDecorationsRef = useRef<string[]>([])
  const disabled = running !== RunningType.NONE

  const handleGenerate = async () => {
    setIsGenerating(true)

    const schemaClient = aiAssistantSettings.grantSchemaAccess ? createSchemaClient(tables, quest) : undefined
    const response = await generateSQL(description, aiAssistantSettings, schemaClient)

    if (isClaudeError(response)) {
      const error = response as ClaudeAPIError
      toast.error(error.message)
      return
    }

    const result = response as GeneratedSQL
    if (!result.sql) {
      toast.error("No query was generated")
      return
    }

    if (editorRef.current) {
      const model = editorRef.current.getModel()
      if (!model) return

      const commentBlock = formatExplanationAsComment(`${description}\nExplanation:\n${result.explanation}`, `Prompt`)
      const sqlWithComment = `\n${commentBlock}\n${result.sql}\n`
      
      const lineNumber = model.getLineCount()
      const column = model.getLineMaxColumn(lineNumber)

      editorRef.current.executeEdits("generate-sql", [{
        range: {
          startLineNumber: lineNumber,
          startColumn: column,
          endLineNumber: lineNumber,
          endColumn: column
        },
        text: sqlWithComment
      }])
      
      if (onBufferContentChange) {
        onBufferContentChange(editorRef.current.getValue())
      }

      editorRef.current.revealLineInCenter(lineNumber)
      highlightDecorationsRef.current = editorRef.current.getModel()?.deltaDecorations(highlightDecorationsRef.current, [{
        range: {
          startLineNumber: lineNumber,
          startColumn: column,
          endLineNumber: lineNumber + sqlWithComment.split("\n").length - 1,
          endColumn: column
        },
        options: {
          className: "aiQueryHighlight",
          isWholeLine: false
        }
      }]) ?? []
      setTimeout(() => {
        highlightDecorationsRef.current = editorRef.current?.getModel()?.deltaDecorations(highlightDecorationsRef.current, []) ?? []
      }, 1000)
      editorRef.current.setPosition({ lineNumber: lineNumber + 1, column: 1 })
      editorRef.current.focus()
    }

    toast.success("Query generated!")
    setShowDialog(false)
    setDescription("")
    setIsGenerating(false)
  }

  const handleOpenDialog = useCallback(() => {
    setShowDialog(true)
    setDescription("")
  }, [])

  const handleCloseDialog = useCallback(() => {
    if (!isGenerating) {
      setShowDialog(false)
      setDescription("")
    }
  }, [isGenerating])

  const handleGenerateQueryOpen = useCallback(() => {
    if (!disabled && editorRef.current && aiAssistantSettings.apiKey) {
      handleOpenDialog()
    }
  }, [disabled, aiAssistantSettings.apiKey])

  useEffect(() => {
    eventBus.subscribe(EventType.GENERATE_QUERY_OPEN, handleGenerateQueryOpen)

    return () => {
      eventBus.unsubscribe(EventType.GENERATE_QUERY_OPEN, handleGenerateQueryOpen)
    }
  }, [handleGenerateQueryOpen])

  if (!aiAssistantSettings.apiKey) {
    return null
  }

  return (
    <>
      <Button
        skin="success"
        onClick={handleGenerateQueryOpen}
        disabled={disabled || !editorRef.current}
        title={`Generate query with AI Assistant (${shortcutTitle})`}
        data-hook="button-generate-sql"
      >
        Generate query
        <KeyBinding $disabled={disabled}>
          <Key>{ctrlCmd}</Key>
          <Key>G</Key>
        </KeyBinding>
      </Button>

      <Dialog.Root open={showDialog} onOpenChange={(open) => !open && handleCloseDialog()}>
        <Dialog.Portal>
          <ForwardRef>
            <Overlay primitive={Dialog.Overlay} />
          </ForwardRef>

          <Dialog.Content
            onEscapeKeyDown={handleCloseDialog}
            onInteractOutside={handleCloseDialog}
            style={{
              minWidth: '60rem'
            }}
          >
            <Dialog.Title>Generate query</Dialog.Title>
            
            <StyledDialogDescription>
              <p>
                Describe what data you want to query in natural language, and I'll generate the query for you.
                For example: "Show me the average price by symbol for the last hour"
              </p>

              <StyledTextArea
                placeholder="Describe your query..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isGenerating}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault()
                    handleGenerate()
                  }
                }}
              />
            </StyledDialogDescription>

            <Dialog.ActionButtons>
              <Dialog.Close asChild>
                <StyledDialogButton
                  skin="secondary"
                  onClick={handleCloseDialog}
                  disabled={isGenerating}
                >
                  Cancel
                </StyledDialogButton>
              </Dialog.Close>
              
              <StyledDialogButton
                skin="primary"
                onClick={handleGenerate}
                disabled={isGenerating || !description.trim()}
                prefixIcon={isGenerating ? <Loader size="14px" /> : undefined}
              >
                {isGenerating ? "Generating..." : "Generate"}
              </StyledDialogButton>
            </Dialog.ActionButtons>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}