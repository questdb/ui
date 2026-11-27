import React from "react"
import { ArrowRightIcon, ChatsCircleIcon } from "@phosphor-icons/react"
import { useOpenConnectCodingAgent } from "../../../components/ConnectCodingAgent"
import type { ChatAgent } from "../../../utils/localAgent/chatAgents"
import { RowAction, RowMessage, StatusRow } from "./popoverParts"

// MCP mode: the same agent can also work in the AI Assistant. The connect
// command runs that agent when the console knows which one it is.
export const CodingAgentChatInvite = ({
  onOpen,
  chatAgent,
}: {
  onOpen: () => void
  chatAgent: ChatAgent | null
}) => {
  const openConnectCodingAgent = useOpenConnectCodingAgent()

  const setUp = () => {
    onOpen()
    openConnectCodingAgent("mcp_popover", chatAgent)
  }

  return (
    <StatusRow $tone="info" data-hook="mcp-pair-chat-invite">
      <ChatsCircleIcon size={16} weight="duotone" />
      <RowMessage>
        {chatAgent?.label ?? "Your agent"} can also work in the AI Assistant.
      </RowMessage>
      <RowAction
        type="button"
        onClick={setUp}
        data-hook="mcp-pair-chat-invite-setup"
      >
        Connect
        <ArrowRightIcon size={13} />
      </RowAction>
    </StatusRow>
  )
}
