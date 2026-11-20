import type {
  AiAssistantSettings,
  LocalAgentPreferences,
} from "../../providers/LocalStorageProvider/types"
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
