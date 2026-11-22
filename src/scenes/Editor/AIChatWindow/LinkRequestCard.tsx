import React, { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { ArrowSquareOutIcon } from "@phosphor-icons/react"
import { Button, CopyButton } from "../../../components"
import { AIStopButton } from "../../../components/AIStopButton"
import { focusCardHeading } from "./focusCardHeading"
import type { AgentQuestionMessage } from "../../../utils/localAgent/protocol"
import {
  AnswerSendError,
  Card,
  Footer,
  Header,
  Heading,
  QuestionBody,
  QuestionText,
} from "./QuestionCard"

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

const webAddress = (value: string): URL | null => {
  if (!/^https?:\/\/[^/?#]/i.test(value) || /[\s\\]/.test(value)) return null
  try {
    const address = new URL(value)
    return address.hostname &&
      (address.protocol === "https:" || address.protocol === "http:")
      ? address
      : null
  } catch {
    return null
  }
}

type LinkRequestCardProps = {
  agentLabel: string
  question: AgentQuestionMessage & { url: string }
  onAnswer: (answers: Record<string, never> | null) => boolean
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
  const [sendFailed, setSendFailed] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const requestedUrl = typeof question.url === "string" ? question.url : ""
  const address = webAddress(requestedUrl)

  useEffect(() => {
    focusCardHeading(headingRef.current)
  }, [question.requestId])

  const finish = (opened: boolean) => {
    if (answered || (opened && !address)) return
    const sent = onAnswer(opened ? {} : null)
    setAnswered(sent)
    setSendFailed(!sent)
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
      <QuestionBody>
        {question.message && (
          <QuestionText data-hook="chat-link-message">
            {question.message}
          </QuestionText>
        )}
        <Address>
          {address && <Host data-hook="chat-link-host">{address.host}</Host>}
          <Url title={requestedUrl}>{requestedUrl}</Url>
        </Address>
        {address ? (
          <Note>
            Open this page in a new tab or copy the link. After opening it, come
            back and confirm.
          </Note>
        ) : (
          <Note role="alert">
            This request needs a valid HTTP or HTTPS link.
          </Note>
        )}
        {sendFailed && <AnswerSendError />}
      </QuestionBody>
      <Footer>
        <Button
          size="sm"
          variant="secondary"
          disabled={answered || !address}
          onClick={() => {
            if (address)
              window.open(address.href, "_blank", "noopener,noreferrer")
          }}
          trailingIcon={<ArrowSquareOutIcon size={14} />}
          data-hook="chat-link-open"
        >
          Open page
        </Button>
        {address && (
          <CopyButton
            text={address.href}
            size="sm"
            variant="ghost"
            title="Copy link"
            aria-label="Copy link"
            data-hook="chat-link-copy"
          />
        )}
        <Button
          size="sm"
          variant="primary"
          disabled={answered || !address}
          onClick={() => finish(true)}
          data-hook="chat-link-confirm"
        >
          I opened the page
        </Button>
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
