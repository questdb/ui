import { useEffect } from "react"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { useAIConversationActions } from "../../providers/AIConversationProvider"
import { LOCAL_AGENT_MODEL } from "../../utils/localAgent/localAgentModel"
import { onLocalAgentPairedViaLink } from "../../utils/localAgent/localAgentPairing"
import { StoreKey } from "../../utils/localStorage/types"

export const LocalAgentChatLauncher = () => {
  const { aiAssistantSettings, updateSettings } = useLocalStorage()
  const { openOrCreateBlankChatWindow } = useAIConversationActions()

  useEffect(
    () =>
      onLocalAgentPairedViaLink(() => {
        updateSettings(StoreKey.AI_ASSISTANT_SETTINGS, {
          ...aiAssistantSettings,
          selectedModel: LOCAL_AGENT_MODEL,
        })
        void openOrCreateBlankChatWindow()
      }),
    [aiAssistantSettings, updateSettings, openOrCreateBlankChatWindow],
  )

  return null
}
