import React, { useState, useContext } from "react"
import styled from "styled-components"
import { Button, Loader } from "@questdb/react-components"
import { InfoCircle } from "@styled-icons/boxicons-regular"
import { useSelector } from "react-redux"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import type { ClaudeAPIError, ClaudeExplanation } from "../../utils/claude"
import { isClaudeError, explainError, createSchemaClient } from "../../utils/claude"
import { toast } from "../Toast"
import { QuestContext } from "../../providers"
import { selectors } from "../../store"

const StyledExplainErrorButton = styled(Button)`
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

const ExplanationDialog = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 1px solid ${({ theme }) => theme.color.gray1};
  border-radius: 0.8rem;
  padding: 2rem;
  max-width: 60rem;
  max-height: 70vh;
  overflow-y: auto;
  z-index: 1000;
  box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.3);
`

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
`

const DialogHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.gray1};
`

const DialogTitle = styled.h3`
  margin: 0;
  color: ${({ theme }) => theme.color.foreground};
  font-size: 1.8rem;
`

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.color.gray2};
  font-size: 1.8rem;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 0.4rem;

  &:hover {
    color: ${({ theme }) => theme.color.foreground};
    background: ${({ theme }) => theme.color.selection};
  }
`

const ErrorSection = styled.div`
  margin-bottom: 1.5rem;
`

const SectionTitle = styled.h4`
  margin: 0 0 0.8rem 0;
  color: ${({ theme }) => theme.color.foreground};
  font-size: 1.4rem;
`

const CodeBlock = styled.pre`
  background: ${({ theme }) => theme.color.selection};
  border: 1px solid ${({ theme }) => theme.color.gray1};
  border-radius: 0.4rem;
  padding: 1rem;
  margin: 0.8rem 0;
  overflow-x: auto;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 1.3rem;
  line-height: 1.4;
  color: ${({ theme }) => theme.color.foreground};
`

const ExplanationText = styled.div`
  color: ${({ theme }) => theme.color.foreground};
  font-size: 1.4rem;
  line-height: 1.6;
  white-space: pre-wrap;
`

type Props = {
  query: string
  errorMessage: string
  disabled?: boolean
}

export const ExplainErrorButton = ({ query, errorMessage, disabled }: Props) => {
  const { aiAssistantSettings } = useLocalStorage()
  const { quest } = useContext(QuestContext)
  const tables = useSelector(selectors.query.getTables)
  const [isExplaining, setIsExplaining] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [explanation, setExplanation] = useState<string>('')

  const handleExplainError = async () => {
    const schemaClient = aiAssistantSettings.grantSchemaAccess ? createSchemaClient(tables, quest) : undefined

    setIsExplaining(true)
    const response = await explainError(query, errorMessage, aiAssistantSettings, schemaClient)

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

    setExplanation(result.explanation)
    setShowDialog(true)
    setIsExplaining(false)
  }

  const handleCloseDialog = () => {
    setShowDialog(false)
    setExplanation('')
  }

  if (!aiAssistantSettings.apiKey) {
    return null
  }

  return (
    <>
      <StyledExplainErrorButton
        size="sm"
        onClick={handleExplainError}
        disabled={disabled || isExplaining}
        prefixIcon={isExplaining ? <Loader size="14px" /> : <InfoCircle size="16px" />}
        title="Get AI explanation for this error"
        data-hook="button-explain-error"
      >
        {isExplaining ? "Getting help..." : "Why did this fail?"}
      </StyledExplainErrorButton>

      {showDialog && (
        <>
          <Overlay onClick={handleCloseDialog} />
          <ExplanationDialog>
            <DialogHeader>
              <DialogTitle>🤖 AI Error Explanation</DialogTitle>
              <CloseButton onClick={handleCloseDialog} title="Close">
                ×
              </CloseButton>
            </DialogHeader>

            <ErrorSection>
              <SectionTitle>SQL Query</SectionTitle>
              <CodeBlock>{query}</CodeBlock>
            </ErrorSection>

            <ErrorSection>
              <SectionTitle>Error Message</SectionTitle>
              <CodeBlock>{errorMessage}</CodeBlock>
            </ErrorSection>

            <ErrorSection>
              <SectionTitle>AI Explanation</SectionTitle>
              <ExplanationText>{explanation}</ExplanationText>
            </ErrorSection>
          </ExplanationDialog>
        </>
      )}
    </>
  )
}