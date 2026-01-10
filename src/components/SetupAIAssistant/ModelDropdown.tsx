import React, { useMemo, useState } from "react"
import styled, { css } from "styled-components"
import { Check, Database2 } from "@styled-icons/remix-line"
import { Error as ErrorIcon } from "@styled-icons/boxicons-regular"
import { PopperToggle } from "../PopperToggle"
import { Box } from "../Box"
import { Text } from "../Text"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import {
  MODEL_OPTIONS,
  getAllModelsIncludingCustom,
  isCustomProvider,
  parseCustomModelValue,
  type ModelOption,
} from "../../utils/aiAssistantSettings"
import { useAIStatus } from "../../providers/AIStatusProvider"
import { StoreKey } from "../../utils/localStorage/types"
import { OpenAIIcon } from "./OpenAIIcon"
import { AnthropicIcon } from "./AnthropicIcon"
import { BrainIcon } from "./BrainIcon"
import { PopperHover } from "../PopperHover"
import { Tooltip } from "../Tooltip"

const ExpandUpDown = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="7"
    height="12"
    viewBox="0 0 7 12"
    fill="none"
  >
    <path
      d="M3.06 1.88667L5.17333 4L6.11333 3.06L3.06 0L0 3.06L0.946667 4L3.06 1.88667ZM3.06 10.1133L0.946667 8L0.00666682 8.94L3.06 12L6.12 8.94L5.17333 8L3.06 10.1133Z"
      fill="currentColor"
    />
  </svg>
)

const DropdownTrigger = styled.button<{ disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.75rem 1rem;
  background: ${({ theme }) => theme.color.background};
  border-radius: 0.4rem;
  border: none;
  color: ${({ theme }) => theme.color.gray2};
  font-size: 1.2rem;
  white-space: nowrap;
  height: 3rem;
  min-width: 17rem;
  justify-content: space-between;
  cursor: pointer;

  ${({ disabled }) =>
    disabled &&
    css`
      cursor: not-allowed;
      gap: 0.5rem;
      min-width: unset;
    `}

  &:focus-visible {
    outline: none;
  }
  &:focus {
    outline: none;
  }

  &:hover {
    background: ${({ theme }) => theme.color.comment};
    color: ${({ theme }) => theme.color.foreground};
  }

  ${({ disabled }) =>
    disabled &&
    css`
      &:hover {
        background: ${({ theme }) => theme.color.background};
        color: ${({ theme }) => theme.color.gray2};
      }
    `}

  > * {
    color: inherit;
  }
`

const DropdownIcon = styled(ExpandUpDown)`
  width: 1.6rem;
  height: 1.6rem;
  flex-shrink: 0;
  color: inherit;
`

const DropdownContent = styled.div`
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 0.6rem;
  padding: 1.2rem;
  box-shadow: 0 0.5rem 0.5rem 0 ${({ theme }) => theme.color.black40};
  min-width: 22.8rem;
  gap: 0.4rem;
  z-index: 9999;
`

const Title = styled(Text)`
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.gray2};
  margin: 0;
  margin-bottom: 0.4rem;
`

const ModelItem = styled.div<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.8rem;
  border-radius: 0.4rem;
  cursor: pointer;
  background: ${({ theme }) => theme.color.backgroundDarker};
  color: ${({ theme }) => theme.color.gray2};
  font-size: 1.2rem;
  line-height: 1.5;
  position: relative;
  margin: 0;
  box-shadow: inset 0px 1px 4px 0px rgba(0, 0, 0, 0.1);
  border: none;
  width: 100%;

  ${({ $selected }) =>
    $selected &&
    css`
      background: ${({ theme }) => theme.color.background};
      color: ${({ theme }) => theme.color.foreground};
    `}

  &:hover {
    background: ${({ theme }) => theme.color.background};
    color: ${({ theme }) => theme.color.foreground};
  }
`

const ModelIconTitle = styled(Box)`
  flex: 1;
  gap: 0.6rem;
  align-items: center;
`

const ModelLabel = styled(Text)`
  font-size: 1.2rem;
  color: inherit;
`

const CheckIcon = styled(Check)`
  width: 1.8rem;
  height: 1.8rem;
  color: ${({ theme }) => theme.color.green};
  flex-shrink: 0;
`

const ProviderGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;

  &:not(:first-child) {
    margin-top: 0.8rem;
    padding-top: 0.8rem;
    border-top: 1px solid ${({ theme }) => theme.color.selection};
  }
`

const ProviderGroupLabel = styled(Text)`
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.gray2};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 0.2rem 0.4rem;
`

const CustomProviderIcon = styled.div`
  width: 1.6rem;
  height: 1.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: inherit;
`

type ModelGroup = {
  provider: string
  label: string
  models: ModelOption[]
}

const getProviderIcon = (provider: string) => {
  if (provider === "openai") {
    return <OpenAIIcon width="16" height="16" color="#bbb" />
  }
  if (provider === "anthropic") {
    return <AnthropicIcon width="16" height="16" color="#bbb" />
  }
  // Custom provider
  return (
    <CustomProviderIcon>
      <Database2 size="1.4rem" />
    </CustomProviderIcon>
  )
}

export const ModelDropdown = () => {
  const { aiAssistantSettings, updateSettings } = useLocalStorage()
  const {
    isConfigured,
    models: enabledModelValues,
    currentModel,
  } = useAIStatus()
  const [dropdownActive, setDropdownActive] = useState(false)

  const allModels = useMemo(
    () => getAllModelsIncludingCustom(aiAssistantSettings),
    [aiAssistantSettings],
  )

  const enabledModels = useMemo(() => {
    return allModels.filter((model) => enabledModelValues.includes(model.value))
  }, [allModels, enabledModelValues])

  // Group models by provider
  const modelGroups = useMemo((): ModelGroup[] => {
    const groups: Map<string, ModelGroup> = new Map()

    // Define provider order: Anthropic, OpenAI, then custom providers
    const providerOrder = ["anthropic", "openai"]

    for (const model of enabledModels) {
      const provider = model.provider
      if (!groups.has(provider)) {
        let label: string
        if (provider === "anthropic") {
          label = "Anthropic"
        } else if (provider === "openai") {
          label = "OpenAI"
        } else {
          // Custom provider - get the name from settings
          const customProvider =
            aiAssistantSettings.customProviders?.[provider]
          label = customProvider?.name || provider
        }
        groups.set(provider, { provider, label, models: [] })
      }
      groups.get(provider)!.models.push(model)
    }

    // Sort groups: built-in providers first in order, then custom providers
    const sortedGroups: ModelGroup[] = []
    for (const p of providerOrder) {
      const group = groups.get(p)
      if (group) {
        sortedGroups.push(group)
        groups.delete(p)
      }
    }
    // Add remaining custom providers
    for (const group of groups.values()) {
      sortedGroups.push(group)
    }

    return sortedGroups
  }, [enabledModels, aiAssistantSettings.customProviders])

  const handleModelSelect = (modelValue: string) => {
    updateSettings(StoreKey.AI_ASSISTANT_SETTINGS, {
      ...aiAssistantSettings,
      selectedModel: modelValue,
    })
    setDropdownActive(false)
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
      <DropdownTrigger disabled>
        <PopperHover
          trigger={<ErrorIcon size="16" />}
          placement="bottom"
          modifiers={[
            {
              name: "offset",
              options: {
                offset: [0, 8],
              },
            },
          ]}
        >
          <Tooltip>
            <Text size="sm" color="foreground" margin="0">
              You can enable models in the AI Assistant settings
            </Text>
          </Tooltip>
        </PopperHover>
        <Text size="sm" color="foreground" margin="0">
          No models enabled
        </Text>
      </DropdownTrigger>
    )
  }

  return (
    <PopperToggle
      active={dropdownActive}
      onToggle={setDropdownActive}
      placement="bottom-start"
      modifiers={[
        {
          name: "offset",
          options: {
            offset: [0, 8],
          },
        },
      ]}
      trigger={
        <DropdownTrigger data-hook="ai-settings-model-dropdown">
          {displayModel.provider === "openai" ? (
            <OpenAIIcon width="16" height="16" />
          ) : displayModel.provider === "anthropic" ? (
            <AnthropicIcon width="16" height="16" />
          ) : (
            <CustomProviderIcon>
              <Database2 size="1.4rem" />
            </CustomProviderIcon>
          )}
          <Text size="sm" color="foreground" margin="0 auto 0 0">
            {displayModel.label}
          </Text>
          <DropdownIcon />
        </DropdownTrigger>
      }
    >
      <DropdownContent>
        <Title>Select Model</Title>
        {modelGroups.map((group) => (
          <ProviderGroup key={group.provider}>
            {modelGroups.length > 1 && (
              <ProviderGroupLabel>{group.label}</ProviderGroupLabel>
            )}
            {group.models.map((model) => {
              const isSelected = currentModel === model.value

              return (
                <ModelItem
                  data-hook="ai-settings-model-item"
                  key={model.value}
                  onClick={() => handleModelSelect(model.value)}
                  $selected={isSelected}
                >
                  <ModelIconTitle>
                    {getProviderIcon(model.provider)}
                    <ModelLabel data-hook="ai-settings-model-item-label">
                      {model.label}
                    </ModelLabel>
                    {model.isSlow && <BrainIcon color="#bbb" />}
                  </ModelIconTitle>
                  {isSelected && <CheckIcon />}
                </ModelItem>
              )
            })}
          </ProviderGroup>
        ))}
      </DropdownContent>
    </PopperToggle>
  )
}
