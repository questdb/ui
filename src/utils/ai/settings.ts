import type {
  AiAssistantSettings,
  CustomProviderDefinition,
} from "../../providers/LocalStorageProvider/types"

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
  isSlow?: boolean
  isTestModel?: boolean
  default?: boolean
  defaultEnabled?: boolean
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    label: "Claude Opus 4.6",
    value: "claude-opus-4-6",
    provider: "anthropic",
    isSlow: true,
    defaultEnabled: true,
  },
  {
    label: "Claude Sonnet 4.6",
    value: "claude-sonnet-4-6",
    provider: "anthropic",
    default: true,
    defaultEnabled: true,
  },
  {
    label: "Claude Sonnet 4.5",
    value: "claude-sonnet-4-5",
    provider: "anthropic",
  },
  {
    label: "Claude Haiku 4.5",
    value: "claude-haiku-4-5",
    provider: "anthropic",
    isTestModel: true,
  },
  {
    label: "GPT-5.4 (High Reasoning)",
    value: "gpt-5.4@reasoning=high",
    provider: "openai",
  },
  {
    label: "GPT-5.4 (Medium Reasoning)",
    value: "gpt-5.4@reasoning=medium",
    provider: "openai",
    defaultEnabled: true,
  },
  {
    label: "GPT-5.4 (Low Reasoning)",
    value: "gpt-5.4@reasoning=low",
    provider: "openai",
    defaultEnabled: true,
    default: true,
  },
  {
    label: "GPT-5 mini",
    value: "gpt-5-mini",
    provider: "openai",
    defaultEnabled: true,
  },
  {
    label: "GPT-5 nano",
    value: "gpt-5-nano",
    provider: "openai",
    defaultEnabled: true,
    isTestModel: true,
  },
]

export type ReasoningEffort = "high" | "medium" | "low"

export type ModelProps = {
  model: string
  reasoningEffort?: ReasoningEffort
}

const CUSTOM_MODEL_SEP = ":"

export const makeCustomModelValue = (
  providerId: ProviderId,
  modelId: string,
): string => `${providerId}${CUSTOM_MODEL_SEP}${modelId}`

export const parseModelValue = (
  value: string,
): { customProviderId: string; rawModel: string } | { rawModel: string } => {
  const sepIndex = value.indexOf(CUSTOM_MODEL_SEP)
  if (sepIndex === -1) return { rawModel: value }
  const candidateProvider = value.slice(0, sepIndex)
  // Only treat as namespaced if the prefix is NOT a built-in provider.
  if (BUILTIN_PROVIDERS[candidateProvider]) return { rawModel: value }
  return {
    customProviderId: candidateProvider,
    rawModel: value.slice(sepIndex + 1),
  }
}

export const getAllModelOptions = (
  settings?: AiAssistantSettings,
): ModelOption[] => {
  if (!settings?.customProviders) return MODEL_OPTIONS
  const customModels: ModelOption[] = []
  for (const [providerId, def] of Object.entries(settings.customProviders)) {
    for (const modelId of def.models) {
      customModels.push({
        label: modelId,
        value: makeCustomModelValue(providerId, modelId),
        provider: providerId,
      })
    }
  }
  return [...MODEL_OPTIONS, ...customModels]
}

export const providerForModel = (
  model: ModelOption["value"],
  _settings?: AiAssistantSettings,
): ProviderId | null => {
  // Check for namespaced custom model value (providerId:modelId)
  const parsed = parseModelValue(model)
  if ("customProviderId" in parsed) return parsed.customProviderId
  // Fall back to built-in model lookup
  return MODEL_OPTIONS.find((m) => m.value === model)?.provider ?? null
}

export const getModelProps = (model: ModelOption["value"]): ModelProps => {
  const { rawModel } = parseModelValue(model)
  const parts = rawModel.split("@")
  const modelName = parts[0]
  const extraParams = parts[1]
    ?.split(",")
    ?.map((p) => ({ key: p.split("=")[0], value: p.split("=")[1] }))
  if (extraParams) {
    const reasoningParam = extraParams.find((p) => p.key === "reasoning")
    if (reasoningParam && reasoningParam.value) {
      return {
        model: modelName,
        reasoningEffort: reasoningParam.value as ReasoningEffort,
      }
    }
  }
  return { model: modelName }
}

export const getAllProviders = (
  settings?: AiAssistantSettings,
): ProviderId[] => {
  const providers = new Set<ProviderId>()
  MODEL_OPTIONS.forEach((model) => {
    providers.add(model.provider)
  })
  if (settings?.customProviders) {
    for (const id of Object.keys(settings.customProviders)) {
      providers.add(id)
    }
  }
  return Array.from(providers)
}

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

  const allModels = getAllModelOptions(settings)
  // Fall back to first enabled default model, then first enabled model
  return (
    enabledModels.find(
      (id) => allModels.find((m) => m.value === id)?.default,
    ) ??
    enabledModels[0] ??
    null
  )
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
): string | null => {
  let nextModel: string | null | undefined = currentModel

  const allModels = getAllModelOptions(settings)
  const modelProvider = currentModel
    ? providerForModel(currentModel, settings)
    : null
  if (modelProvider && enabledModels[modelProvider]?.length > 0) {
    // Current model is still enabled, so we can use it
    if (currentModel && enabledModels[modelProvider].includes(currentModel)) {
      return currentModel
    }
    // Take the default model of this provider, otherwise the first enabled model of this provider
    nextModel =
      enabledModels[modelProvider].find(
        (m) => allModels.find((mo) => mo.value === m)?.default,
      ) ?? enabledModels[modelProvider][0]
  } else {
    // No other enabled models for this provider, we have to choose from another provider if exists
    const otherProviderWithEnabledModel = getAllProviders(settings).find(
      (p) => enabledModels[p]?.length > 0,
    )
    if (otherProviderWithEnabledModel) {
      nextModel =
        enabledModels[otherProviderWithEnabledModel].find(
          (m) => allModels.find((mo) => mo.value === m)?.default,
        ) ?? enabledModels[otherProviderWithEnabledModel][0]
    } else {
      nextModel = null
    }
  }
  return nextModel ?? null
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

export const getTestModel = (
  providerId: ProviderId,
  settings?: AiAssistantSettings,
): string | null => {
  if (settings?.customProviders?.[providerId]) {
    return settings.selectedModel ?? null
  }
  return (
    MODEL_OPTIONS.find((m) => m.provider === providerId && m.isTestModel)
      ?.value ?? null
  )
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

/**
 * Reconciles persisted AI assistant settings against current model options.
 * Removes stale model IDs from built-in providers' enabledModels.
 * Preserves custom provider models (validated against customProviders definitions).
 *
 * Pure function — does not write to localStorage.
 * Idempotent: applying it multiple times produces the same result.
 */
export const reconcileSettings = (
  settings: AiAssistantSettings,
): AiAssistantSettings => {
  const allValidIds = new Set(getAllModelOptions(settings).map((m) => m.value))
  const result = {
    ...settings,
    providers: { ...settings.providers },
  }

  for (const providerKey of Object.keys(result.providers)) {
    const providerSettings = result.providers[providerKey]
    if (!providerSettings?.enabledModels) continue

    const models = providerSettings.enabledModels.filter((id) =>
      allValidIds.has(id),
    )
    result.providers[providerKey] = {
      ...providerSettings,
      enabledModels: models,
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
