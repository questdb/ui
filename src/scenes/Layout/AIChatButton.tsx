import React from "react"
import styled from "styled-components"
import { PrimaryToggleButton, IconWithTooltip, Box } from "../../components"
import { AISparkle } from "../../components/AISparkle"
import { useAIConversation } from "../../providers/AIConversationProvider"
import { useAIStatus } from "../../providers/AIStatusProvider"
import { useSelector } from "react-redux"
import { selectors } from "../../store"

const ChatButton = styled(PrimaryToggleButton)`
  padding: 0;
`

const TooltipWrapper = styled(Box).attrs({ justifyContent: "center" })`
  width: 100%;
  height: 100%;
`

export const AIChatButton = () => {
  const { openOrCreateBlankChatWindow, closeChatWindow } = useAIConversation()
  const { canUse } = useAIStatus()
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)

  if (!canUse) {
    return null
  }

  const handleClick = () => {
    if (activeSidebar === "aiChat") {
      closeChatWindow()
    } else {
      void openOrCreateBlankChatWindow()
    }
  }

  return (
    <ChatButton
      selected={activeSidebar === "aiChat"}
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
