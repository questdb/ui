import React, { useState, useCallback, useMemo, useRef } from "react"
import styled from "styled-components"
import * as RadixDialog from "@radix-ui/react-dialog"
import { Dialog } from "../Dialog"
import { Box } from "../Box"
import { Input } from "../Input"
import { Switch } from "../Switch"
import { Checkbox } from "../Checkbox"
import { Text } from "../Text"
import { Button } from "../Button"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { testApiKey } from "../../utils/aiAssistant"
import { StoreKey } from "../../utils/localStorage/types"
import { toast } from "../Toast"
import { Edit } from "@styled-icons/remix-line"
import { OpenAIIcon } from "./OpenAIIcon"
import { AnthropicIcon } from "./AnthropicIcon"
import { BrainIcon } from "./BrainIcon"
import { LoadingSpinner } from "../LoadingSpinner"
import { Overlay } from "../Overlay"
import {
  getAllProviders,
  MODEL_OPTIONS,
  type ModelOption,
  type Provider,
  getNextModel,
} from "../../utils/aiAssistantSettings"
import type { AiAssistantSettings } from "../../providers/LocalStorageProvider/types"
import { ForwardRef } from "../ForwardRef"
import { Badge, BadgeType } from "../../components/Badge"
import { CheckboxCircle } from "@styled-icons/remix-fill"

const ModalContent = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
`

const StyledContent = styled(Dialog.Content).attrs({
  maxwidth: "72rem",
})`
  display: flex;
  flex-direction: column;
  max-height: 85vh;
  overflow: hidden;
`

const HeaderSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "1.6rem",
})`
  padding: 2.4rem;
  width: 100%;
  flex-shrink: 0;
`

const HeaderTitleRow = styled(Box).attrs({
  justifyContent: "space-between",
  align: "flex-start",
  gap: "1rem",
})`
  width: 100%;
`

const HeaderText = styled(Box).attrs({
  flexDirection: "column",
  gap: "1.2rem",
  align: "flex-start",
})`
  flex: 1;
`

const ModalTitle = styled(Dialog.Title)`
  font-size: 2.4rem;
  font-weight: 600;
  margin: 0;
  padding: 0;
  color: ${({ theme }) => theme.color.foreground};
  border: 0;
`

const ModalSubtitle = styled(Dialog.Description)`
  color: ${({ theme }) => theme.color.gray2};
  margin: 0;
  padding: 0;
`

const CloseButton = styled.button`
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.gray1};
  border-radius: 0.4rem;
  flex-shrink: 0;
  width: 2.2rem;
  height: 2.2rem;

  &:hover {
    color: ${({ theme }) => theme.color.foreground};
  }
`

const Separator = styled.div`
  height: 0.1rem;
  width: 100%;
  background: ${({ theme }) => theme.color.selection};
`

const MainContentArea = styled(Box)`
  display: flex;
  flex-direction: row;
  width: 100%;
  align-items: stretch;
  min-height: 0;
  flex: 1;
  gap: 0;
  overflow: hidden;
`

const Sidebar = styled(Box).attrs({
  flexDirection: "column",
  gap: "1.2rem",
})`
  padding: 0;
  padding-top: 2.4rem;
  width: 15.1rem;
  flex-shrink: 0;
  overflow-y: auto;
`

const ProviderTab = styled.button<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.2rem 2.4rem;
  background: ${({ $active, theme }) =>
    $active ? theme.color.midnight : "transparent"};
  border: none;
  border-bottom: ${({ $active, theme }) =>
    $active ? "0.2rem solid " + theme.color.pinkPrimary : "none"};
  cursor: pointer;
  align-items: flex-start;
  width: 100%;

  &:hover {
    background: ${({ $active, theme }) =>
      $active ? theme.color.midnight : theme.color.selection};
  }
`

const ProviderTabTitle = styled(Box).attrs({
  gap: "0.6rem",
  align: "center",
})`
  width: 100%;
`

const ProviderTabName = styled(Text)<{ $active: boolean }>`
  font-size: 1.6rem;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  color: ${({ theme, $active }) =>
    $active ? theme.color.foreground : theme.color.gray2};
`

const StatusBadge = styled(Box).attrs({
  gap: "0.4rem",
  align: "center",
})<{ $enabled: boolean }>`
  background: ${({ $enabled }) => ($enabled ? "transparent" : "#2d303e")};
  padding: 0.3rem;
  border-radius: 0.2rem;
`

const StatusDot = styled.div<{ $enabled: boolean }>`
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: ${({ $enabled, theme }) =>
    $enabled ? theme.color.green : theme.color.gray2};
`

const StatusText = styled(Text)<{ $enabled: boolean }>`
  font-size: 1rem;
  font-weight: 400;
  color: ${({ $enabled, theme }) => ($enabled ? theme.color.green : "#bbbbbb")};
`

const VerticalSeparator = styled.div`
  width: 0.1rem;
  background: ${({ theme }) => theme.color.selection};
  flex-shrink: 0;
  align-self: stretch;
`

const ContentPanel = styled(Box).attrs({
  flexDirection: "column",
  gap: "2.8rem",
})`
  flex: 1;
  padding: 2.4rem;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
`

const ContentSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "1.2rem",
  align: "stretch",
})`
  width: 100%;
`

const SectionTitle = styled(Text)`
  font-size: 1.6rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.foreground};
`

const SectionDescription = styled(Text)`
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.gray2};
`

const InputWrapper = styled(Box)`
  position: relative;
  width: 100%;
`

const StyledInput = styled(Input)<{
  $hasError?: boolean
  $showEditButton?: boolean
}>`
  width: 100%;
  background: ${({ theme }) => theme.color.background};
  border: 0.1rem solid
    ${({ theme, $hasError }) => ($hasError ? theme.color.red : "#6b7280")};
  border-radius: 0.8rem;
  padding: 1.2rem;
  padding-right: ${({ $showEditButton }) =>
    $showEditButton ? "4rem" : "1.2rem"};
  color: ${({ theme }) => theme.color.foreground};
  font-size: 1.4rem;

  &::placeholder {
    color: ${({ theme }) => theme.color.gray2};
    font-family: inherit;
  }
`

const EditButton = styled.button`
  position: absolute;
  right: 1.2rem;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.gray1};
  width: 2rem;
  height: 2rem;

  &:hover {
    color: ${({ theme }) => theme.color.foreground};
  }
`

const ValidatedBadge = styled(Badge).attrs({
  type: BadgeType.SUCCESS,
})`
  font-size: 1rem;
  margin-right: auto;
  padding: 0.3rem 0.6rem;
  height: 2rem;
  border: 0;
`

const APIKeyLink = styled.a`
  color: ${({ theme }) => theme.color.gray2};

  &:hover {
    text-decoration: underline;
    color: ${({ theme }) => theme.color.foreground};
  }
`

const ErrorText = styled(Text)`
  color: ${({ theme }) => theme.color.red};
  font-size: 1.3rem;
`

const ValidateRemoveButton = styled.button`
  height: 3rem;
  border: 0.1rem solid ${({ theme }) => theme.color.pinkDarker};
  background: ${({ theme }) => theme.color.background};
  color: ${({ theme }) => theme.color.foreground};
  border-radius: 0.4rem;
  padding: 0.6rem 1.2rem;
  font-size: 1.4rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.pinkDarker};
    color: ${({ theme }) => theme.color.foreground};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const ModelsPlaceholder = styled(Box).attrs({
  flexDirection: "column",
  gap: "1rem",
})`
  background: rgba(68, 71, 90, 0.56);
  padding: 0.75rem;
  border-radius: 0.4rem;
  width: 100%;
`

const ModelsPlaceholderText = styled(Text)`
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.gray2};
`

const ModelList = styled(Box).attrs({ flexDirection: "column", gap: "1.6rem" })`
  width: 100%;
`

const ModelToggleRow = styled(Box).attrs({
  justifyContent: "space-between",
  align: "center",
  gap: "2.4rem",
})`
  width: 100%;
`

const ModelInfoColumn = styled(Box).attrs({
  flexDirection: "column",
  gap: "0.8rem",
})`
  flex: 1;
  align-items: flex-start;
`

const ModelInfoRow = styled(Box).attrs({
  gap: "0.8rem",
  align: "center",
})`
  width: 100%;
`

const ModelDescriptionText = styled(Text)`
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.gray2};
  flex: 1;
`

const ModelNameText = styled(Text)`
  font-size: 1.4rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.foreground};
`

const EnableModelsTitle = styled(Text)`
  font-size: 1.6rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.foreground};
`

const SchemaAccessSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "1.6rem",
})`
  width: 100%;
`

const SchemaAccessHeader = styled(Box).attrs({
  justifyContent: "space-between",
  align: "center",
  gap: "1rem",
})`
  width: 100%;
`

const SchemaAccessTitle = styled(Text)`
  font-size: 1.6rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.foreground};
  flex: 1;
`

const SchemaCheckboxContainer = styled(Box).attrs({
  gap: "1.5rem",
  align: "flex-start",
})`
  background: rgba(68, 71, 90, 0.56);
  padding: 0.75rem;
  border-radius: 0.4rem;
  width: 100%;
`

const SchemaCheckboxInner = styled(Box).attrs({
  gap: "1.5rem",
  align: "center",
})`
  flex: 1;
  padding: 0.75rem;
  border-radius: 0.5rem;
`

const SchemaCheckboxWrapper = styled.div`
  flex-shrink: 0;
  display: flex;
  align-items: center;
`

const SchemaCheckboxContent = styled(Box).attrs({
  flexDirection: "column",
  gap: "0.6rem",
})`
  flex: 1;
`

const SchemaCheckboxLabel = styled(Text)`
  font-size: 1.4rem;
  font-weight: 500;
  color: ${({ theme }) => theme.color.foreground};
`

const SchemaCheckboxDescription = styled(Text)`
  font-size: 1.3rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.gray2};
`

const SchemaCheckboxDescriptionBold = styled.span`
  font-weight: 500;
  color: ${({ theme }) => theme.color.foreground};
`

const FooterSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "2rem",
})`
  padding: 2.4rem 2.4rem 0.4rem 2.4rem;
  width: 100%;
  flex-shrink: 0;
`

const FooterButtons = styled(Box).attrs({
  justifyContent: "flex-end",
  align: "center",
  gap: "1.6rem",
})`
  width: 100%;
`

const CancelButton = styled(Button)`
  flex: 1;
  padding: 1.1rem 1.2rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 1.4rem;
  font-weight: 500;
  width: 100%;
  height: 4rem;
`

const SaveButton = styled(Button)`
  padding: 1.1rem 1.2rem;
  font-size: 1.4rem;
  font-weight: 500;
  flex: 1;
  height: 4rem;
  width: 100%;
`

type SettingsModalProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const getProviderName = (provider: Provider) => {
  return provider === "openai" ? "OpenAI" : "Anthropic"
}

const getModelsForProvider = (provider: Provider): ModelOption[] => {
  return MODEL_OPTIONS.filter((m) => m.provider === provider)
}

const getProvidersWithApiKeys = (settings: AiAssistantSettings): Provider[] => {
  const providers: Provider[] = []
  const allProviders = getAllProviders()
  for (const provider of allProviders) {
    if (settings.providers?.[provider]?.apiKey) {
      providers.push(provider)
    }
  }
  return providers
}

export const SettingsModal = ({ open, onOpenChange }: SettingsModalProps) => {
  const { aiAssistantSettings, updateSettings } = useLocalStorage()
  const initializeProviderState = useCallback(
    <T,>(
      getValue: (provider: Provider) => T,
      defaultValue: T,
    ): Record<Provider, T> => {
      const allProviders = getAllProviders()
      const state = {} as Record<Provider, T>
      for (const provider of allProviders) {
        state[provider] = getValue(provider) ?? defaultValue
      }
      return state
    },
    [],
  )

  const [selectedProvider, setSelectedProvider] = useState<Provider>(() => {
    const providersWithKeys = getProvidersWithApiKeys(aiAssistantSettings)
    return providersWithKeys[0] || getAllProviders()[0]
  })
  const [apiKeys, setApiKeys] = useState<Record<Provider, string>>(() =>
    initializeProviderState(
      (provider) => aiAssistantSettings.providers?.[provider]?.apiKey || "",
      "",
    ),
  )
  const [enabledModels, setEnabledModels] = useState<
    Record<Provider, string[]>
  >(() =>
    initializeProviderState(
      (provider) =>
        aiAssistantSettings.providers?.[provider]?.enabledModels || [],
      [],
    ),
  )
  const [grantSchemaAccess, setGrantSchemaAccess] = useState<
    Record<Provider, boolean>
  >(() =>
    initializeProviderState(
      (provider) =>
        aiAssistantSettings.providers?.[provider]?.grantSchemaAccess !== false,
      true,
    ),
  )
  const [validatedApiKeys, setValidatedApiKeys] = useState<
    Record<Provider, boolean>
  >(() =>
    initializeProviderState(
      (provider) => !!aiAssistantSettings.providers?.[provider]?.apiKey,
      false,
    ),
  )
  const [validationState, setValidationState] = useState<
    Record<Provider, "idle" | "validating" | "validated" | "error">
  >(() => initializeProviderState(() => "idle" as const, "idle" as const))
  const [validationErrors, setValidationErrors] = useState<
    Record<Provider, string | null>
  >(() => initializeProviderState(() => null, null))
  const [isInputFocused, setIsInputFocused] = useState<
    Record<Provider, boolean>
  >(() => initializeProviderState(() => false, false))
  const inputRef = useRef<HTMLInputElement>(null)

  const handleProviderSelect = useCallback((provider: Provider) => {
    setSelectedProvider(provider)
    setValidationErrors((prev) => ({ ...prev, [provider]: null }))
  }, [])

  const handleApiKeyChange = useCallback(
    (provider: Provider, value: string) => {
      setApiKeys((prev) => ({ ...prev, [provider]: value }))
      setValidationErrors((prev) => ({ ...prev, [provider]: null }))
      // If API key changes, mark as not validated
      if (validatedApiKeys[provider]) {
        setValidatedApiKeys((prev) => ({ ...prev, [provider]: false }))
      }
    },
    [validatedApiKeys],
  )

  const handleValidateApiKey = useCallback(
    async (provider: Provider) => {
      const apiKey = apiKeys[provider]
      if (!apiKey) {
        setValidationErrors((prev) => ({
          ...prev,
          [provider]: "Please enter an API key",
        }))
        return
      }

      setValidationState((prev) => ({ ...prev, [provider]: "validating" }))
      setValidationErrors((prev) => ({ ...prev, [provider]: null }))

      const providerModels = getModelsForProvider(provider)
      if (providerModels.length === 0) {
        setValidationState((prev) => ({ ...prev, [provider]: "error" }))
        setValidationErrors((prev) => ({
          ...prev,
          [provider]: "No models available for this provider",
        }))
        return
      }

      const testModel = (
        providerModels.find((m) => m.isTestModel) ?? providerModels[0]
      ).value
      try {
        const result = await testApiKey(apiKey, testModel)
        if (!result.valid) {
          setValidationState((prev) => ({ ...prev, [provider]: "error" }))
          setValidationErrors((prev) => ({
            ...prev,
            [provider]: result.error || "Invalid API key",
          }))
        } else {
          const defaultModels = MODEL_OPTIONS.filter(
            (m) => m.defaultEnabled && m.provider === provider,
          ).map((m) => m.value)
          if (defaultModels.length > 0) {
            setEnabledModels((prev) => ({ ...prev, [provider]: defaultModels }))
          }
          setValidationState((prev) => ({ ...prev, [provider]: "validated" }))
          setValidatedApiKeys((prev) => ({ ...prev, [provider]: true }))
          setValidationErrors((prev) => ({ ...prev, [provider]: null }))
        }
      } catch (err) {
        setValidationState((prev) => ({ ...prev, [provider]: "error" }))
        const errorMessage =
          err instanceof Error ? err.message : "Failed to validate API key"
        setValidationErrors((prev) => ({ ...prev, [provider]: errorMessage }))
      }
    },
    [apiKeys],
  )

  const handleRemoveApiKey = useCallback((provider: Provider) => {
    // Remove API key from local state only
    // Settings will be persisted when Save Settings is clicked
    setApiKeys((prev) => ({ ...prev, [provider]: "" }))
    setValidatedApiKeys((prev) => ({ ...prev, [provider]: false }))
    setValidationState((prev) => ({ ...prev, [provider]: "idle" }))
    setValidationErrors((prev) => ({ ...prev, [provider]: null }))
    setIsInputFocused((prev) => ({ ...prev, [provider]: false }))
  }, [])

  const handleModelToggle = useCallback(
    (provider: Provider, modelValue: string) => {
      setEnabledModels((prev) => {
        const current = prev[provider]
        const isEnabled = current.includes(modelValue)
        return {
          ...prev,
          [provider]: isEnabled
            ? current.filter((m) => m !== modelValue)
            : [...current, modelValue],
        }
      })
    },
    [],
  )

  const handleSchemaAccessChange = useCallback(
    (provider: Provider, checked: boolean) => {
      setGrantSchemaAccess((prev) => ({ ...prev, [provider]: checked }))
    },
    [],
  )

  const handleSave = useCallback(() => {
    const updatedProviders = { ...aiAssistantSettings.providers }
    const allProviders = getAllProviders()

    for (const provider of allProviders) {
      if (validatedApiKeys[provider]) {
        // Only save providers with validated API keys
        updatedProviders[provider] = {
          apiKey: apiKeys[provider],
          enabledModels: enabledModels[provider],
          grantSchemaAccess: grantSchemaAccess[provider],
        }
      } else {
        // Remove provider entry if no validated API key
        delete updatedProviders[provider]
      }
    }

    const updatedSettings: AiAssistantSettings = {
      ...aiAssistantSettings,
      providers: updatedProviders,
    }

    const nextModel = getNextModel(updatedSettings.selectedModel, enabledModels)
    updatedSettings.selectedModel = nextModel || undefined

    updateSettings(StoreKey.AI_ASSISTANT_SETTINGS, updatedSettings)
    toast.success("Settings saved successfully")
    onOpenChange?.(false)
  }, [
    aiAssistantSettings,
    apiKeys,
    enabledModels,
    grantSchemaAccess,
    validatedApiKeys,
    updateSettings,
    onOpenChange,
  ])

  const handleClose = useCallback(() => {
    onOpenChange?.(false)
  }, [onOpenChange])

  const currentProviderValidated = validatedApiKeys[selectedProvider]
  const currentProviderApiKey = apiKeys[selectedProvider]
  const currentProviderValidationState = validationState[selectedProvider]
  const currentProviderError = validationErrors[selectedProvider]
  const currentProviderIsFocused = isInputFocused[selectedProvider]
  const maskInput = !!(currentProviderApiKey && !currentProviderIsFocused)

  const modelsForProvider = useMemo(
    () => getModelsForProvider(selectedProvider),
    [selectedProvider],
  )

  const enabledModelsForProvider = useMemo(
    () => enabledModels[selectedProvider],
    [enabledModels, selectedProvider],
  )

  const allProviders = useMemo(() => getAllProviders(), [])

  const renderProviderIcon = (provider: Provider, isActive: boolean) => {
    const color = isActive ? "#f8f8f2" : "#9ca3af"
    if (provider === "openai") {
      return <OpenAIIcon width="20" height="20" color={color} />
    }
    return <AnthropicIcon width="20" height="20" color={color} />
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <ForwardRef>
          <Overlay primitive={RadixDialog.Overlay} />
        </ForwardRef>
        <StyledContent aria-describedby="ai-settings-modal-description">
          <ModalContent>
            <HeaderSection>
              <HeaderTitleRow>
                <HeaderText>
                  <ModalTitle>Assistant Settings</ModalTitle>
                  <ModalSubtitle id="ai-settings-modal-description">
                    Modify settings for your AI assistant, set up new providers,
                    and review access.
                  </ModalSubtitle>
                </HeaderText>
                <CloseButton onClick={handleClose}>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M15 5L5 15M5 5L15 15"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </CloseButton>
              </HeaderTitleRow>
            </HeaderSection>
            <Separator />
            <MainContentArea>
              <Sidebar>
                {allProviders.map((provider) => {
                  const isActive = selectedProvider === provider
                  return (
                    <ProviderTab
                      key={provider}
                      $active={isActive}
                      onClick={() => handleProviderSelect(provider)}
                    >
                      <ProviderTabTitle>
                        {renderProviderIcon(provider, isActive)}
                        <ProviderTabName $active={isActive}>
                          {getProviderName(provider)}
                        </ProviderTabName>
                      </ProviderTabTitle>
                      <StatusBadge $enabled={validatedApiKeys[provider]}>
                        <StatusDot $enabled={validatedApiKeys[provider]} />
                        <StatusText $enabled={validatedApiKeys[provider]}>
                          {validatedApiKeys[provider] ? "Enabled" : "Inactive"}
                        </StatusText>
                      </StatusBadge>
                    </ProviderTab>
                  )
                })}
              </Sidebar>
              <VerticalSeparator />
              <ContentPanel>
                <ContentSection>
                  <Box flexDirection="column" gap="1.2rem" align="flex-start">
                    <Box
                      justifyContent="space-between"
                      align="center"
                      gap="1rem"
                      style={{ width: "100%" }}
                    >
                      <SectionTitle>API Key</SectionTitle>
                      {validatedApiKeys[selectedProvider] && (
                        <ValidatedBadge icon={<CheckboxCircle size="13px" />}>
                          Validated
                        </ValidatedBadge>
                      )}
                      <Text size="sm" color="gray2">
                        Get your API key from{" "}
                        <APIKeyLink
                          href={
                            selectedProvider === "openai"
                              ? "https://platform.openai.com/api-keys"
                              : "https://console.anthropic.com/settings/keys"
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {getProviderName(selectedProvider)}
                        </APIKeyLink>
                        .
                      </Text>
                    </Box>
                    <InputWrapper>
                      <StyledInput
                        ref={inputRef}
                        type="text"
                        value={
                          maskInput
                            ? "••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"
                            : currentProviderApiKey
                        }
                        autoComplete="off"
                        onChange={(e) => {
                          handleApiKeyChange(selectedProvider, e.target.value)
                        }}
                        placeholder={`Enter ${getProviderName(selectedProvider)} API key`}
                        $hasError={!!currentProviderError}
                        $showEditButton={maskInput}
                        readOnly={maskInput}
                        onFocus={() => {
                          setIsInputFocused((prev) => ({
                            ...prev,
                            [selectedProvider]: true,
                          }))
                        }}
                        onBlur={() => {
                          setIsInputFocused((prev) => ({
                            ...prev,
                            [selectedProvider]: false,
                          }))
                          if (inputRef.current) {
                            inputRef.current.blur()
                          }
                        }}
                        onMouseDown={(e) => {
                          if (maskInput) {
                            e.preventDefault()
                          }
                        }}
                        tabIndex={maskInput ? -1 : 0}
                        style={{
                          cursor: maskInput ? "default" : "text",
                        }}
                      />
                      {maskInput && (
                        <EditButton
                          type="button"
                          onClick={() => {
                            inputRef.current?.focus()
                          }}
                          title="Edit API key"
                        >
                          <Edit size="20px" />
                        </EditButton>
                      )}
                    </InputWrapper>
                    {currentProviderError && (
                      <ErrorText>{currentProviderError}</ErrorText>
                    )}
                    {!currentProviderError && (
                      <SectionDescription>
                        Stored locally in your browser and never sent to QuestDB
                        servers. This API key is used to authenticate your
                        requests to the model provider.
                      </SectionDescription>
                    )}
                    <ValidateRemoveButton
                      onClick={() =>
                        currentProviderValidated
                          ? handleRemoveApiKey(selectedProvider)
                          : handleValidateApiKey(selectedProvider)
                      }
                      disabled={
                        currentProviderValidationState === "validating" ||
                        (!currentProviderValidated && !currentProviderApiKey)
                      }
                    >
                      {currentProviderValidationState === "validating" ? (
                        <Box gap="0.8rem" align="center">
                          <LoadingSpinner size="1.6rem" />
                          <span>Validating...</span>
                        </Box>
                      ) : currentProviderValidated ? (
                        "Remove API Key"
                      ) : (
                        "Validate API Key"
                      )}
                    </ValidateRemoveButton>
                  </Box>
                </ContentSection>
                <ContentSection>
                  <Box flexDirection="column" gap="1.6rem" align="flex-start">
                    <EnableModelsTitle>Enable Models</EnableModelsTitle>
                    {currentProviderValidated ? (
                      <ModelList>
                        {modelsForProvider.map((model) => {
                          const isEnabled = enabledModelsForProvider.includes(
                            model.value,
                          )
                          return (
                            <ModelToggleRow key={model.value}>
                              <ModelInfoColumn>
                                <ModelNameText>{model.label}</ModelNameText>
                                {model.isSlow && (
                                  <ModelInfoRow>
                                    <BrainIcon color="#bbb" />
                                    <ModelDescriptionText>
                                      Due to advanced reasoning &amp; thinking
                                      capabilities, responses using this model
                                      can be slow.
                                    </ModelDescriptionText>
                                  </ModelInfoRow>
                                )}
                              </ModelInfoColumn>
                              <Switch
                                checked={isEnabled}
                                onChange={() =>
                                  handleModelToggle(
                                    selectedProvider,
                                    model.value,
                                  )
                                }
                              />
                            </ModelToggleRow>
                          )
                        })}
                      </ModelList>
                    ) : (
                      <ModelsPlaceholder>
                        <ModelsPlaceholderText>
                          When you&apos;ve entered and validated your API key,
                          you&apos;ll be able to select and enable available
                          models.
                        </ModelsPlaceholderText>
                      </ModelsPlaceholder>
                    )}
                  </Box>
                </ContentSection>
                <ContentSection>
                  <SchemaAccessSection>
                    <SchemaAccessHeader>
                      <SchemaAccessTitle>Schema Access</SchemaAccessTitle>
                    </SchemaAccessHeader>
                    <SchemaCheckboxContainer>
                      <SchemaCheckboxInner>
                        <SchemaCheckboxWrapper>
                          <Checkbox
                            id={`schema-access-${selectedProvider}`}
                            checked={
                              selectedProvider === "openai"
                                ? grantSchemaAccess.openai
                                : grantSchemaAccess.anthropic
                            }
                            onChange={(e) =>
                              handleSchemaAccessChange(
                                selectedProvider,
                                e.target.checked,
                              )
                            }
                            disabled={!currentProviderValidated}
                          />
                        </SchemaCheckboxWrapper>
                        <SchemaCheckboxContent align="flex-start">
                          <SchemaCheckboxLabel>
                            Grant schema access to{" "}
                            {getProviderName(selectedProvider)}
                          </SchemaCheckboxLabel>
                          <SchemaCheckboxDescription>
                            When enabled, the AI assistant can access your
                            database schema information to provide more accurate
                            suggestions and explanations. Schema information
                            helps the AI understand your table structures,
                            column names, and relationships.{" "}
                            <SchemaCheckboxDescriptionBold>
                              The AI model will not have access to your data.
                            </SchemaCheckboxDescriptionBold>
                          </SchemaCheckboxDescription>
                        </SchemaCheckboxContent>
                      </SchemaCheckboxInner>
                    </SchemaCheckboxContainer>
                  </SchemaAccessSection>
                </ContentSection>
              </ContentPanel>
            </MainContentArea>
            <Separator />
            <FooterSection>
              <FooterButtons>
                <CancelButton onClick={handleClose} skin="transparent">
                  Cancel
                </CancelButton>
                <SaveButton onClick={handleSave} skin="primary">
                  Save Settings
                </SaveButton>
              </FooterButtons>
            </FooterSection>
          </ModalContent>
        </StyledContent>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
