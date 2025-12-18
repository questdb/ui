import React from "react"
import styled from "styled-components"
import { PrimaryToggleButton, IconWithTooltip, Box } from "../../components"
import { AISparkle } from "../../components/AISparkle"
import { useAIConversation } from "../../providers/AIConversationProvider"
import { useAIStatus } from "../../providers/AIStatusProvider"

const ChatButton = styled(PrimaryToggleButton)`
  padding: 0;
`

const TooltipWrapper = styled(Box).attrs({ justifyContent: "center" })`
  width: 100%;
  height: 100%;
`

export const AIChatButton = () => {
  const { chatWindowState, openOrCreateBlankChatWindow, closeChatWindow } =
    useAIConversation()
  const { canUse } = useAIStatus()

  if (!canUse) {
    return null
  }

  const handleClick = () => {
    if (chatWindowState.isOpen) {
      closeChatWindow()
    } else {
      openOrCreateBlankChatWindow()
    }
  }

  return (
    <ChatButton
      selected={chatWindowState.isOpen}
      onClick={handleClick}
      data-hook="ai-chat-button"
    >
      <IconWithTooltip
        icon={
          <TooltipWrapper>
            <AISparkle size={24} variant="filled" />
          </TooltipWrapper>
        }
        placement="left"
        tooltip="AI Assistant"
      />
    </ChatButton>
  )
}
