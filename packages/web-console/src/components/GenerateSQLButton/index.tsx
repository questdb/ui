import React, { useState, useContext, useEffect, useRef } from "react"
import styled from "styled-components"
import { Button, Loader, Box, Dialog, ForwardRef, Overlay } from "@questdb/react-components"
import { platform } from "../../utils"
import { useSelector } from "react-redux"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import type { ClaudeAPIError, GeneratedSQL } from "../../utils/claude"
import { generateSQL, formatExplanationAsComment, createSchemaClient, isClaudeError } from "../../utils/claude"
import { toast } from "../Toast"
import type { editor } from "monaco-editor"
import { QuestContext } from "../../providers"
import { selectors } from "../../store"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { RunningType } from "../../store/Query/types"

const GenerateButton = styled(Button)`
  background-color: ${({ theme }) => theme.color.pink};
  border-color: ${({ theme }) => theme.color.pink};
  color: ${({ theme }) => theme.color.foreground};

  &:hover:not(:disabled) {
    background-color: ${({ theme }) => theme.color.pink};
    border-color: ${({ theme }) => theme.color.pink};
    filter: brightness(1.2);
  }

  &:disabled {
    background-color: ${({ theme }) => theme.color.pink};
    border-color: ${({ theme }) => theme.color.pink};
    opacity: 0.6;
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
  color: ${({ theme }) => theme.color.pink};

  &:not(:last-child) {
    margin-right: 0.25rem;
  }
`

const KeyBinding = styled(Box).attrs({ alignItems: "center", gap: "0" })`
  margin-left: 1rem;
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
  editor: editor.IStandaloneCodeEditor | null
  running: RunningType
}

const ctrlCmd = platform.isMacintosh || platform.isIOS ? "⌘" : "Ctrl"
const shortcutTitle = platform.isMacintosh || platform.isIOS ? "Cmd+G" : "Ctrl+G"

export const GenerateSQLButton = ({ editor, running }: Props) => {
  const { aiAssistantSettings } = useLocalStorage()
  const { quest } = useContext(QuestContext)
  const tables = useSelector(selectors.query.getTables)
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

    if (editor) {
      const model = editor.getModel()
      if (!model) return

      const commentBlock = formatExplanationAsComment(`${description}\nExplanation:\n${result.explanation}`, `Prompt`)
      const sqlWithComment = `\n${commentBlock}\n${result.sql}\n`
      
      const lineNumber = model.getLineCount()
      const column = model.getLineMaxColumn(lineNumber)

      editor.executeEdits("generate-sql", [{
        range: {
          startLineNumber: lineNumber,
          startColumn: column,
          endLineNumber: lineNumber,
          endColumn: column
        },
        text: sqlWithComment
      }])

      editor.revealLineInCenter(lineNumber)
      highlightDecorationsRef.current = editor.getModel()?.deltaDecorations(highlightDecorationsRef.current, [{
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
        highlightDecorationsRef.current = editor.getModel()?.deltaDecorations(highlightDecorationsRef.current, []) ?? []
      }, 1000)
      editor.setPosition({ lineNumber: lineNumber + 1, column: 1 })
      editor.focus()
    }

    toast.success("Query generated!")
    setShowDialog(false)
    setDescription("")
    setIsGenerating(false)
  }

  const handleOpenDialog = () => {
    setShowDialog(true)
    setDescription("")
  }

  const handleCloseDialog = () => {
    if (!isGenerating) {
      setShowDialog(false)
      setDescription("")
    }
  }

  useEffect(() => {
    const handleGenerateQueryOpen = () => {
      if (!disabled && editor && aiAssistantSettings.apiKey) {
        handleOpenDialog()
      }
    }

    eventBus.subscribe(EventType.GENERATE_QUERY_OPEN, handleGenerateQueryOpen)

    return () => {
      eventBus.unsubscribe(EventType.GENERATE_QUERY_OPEN, handleGenerateQueryOpen)
    }
  }, [disabled, editor, aiAssistantSettings.apiKey])

  if (!aiAssistantSettings.apiKey) {
    return null
  }

  return (
    <>
      <GenerateButton
        onClick={handleOpenDialog}
        disabled={disabled || !editor}
        title={`Generate query with AI Assistant (${shortcutTitle})`}
        data-hook="button-generate-sql"
      >
        Generate query
        <KeyBinding>
          <Key>{ctrlCmd}</Key>
          <Key>G</Key>
        </KeyBinding>
      </GenerateButton>

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