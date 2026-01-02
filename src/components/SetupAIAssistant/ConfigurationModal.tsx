import React, { useState, useMemo, useCallback } from "react"
import styled, { css } from "styled-components"
import { Dialog } from "../Dialog"
import { MultiStepModal, Step } from "../MultiStepModal"
import { Box } from "../Box"
import { Input } from "../Input"
import { Switch } from "../Switch"
import { Checkbox } from "../Checkbox"
import { Text } from "../Text"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { testApiKey } from "../../utils/aiAssistant"
import { StoreKey } from "../../utils/localStorage/types"
import { toast } from "../Toast"
import {
  MODEL_OPTIONS,
  type ModelOption,
  type Provider,
} from "../../utils/aiAssistantSettings"
import { useModalNavigation } from "../MultiStepModal"
import { OpenAIIcon } from "./OpenAIIcon"
import { AnthropicIcon } from "./AnthropicIcon"
import { BrainIcon } from "./BrainIcon"
import { theme } from "../../theme"

const ModalContent = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`

const HeaderSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "1.6rem",
})`
  padding: 2.4rem;
  padding-top: 0;
  width: 100%;
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

const StyledCloseButton = styled.button`
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

const ContentSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "2rem",
})`
  padding: 2.4rem;
  width: 100%;
`

const SectionTitle = styled(Text)`
  font-size: 1.8rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.foreground};
`

const SectionDescription = styled(Text)`
  font-size: 1.3rem;
  font-weight: 300;
  color: ${({ theme }) => theme.color.gray2};
`

const ProviderSelectionContainer = styled(Box).attrs({
  gap: "4rem",
  align: "center",
})`
  width: 100%;
`

const ProviderCardsContainer = styled(Box).attrs({
  gap: "2rem",
})`
  height: 8.5rem;
`

const ProviderCard = styled.button<{ $selected: boolean }>`
  background: #262833;
  border: 0.1rem solid ${({ theme }) => theme.color.selection};
  border-radius: 0.8rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 1.2rem 2rem;
  width: 10rem;
  height: 8.5rem;
  transition: all 0.2s;

  ${({ $selected, theme }) =>
    $selected &&
    `
    border-color: ${theme.color.foreground};
    box-shadow: 0 0 0 0.1rem ${theme.color.foreground};
    background: ${theme.color.midnight};
  `}

  &:hover {
    border-color: ${({ theme }) => theme.color.foreground};
  }

  &:focus-visible {
    outline: 0.2rem solid ${({ theme }) => theme.color.foreground};
    outline-offset: 0.2rem;
  }
`

const ProviderName = styled(Text)`
  font-size: 1.3rem;
  font-weight: 400;
  color: rgba(249, 250, 251, 0.8);
  text-align: center;
`

const ComingSoonContainer = styled(Box).attrs({
  flexDirection: "column",
  gap: "0.6rem",
  align: "flex-start",
})`
  width: 13.2rem;
`

const ComingSoonIcons = styled(Box).attrs({
  align: "center",
})`
  width: 100%;
  padding-left: 0;
  padding-right: 1.2rem;
`

const ComingSoonIcon = styled.img`
  width: 100%;
  height: auto;
  object-fit: contain;
`

const ComingSoonText = styled(Text)`
  font-size: 1.3rem;
  font-weight: 300;
  color: ${({ theme }) => theme.color.gray2};
`

const InputSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "1.2rem",
})`
  width: 100%;
`

const InputLabel = styled(Text)`
  font-size: 1.6rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.gray2};
`

const StyledInput = styled(Input)<{ $hasError?: boolean; disabled?: boolean }>`
  width: 100%;
  background: #262833;
  border: 0.1rem solid
    ${({ theme, $hasError }) => ($hasError ? theme.color.red : "#6b7280")};
  border-radius: 0.8rem;
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : "text")};
  font-size: 1.4rem;
  min-height: 3rem;
  text-security: disc;
  -webkit-text-security: disc;
  -moz-text-security: disc;

  &::placeholder {
    color: ${({ theme }) => theme.color.gray2};
    font-family: inherit;
  }

  ${({ disabled }) =>
    disabled &&
    css`
      opacity: 0.6;
      cursor: not-allowed;
    `}
`

const ErrorText = styled(Text)`
  color: ${({ theme }) => theme.color.red};
  font-size: 1.3rem;
`

const ModelList = styled(Box).attrs({ flexDirection: "column", gap: "1.2rem" })`
  width: 100%;
`

const StyledCheckbox = styled(Checkbox)`
  font-size: 1.4rem;
  display: inline;
`

const FormGroup = styled(Box).attrs({
  flexDirection: "column",
  gap: "1.6rem",
})`
  width: 100%;
  align-items: flex-start;
`

const ProviderBadge = styled(Box).attrs({
  gap: "0.6rem",
  align: "center",
})`
  background: #2d303e;
  padding: 0.6rem 0.8rem;
  border-radius: 0.4rem;
  box-shadow: inset 0 0.1rem 0.4rem rgba(0, 0, 0, 0.1);
`

const ProviderBadgeText = styled(Text)`
  font-size: 1.3rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.foreground};
  font-family: "Open Sans", sans-serif;
`

const EnableModelsSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "2rem",
})`
  width: 100%;
`

const EnableModelsHeader = styled(Box).attrs({
  justifyContent: "space-between",
  align: "center",
  gap: "1rem",
})`
  width: 100%;
`

const EnableModelsTitle = styled(Text)`
  font-size: 1.8rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.foreground};
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
  color: ${({ theme }) => theme.color.gray2};
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

const WarningText = styled(Text)`
  font-size: 1.3rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.gray2};
  padding: 2.4rem;
  text-align: left;
`

type ConfigurationModalProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const getProviderName = (provider: Provider | null) => {
  if (!provider) return ""
  return provider === "openai" ? "OpenAI" : "Anthropic"
}

type StepOneContentProps = {
  selectedProvider: Provider | null
  apiKey: string
  error: string | null
  providerName: string
  onProviderSelect: (provider: Provider) => void
  onApiKeyChange: (value: string) => void
}

type StepTwoContentProps = {
  selectedProvider: Provider | null
  enabledModels: string[]
  grantSchemaAccess: boolean
  modelsByProvider: { anthropic: ModelOption[]; openai: ModelOption[] }
  onModelToggle: (modelValue: string) => void
  onSchemaAccessChange: (checked: boolean) => void
}

const CloseButton = ({ onClick }: { onClick: () => void }) => {
  return (
    <StyledCloseButton onClick={onClick}>
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
    </StyledCloseButton>
  )
}

const StepOneContent = ({
  selectedProvider,
  apiKey,
  error,
  providerName,
  onProviderSelect,
  onApiKeyChange,
}: StepOneContentProps) => {
  const navigation = useModalNavigation()
  const handleClose: () => void = navigation.handleClose

  return (
    <ModalContent data-hook="ai-settings-modal-step-one">
      <HeaderSection>
        <HeaderTitleRow>
          <HeaderText>
            <ModalTitle>Add a model provider</ModalTitle>
            <ModalSubtitle id="step-0-description">
              Select an AI model provider and enter your API key. You&apos;ll be
              able to configure and switch between multiple providers later.
            </ModalSubtitle>
          </HeaderText>
          <CloseButton onClick={handleClose} />
        </HeaderTitleRow>
      </HeaderSection>
      <Separator />
      <ContentSection align="flex-start">
        <Box flexDirection="column" gap="2rem">
          <Box flexDirection="column" gap="0.8rem" align="flex-start">
            <SectionTitle>Select Provider</SectionTitle>
            <SectionDescription>
              We currently only support two model providers, with support for
              more coming soon.
            </SectionDescription>
          </Box>
          <ProviderSelectionContainer>
            <ProviderCardsContainer>
              <ProviderCard
                $selected={selectedProvider === "openai"}
                onClick={() => onProviderSelect("openai")}
                type="button"
                data-hook="ai-settings-provider-openai"
              >
                <OpenAIIcon
                  width="40"
                  height="40"
                  color={theme.color.foreground}
                />
                <ProviderName>OpenAI</ProviderName>
              </ProviderCard>
              <ProviderCard
                $selected={selectedProvider === "anthropic"}
                onClick={() => onProviderSelect("anthropic")}
                type="button"
                data-hook="ai-settings-provider-anthropic"
              >
                <AnthropicIcon
                  width="40"
                  height="40"
                  color={theme.color.foreground}
                />
                <ProviderName>Anthropic</ProviderName>
              </ProviderCard>
            </ProviderCardsContainer>
            <ComingSoonContainer>
              <ComingSoonIcons>
                <ComingSoonIcon
                  src="/assets/models-group-icon.svg"
                  alt="Coming soon providers"
                />
              </ComingSoonIcons>
              <ComingSoonText>Coming soon...</ComingSoonText>
            </ComingSoonContainer>
          </ProviderSelectionContainer>
        </Box>
      </ContentSection>
      <Separator />
      <ContentSection>
        <InputSection align="flex-start">
          <InputLabel>API Key</InputLabel>
          <StyledInput
            type="text"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={`Enter${providerName ? ` ${providerName}` : ""} API key`}
            $hasError={!!error}
            disabled={!selectedProvider}
            data-hook="ai-settings-api-key"
          />
          {error && (
            <ErrorText data-hook="ai-settings-api-key-error">{error}</ErrorText>
          )}
          <SectionDescription>
            Stored locally in your browser and never sent to QuestDB servers.
            This API key is used to authenticate your requests to the model
            provider.
          </SectionDescription>
        </InputSection>
      </ContentSection>
    </ModalContent>
  )
}

const StepTwoContent = ({
  selectedProvider,
  enabledModels,
  grantSchemaAccess,
  modelsByProvider,
  onModelToggle,
  onSchemaAccessChange,
}: StepTwoContentProps) => {
  const navigation = useModalNavigation()
  const handleClose: () => void = navigation.handleClose
  const currentProvider = selectedProvider

  const getModelsForProvider = (provider: Provider) => {
    return provider === "openai"
      ? modelsByProvider.openai
      : modelsByProvider.anthropic
  }

  return (
    <ModalContent data-hook="ai-settings-modal-step-two">
      <HeaderSection>
        <HeaderTitleRow>
          <HeaderText>
            <ModalTitle>Setup your model preferences</ModalTitle>
            <ModalSubtitle id="step-1-description">
              Enable and disable each of the models QuestDB currently supports
              from this provider, and a level of data access. You&apos;ll be
              able to update these settings any time.
            </ModalSubtitle>
          </HeaderText>
          <CloseButton onClick={handleClose} />
        </HeaderTitleRow>
      </HeaderSection>
      <Separator />
      <ContentSection>
        {currentProvider ? (
          <FormGroup>
            <EnableModelsSection>
              <EnableModelsHeader>
                <EnableModelsTitle>Enable Models</EnableModelsTitle>
                <ProviderBadge>
                  {currentProvider === "openai" ? (
                    <OpenAIIcon width="16" height="16" color="#fff" />
                  ) : (
                    <AnthropicIcon width="16" height="16" color="#fff" />
                  )}
                  <ProviderBadgeText>
                    {getProviderName(currentProvider)}
                  </ProviderBadgeText>
                </ProviderBadge>
              </EnableModelsHeader>
              <ModelList>
                {getModelsForProvider(currentProvider).map((model) => {
                  const isEnabled = enabledModels.includes(model.value)
                  return (
                    <ModelToggleRow
                      key={model.value}
                      data-model={model.label}
                      data-model-enabled={isEnabled}
                    >
                      <ModelInfoColumn>
                        <ModelNameText>{model.label}</ModelNameText>
                        {model.isSlow && (
                          <ModelInfoRow>
                            <BrainIcon color="#bbb" />
                            <ModelDescriptionText>
                              Due to advanced reasoning &amp; thinking
                              capabilities, responses using this model can be
                              slow.
                            </ModelDescriptionText>
                          </ModelInfoRow>
                        )}
                      </ModelInfoColumn>
                      <Switch
                        checked={isEnabled}
                        onChange={() => onModelToggle(model.value)}
                        data-checked={isEnabled}
                      />
                    </ModelToggleRow>
                  )
                })}
              </ModelList>
            </EnableModelsSection>
          </FormGroup>
        ) : (
          <SectionDescription>
            Please configure at least one provider in step 1 before enabling
            models.
          </SectionDescription>
        )}
      </ContentSection>
      <Separator />
      <ContentSection>
        {currentProvider && (
          <SchemaAccessSection>
            <SchemaAccessHeader>
              <SchemaAccessTitle>Schema Access</SchemaAccessTitle>
            </SchemaAccessHeader>
            <SchemaCheckboxContainer>
              <SchemaCheckboxInner>
                <SchemaCheckboxWrapper>
                  <StyledCheckbox
                    id={`schema-access-${currentProvider}`}
                    checked={grantSchemaAccess}
                    onChange={(e) => onSchemaAccessChange(e.target.checked)}
                    data-hook="ai-settings-schema-access"
                  />
                </SchemaCheckboxWrapper>
                <SchemaCheckboxContent align="flex-start">
                  <SchemaCheckboxLabel>
                    Grant schema access to {getProviderName(currentProvider)}
                  </SchemaCheckboxLabel>
                  <SchemaCheckboxDescription>
                    When enabled, the AI assistant can access your database
                    schema information to provide more accurate suggestions and
                    explanations. Schema information helps the AI understand
                    your table structures, column names, and relationships.{" "}
                    <SchemaCheckboxDescriptionBold>
                      The AI model will not have access to your database store.
                    </SchemaCheckboxDescriptionBold>
                  </SchemaCheckboxDescription>
                </SchemaCheckboxContent>
              </SchemaCheckboxInner>
            </SchemaCheckboxContainer>
          </SchemaAccessSection>
        )}
      </ContentSection>
      <WarningText>
        The AI assistant may occasionally produce incorrect information. Please
        verify important details and review all generated queries before
        execution.
      </WarningText>
    </ModalContent>
  )
}

export const ConfigurationModal = ({
  open,
  onOpenChange,
}: ConfigurationModalProps) => {
  const { aiAssistantSettings, updateSettings } = useLocalStorage()
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(
    null,
  )
  const providerName = useMemo(
    () => getProviderName(selectedProvider),
    [selectedProvider],
  )
  const [apiKey, setApiKey] = useState<string>("")
  const [error, setError] = useState<string | null>(null)

  const [enabledModels, setEnabledModels] = useState<string[]>([])
  const [grantSchemaAccess, setGrantSchemaAccess] = useState<boolean>(true)

  const modelsByProvider = useMemo(() => {
    const anthropic: ModelOption[] = []
    const openai: ModelOption[] = []
    MODEL_OPTIONS.forEach((model) => {
      if (model.provider === "anthropic") {
        anthropic.push(model)
      } else {
        openai.push(model)
      }
    })
    return { anthropic, openai }
  }, [])

  const handleProviderSelect = useCallback((provider: Provider) => {
    setSelectedProvider(provider)
    setError(null)
    setApiKey("")
  }, [])

  const handleApiKeyChange = useCallback((value: string) => {
    setApiKey(value)
    setError(null)
  }, [])

  const handleModelToggle = useCallback((modelValue: string) => {
    setEnabledModels((prev) => {
      const isEnabled = prev.includes(modelValue)
      return isEnabled
        ? prev.filter((m) => m !== modelValue)
        : [...prev, modelValue]
    })
  }, [])

  const handleSchemaAccessChange = useCallback((checked: boolean) => {
    setGrantSchemaAccess(checked)
  }, [])

  const handleComplete = () => {
    if (!selectedProvider || enabledModels.length === 0) return

    const selectedModel =
      enabledModels.find(
        (m) => MODEL_OPTIONS.find((mo) => mo.value === m)?.default,
      ) ?? enabledModels[0]

    const newSettings = {
      ...aiAssistantSettings,
      selectedModel,
      providers: {
        ...aiAssistantSettings.providers,
        [selectedProvider]: {
          apiKey,
          enabledModels,
          grantSchemaAccess,
        },
      },
    }

    updateSettings(StoreKey.AI_ASSISTANT_SETTINGS, newSettings)
    toast.success("AI Assistant activated successfully")
    onOpenChange?.(false)
  }

  const canProceed = (stepIndex: number): boolean => {
    if (stepIndex === 0) {
      if (!selectedProvider) return false
      return !!apiKey
    }
    return true
  }

  const validateStepOne = useCallback(async (): Promise<string | boolean> => {
    if (!selectedProvider) {
      return "Please select a provider"
    }

    if (!apiKey) {
      return "Please enter an API key"
    }

    const testModel =
      MODEL_OPTIONS.find(
        (m) => m.isTestModel && m.provider === selectedProvider,
      )?.value ?? modelsByProvider[selectedProvider][0].value

    try {
      const result = await testApiKey(apiKey, testModel)
      if (!result.valid) {
        const errorMsg = result.error || "Invalid API key"
        setError(errorMsg)
        return errorMsg
      }
      const defaultModels = MODEL_OPTIONS.filter(
        (m) => m.defaultEnabled && m.provider === selectedProvider,
      ).map((m) => m.value)
      if (defaultModels.length > 0) {
        setEnabledModels(defaultModels)
      }
      setError(null)
      return true
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to validate API key"
      setError(errorMessage)
      return errorMessage
    }
  }, [selectedProvider, apiKey, modelsByProvider])

  const validateStepTwo = useCallback((): string | boolean => {
    if (!selectedProvider) return "Please select a provider"
    if (enabledModels.length === 0) {
      return "Please enable at least one model"
    }
    return true
  }, [enabledModels, selectedProvider])

  const handleStepChange = useCallback(
    (newStepIndex: number, direction: "next" | "previous") => {
      // When going back from step 2 to step 1, reset step 2 state but keep API key
      if (newStepIndex === 0 && direction === "previous") {
        setEnabledModels([])
        setGrantSchemaAccess(true)
      }
    },
    [],
  )

  const handleModalClose = useCallback(() => {
    setSelectedProvider(null)
    setApiKey("")
    setError(null)
    setEnabledModels([])
    setGrantSchemaAccess(true)
  }, [])

  const steps: Step[] = useMemo(
    () => [
      {
        id: "provider",
        title: "Add a model provider",
        stepName: "Add model provider",
        content: (
          <StepOneContent
            selectedProvider={selectedProvider}
            apiKey={apiKey}
            error={error}
            providerName={providerName}
            onProviderSelect={handleProviderSelect}
            onApiKeyChange={handleApiKeyChange}
          />
        ),
        validate: validateStepOne,
      },
      {
        id: "models",
        title: "Configure Models",
        stepName: "Configure provider settings",
        content: (
          <StepTwoContent
            selectedProvider={selectedProvider}
            enabledModels={enabledModels}
            grantSchemaAccess={grantSchemaAccess}
            modelsByProvider={modelsByProvider}
            onModelToggle={handleModelToggle}
            onSchemaAccessChange={handleSchemaAccessChange}
          />
        ),
        validate: validateStepTwo,
      },
    ],
    [
      selectedProvider,
      apiKey,
      error,
      providerName,
      handleProviderSelect,
      handleApiKeyChange,
      enabledModels,
      grantSchemaAccess,
      modelsByProvider,
      handleModelToggle,
      handleSchemaAccessChange,
      validateStepOne,
      validateStepTwo,
    ],
  )

  return (
    <MultiStepModal
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          handleModalClose()
        }
        onOpenChange?.(isOpen)
      }}
      onStepChange={handleStepChange}
      steps={steps}
      maxWidth="64rem"
      onComplete={handleComplete}
      canProceed={canProceed}
      completeButtonText="Activate Assistant"
      showValidationError={false}
    />
  )
}
