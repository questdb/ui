import type {
  AiAssistantSettings,
  LocalAgentPreferences,
} from "../../providers/LocalStorageProvider/types"
import { LOCAL_AGENT_MODEL } from "./localAgentModel"

// The API model the user selected: while the local agent is selected, the
// one selected before it, which answers while the agent is offline.
export const selectedApiModelOf = (
  settings: AiAssistantSettings,
): string | undefined =>
  settings.selectedModel === LOCAL_AGENT_MODEL
    ? settings.localAgent?.apiModel
    : settings.selectedModel

// Selects an API model, as provider setup does, without deselecting the local
// agent: while the agent is selected, the model is the one that answers while
// the agent is offline. Only choosing an API model in the model picker
// replaces the agent's marker.
export const withApiModelSelected = (
  settings: AiAssistantSettings,
  model: string | undefined,
): AiAssistantSettings =>
  settings.selectedModel === LOCAL_AGENT_MODEL
    ? { ...settings, localAgent: { ...settings.localAgent, apiModel: model } }
    : { ...settings, selectedModel: model }

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
