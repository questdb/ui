import React, { useMemo } from "react"
import styled from "styled-components"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { getAllModelOptions } from "../../utils/ai"
import { useAIStatus } from "../../providers/AIStatusProvider"
import { StoreKey } from "../../utils/localStorage/types"
import { OpenAIIcon } from "./OpenAIIcon"
import { AnthropicIcon } from "./AnthropicIcon"
import { BrainIcon } from "./BrainIcon"
import { PlugsIcon, WarningCircleIcon } from "@phosphor-icons/react"
import { SelectMenu } from "../SelectMenu"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"

const ModelName = styled.span`
  display: flex;
  align-items: center;
  gap: 0.6rem;
`

export const ModelDropdown = () => {
  const { aiAssistantSettings, updateSettings } = useLocalStorage()
  const {
    isConfigured,
    models: enabledModelValues,
    currentModel,
  } = useAIStatus()
  const enabledModels = useMemo(() => {
    return getAllModelOptions(aiAssistantSettings).filter((model) =>
      enabledModelValues.includes(model.value),
    )
  }, [enabledModelValues, aiAssistantSettings])

  const handleModelSelect = (modelValue: string) => {
    void trackEvent(ConsoleEvent.AI_MODEL_CHANGE)
    updateSettings(StoreKey.AI_ASSISTANT_SETTINGS, {
      ...aiAssistantSettings,
      selectedModel: modelValue,
    })
  }

  if (!isConfigured) {
    return null
  }

  // currentModel is guaranteed to be from MODEL_OPTIONS (set in modals)
  const displayModel = currentModel
    ? (enabledModels.find((m) => m.value === currentModel) ?? enabledModels[0])
    : (enabledModels[0] ?? null)

  if (!displayModel) {
    return (
      <SelectMenu.TriggerButton
        disabled
        disabledTooltip="You can enable models in the AI Assistant settings"
        label="No models enabled"
        labelFontSize="1.3rem"
        leadingIcon={<WarningCircleIcon size={16} />}
        minWidth="17rem"
      />
    )
  }

  return (
    <SelectMenu.Root>
      <SelectMenu.Trigger
        dataHook="ai-settings-model-dropdown"
        label={displayModel.label}
        labelFontSize="1.3rem"
        minWidth="17rem"
        leadingIcon={
          displayModel.provider === "anthropic" ? (
            <AnthropicIcon width="16" height="16" />
          ) : displayModel.provider === "openai" ? (
            <OpenAIIcon width="16" height="16" />
          ) : (
            <PlugsIcon size={16} />
          )
        }
      />
      <SelectMenu.Portal>
        <SelectMenu.Content align="start" sideOffset={8} minWidth="22.8rem">
          <SelectMenu.Label>Select model</SelectMenu.Label>
          <SelectMenu.RadioGroup
            value={displayModel.value}
            onValueChange={handleModelSelect}
          >
            {enabledModels.map((model) => (
              <SelectMenu.Item
                data-hook="ai-settings-model-item"
                key={model.value}
                value={model.value}
                icon={
                  model.provider === "anthropic" ? (
                    <AnthropicIcon
                      width="16"
                      height="16"
                      color="currentColor"
                    />
                  ) : model.provider === "openai" ? (
                    <OpenAIIcon width="16" height="16" color="currentColor" />
                  ) : (
                    <PlugsIcon size={16} />
                  )
                }
              >
                <ModelName data-hook="ai-settings-model-item-label">
                  {model.label}
                  {model.isSlow && <BrainIcon color="currentColor" />}
                </ModelName>
              </SelectMenu.Item>
            ))}
          </SelectMenu.RadioGroup>
        </SelectMenu.Content>
      </SelectMenu.Portal>
    </SelectMenu.Root>
  )
}
