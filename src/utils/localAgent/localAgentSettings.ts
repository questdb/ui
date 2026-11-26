import type {
  AiAssistantSettings,
  LocalAgentPreferences,
} from "../../providers/LocalStorageProvider/types"
import { LOCAL_AGENT_MODEL } from "./localAgentModel"

// Selects the local agent. The API model selected so far is kept: it answers
// while the agent is offline (see getSelectedModel).
export const withLocalAgentSelected = (
  settings: AiAssistantSettings,
): AiAssistantSettings =>
  settings.selectedModel === LOCAL_AGENT_MODEL
    ? settings
    : {
        ...settings,
        selectedModel: LOCAL_AGENT_MODEL,
        localAgent: {
          ...settings.localAgent,
          apiModel: settings.selectedModel,
        },
      }

export type ResolvedLocalAgentPreferences = {
  model: string | null
  effort: string | null
}

export const localAgentPreferencesOf = (
  settings: AiAssistantSettings,
  agentId: string | undefined,
): ResolvedLocalAgentPreferences => {
  const preferences = agentId
    ? settings.localAgent?.preferences?.[agentId]
    : undefined
  return {
    model: preferences?.model ?? null,
    effort: preferences?.effort ?? null,
  }
}

export const withLocalAgentPreferences = (
  settings: AiAssistantSettings,
  agentId: string,
  patch: LocalAgentPreferences,
): AiAssistantSettings => ({
  ...settings,
  localAgent: {
    ...settings.localAgent,
    preferences: {
      ...settings.localAgent?.preferences,
      [agentId]: { ...settings.localAgent?.preferences?.[agentId], ...patch },
    },
  },
})
