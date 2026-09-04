import type {
  AiAssistantSettings,
  CustomProviderDefinition,
  ProviderSettings,
} from "../../providers/LocalStorageProvider/types"
import type { Permissions } from "../tools/permissions"
import { getValue } from "../localStorage"
import { StoreKey } from "../localStorage/types"
import {
  filterOpenAiChatModels,
  formatModelLabel,
  resolveUtilityModel,
  UTILITY_MODEL_TIERS,
} from "./modelCatalog"
import type { ProviderModel } from "./modelCatalog"

export type ProviderType = "anthropic" | "openai" | "openai-chat-completions"

/** Provider ID — built-in ("anthropic", "openai") or user-defined string for custom providers. */
export type ProviderId = string

export type ProviderDefinition = {
  type: ProviderType
  name: string
}

export { type CustomProviderDefinition }

export const BUILTIN_PROVIDERS: Record<string, ProviderDefinition> = {
  anthropic: { type: "anthropic", name: "Anthropic" },
  openai: { type: "openai", name: "OpenAI" },
}

export const getProviderName = (
  providerId: ProviderId | null,
  settings?: AiAssistantSettings,
): string => {
  if (!providerId) return ""
  if (BUILTIN_PROVIDERS[providerId]) return BUILTIN_PROVIDERS[providerId].name
  const custom = settings?.customProviders?.[providerId]
  if (custom) return custom.name
  return providerId
}

export type ModelOption = {
  label: string
  value: string
  provider: ProviderId
}

const CUSTOM_MODEL_SEP = ":"

export const makeCustomModelValue = (
  providerId: ProviderId,
  modelId: string,
): string => `${providerId}${CUSTOM_MODEL_SEP}${modelId}`

export const parseModelValue = (
  value: string,
  customProviders?: Record<string, CustomProviderDefinition>,
): { customProviderId: string; rawModel: string } | { rawModel: string } => {
  const sepIndex = value.indexOf(CUSTOM_MODEL_SEP)
  if (sepIndex === -1) return { rawModel: value }
  const candidateProvider = value.slice(0, sepIndex)
  if (!customProviders || !Object.hasOwn(customProviders, candidateProvider)) {
    return { rawModel: value }
  }
  return {
    customProviderId: candidateProvider,
    rawModel: value.slice(sepIndex + 1),
  }
}

export const stripModelNamespace = (
  value: string,
  providerId: ProviderId,
): string => {
  const prefix = `${providerId}${CUSTOM_MODEL_SEP}`
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

export const getModelLabel = (
  modelId: string,
  providerId: ProviderId,
  settings?: AiAssistantSettings,
): string =>
  settings?.providers?.[providerId]?.modelLabels?.[modelId] ??
  formatModelLabel(modelId)

export const getAllModelOptions = (
  settings?: AiAssistantSettings,
): ModelOption[] => {
  if (!settings) return []
  const options: ModelOption[] = []
  for (const providerId of Object.keys(BUILTIN_PROVIDERS)) {
    const enabledModels = settings.providers?.[providerId]?.enabledModels ?? []
    for (const modelId of enabledModels) {
      options.push({
        label: getModelLabel(modelId, providerId, settings),
        value: modelId,
        provider: providerId,
      })
    }
  }
  for (const [providerId, def] of Object.entries(
    settings.customProviders ?? {},
  )) {
    for (const modelId of def.models) {
      options.push({
        label: modelId,
        value: makeCustomModelValue(providerId, modelId),
        provider: providerId,
      })
    }
  }
  return options
}

export const providerForModel = (
  model: ModelOption["value"],
  settings?: AiAssistantSettings,
): ProviderId | null => {
  // Check for namespaced custom model value (providerId:modelId)
  const parsed = parseModelValue(model, settings?.customProviders)
  if ("customProviderId" in parsed) return parsed.customProviderId
  return (
    Object.keys(BUILTIN_PROVIDERS).find((providerId) =>
      settings?.providers?.[providerId]?.enabledModels?.includes(model),
    ) ?? null
  )
}

export const getAllProviders = (
  settings?: AiAssistantSettings,
): ProviderId[] => [
  ...Object.keys(BUILTIN_PROVIDERS),
  ...Object.keys(settings?.customProviders ?? {}),
]

export const getSelectedModel = (
  settings: AiAssistantSettings,
): string | null => {
  const enabledModels = getAllEnabledModels(settings)
  const selectedModel = settings.selectedModel
  if (
    selectedModel &&
    typeof selectedModel === "string" &&
    enabledModels.includes(selectedModel)
  ) {
    return selectedModel
  }
  return enabledModels[0] ?? null
}

export const getAllEnabledModels = (
  settings: AiAssistantSettings,
): string[] => {
  const models: string[] = []
  for (const provider of getAllProviders(settings)) {
    const providerModels = settings.providers?.[provider]?.enabledModels
    if (providerModels) {
      models.push(...providerModels)
    } else if (settings.customProviders?.[provider]) {
      models.push(
        ...settings.customProviders[provider].models.map((m) =>
          makeCustomModelValue(provider, m),
        ),
      )
    }
  }
  return models
}

export const getNextModel = (
  currentModel: string | undefined,
  enabledModels: Record<ProviderId, string[]>,
  settings?: AiAssistantSettings,
  previousSettings?: AiAssistantSettings,
): string | null => {
  const providerOf = (model: string) => {
    const parsed = parseModelValue(
      model,
      settings?.customProviders ?? previousSettings?.customProviders,
    )
    if ("customProviderId" in parsed) return parsed.customProviderId
    return (
      Object.keys(enabledModels).find((p) =>
        enabledModels[p]?.includes(model),
      ) ??
      providerForModel(model, settings) ??
      providerForModel(model, previousSettings)
    )
  }
  const modelProvider = currentModel ? providerOf(currentModel) : null
  if (modelProvider && enabledModels[modelProvider]?.length > 0) {
    if (currentModel && enabledModels[modelProvider].includes(currentModel)) {
      return currentModel
    }
    return enabledModels[modelProvider][0]
  }
  const providerWithEnabledModel = getAllProviders(settings).find(
    (p) => enabledModels[p]?.length > 0,
  )
  return providerWithEnabledModel
    ? enabledModels[providerWithEnabledModel][0]
    : null
}

export const isAiAssistantConfigured = (
  settings: AiAssistantSettings,
): boolean => {
  const builtinConfigured = Object.keys(BUILTIN_PROVIDERS).some(
    (provider) => !!settings.providers?.[provider]?.apiKey,
  )
  if (builtinConfigured) return true
  return Object.keys(settings.customProviders ?? {}).length > 0
}

export const canUseAiAssistant = (settings: AiAssistantSettings): boolean => {
  return isAiAssistantConfigured(settings) && !!settings.selectedModel
}

export const getUtilityModel = (
  providerId: ProviderId,
  settings?: AiAssistantSettings,
): string | null => {
  if (!settings) return null
  if (settings.customProviders?.[providerId]) {
    return settings.selectedModel ?? null
  }
  return (
    settings.providers?.[providerId]?.utilityModel ?? getSelectedModel(settings)
  )
}

export type ProviderSettingsInput = {
  apiKey: string
  enabledModels: string[]
  permissions: Permissions
  modelLabels?: Record<string, string>
  utilityModel?: string
  reasoningEffort?: "default" | "high"
}

export const buildProviderSettings = ({
  apiKey,
  enabledModels,
  permissions,
  modelLabels,
  utilityModel,
  reasoningEffort,
}: ProviderSettingsInput): ProviderSettings => ({
  apiKey,
  enabledModels,
  grantSchemaAccess: permissions.grantSchemaAccess,
  read: permissions.read,
  write: permissions.write,
  ...(modelLabels && Object.keys(modelLabels).length > 0
    ? { modelLabels }
    : {}),
  ...(utilityModel ? { utilityModel } : {}),
  ...(reasoningEffort === "high" ? { reasoningEffort: "high" as const } : {}),
})

/**
 * Derives the listing-dependent provider settings captured at Save time:
 * labels for enabled models, the utility model, and the reasoning gate.
 */
export type ListingMetadata = {
  modelLabels: Record<string, string>
  utilityModel?: string
}

export const buildListingMetadata = (
  providerId: ProviderId,
  listing: ProviderModel[],
  enabledModels: string[],
): ListingMetadata => {
  const isOpenAi = BUILTIN_PROVIDERS[providerId]?.type === "openai"
  const utilityPool = isOpenAi ? filterOpenAiChatModels(listing) : listing
  const utilityModel = resolveUtilityModel(
    utilityPool,
    UTILITY_MODEL_TIERS[isOpenAi ? "openai" : "anthropic"],
  )
  const modelLabels: Record<string, string> = {}
  for (const id of enabledModels) {
    const listed = listing.find((m) => m.id === id)
    modelLabels[id] = listed ? (listed.label ?? formatModelLabel(id)) : id
  }
  return {
    modelLabels,
    ...(utilityModel ? { utilityModel } : {}),
  }
}

/**
 * Returns the context window for a given provider.
 * For custom providers, returns the configured value.
 * For built-in providers, returns null (factory uses its own default).
 */
export const getProviderContextWindow = (
  providerId: ProviderId,
  settings?: AiAssistantSettings,
): number | null => {
  const custom = settings?.customProviders?.[providerId]
  return custom?.contextWindow ?? null
}

const LEGACY_REASONING_VARIANT = /@reasoning=(high|medium|low)$/

const collapseLegacyVariant = (modelId: string): string =>
  modelId.replace(LEGACY_REASONING_VARIANT, "")

/**
 * Reconciles persisted AI assistant settings.
 * Collapses legacy `@reasoning=` model variants into plain ids and folds a
 * selected high variant into the provider-level reasoningEffort.
 * Validates custom provider models against customProviders definitions;
 * built-in models stay until the Manage Models picker removes them.
 *
 * Pure function — does not write to localStorage.
 * Idempotent: applying it multiple times produces the same result.
 */
export const reconcileSettings = (
  settings: AiAssistantSettings,
): AiAssistantSettings => {
  const result = {
    ...settings,
    providers: { ...settings.providers },
  }
  const selectedModel = result.selectedModel

  for (const providerKey of Object.keys(result.providers)) {
    const providerSettings = result.providers[providerKey]
    if (!providerSettings?.enabledModels) continue

    const isBuiltinProvider = Object.hasOwn(BUILTIN_PROVIDERS, providerKey)
    const selectedHighVariant =
      isBuiltinProvider &&
      selectedModel !== undefined &&
      selectedModel.endsWith("@reasoning=high") &&
      providerSettings.enabledModels.includes(selectedModel)
    const validCustomIds = settings.customProviders?.[providerKey]
      ? new Set(
          settings.customProviders[providerKey].models.map((m) =>
            makeCustomModelValue(providerKey, m),
          ),
        )
      : null
    result.providers[providerKey] = {
      ...providerSettings,
      enabledModels: isBuiltinProvider
        ? [
            ...new Set(
              providerSettings.enabledModels.map(collapseLegacyVariant),
            ),
          ]
        : providerSettings.enabledModels.filter((id) =>
            validCustomIds?.has(id),
          ),
      ...(selectedHighVariant ? { reasoningEffort: "high" as const } : {}),
    }
  }

  if (result.selectedModel !== undefined) {
    const selectedProvider = providerForModel(result.selectedModel, settings)
    if (
      selectedProvider !== null &&
      Object.hasOwn(BUILTIN_PROVIDERS, selectedProvider)
    ) {
      result.selectedModel = collapseLegacyVariant(result.selectedModel)
    }
  }
  result.selectedModel = getSelectedModel(result) ?? undefined

  return result
}

export const getApiKey = (
  providerId: ProviderId,
  settings: AiAssistantSettings,
): string | null => {
  const builtinKey = settings.providers?.[providerId]?.apiKey
  if (builtinKey) return builtinKey
  const custom = settings.customProviders?.[providerId]
  if (custom) return custom.apiKey || ""
  return null
}

export const hasSchemaAccess = (settings: AiAssistantSettings): boolean => {
  const selectedModel = getSelectedModel(settings)
  if (!selectedModel) return false

  const provider = providerForModel(selectedModel, settings)
  if (!provider) return false

  return (
    settings.providers?.[provider]?.grantSchemaAccess === true ||
    settings.customProviders?.[provider]?.grantSchemaAccess === true
  )
}

export const getAiPermissions = (
  settings: AiAssistantSettings,
): Permissions => {
  const selectedModel = getSelectedModel(settings)
  if (!selectedModel) {
    return { grantSchemaAccess: false, read: false, write: false }
  }
  const provider = providerForModel(selectedModel, settings)
  if (!provider) {
    return { grantSchemaAccess: false, read: false, write: false }
  }
  const ps = settings.providers?.[provider]
  const cs = settings.customProviders?.[provider]
  return {
    grantSchemaAccess:
      ps?.grantSchemaAccess === true || cs?.grantSchemaAccess === true,
    read: ps?.read === true || cs?.read === true,
    write: ps?.write === true || cs?.write === true,
  }
}

export const readLiveAiAssistantSettings = (): AiAssistantSettings | null => {
  const stored = getValue(StoreKey.AI_ASSISTANT_SETTINGS)
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored) as AiAssistantSettings
    return reconcileSettings({
      selectedModel: parsed.selectedModel,
      providers: parsed.providers || {},
      ...(parsed.customProviders && {
        customProviders: parsed.customProviders,
      }),
    })
  } catch {
    return null
  }
}

export const readLiveAiPermissions = (fallback: Permissions): Permissions => {
  const live = readLiveAiAssistantSettings()
  return live ? getAiPermissions(live) : fallback
}
