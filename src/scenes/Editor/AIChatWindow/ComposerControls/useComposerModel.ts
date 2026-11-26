import { useMemo } from "react"
import { useLocalStorage } from "../../../../providers/LocalStorageProvider"
import { useAIStatus } from "../../../../providers/AIStatusProvider"
import { providerForModel } from "../../../../utils/ai"
import { StoreKey } from "../../../../utils/localStorage/types"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import {
  useLocalAgent,
  useLocalAgentChannel,
} from "../../../../utils/localAgent/LocalAgentContext"
import { LOCAL_AGENT_MODEL } from "../../../../utils/localAgent/localAgentModel"
import {
  localAgentPreferencesOf,
  withLocalAgentPreferences,
  withLocalAgentSelected,
} from "../../../../utils/localAgent/localAgentSettings"
import {
  buildModelGroups,
  effortControlFor,
  findOption,
  selectedOptionKey,
  type ModelSelection,
} from "./modelOptions"

// The model and effort the chat composer shows, and how picking one is saved:
// API models write the selected model and the provider's reasoning effort,
// an agent model selects the local agent and stores the agent's preferences.
export const useComposerModel = () => {
  const { aiAssistantSettings, updateSettings } = useLocalStorage()
  const { models: enabledModels, currentModel } = useAIStatus()
  const agent = useLocalAgent()
  const channel = useLocalAgentChannel()
  const agentPreferences = localAgentPreferencesOf(
    aiAssistantSettings,
    agent?.info.id,
  )

  const groups = useMemo(
    () => buildModelGroups(aiAssistantSettings, enabledModels, agent),
    [aiAssistantSettings, enabledModels, agent],
  )
  const selectedKey = selectedOptionKey(currentModel, agent, agentPreferences)
  const selected = findOption(groups, selectedKey)
  const effort = effortControlFor(
    currentModel,
    aiAssistantSettings,
    agent,
    agentPreferences,
  )

  const agentModelSelected =
    selected?.option?.selection.kind === "agent" &&
    selected.option.selection.model !== null
  const triggerLabel = !selected
    ? "Select model"
    : agentModelSelected
      ? `${selected.option?.label} · ${selected.group.label}`
      : selected.group.provider === null
        ? selected.group.label
        : (selected.option?.label ?? selected.group.label)

  const selectModel = (selection: ModelSelection) => {
    void trackEvent(ConsoleEvent.AI_MODEL_CHANGE)
    if (selection.kind === "api") {
      updateSettings(StoreKey.AI_ASSISTANT_SETTINGS, {
        ...aiAssistantSettings,
        selectedModel: selection.model,
      })
      return
    }
    updateSettings(
      StoreKey.AI_ASSISTANT_SETTINGS,
      withLocalAgentPreferences(
        withLocalAgentSelected(aiAssistantSettings),
        selection.agentId,
        selection.model === null ? {} : { model: selection.model },
      ),
    )
  }

  const selectEffort = (value: string) => {
    if (currentModel === LOCAL_AGENT_MODEL && agent) {
      updateSettings(
        StoreKey.AI_ASSISTANT_SETTINGS,
        withLocalAgentPreferences(aiAssistantSettings, agent.info.id, {
          effort: value,
        }),
      )
      return
    }
    const provider = currentModel
      ? providerForModel(currentModel, aiAssistantSettings)
      : null
    const providerSettings = provider
      ? aiAssistantSettings.providers?.[provider]
      : undefined
    if (!provider || !providerSettings) return
    updateSettings(StoreKey.AI_ASSISTANT_SETTINGS, {
      ...aiAssistantSettings,
      providers: {
        ...aiAssistantSettings.providers,
        [provider]: {
          ...providerSettings,
          reasoningEffort: value === "high" ? "high" : "default",
        },
      },
    })
  }

  return {
    usesAgent: currentModel === LOCAL_AGENT_MODEL && agent !== null,
    groups,
    selectedKey,
    triggerLabel,
    triggerProvider: selected?.group.provider ?? null,
    effort,
    agent,
    selectModel,
    selectEffort,
    restartAgent: () => channel?.restart(),
  }
}
