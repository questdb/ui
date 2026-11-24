import React from "react"
import styled from "styled-components"
import { ChatsCircleIcon } from "@phosphor-icons/react"
import { Button } from "../../../components"
import { useOpenConnectCodingAgent } from "../../../components/ConnectCodingAgent"

const Root = styled.div`
  display: flex;
  gap: 1rem;
  margin: 0 1.6rem 1.2rem;
  padding: 1.2rem;
  border: 1px solid ${({ theme }) => theme.color.borderAccent};
  border-radius: 0.6rem;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};

  > svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.color.contentAccent};
  }
`

const Copy = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.6rem;
  line-height: 1.5;

  strong {
    color: ${({ theme }) => theme.color.contentPrimary};
    font-weight: 600;
  }
`

export const CodingAgentChatInvite = ({ onOpen }: { onOpen: () => void }) => {
  const openConnectCodingAgent = useOpenConnectCodingAgent()

  const setUp = () => {
    onOpen()
    openConnectCodingAgent("mcp_popover")
  }

  return (
    <Root data-hook="mcp-pair-chat-invite">
      <ChatsCircleIcon size={18} weight="duotone" />
      <Copy>
        <strong>New: chat with your coding agent in the console</strong>
        <span>
          Run one command, and your coding agent answers in the AI Assistant,
          with your login.
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={setUp}
          dataHook="mcp-pair-chat-invite-setup"
        >
          Set it up
        </Button>
      </Copy>
    </Root>
  )
}
