import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import styled, { useTheme } from "styled-components"
import { Dialog } from "../Dialog"
import { MultiStepModal, Step } from "../MultiStepModal"
import { Box } from "../Box"
import { Input } from "../Input"
import { Text } from "../Text"
import { IconButton } from "../IconButton"
import { SelectableCardButton } from "../SelectableCardButton"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { StoreKey } from "../../utils/localStorage/types"
import type { CustomProviderDefinition } from "../../providers/LocalStorageProvider/types"
import { toast } from "../Toast"
import {
  buildListingMetadata,
  buildProviderSettings,
  filterOpenAiChatModels,
  formatModelLabel,
  getAllProviders,
  makeCustomModelValue,
  sortModelsNewestFirst,
  type ProviderId,
  type ProviderModel,
  getProviderName,
} from "../../utils/ai"
import { createProvider } from "../../utils/ai/registry"
import { PermissionsSection } from "../../scenes/Footer/MCPBridgeStatus/PermissionsSection"
import type { Permissions } from "../../utils/tools/permissions"
import { useModalNavigation } from "../MultiStepModal"
import { OpenAIIcon } from "./OpenAIIcon"
import { AnthropicIcon } from "./AnthropicIcon"
import { PlusIcon, Plugs as PlugsIcon, XIcon } from "@phosphor-icons/react"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { CustomProviderModal } from "./CustomProviderModal"
import { ModelPicker } from "./ModelPicker"
import { ReasoningSection } from "./ReasoningSection"
import type { ReasoningEffortLevel } from "./ReasoningSection"

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
  color: ${({ theme }) => theme.color.contentPrimary};
  border: 0;
`

const ModalSubtitle = styled(Dialog.Description)`
  color: ${({ theme }) => theme.color.contentSecondary};
  margin: 0;
  padding: 0;
`

const StyledCloseButton = styled(IconButton)`
  padding: 0;
`

const Separator = styled.div`
  height: 0.1rem;
  width: 100%;
  background: ${({ theme }) => theme.color.interactionNeutral};
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
  color: ${({ theme }) => theme.color.contentPrimary};
`

const SectionDescription = styled(Text)`
  font-size: 1.3rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const ProviderCardsContainer = styled(Box).attrs({
  gap: "2rem",
  alignItems: "flex-start",
})`
  height: 8.5rem;
  width: 100%;
`

const ProviderCard = styled(SelectableCardButton)`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 1.2rem 2rem;
  width: 10rem;
  height: 8.5rem;
`

const ProviderName = styled(Text)`
  font-size: 1.3rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.contentSecondary};
  text-align: center;
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
  color: ${({ theme }) => theme.color.contentSecondary};
`

const StyledInput = styled(Input)`
  width: 100%;
  text-security: disc;
  -webkit-text-security: disc;
  -moz-text-security: disc;
`

const ErrorText = styled(Text)`
  color: ${({ theme }) => theme.color.statusDanger};
  font-size: 1.3rem;
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
  background: ${({ theme }) => theme.color.controlSurface};
  padding: 0.6rem 0.8rem;
  border-radius: 0.4rem;
  box-shadow: inset 0 0.1rem 0.4rem ${({ theme }) => theme.color.shadowSubtle};
`

const ProviderBadgeText = styled(Text)`
  font-size: 1.3rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.contentPrimary};
  font-family: inherit;
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
  color: ${({ theme }) => theme.color.contentPrimary};
`

const WarningText = styled(Text)`
  font-size: 1.3rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.contentSecondary};
  padding: 2.4rem;
  text-align: left;
`

const AddCustomProviderCard = styled(SelectableCardButton)`
  border-style: dashed;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 1.2rem 2rem;
  width: 10rem;
  height: 8.5rem;
`

type ConfigurationModalProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type StepOneContentProps = {
  selectedProvider: ProviderId | null
  apiKey: string
  error: string | null
  providerName: string
  onProviderSelect: (provider: ProviderId) => void
  onApiKeyChange: (value: string) => void
  onAddCustomProvider: () => void
}

type StepTwoContentProps = {
  selectedProvider: ProviderId | null
  listing: ProviderModel[] | null
  enabledModels: string[]
  manualInput: string
  reasoningEffortLevel: ReasoningEffortLevel
  permissions: Permissions
  onSelectionChange: (models: string[]) => void
  onManualInputChange: (value: string) => void
  onReasoningEffortChange: (next: ReasoningEffortLevel) => void
  onPermissionsChange: (next: Permissions) => void
}

// New scopes default to denied; schema access stays on for back-compat.
const DEFAULT_PERMISSIONS: Permissions = {
  grantSchemaAccess: true,
  read: false,
  write: false,
}

const CloseButton = ({ onClick }: { onClick: () => void }) => {
  return (
    <StyledCloseButton
      label="Close"
      variant="ghost"
      size="sm"
      onClick={onClick}
    >
      <XIcon size={20} />
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
  onAddCustomProvider,
}: StepOneContentProps) => {
  const theme = useTheme()
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
              Choose a built-in provider or add your own custom provider.
              You&apos;ll be able to configure and switch between multiple
              providers later.
            </SectionDescription>
          </Box>
          <ProviderCardsContainer role="group" aria-label="AI model provider">
            <ProviderCard
              $selected={selectedProvider === "openai"}
              onClick={() => onProviderSelect("openai")}
              type="button"
              data-hook="ai-settings-provider-openai"
            >
              <OpenAIIcon
                width="40"
                height="40"
                color={theme.color.contentPrimary}
              />
              <ProviderName>{getProviderName("openai")}</ProviderName>
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
                color={theme.color.contentPrimary}
              />
              <ProviderName>{getProviderName("anthropic")}</ProviderName>
            </ProviderCard>
            <AddCustomProviderCard
              data-hook="ai-settings-provider-custom"
              type="button"
              onClick={onAddCustomProvider}
            >
              <PlusIcon size={32} weight="light" />
              <ProviderName>Custom</ProviderName>
            </AddCustomProviderCard>
          </ProviderCardsContainer>
        </Box>
      </ContentSection>
      {selectedProvider && (
        <>
          <Separator />
          <ContentSection>
            <InputSection align="flex-start">
              <InputLabel>API Key</InputLabel>
              <StyledInput
                type="text"
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder={`Enter${providerName ? ` ${providerName}` : ""} API key`}
                variant={error ? "error" : undefined}
                data-hook="ai-settings-api-key"
              />
              {error && (
                <Box role="alert">
                  <ErrorText data-hook="ai-settings-api-key-error">
                    {error}
                  </ErrorText>
                </Box>
              )}
              <SectionDescription>
                Stored locally in your browser and never sent to QuestDB
                servers. This API key is used to authenticate your requests to
                the model provider.
              </SectionDescription>
            </InputSection>
          </ContentSection>
        </>
      )}
    </ModalContent>
  )
}

const StepTwoContent = ({
  selectedProvider,
  listing,
  enabledModels,
  manualInput,
  reasoningEffortLevel,
  permissions,
  onSelectionChange,
  onManualInputChange,
  onReasoningEffortChange,
  onPermissionsChange,
}: StepTwoContentProps) => {
  const theme = useTheme()
  const navigation = useModalNavigation()
  const handleClose: () => void = navigation.handleClose
  const currentProvider = selectedProvider

  const isOpenAi = currentProvider === "openai"
  const pickerModels = listing
    ? isOpenAi
      ? filterOpenAiChatModels(listing)
      : sortModelsNewestFirst(listing)
    : []

  return (
    <ModalContent data-hook="ai-settings-modal-step-two">
      <HeaderSection>
        <HeaderTitleRow>
          <HeaderText>
            <ModalTitle>Setup your model preferences</ModalTitle>
            <ModalSubtitle id="step-1-description">
              Enable the models you want to use from this provider, and a level
              of data access. You&apos;ll be able to update these settings any
              time.
            </ModalSubtitle>
          </HeaderText>
          <CloseButton onClick={handleClose} />
        </HeaderTitleRow>
      </HeaderSection>
      <Separator />
      <ContentSection>
        {currentProvider && listing ? (
          <FormGroup>
            <EnableModelsSection>
              <EnableModelsHeader>
                <EnableModelsTitle>Models</EnableModelsTitle>
                <ProviderBadge>
                  {currentProvider === "anthropic" ? (
                    <AnthropicIcon
                      width="16"
                      height="16"
                      color={theme.color.contentPrimary}
                    />
                  ) : currentProvider === "openai" ? (
                    <OpenAIIcon
                      width="16"
                      height="16"
                      color={theme.color.contentPrimary}
                    />
                  ) : (
                    <PlugsIcon size={16} color={theme.color.contentPrimary} />
                  )}
                  <ProviderBadgeText>
                    {getProviderName(currentProvider)}
                  </ProviderBadgeText>
                </ProviderBadge>
              </EnableModelsHeader>
              <ModelPicker
                listedModels={pickerModels}
                selectedModels={enabledModels}
                manualInput={manualInput}
                dataHookPrefix="configure-models"
                labelFor={(model) => model.label ?? formatModelLabel(model.id)}
                onSelectionChange={onSelectionChange}
                onManualInputChange={onManualInputChange}
              />
            </EnableModelsSection>
          </FormGroup>
        ) : (
          <SectionDescription>
            Please configure at least one provider in step 1 before enabling
            models.
          </SectionDescription>
        )}
      </ContentSection>
      {isOpenAi && (
        <>
          <Separator />
          <ContentSection>
            <ReasoningSection
              value={reasoningEffortLevel}
              onChange={onReasoningEffortChange}
            />
          </ContentSection>
        </>
      )}
      <Separator />
      <ContentSection>
        {currentProvider && (
          <PermissionsSection
            value={permissions}
            onChange={onPermissionsChange}
            variant="rich"
          />
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
  const closeCountRef = useRef(0)
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(
    null,
  )
  const providerName = useMemo(
    () => getProviderName(selectedProvider, aiAssistantSettings),
    [selectedProvider, aiAssistantSettings],
  )
  const [apiKey, setApiKey] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [customProviderModalOpen, setCustomProviderModalOpen] = useState(false)

  useEffect(() => {
    if (!open) {
      setCustomProviderModalOpen(false)
    }
  }, [open])

  const [enabledModels, setEnabledModels] = useState<string[]>([])
  const [manualInput, setManualInput] = useState("")
  const [providerListing, setProviderListing] = useState<
    ProviderModel[] | null
  >(null)
  const [reasoningEffortLevel, setReasoningEffortLevel] =
    useState<ReasoningEffortLevel>("default")
  const [permissions, setPermissions] =
    useState<Permissions>(DEFAULT_PERMISSIONS)

  const handleProviderSelect = useCallback((provider: ProviderId) => {
    setSelectedProvider(provider)
    setError(null)
    setApiKey("")
  }, [])

  const handleApiKeyChange = useCallback((value: string) => {
    setApiKey(value)
    setError(null)
  }, [])

  const handlePermissionsChange = useCallback((next: Permissions) => {
    setPermissions(next)
  }, [])

  const effectiveEnabledModels = useCallback(() => {
    const pending = manualInput.trim()
    return pending && !enabledModels.includes(pending)
      ? [...enabledModels, pending]
      : enabledModels
  }, [enabledModels, manualInput])

  const handleComplete = () => {
    const models = effectiveEnabledModels()
    if (!selectedProvider || models.length === 0) return

    void trackEvent(ConsoleEvent.AI_PROVIDER_CONFIGURE, {
      name: selectedProvider,
      grantSchemaAccess: permissions.grantSchemaAccess,
      read: permissions.read,
      write: permissions.write,
    })

    const metadata = providerListing
      ? buildListingMetadata(selectedProvider, providerListing, models)
      : null

    const newSettings = {
      ...aiAssistantSettings,
      selectedModel: models[0],
      providers: {
        ...aiAssistantSettings.providers,
        [selectedProvider]: buildProviderSettings({
          apiKey,
          enabledModels: models,
          permissions,
          modelLabels: metadata?.modelLabels,
          utilityModel: metadata?.utilityModel,
          reasoningEffort: reasoningEffortLevel,
        }),
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

    const provider = createProvider(
      selectedProvider,
      apiKey,
      aiAssistantSettings,
    )
    const session = closeCountRef.current
    try {
      const listing = await provider.listModels()
      if (session !== closeCountRef.current) return false
      setProviderListing(listing)
      setError(null)
      void trackEvent(ConsoleEvent.AI_CONFIGURATION_VALIDATE)
      return true
    } catch (err) {
      const classified = provider.classifyError(err, () => {})
      const errorMessage =
        classified.type === "invalid_key"
          ? "Invalid API key"
          : classified.message
      setError(errorMessage)
      return false
    }
  }, [selectedProvider, apiKey, aiAssistantSettings])

  const validateStepTwo = useCallback((): string | boolean => {
    if (!selectedProvider) return "Please select a provider"
    if (effectiveEnabledModels().length === 0) {
      return "Please enable at least one model"
    }
    return true
  }, [effectiveEnabledModels, selectedProvider])

  const handleStepChange = useCallback(
    (newStepIndex: number, direction: "next" | "previous") => {
      // When going back from step 2 to step 1, reset step 2 state but keep API key
      if (newStepIndex === 0 && direction === "previous") {
        setEnabledModels([])
        setManualInput("")
        setProviderListing(null)
        setReasoningEffortLevel("default")
        setPermissions(DEFAULT_PERMISSIONS)
      }
    },
    [],
  )

  const handleModalClose = useCallback(() => {
    closeCountRef.current += 1
    setSelectedProvider(null)
    setApiKey("")
    setError(null)
    setEnabledModels([])
    setManualInput("")
    setProviderListing(null)
    setReasoningEffortLevel("default")
    setPermissions(DEFAULT_PERMISSIONS)
  }, [])

  const handleCustomProviderSave = useCallback(
    (providerId: string, definition: CustomProviderDefinition) => {
      const newEnabledModels = definition.models.map((m) =>
        makeCustomModelValue(providerId, m),
      )

      const newSettings = {
        ...aiAssistantSettings,
        selectedModel: newEnabledModels[0],
        customProviders: {
          ...(aiAssistantSettings.customProviders ?? {}),
          [providerId]: definition,
        },
        providers: {
          ...aiAssistantSettings.providers,
          [providerId]: {
            apiKey: definition.apiKey ?? "",
            enabledModels: newEnabledModels,
            grantSchemaAccess: definition.grantSchemaAccess ?? false,
            read: definition.read ?? false,
            write: definition.write ?? false,
          },
        },
      }

      void trackEvent(ConsoleEvent.AI_PROVIDER_CONFIGURE, {
        name: "custom",
        grantSchemaAccess: definition.grantSchemaAccess ?? false,
        read: definition.read ?? false,
        write: definition.write ?? false,
        type: definition.type,
        contextWindow: definition.contextWindow,
      })

      updateSettings(StoreKey.AI_ASSISTANT_SETTINGS, newSettings)
      toast.success("AI Assistant activated successfully")
      setCustomProviderModalOpen(false)
      onOpenChange?.(false)
    },
    [aiAssistantSettings, updateSettings, onOpenChange],
  )

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
            onAddCustomProvider={() => setCustomProviderModalOpen(true)}
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
            listing={providerListing}
            enabledModels={enabledModels}
            manualInput={manualInput}
            reasoningEffortLevel={reasoningEffortLevel}
            permissions={permissions}
            onSelectionChange={setEnabledModels}
            onManualInputChange={setManualInput}
            onReasoningEffortChange={setReasoningEffortLevel}
            onPermissionsChange={handlePermissionsChange}
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
      providerListing,
      enabledModels,
      manualInput,
      reasoningEffortLevel,
      permissions,
      handlePermissionsChange,
      validateStepOne,
      validateStepTwo,
    ],
  )

  return (
    <>
      <MultiStepModal
        open={open && !customProviderModalOpen}
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
      />
      {customProviderModalOpen && (
        <CustomProviderModal
          open={customProviderModalOpen}
          onOpenChange={setCustomProviderModalOpen}
          onSave={handleCustomProviderSave}
          existingProviderNames={getAllProviders(aiAssistantSettings).map((p) =>
            getProviderName(p, aiAssistantSettings),
          )}
        />
      )}
    </>
  )
}
