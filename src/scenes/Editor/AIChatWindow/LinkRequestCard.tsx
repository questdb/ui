import React, { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { ArrowSquareOutIcon } from "@phosphor-icons/react"
import { Button, CopyButton } from "../../../components"
import { AIStopButton } from "../../../components/AIStopButton"
import type { AgentQuestionMessage } from "../../../utils/localAgent/protocol"
import { Card, Footer, Header, Heading, QuestionText } from "./QuestionCard"

const Address = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  padding: 0.8rem 1rem;
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  border-radius: 0.6rem;
`

const Host = styled.span`
  font-size: 1.3rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
  overflow-wrap: anywhere;
`

const Url = styled.span`
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.1rem;
  line-height: 1.6rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Note = styled.p`
  margin: 0;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`

export const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

type LinkRequestCardProps = {
  agentLabel: string
  question: AgentQuestionMessage & { url: string }
  onAnswer: (answers: Record<string, never> | null) => void
  onStop: () => void
}

// Shown in place of the message box when the agent asks the user to open a
// page, like a sign-in for a service it connects to. The address is shown in
// full, its host first, so the user sees where it leads before opening it.
export const LinkRequestCard = ({
  agentLabel,
  question,
  onAnswer,
  onStop,
}: LinkRequestCardProps) => {
  const [answered, setAnswered] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [question.requestId])

  const finish = (opened: boolean) => {
    if (answered) return
    setAnswered(true)
    if (opened) window.open(question.url, "_blank", "noopener,noreferrer")
    onAnswer(opened ? {} : null)
  }

  return (
    <Card
      role="alertdialog"
      aria-labelledby={`link-${question.requestId}`}
      data-hook="chat-link-request"
    >
      <Header>
        <Heading
          id={`link-${question.requestId}`}
          ref={headingRef}
          tabIndex={-1}
        >
          {agentLabel} asks you to open a page
        </Heading>
        <AIStopButton
          size="sm"
          onClick={onStop}
          title="Stop the agent"
          ariaLabel="Stop the agent"
          dataHook="chat-question-stop"
        />
      </Header>
      {question.message && (
        <QuestionText data-hook="chat-link-message">
          {question.message}
        </QuestionText>
      )}
      <Address>
        <Host data-hook="chat-link-host">{hostOf(question.url)}</Host>
        <Url title={question.url}>{question.url}</Url>
      </Address>
      <Note>Opens in a new tab. Finish there, then come back here.</Note>
      <Footer>
        <Button
          size="sm"
          variant="primary"
          disabled={answered}
          onClick={() => finish(true)}
          trailingIcon={<ArrowSquareOutIcon size={14} />}
          data-hook="chat-link-open"
        >
          Open page
        </Button>
        <CopyButton
          text={question.url}
          size="sm"
          variant="ghost"
          title="Copy link"
          aria-label="Copy link"
          data-hook="chat-link-copy"
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={answered}
          onClick={() => finish(false)}
          data-hook="chat-link-decline"
        >
          Cancel
        </Button>
      </Footer>
    </Card>
  )
}
