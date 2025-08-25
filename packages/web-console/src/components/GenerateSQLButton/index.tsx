import React, { useState, useContext } from "react"
import styled from "styled-components"
import { Button, Loader } from "@questdb/react-components"
import { Star } from "@styled-icons/remix-line"
import { useSelector } from "react-redux"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import type { ClaudeAPIError, GeneratedSQL } from "../../utils/claude"
import { generateSQL, formatExplanationAsComment, createSchemaClient, isClaudeError } from "../../utils/claude"
import { toast } from "../Toast"
import type { editor } from "monaco-editor"
import { QuestContext } from "../../providers"
import { selectors } from "../../store"

const GenerateButton = styled(Button)`
  background-color: ${({ theme }) => theme.color.purple};
  border-color: ${({ theme }) => theme.color.purple};
  color: ${({ theme }) => theme.color.foreground};

  &:hover:not(:disabled) {
    background-color: ${({ theme }) => theme.color.purple};
    border-color: ${({ theme }) => theme.color.purple};
    filter: brightness(1.2);
  }

  &:disabled {
    background-color: ${({ theme }) => theme.color.purple};
    border-color: ${({ theme }) => theme.color.purple};
    opacity: 0.6;
  }

  svg {
    color: ${({ theme }) => theme.color.foreground};
  }
`

const Modal = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 1px solid ${({ theme }) => theme.color.gray1};
  border-radius: 0.8rem;
  box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.3);
  z-index: 1000;
  padding: 2rem;
  min-width: 500px;
  max-width: 700px;
`

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
`

const DialogTitle = styled.h3`
  margin: 0 0 1.5rem 0;
  color: ${({ theme }) => theme.color.foreground};
  font-size: 1.6rem;
  font-weight: 600;
`

const DialogDescription = styled.p`
  margin: 0 0 1.5rem 0;
  color: ${({ theme }) => theme.color.gray2};
  font-size: 1.3rem;
  line-height: 1.5;
`

const InputWrapper = styled.div`
  margin-bottom: 2rem;
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

  &:focus {
    border-color: ${({ theme }) => theme.color.selection};
  }

  &::placeholder {
    color: ${({ theme }) => theme.color.gray2};
  }
`

const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
`

type Props = {
  editor: editor.IStandaloneCodeEditor | null
  disabled?: boolean
}

export const GenerateSQLButton = ({ editor, disabled }: Props) => {
  const { aiAssistantSettings } = useLocalStorage()
  const { quest } = useContext(QuestContext)
  const tables = useSelector(selectors.query.getTables)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [description, setDescription] = useState("")

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
      toast.error("No SQL query was generated")
      return
    }

    if (editor) {
      const model = editor.getModel()
      if (!model) return

      const commentBlock = formatExplanationAsComment(`${description}`, "Prompt")
      const sqlWithComment = `${commentBlock}\n${result.sql}`
      
      const position = editor.getPosition() ?? { lineNumber: model.getLineCount(), column: model.getLineLength(model.getLineCount()) }

      editor.executeEdits("generate-sql", [{
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        },
        text: sqlWithComment
      }])

      // Move cursor to the end of the inserted SQL
      const lines = sqlWithComment.split('\n')
      const newLineNumber = position.lineNumber + lines.length - 1
      const newColumn = lines[lines.length - 1].length + 1
      editor.setPosition({ lineNumber: newLineNumber, column: newColumn })
      editor.focus()
    }

    toast.success("SQL query generated!")
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

  if (!aiAssistantSettings.apiKey) {
    return null
  }

  return (
    <>
      <GenerateButton
        size="sm"
        onClick={handleOpenDialog}
        disabled={disabled || !editor}
        prefixIcon={<Star size="16px" />}
        title="Generate SQL from natural language description (requires Anthropic API key)"
        data-hook="button-generate-sql"
      >
        Generate SQL
      </GenerateButton>

      {showDialog && (
        <>
          <ModalOverlay onClick={handleCloseDialog} />
          <Modal>
            <DialogTitle>Generate SQL Query</DialogTitle>
            <DialogDescription>
              Describe what data you want to query in plain English, and I'll generate the SQL for you.
              For example: "Show me the average price by symbol for the last hour"
            </DialogDescription>
            
            <InputWrapper>
              <StyledTextArea
                placeholder="Describe your query in plain English..."
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
            </InputWrapper>

            <ButtonGroup>
              <Button
                skin="secondary"
                onClick={handleCloseDialog}
                disabled={isGenerating}
              >
                Cancel
              </Button>
              <GenerateButton
                onClick={handleGenerate}
                disabled={isGenerating || !description.trim()}
                prefixIcon={isGenerating ? <Loader size="14px" /> : <Star size="16px" />}
              >
                {isGenerating ? "Generating..." : "Generate"}
              </GenerateButton>
            </ButtonGroup>
          </Modal>
        </>
      )}
    </>
  )
}