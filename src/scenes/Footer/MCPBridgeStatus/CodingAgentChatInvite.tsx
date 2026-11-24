import React from "react"
import { ArrowRightIcon, ChatsCircleIcon } from "@phosphor-icons/react"
import { useOpenConnectCodingAgent } from "../../../components/ConnectCodingAgent"
import { InfoRow, RowAction, RowMessage } from "./popoverParts"

export const CodingAgentChatInvite = ({ onOpen }: { onOpen: () => void }) => {
  const openConnectCodingAgent = useOpenConnectCodingAgent()

  const setUp = () => {
    onOpen()
    openConnectCodingAgent("mcp_popover")
  }

  return (
    <InfoRow $tone="info" data-hook="mcp-pair-chat-invite">
      <ChatsCircleIcon size={16} weight="duotone" />
      <RowMessage>
        You can also chat with your coding agent in the console.
      </RowMessage>
      <RowAction
        type="button"
        onClick={setUp}
        data-hook="mcp-pair-chat-invite-setup"
      >
        Set up
        <ArrowRightIcon size={13} />
      </RowAction>
    </InfoRow>
  )
}
