import React, { useState, useCallback, useEffect, useMemo, useRef } from "react"
import styled, { useTheme } from "styled-components"
import * as RadixDialog from "@radix-ui/react-dialog"
import { Dialog } from "../Dialog"
import { Box } from "../Box"
import { Input } from "../Input"
import { Text } from "../Text"
import { Button } from "../Button"
import { IconButton } from "../IconButton"
import { TabButton } from "../TabButton"
import { TextButton } from "../TextButton"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { StoreKey } from "../../utils/localStorage/types"
import { toast } from "../Toast"
import { Edit } from "../icons"
import { TrashIcon, PlugsIcon, PlusIcon, XIcon } from "@phosphor-icons/react"
import { OpenAIIcon } from "./OpenAIIcon"
import { AnthropicIcon } from "./AnthropicIcon"
import { LoadingSpinner } from "../LoadingSpinner"
import { Overlay } from "../Overlay"
import {
  getAllProviders,
  getAllModelOptions,
  getApiKey,
  makeCustomModelValue,
  stripModelNamespace,
  formatModelLabel,
  buildProviderSettings,
  BUILTIN_PROVIDERS,
  type ModelOption,
  type ProviderId,
  type ProviderModel,
  getNextModel,
  getProviderName,
} from "../../utils/ai"
import { createProvider } from "../../utils/ai/registry"
import type {
  AiAssistantSettings,
  CustomProviderDefinition,
} from "../../providers/LocalStorageProvider/types"
import { PermissionsSection } from "../../scenes/Footer/MCPBridgeStatus/PermissionsSection"
import type { Permissions } from "../../utils/tools/permissions"
import { ForwardRef } from "../ForwardRef"
import { Badge, BadgeType } from "../../components/Badge"
import { CheckboxCircle } from "../icons"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { CustomProviderModal } from "./CustomProviderModal"
import { ManageModelsModal } from "./ManageModelsModal"
import type { BuiltinModelsResult } from "./ManageModelsModal"
import { ReasoningSection } from "./ReasoningSection"
import type { ReasoningEffortLevel } from "./ReasoningSection"

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
  color: ${({ theme }) => theme.color.contentPrimary};
  border: 0;
`

const ModalSubtitle = styled(Dialog.Description)`
  color: ${({ theme }) => theme.color.contentSecondary};
  margin: 0;
  padding: 0;
`

const CloseButton = styled(IconButton).attrs({
  label: "Close",
  variant: "ghost",
  size: "sm",
})`
  padding: 0;
`

const Separator = styled.div`
  height: 0.1rem;
  width: 100%;
  background: ${({ theme }) => theme.color.interactionNeutral};
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

const ProviderTabList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
`

const ProviderTab = styled(TabButton)`
  && {
    flex-direction: column;
    gap: 1rem;
    padding: 1.2rem 2.4rem;
    align-items: flex-start;
    width: 100%;
    background: ${({ $active, theme }) =>
      $active ? theme.color.interactionNeutralHover : theme.color.transparent};
  }

  &&:hover:not(:disabled) {
    background: ${({ $active, theme }) =>
      $active
        ? theme.color.interactionNeutralHover
        : theme.color.controlSurfaceHover};
  }
`

const ProviderTabTitle = styled(Box).attrs({
  gap: "0.6rem",
  align: "center",
})`
  width: 100%;

  svg {
    flex-shrink: 0;
  }
`

const ProviderTabName = styled(Text)<{ $active: boolean }>`
  font-size: 1.6rem;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  color: ${({ theme, $active }) =>
    $active ? theme.color.contentPrimary : theme.color.contentSecondary};
  text-align: left;
`

const StatusDot = styled.div<{ $enabled: boolean }>`
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: ${({ $enabled, theme }) =>
    $enabled ? theme.color.statusSuccess : theme.color.contentSecondary};
`

const StatusText = styled(Text)<{ $enabled: boolean }>`
  font-size: 1rem;
  font-weight: 400;
  color: ${({ $enabled, theme }) =>
    $enabled ? theme.color.statusSuccess : theme.color.contentSecondary};
`

const VerticalSeparator = styled.div`
  width: 0.1rem;
  background: ${({ theme }) => theme.color.interactionNeutral};
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
  color: ${({ theme }) => theme.color.contentPrimary};
`

const SectionDescription = styled(Text)`
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const InputWrapper = styled(Box)`
  position: relative;
  width: 100%;
`

const StyledInput = styled(Input)<{
  $showEditButton?: boolean
}>`
  width: 100%;
  padding-right: ${({ $showEditButton }) =>
    $showEditButton ? "4rem" : "1rem"};
`

const EditButton = styled(IconButton).attrs({
  label: "Edit API key",
  dataHook: "ai-settings-edit-api-key",
  variant: "ghost",
  size: "sm",
})`
  position: absolute;
  right: 1.2rem;
  top: 50%;
  transform: translateY(-50%);
  padding: 0;
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
  color: ${({ theme }) => theme.color.contentSecondary};

  &:hover {
    text-decoration: underline;
    color: ${({ theme }) => theme.color.contentPrimary};
  }
`

const ErrorText = styled(Text)`
  color: ${({ theme }) => theme.color.statusDanger};
  font-size: 1.3rem;
`

const ValidateRemoveButton = styled(Button).attrs({ variant: "secondary" })`
  height: 3rem;
  padding: 0.6rem 1.2rem;
  font-size: 1.4rem;
  gap: 0.8rem;
`

const ModelsPlaceholder = styled(Box).attrs({
  flexDirection: "column",
  gap: "1rem",
})`
  background: ${({ theme }) => theme.color.surfaceScrim};
  padding: 0.75rem;
  border-radius: 0.4rem;
  width: 100%;
`

const ModelsPlaceholderText = styled(Text)`
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.contentSecondary};
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

const ModelDescriptionText = styled(Text)`
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  flex: 1;
`

const ModelNameText = styled(Text)`
  font-size: 1.4rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const EnableModelsTitle = styled(Text)`
  font-size: 1.6rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const ManageModelsButton = styled(TextButton)`
  font-size: 1.3rem;
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

const AddProviderButton = styled(Button).attrs({ variant: "tertiary" })`
  && {
    display: flex;
    height: auto;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.8rem 1.6rem;
    border-style: dashed;
    font-size: 1.3rem;
    justify-content: center;
    margin: 0 1rem;
  }
`

type SettingsModalProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const getModelsForProvider = (
  provider: ProviderId,
  settings?: AiAssistantSettings,
): ModelOption[] => {
  return getAllModelOptions(settings).filter((m) => m.provider === provider)
}

const getProvidersWithApiKeys = (
  settings: AiAssistantSettings,
): ProviderId[] => {
  const providers: ProviderId[] = []
  const allProviders = getAllProviders(settings)
  for (const provider of allProviders) {
    if (getApiKey(provider, settings)) {
      providers.push(provider)
    }
  }
  return providers
}

export const SettingsModal = ({ open, onOpenChange }: SettingsModalProps) => {
  const theme = useTheme()
  const { aiAssistantSettings, updateSettings } = useLocalStorage()
  const initializeProviderState = useCallback(
    <T,>(
      getValue: (provider: ProviderId) => T,
      defaultValue: T,
    ): Record<ProviderId, T> => {
      const allProviders = getAllProviders(aiAssistantSettings)
      const state = {} as Record<ProviderId, T>
      for (const provider of allProviders) {
        state[provider] = getValue(provider) ?? defaultValue
      }
      return state
    },
    [],
  )

  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(() => {
    const providersWithKeys = getProvidersWithApiKeys(aiAssistantSettings)
    return providersWithKeys[0] || getAllProviders(aiAssistantSettings)[0]
  })
  const isCustomProvider = !BUILTIN_PROVIDERS[selectedProvider]
  const [apiKeys, setApiKeys] = useState<Record<ProviderId, string>>(() =>
    initializeProviderState(
      (provider) => getApiKey(provider, aiAssistantSettings) || "",
      "",
    ),
  )
  const [enabledModels, setEnabledModels] = useState<
    Record<ProviderId, string[]>
  >(() =>
    initializeProviderState(
      (provider) =>
        aiAssistantSettings.providers?.[provider]?.enabledModels || [],
      [],
    ),
  )
  const [modelLabels, setModelLabels] = useState<
    Record<ProviderId, Record<string, string>>
  >(() =>
    initializeProviderState(
      (provider) =>
        aiAssistantSettings.providers?.[provider]?.modelLabels ?? {},
      {},
    ),
  )
  const [utilityModels, setUtilityModels] = useState<
    Record<ProviderId, string | undefined>
  >(() =>
    initializeProviderState(
      (provider) => aiAssistantSettings.providers?.[provider]?.utilityModel,
      undefined,
    ),
  )
  const [reasoningEffort, setReasoningEffort] = useState<
    Record<ProviderId, ReasoningEffortLevel>
  >(() =>
    initializeProviderState(
      (provider) =>
        aiAssistantSettings.providers?.[provider]?.reasoningEffort ?? "default",
      "default",
    ),
  )
  const [permissions, setPermissions] = useState<
    Record<ProviderId, Permissions>
  >(() =>
    initializeProviderState<Permissions>(
      (provider) => {
        const providerSettings = aiAssistantSettings.providers?.[provider]
        const custom = aiAssistantSettings.customProviders?.[provider]
        const source = providerSettings ?? custom
        if (!source) {
          return { grantSchemaAccess: true, read: false, write: false }
        }
        return {
          grantSchemaAccess: source.grantSchemaAccess !== false,
          read: source.read === true,
          write: source.write === true,
        }
      },
      { grantSchemaAccess: true, read: false, write: false },
    ),
  )
  const [validatedApiKeys, setValidatedApiKeys] = useState<
    Record<ProviderId, boolean>
  >(() =>
    initializeProviderState(
      (provider) =>
        !BUILTIN_PROVIDERS[provider] ||
        !!getApiKey(provider, aiAssistantSettings),
      false,
    ),
  )
  const [validationState, setValidationState] = useState<
    Record<ProviderId, "idle" | "validating" | "validated" | "error">
  >(() => initializeProviderState(() => "idle" as const, "idle" as const))
  const [validationErrors, setValidationErrors] = useState<
    Record<ProviderId, string | null>
  >(() => initializeProviderState(() => null, null))
  const [isInputFocused, setIsInputFocused] = useState<
    Record<ProviderId, boolean>
  >(() => initializeProviderState(() => false, false))
  const inputRef = useRef<HTMLInputElement>(null)

  const [customProviderModalOpen, setCustomProviderModalOpen] = useState(false)
  const [manageModelsProvider, setManageModelsProvider] =
    useState<ProviderId | null>(null)

  const [localCustomProviders, setLocalCustomProviders] = useState<
    Record<string, CustomProviderDefinition>
  >(() => ({ ...(aiAssistantSettings.customProviders ?? {}) }))

  const localSettings = useMemo<AiAssistantSettings>(
    () => ({
      ...aiAssistantSettings,
      customProviders:
        Object.keys(localCustomProviders).length > 0
          ? localCustomProviders
          : undefined,
    }),
    [aiAssistantSettings, localCustomProviders],
  )

  const handleProviderSelect = useCallback(
    (provider: ProviderId) => {
      if (provider !== selectedProvider) {
        abortValidation(selectedProvider)
      }
      setSelectedProvider(provider)
      setValidationErrors((prev) => ({ ...prev, [provider]: null }))
    },
    [selectedProvider],
  )

  const validationTokenRef = useRef<Record<string, number>>({})
  const [validationListings, setValidationListings] = useState<
    Record<ProviderId, ProviderModel[] | undefined>
  >({})
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const abortValidation = (provider: ProviderId) => {
    validationTokenRef.current[provider] =
      (validationTokenRef.current[provider] ?? 0) + 1
    setValidationState((prev) =>
      prev[provider] === "validating" ? { ...prev, [provider]: "idle" } : prev,
    )
    setValidationListings((prev) => ({ ...prev, [provider]: undefined }))
  }

  const handleApiKeyChange = useCallback(
    (provider: ProviderId, value: string) => {
      validationTokenRef.current[provider] =
        (validationTokenRef.current[provider] ?? 0) + 1
      setApiKeys((prev) => ({ ...prev, [provider]: value }))
      setValidationErrors((prev) => ({ ...prev, [provider]: null }))
      setValidationState((prev) => ({ ...prev, [provider]: "idle" }))

      if (validatedApiKeys[provider]) {
        setValidatedApiKeys((prev) => ({ ...prev, [provider]: false }))
      }
    },
    [validatedApiKeys],
  )

  const handleValidateApiKey = useCallback(
    async (provider: ProviderId) => {
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

      const token = validationTokenRef.current[provider] ?? 0
      const isStale = () =>
        !mountedRef.current ||
        (validationTokenRef.current[provider] ?? 0) !== token
      const isBuiltin = !!BUILTIN_PROVIDERS[provider]
      try {
        const aiProvider = createProvider(provider, apiKey, localSettings)
        const listing = await aiProvider.listModels()
        if (isStale()) return
        if (isBuiltin) {
          setValidationListings((prev) => ({ ...prev, [provider]: listing }))
        }
        setValidationState((prev) => ({ ...prev, [provider]: "validated" }))
        setValidatedApiKeys((prev) => ({ ...prev, [provider]: true }))
        setValidationErrors((prev) => ({ ...prev, [provider]: null }))
        const storedKey = localSettings.providers?.[provider]?.apiKey
        if (isBuiltin && apiKey !== storedKey) {
          setEnabledModels((prev) => ({ ...prev, [provider]: [] }))
          setModelLabels((prev) => ({ ...prev, [provider]: {} }))
          setUtilityModels((prev) => ({ ...prev, [provider]: undefined }))
        }
        if (isBuiltin) {
          setManageModelsProvider(provider)
        }
      } catch (err) {
        if (isStale()) return
        const aiProvider = createProvider(provider, apiKey, localSettings)
        const classified = aiProvider.classifyError(err, () => {})
        if (!isBuiltin && classified.type !== "invalid_key") {
          // Custom endpoints often lack a model listing — the key may still work.
          setValidationState((prev) => ({ ...prev, [provider]: "validated" }))
          setValidatedApiKeys((prev) => ({ ...prev, [provider]: true }))
          return
        }
        setValidationState((prev) => ({ ...prev, [provider]: "error" }))
        setValidationErrors((prev) => ({
          ...prev,
          [provider]:
            classified.type === "invalid_key"
              ? "Invalid API key"
              : classified.message,
        }))
      }
    },
    [apiKeys, localSettings],
  )

  // Emit the legacy schema-access-removed event on grantSchemaAccess → false
  // so existing dashboards keep working.
  const handlePermissionsChange = useCallback(
    (provider: ProviderId, next: Permissions) => {
      setPermissions((prev) => {
        const prior = prev[provider]
        if (prior?.grantSchemaAccess && !next.grantSchemaAccess) {
          void trackEvent(ConsoleEvent.AI_SETTINGS_SCHEMA_ACCESS_REMOVE)
        }
        return { ...prev, [provider]: next }
      })
    },
    [],
  )

  const handleSave = useCallback(() => {
    const updatedProviders = { ...aiAssistantSettings.providers }
    const allProviderIds = getAllProviders(localSettings)

    for (const provider of allProviderIds) {
      const isCustom = !BUILTIN_PROVIDERS[provider]
      if (validatedApiKeys[provider] || isCustom) {
        const perms = permissions[provider]
        const labels = modelLabels[provider]
        updatedProviders[provider] = buildProviderSettings({
          apiKey: apiKeys[provider] ?? "",
          enabledModels: enabledModels[provider],
          permissions: perms,
          modelLabels: labels,
          utilityModel: utilityModels[provider],
          reasoningEffort: reasoningEffort[provider],
        })
      } else {
        delete updatedProviders[provider]
      }
    }

    // Remove provider entries for deleted custom providers
    for (const provider of Object.keys(updatedProviders)) {
      if (!BUILTIN_PROVIDERS[provider] && !localCustomProviders[provider]) {
        delete updatedProviders[provider]
      }
    }

    const updatedCustomProviders =
      Object.keys(localCustomProviders).length > 0
        ? { ...localCustomProviders }
        : undefined
    if (updatedCustomProviders) {
      for (const provider of Object.keys(updatedCustomProviders)) {
        const perms = permissions[provider]
        updatedCustomProviders[provider] = {
          ...updatedCustomProviders[provider],
          apiKey: apiKeys[provider] || undefined,
          grantSchemaAccess: perms.grantSchemaAccess,
          read: perms.read,
          write: perms.write,
        }
      }
    }

    const updatedSettings: AiAssistantSettings = {
      ...aiAssistantSettings,
      providers: updatedProviders,
      customProviders: updatedCustomProviders,
    }

    const nextModel = getNextModel(
      updatedSettings.selectedModel,
      enabledModels,
      updatedSettings,
      aiAssistantSettings,
    )
    updatedSettings.selectedModel = nextModel || undefined

    updateSettings(StoreKey.AI_ASSISTANT_SETTINGS, updatedSettings)
    toast.success("Settings saved successfully")
    onOpenChange?.(false)
  }, [
    aiAssistantSettings,
    localSettings,
    localCustomProviders,
    apiKeys,
    enabledModels,
    modelLabels,
    utilityModels,
    reasoningEffort,
    permissions,
    validatedApiKeys,
    updateSettings,
    onOpenChange,
  ])

  const handleClose = useCallback(() => {
    onOpenChange?.(false)
  }, [onOpenChange])

  const handleRemoveProvider = useCallback(
    (providerId: ProviderId) => {
      abortValidation(providerId)
      const isCustom = !BUILTIN_PROVIDERS[providerId]
      void trackEvent(ConsoleEvent.AI_SETTINGS_PROVIDER_REMOVE, {
        isCustom,
      })

      if (isCustom) {
        setLocalCustomProviders((prev) => {
          const { [providerId]: _, ...rest } = prev
          return rest
        })
      }

      setApiKeys((prev) => ({ ...prev, [providerId]: "" }))
      setPermissions((prev) => ({
        ...prev,
        [providerId]: { grantSchemaAccess: false, read: false, write: false },
      }))
      setValidatedApiKeys((prev) => ({ ...prev, [providerId]: false }))
      setValidationState((prev) => ({ ...prev, [providerId]: "idle" }))
      setValidationErrors((prev) => ({ ...prev, [providerId]: null }))
      setEnabledModels((prev) => ({ ...prev, [providerId]: [] }))
      setModelLabels((prev) => ({ ...prev, [providerId]: {} }))
      setUtilityModels((prev) => ({ ...prev, [providerId]: undefined }))
      setReasoningEffort((prev) => ({ ...prev, [providerId]: "default" }))
      setIsInputFocused((prev) => ({ ...prev, [providerId]: false }))

      // Switch to first remaining active provider
      const updatedCustomProviders = isCustom
        ? (() => {
            const { [providerId]: _, ...rest } = localCustomProviders
            return Object.keys(rest).length > 0 ? rest : undefined
          })()
        : localSettings.customProviders
      const remaining = getAllProviders({
        ...localSettings,
        customProviders: updatedCustomProviders,
      }).filter((p) => p !== providerId || BUILTIN_PROVIDERS[p])
      setSelectedProvider(remaining[0] ?? "openai")
    },
    [localSettings, localCustomProviders],
  )

  const handleCustomProviderSave = useCallback(
    (providerId: string, definition: CustomProviderDefinition) => {
      const newEnabledModels = definition.models.map((m) =>
        makeCustomModelValue(providerId, m),
      )

      setLocalCustomProviders((prev) => ({
        ...prev,
        [providerId]: definition,
      }))
      setApiKeys((prev) => ({
        ...prev,
        [providerId]: definition.apiKey ?? "",
      }))
      setPermissions((prev) => ({
        ...prev,
        [providerId]: {
          grantSchemaAccess: definition.grantSchemaAccess ?? false,
          read: definition.read ?? false,
          write: definition.write ?? false,
        },
      }))
      setValidatedApiKeys((prev) => ({
        ...prev,
        [providerId]: true,
      }))
      setEnabledModels((prev) => ({
        ...prev,
        [providerId]: newEnabledModels,
      }))

      const updatedCustomProviders = {
        ...(aiAssistantSettings.customProviders ?? {}),
        [providerId]: definition,
      }
      const updatedProviders = {
        ...aiAssistantSettings.providers,
        [providerId]: {
          apiKey: definition.apiKey ?? "",
          enabledModels: newEnabledModels,
          grantSchemaAccess: definition.grantSchemaAccess ?? false,
          read: definition.read ?? false,
          write: definition.write ?? false,
        },
      }
      updateSettings(StoreKey.AI_ASSISTANT_SETTINGS, {
        ...aiAssistantSettings,
        customProviders: updatedCustomProviders,
        providers: updatedProviders,
      })

      setSelectedProvider(providerId)
      setCustomProviderModalOpen(false)
    },
    [aiAssistantSettings, updateSettings],
  )

  const handleManageModelsSave = useCallback(
    (providerId: string, definition: CustomProviderDefinition) => {
      const newModelValues = definition.models.map((m) =>
        makeCustomModelValue(providerId, m),
      )

      // Update local custom providers — only override models and contextWindow,
      // preserve everything else (apiKey, grantSchemaAccess, etc.) from local state.
      setLocalCustomProviders((prev) => ({
        ...prev,
        [providerId]: {
          ...prev[providerId],
          models: definition.models,
          contextWindow: definition.contextWindow,
        },
      }))

      // Determine which models are truly new (not in the previous model list)
      const oldModelValues = (
        localCustomProviders[providerId]?.models || []
      ).map((m) => makeCustomModelValue(providerId, m))
      const trulyNew = newModelValues.filter((m) => !oldModelValues.includes(m))

      // Local state: respect unsaved checkbox toggles, add truly new as enabled
      const localEnabled = enabledModels[providerId] || []
      const localStillEnabled = localEnabled.filter((m: string) =>
        newModelValues.includes(m),
      )
      setEnabledModels((prev) => ({
        ...prev,
        [providerId]: [...localStillEnabled, ...trulyNew],
      }))

      // Storage: preserve stored enabled/disabled state, only add truly new models.
      // Unsaved toggle changes (apiKey, grantSchemaAccess, enable/disable) are not
      // persisted here — they require "Save Settings".
      const storedProviderSettings = aiAssistantSettings.providers?.[providerId]
      const storedEnabled = storedProviderSettings?.enabledModels || []
      const storedStillEnabled = storedEnabled.filter((m: string) =>
        newModelValues.includes(m),
      )
      const storedCustomProvider =
        aiAssistantSettings.customProviders?.[providerId]
      updateSettings(StoreKey.AI_ASSISTANT_SETTINGS, {
        ...aiAssistantSettings,
        customProviders: {
          ...(aiAssistantSettings.customProviders ?? {}),
          ...(storedCustomProvider && {
            [providerId]: {
              ...storedCustomProvider,
              models: definition.models,
              contextWindow: definition.contextWindow,
            },
          }),
        },
        providers: {
          ...aiAssistantSettings.providers,
          ...(storedProviderSettings && {
            [providerId]: {
              ...storedProviderSettings,
              enabledModels: [...storedStillEnabled, ...trulyNew],
            },
          }),
        },
      })

      toast.success("Model preferences updated")
    },
    [aiAssistantSettings, enabledModels, localCustomProviders, updateSettings],
  )

  const builtinModelsSavedRef = useRef(false)

  const handleBuiltinModelsOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) return
      const provider = manageModelsProvider
      setManageModelsProvider(null)
      const cancelled = !builtinModelsSavedRef.current
      builtinModelsSavedRef.current = false
      if (!provider) return
      setValidationListings((prev) => ({ ...prev, [provider]: undefined }))
      if (!cancelled || (enabledModels[provider]?.length ?? 0) > 0) return
      abortValidation(provider)
      const stored = aiAssistantSettings.providers?.[provider]
      if (stored?.enabledModels?.length) {
        setApiKeys((prev) => ({ ...prev, [provider]: stored.apiKey }))
        setEnabledModels((prev) => ({
          ...prev,
          [provider]: stored.enabledModels,
        }))
        setModelLabels((prev) => ({
          ...prev,
          [provider]: stored.modelLabels ?? {},
        }))
        setUtilityModels((prev) => ({
          ...prev,
          [provider]: stored.utilityModel,
        }))
        return
      }
      setValidatedApiKeys((prev) => ({ ...prev, [provider]: false }))
      setValidationState((prev) => ({ ...prev, [provider]: "idle" }))
    },
    [aiAssistantSettings, enabledModels, manageModelsProvider],
  )

  const handleBuiltinModelsSave = useCallback(
    (providerId: string, result: BuiltinModelsResult) => {
      builtinModelsSavedRef.current = true
      setEnabledModels((prev) => ({
        ...prev,
        [providerId]: result.enabledModels,
      }))
      setModelLabels((prev) => ({ ...prev, [providerId]: result.modelLabels }))
      setUtilityModels((prev) => ({
        ...prev,
        [providerId]: result.utilityModel,
      }))

      const perms = permissions[providerId]
      const updatedSettings: AiAssistantSettings = {
        ...aiAssistantSettings,
        providers: {
          ...aiAssistantSettings.providers,
          [providerId]: buildProviderSettings({
            apiKey: apiKeys[providerId] ?? "",
            enabledModels: result.enabledModels,
            permissions: perms,
            modelLabels: result.modelLabels,
            utilityModel: result.utilityModel,
            reasoningEffort: reasoningEffort[providerId],
          }),
        },
      }
      const persistedEnabledModels = Object.fromEntries(
        Object.entries(updatedSettings.providers).map(
          ([provider, providerSettings]) => [
            provider,
            providerSettings?.enabledModels ?? [],
          ],
        ),
      )
      updatedSettings.selectedModel =
        getNextModel(
          updatedSettings.selectedModel,
          persistedEnabledModels,
          updatedSettings,
          aiAssistantSettings,
        ) || undefined

      updateSettings(StoreKey.AI_ASSISTANT_SETTINGS, updatedSettings)
      toast.success("Model preferences updated")
    },
    [
      aiAssistantSettings,
      apiKeys,
      permissions,
      reasoningEffort,
      updateSettings,
    ],
  )

  const currentProviderValidated = validatedApiKeys[selectedProvider]
  const currentProviderApiKey = apiKeys[selectedProvider]
  const currentProviderValidationState = validationState[selectedProvider]
  const currentProviderError = validationErrors[selectedProvider]
  const currentProviderIsFocused = isInputFocused[selectedProvider]
  const maskInput = !!(currentProviderApiKey && !currentProviderIsFocused)
  const noApiKeyReadonly =
    isCustomProvider && !currentProviderApiKey && !currentProviderIsFocused
  const showEditButton = maskInput || noApiKeyReadonly

  const modelsForProvider = useMemo(
    () => getModelsForProvider(selectedProvider, localSettings),
    [selectedProvider, localSettings],
  )

  const enabledModelsForProvider = useMemo(
    () => enabledModels[selectedProvider],
    [enabledModels, selectedProvider],
  )

  const labelForModel = (provider: ProviderId, value: string) => {
    if (!BUILTIN_PROVIDERS[provider])
      return stripModelNamespace(value, provider)
    return modelLabels[provider]?.[value] ?? formatModelLabel(value)
  }

  const allProviders = useMemo(
    () => getAllProviders(localSettings),
    [localSettings],
  )

  const renderProviderIcon = (provider: ProviderId, isActive: boolean) => {
    const color = isActive
      ? theme.color.contentPrimary
      : theme.color.contentSecondary
    switch (provider) {
      case "openai":
        return <OpenAIIcon width="20" height="20" color={color} />
      case "anthropic":
        return <AnthropicIcon width="20" height="20" color={color} />
      default:
        return <PlugsIcon size={20} color={color} />
    }
  }

  return (
    <>
      <RadixDialog.Root
        open={open && !customProviderModalOpen && manageModelsProvider === null}
        onOpenChange={onOpenChange}
      >
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
                      Modify settings for your AI assistant, set up new
                      providers, and review access.
                    </ModalSubtitle>
                  </HeaderText>
                  <CloseButton onClick={handleClose}>
                    <XIcon size={20} />
                  </CloseButton>
                </HeaderTitleRow>
              </HeaderSection>
              <Separator />
              <MainContentArea>
                <Sidebar>
                  <ProviderTabList role="tablist" aria-label="AI providers">
                    {allProviders.map((provider) => {
                      const isActive = selectedProvider === provider
                      return (
                        <ProviderTab
                          key={provider}
                          $active={isActive}
                          role="tab"
                          onClick={() => handleProviderSelect(provider)}
                          data-hook={`ai-settings-provider-${provider}`}
                        >
                          <ProviderTabTitle>
                            {renderProviderIcon(provider, isActive)}
                            <ProviderTabName $active={isActive}>
                              {getProviderName(provider, localSettings)}
                            </ProviderTabName>
                          </ProviderTabTitle>
                          <Badge
                            variant={
                              validatedApiKeys[provider] ? "success" : "neutral"
                            }
                            size="sm"
                          >
                            <StatusDot $enabled={validatedApiKeys[provider]} />
                            <StatusText
                              data-hook="ai-settings-provider-status"
                              $enabled={validatedApiKeys[provider]}
                            >
                              {validatedApiKeys[provider]
                                ? "Enabled"
                                : "Inactive"}
                            </StatusText>
                          </Badge>
                        </ProviderTab>
                      )
                    })}
                  </ProviderTabList>
                  <AddProviderButton
                    type="button"
                    data-hook="ai-settings-add-custom-provider"
                    onClick={() => {
                      setCustomProviderModalOpen(true)
                    }}
                  >
                    <PlusIcon size={16} weight="bold" /> Add custom provider
                  </AddProviderButton>
                </Sidebar>
                <VerticalSeparator />
                <ContentPanel>
                  <ContentSection>
                    <Box flexDirection="column" gap="1.2rem" align="flex-start">
                      <>
                        <Box
                          justifyContent="space-between"
                          align="center"
                          gap="1rem"
                          style={{ width: "100%" }}
                        >
                          <SectionTitle>API Key</SectionTitle>
                          {validatedApiKeys[selectedProvider] &&
                            currentProviderApiKey && (
                              <ValidatedBadge
                                icon={<CheckboxCircle size="13px" />}
                                data-hook="ai-settings-validated-badge"
                              >
                                Validated
                              </ValidatedBadge>
                            )}
                          {!isCustomProvider && (
                            <Text size="sm" color="contentSecondary">
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
                                {getProviderName(
                                  selectedProvider,
                                  localSettings,
                                )}
                              </APIKeyLink>
                              .
                            </Text>
                          )}
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
                              handleApiKeyChange(
                                selectedProvider,
                                e.target.value,
                              )
                            }}
                            placeholder={
                              noApiKeyReadonly
                                ? "This provider does not have an API key"
                                : `Enter ${getProviderName(selectedProvider, localSettings)} API key`
                            }
                            variant={currentProviderError ? "error" : undefined}
                            $showEditButton={showEditButton}
                            readOnly={maskInput || noApiKeyReadonly}
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
                              if (maskInput || noApiKeyReadonly) {
                                e.preventDefault()
                              }
                            }}
                            tabIndex={maskInput || noApiKeyReadonly ? -1 : 0}
                            style={{
                              cursor:
                                maskInput || noApiKeyReadonly
                                  ? "default"
                                  : "text",
                            }}
                            data-hook="ai-settings-api-key"
                          />
                          {showEditButton && (
                            <EditButton
                              type="button"
                              onClick={() => {
                                void trackEvent(
                                  ConsoleEvent.AI_SETTINGS_API_KEY_EDIT,
                                )
                                inputRef.current?.focus()
                              }}
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
                            Stored locally in your browser and never sent to
                            QuestDB servers. This API key is used to
                            authenticate your requests to the model provider.
                          </SectionDescription>
                        )}
                        {!currentProviderValidated && currentProviderApiKey && (
                          <ValidateRemoveButton
                            onClick={() =>
                              handleValidateApiKey(selectedProvider)
                            }
                            disabled={
                              currentProviderValidationState === "validating"
                            }
                            data-hook="ai-settings-test-api"
                          >
                            {currentProviderValidationState === "validating" ? (
                              <Box gap="0.8rem" align="center">
                                <LoadingSpinner size="1.6rem" />
                                <span>Validating...</span>
                              </Box>
                            ) : (
                              "Validate API Key"
                            )}
                          </ValidateRemoveButton>
                        )}
                      </>
                    </Box>
                  </ContentSection>
                  <ContentSection>
                    <Box flexDirection="column" gap="1.6rem" align="flex-start">
                      <Box
                        flexDirection="row"
                        justifyContent="space-between"
                        align="center"
                        style={{ width: "100%" }}
                      >
                        <EnableModelsTitle>Models</EnableModelsTitle>
                        {(currentProviderValidated ||
                          (isCustomProvider &&
                            modelsForProvider.length > 0)) && (
                          <ManageModelsButton
                            type="button"
                            data-hook="ai-settings-manage-models"
                            onClick={() =>
                              setManageModelsProvider(selectedProvider)
                            }
                          >
                            Manage models
                          </ManageModelsButton>
                        )}
                      </Box>
                      {enabledModelsForProvider.length > 0 ? (
                        <ModelList>
                          {enabledModelsForProvider.map((value) => {
                            const label = labelForModel(selectedProvider, value)
                            return (
                              <ModelToggleRow key={value} data-model={label}>
                                <ModelInfoColumn>
                                  <ModelNameText>{label}</ModelNameText>
                                  {!isCustomProvider && label !== value && (
                                    <ModelDescriptionText>
                                      {value}
                                    </ModelDescriptionText>
                                  )}
                                </ModelInfoColumn>
                              </ModelToggleRow>
                            )
                          })}
                        </ModelList>
                      ) : (
                        <ModelsPlaceholder>
                          <ModelsPlaceholderText>
                            {currentProviderValidated
                              ? "No models enabled yet. Use “Manage models” to enable the models you want."
                              : "When you’ve entered and validated your API key, you’ll be able to enable models via “Manage models”."}
                          </ModelsPlaceholderText>
                        </ModelsPlaceholder>
                      )}
                    </Box>
                  </ContentSection>
                  {selectedProvider === "openai" && (
                    <ContentSection>
                      <ReasoningSection
                        value={reasoningEffort[selectedProvider] ?? "default"}
                        onChange={(next) =>
                          setReasoningEffort((prev) => ({
                            ...prev,
                            [selectedProvider]: next,
                          }))
                        }
                        disabled={!currentProviderValidated}
                      />
                    </ContentSection>
                  )}
                  <ContentSection>
                    <PermissionsSection
                      value={
                        permissions[selectedProvider] ?? {
                          grantSchemaAccess: false,
                          read: false,
                          write: false,
                        }
                      }
                      onChange={(next) =>
                        handlePermissionsChange(selectedProvider, next)
                      }
                      disabled={
                        !currentProviderValidated &&
                        !(isCustomProvider && modelsForProvider.length > 0)
                      }
                      variant="rich"
                    />
                  </ContentSection>
                  <ContentSection style={{ alignItems: "flex-start" }}>
                    <Button
                      variant="dangerGhost"
                      prefixIcon={<TrashIcon size={16} />}
                      type="button"
                      data-hook="ai-settings-remove-provider"
                      onClick={() => handleRemoveProvider(selectedProvider)}
                    >
                      {isCustomProvider ? "Remove Provider" : "Reset Provider"}
                    </Button>
                  </ContentSection>
                </ContentPanel>
              </MainContentArea>
              <Separator />
              <FooterSection>
                <FooterButtons>
                  <CancelButton
                    onClick={handleClose}
                    variant="ghost"
                    data-hook="ai-settings-cancel"
                  >
                    Cancel
                  </CancelButton>
                  <SaveButton
                    onClick={handleSave}
                    variant="primary"
                    data-hook="ai-settings-save"
                  >
                    Save Settings
                  </SaveButton>
                </FooterButtons>
              </FooterSection>
            </ModalContent>
          </StyledContent>
        </RadixDialog.Portal>
      </RadixDialog.Root>
      {customProviderModalOpen && (
        <CustomProviderModal
          open={customProviderModalOpen}
          onOpenChange={setCustomProviderModalOpen}
          onSave={handleCustomProviderSave}
          existingProviderNames={allProviders.map((p) =>
            getProviderName(p, localSettings),
          )}
        />
      )}
      {manageModelsProvider &&
        !BUILTIN_PROVIDERS[manageModelsProvider] &&
        localCustomProviders[manageModelsProvider] && (
          <ManageModelsModal
            key={manageModelsProvider}
            variant="custom"
            open
            onOpenChange={(nextOpen) => {
              if (!nextOpen) setManageModelsProvider(null)
            }}
            providerId={manageModelsProvider}
            definition={localCustomProviders[manageModelsProvider]}
            onSave={handleManageModelsSave}
          />
        )}
      {manageModelsProvider && BUILTIN_PROVIDERS[manageModelsProvider] && (
        <ManageModelsModal
          key={manageModelsProvider}
          variant="builtin"
          open
          onOpenChange={handleBuiltinModelsOpenChange}
          providerId={manageModelsProvider}
          apiKey={apiKeys[manageModelsProvider] ?? ""}
          enabledModels={enabledModels[manageModelsProvider] ?? []}
          initialListing={validationListings[manageModelsProvider]}
          onSave={handleBuiltinModelsSave}
        />
      )}
    </>
  )
}
