import { useEffect } from "react"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { useAIConversationActions } from "../../providers/AIConversationProvider"
import { onLocalAgentPairedViaLink } from "../../utils/localAgent/localAgentPairing"
import { withLocalAgentSelected } from "../../utils/localAgent/localAgentSettings"
import { StoreKey } from "../../utils/localStorage/types"

export const LocalAgentChatLauncher = () => {
  const { aiAssistantSettings, updateSettings } = useLocalStorage()
  const { openOrCreateBlankChatWindow } = useAIConversationActions()

  useEffect(
    () =>
      onLocalAgentPairedViaLink(() => {
        updateSettings(
          StoreKey.AI_ASSISTANT_SETTINGS,
          withLocalAgentSelected(aiAssistantSettings),
        )
        void openOrCreateBlankChatWindow()
      }),
    [aiAssistantSettings, updateSettings, openOrCreateBlankChatWindow],
  )

  return null
}
