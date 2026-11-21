import React from "react"
import styled from "styled-components"
import { PrimaryToggleButton, IconWithTooltip, Box } from "../../components"
import { AISparkle } from "../../components/AISparkle"
import { useAIConversationActions } from "../../providers/AIConversationProvider"
import { useAIStatus } from "../../providers/AIStatusProvider"
import { useSelector } from "react-redux"
import { selectors } from "../../store"
import { SIDEBAR_ICON_SIZE } from "../../consts"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { useLocalAgent } from "../../utils/localAgent/LocalAgentContext"
import { LOCAL_AGENT_MODEL } from "../../utils/localAgent/localAgentModel"
import { StoreKey } from "../../utils/localStorage/types"

const ChatButton = styled(PrimaryToggleButton)`
  padding: 0;
`

const TooltipWrapper = styled(Box).attrs({ justifyContent: "center" })`
  width: 100%;
  height: 100%;
`

export const AIChatButton = () => {
  const { openOrCreateBlankChatWindow, closeChatWindow } =
    useAIConversationActions()
  const { canUse } = useAIStatus()
  const { aiAssistantSettings, updateSettings } = useLocalStorage()
  const localAgent = useLocalAgent()
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)
  const isActive = activeSidebar?.type === "aiChat"

  if (!canUse && !isActive && !localAgent) {
    return null
  }

  const handleClick = () => {
    if (isActive) {
      closeChatWindow()
    } else {
      if (!canUse && localAgent) {
        updateSettings(StoreKey.AI_ASSISTANT_SETTINGS, {
          ...aiAssistantSettings,
          selectedModel: LOCAL_AGENT_MODEL,
        })
      }
      void openOrCreateBlankChatWindow()
    }
  }

  return (
    <ChatButton
      aria-label={isActive ? "Close AI Assistant" : "Open AI Assistant"}
      aria-pressed={isActive}
      selected={isActive}
      onClick={handleClick}
      data-hook="ai-chat-button"
    >
      <IconWithTooltip
        icon={
          <TooltipWrapper>
            <AISparkle size={SIDEBAR_ICON_SIZE} variant="filled" />
          </TooltipWrapper>
        }
        placement="left"
        tooltip="AI Assistant"
      />
    </ChatButton>
  )
}
