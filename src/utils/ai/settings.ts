import type { AiAssistantSettings } from "../../providers/LocalStorageProvider/types"

export type ProviderType = "anthropic" | "openai" | "openai-chat-completions"

export type ProviderId = "anthropic" | "openai"

/** @deprecated Use ProviderId instead */
export type Provider = ProviderId

export const PROVIDER_TYPE: Record<ProviderId, ProviderType> = {
  anthropic: "anthropic",
  openai: "openai",
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

export const providerForModel = (
  model: ModelOption["value"],
): ProviderId | null => {
  return MODEL_OPTIONS.find((m) => m.value === model)?.provider ?? null
}

export const getModelProps = (model: ModelOption["value"]): ModelProps => {
  const modelOption = MODEL_OPTIONS.find((m) => m.value === model)
  if (!modelOption) {
    return { model }
  }
  const parts = modelOption.value.split("@")
  const modelName = parts[0]
  const extraParams = parts[1]
  if (extraParams) {
    const params = extraParams.split("=")
    const paramName = params[0]
    const paramValue = params[1]
    if (paramName === "reasoning" && paramValue) {
      return {
        model: modelName,
        reasoningEffort: paramValue as ReasoningEffort,
      }
    }
  }
  return { model: modelName }
}

export const getAllProviders = (): ProviderId[] => {
  const providers = new Set<ProviderId>()
  MODEL_OPTIONS.forEach((model) => {
    providers.add(model.provider)
  })
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

  // Fall back to first enabled default model, then first enabled model
  return (
    enabledModels.find(
      (id) => MODEL_OPTIONS.find((m) => m.value === id)?.default,
    ) ??
    enabledModels[0] ??
    null
  )
}

const getAllEnabledModels = (settings: AiAssistantSettings): string[] => {
  const models: string[] = []
  for (const provider of getAllProviders()) {
    const providerModels = settings.providers?.[provider]?.enabledModels
    if (providerModels) {
      models.push(...providerModels)
    }
  }
  return models
}

export const getNextModel = (
  currentModel: string | undefined,
  enabledModels: Record<ProviderId, string[]>,
): string | null => {
  let nextModel: string | null | undefined = currentModel

  const modelProvider = currentModel ? providerForModel(currentModel) : null
  if (modelProvider && enabledModels[modelProvider]?.length > 0) {
    // Current model is still enabled, so we can use it
    if (currentModel && enabledModels[modelProvider].includes(currentModel)) {
      return currentModel
    }
    // Take the default model of this provider, otherwise the first enabled model of this provider
    nextModel =
      enabledModels[modelProvider].find(
        (m) => MODEL_OPTIONS.find((mo) => mo.value === m)?.default,
      ) ?? enabledModels[modelProvider][0]
  } else {
    // No other enabled models for this provider, we have to choose from another provider if exists
    const otherProviderWithEnabledModel = getAllProviders().find(
      (p) => enabledModels[p].length > 0,
    )
    if (otherProviderWithEnabledModel) {
      nextModel =
        enabledModels[otherProviderWithEnabledModel].find(
          (m) => MODEL_OPTIONS.find((mo) => mo.value === m)?.default,
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
  return getAllProviders().some(
    (provider) => !!settings.providers?.[provider]?.apiKey,
  )
}

export const canUseAiAssistant = (settings: AiAssistantSettings): boolean => {
  return isAiAssistantConfigured(settings) && !!settings.selectedModel
}

/**
 * Reconciles persisted AI assistant settings against the current MODEL_OPTIONS.
 * Removes model IDs not present in MODEL_OPTIONS from enabledModels.
 *
 * Pure function — does not write to localStorage.
 * Idempotent: applying it multiple times produces the same result.
 */
export const reconcileSettings = (
  settings: AiAssistantSettings,
): AiAssistantSettings => {
  const validModelIds = new Set(MODEL_OPTIONS.map((m) => m.value))
  const result = {
    ...settings,
    providers: { ...settings.providers },
  }

  for (const providerKey of Object.keys(result.providers) as ProviderId[]) {
    const providerSettings = result.providers[providerKey]
    if (!providerSettings?.enabledModels) continue

    const models = providerSettings.enabledModels.filter((id) =>
      validModelIds.has(id),
    )
    result.providers[providerKey] = {
      ...providerSettings,
      enabledModels: models,
    }
  }

  result.selectedModel = getSelectedModel(result) ?? undefined

  return result
}

export const hasSchemaAccess = (settings: AiAssistantSettings): boolean => {
  const selectedModel = getSelectedModel(settings)
  if (!selectedModel) return false

  const anthropicModels = settings.providers?.anthropic?.enabledModels || []
  const openaiModels = settings.providers?.openai?.enabledModels || []

  if (anthropicModels.includes(selectedModel)) {
    return settings.providers?.anthropic?.grantSchemaAccess === true
  }

  if (openaiModels.includes(selectedModel)) {
    return settings.providers?.openai?.grantSchemaAccess === true
  }

  return false
}
