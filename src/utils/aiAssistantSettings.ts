import { ReasoningEffort } from "openai/resources/shared"
import type { AiAssistantSettings } from "../providers/LocalStorageProvider/types"

export type BuiltInProvider = "anthropic" | "openai"
export type Provider = BuiltInProvider | string

export const isCustomProvider = (provider: string): boolean => {
  return provider.startsWith("custom-")
}

export const generateCustomProviderId = (name: string): string => {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-")
  const timestamp = Date.now().toString(36)
  return `custom-${slug}-${timestamp}`
}

export const getCustomProviderIds = (settings: AiAssistantSettings): string[] => {
  return Object.keys(settings.customProviders || {})
}

export const parseCustomModelValue = (
  modelValue: string,
): { providerId: string; modelId: string } | null => {
  if (!modelValue.startsWith("custom-")) return null
  const firstColonIndex = modelValue.indexOf(":", 7) // Skip "custom-" prefix
  if (firstColonIndex === -1) return null
  return {
    providerId: modelValue.slice(0, firstColonIndex),
    modelId: modelValue.slice(firstColonIndex + 1),
  }
}

export type ModelOption = {
  label: string
  value: string
  provider: Provider
  isSlow?: boolean
  isTestModel?: boolean
  default?: boolean
  defaultEnabled?: boolean
  isCustom?: boolean
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    label: "Claude Sonnet 4.5",
    value: "claude-sonnet-4-5",
    provider: "anthropic",
    default: true,
    defaultEnabled: true,
  },
  {
    label: "Claude Opus 4.5",
    value: "claude-opus-4-5",
    provider: "anthropic",
    isSlow: true,
    defaultEnabled: true,
  },
  {
    label: "Claude Sonnet 4",
    value: "claude-sonnet-4",
    provider: "anthropic",
  },
  {
    label: "Claude Haiku 4.5",
    value: "claude-haiku-4-5",
    provider: "anthropic",
    isTestModel: true,
  },
  {
    label: "GPT-5.1 (High Reasoning)",
    value: "gpt-5.1@reasoning=high",
    provider: "openai",
    isSlow: true,
  },
  {
    label: "GPT-5.1 (Medium Reasoning)",
    value: "gpt-5.1@reasoning=medium",
    provider: "openai",
    isSlow: true,
    defaultEnabled: true,
  },
  {
    label: "GPT-5.1 (No Reasoning)",
    value: "gpt-5.1",
    provider: "openai",
    defaultEnabled: true,
    isTestModel: true,
  },
  {
    label: "GPT-5",
    value: "gpt-5",
    provider: "openai",
    defaultEnabled: true,
  },
  {
    label: "GPT-5 mini",
    value: "gpt-5-mini",
    provider: "openai",
    default: true,
    defaultEnabled: true,
  },
]

export const providerForModel = (model: ModelOption["value"]): Provider => {
  // Check if it's a custom provider model (format: "custom-xxx:model-id")
  const customParsed = parseCustomModelValue(model)
  if (customParsed) {
    return customParsed.providerId
  }
  // Fall back to built-in model lookup
  const found = MODEL_OPTIONS.find((m) => m.value === model)
  return found?.provider ?? "openai"
}

export const getModelProps = (
  model: ModelOption["value"],
): {
  model: string
  reasoning?: { effort: ReasoningEffort }
} => {
  // Handle custom provider models (format: "custom-xxx:model-id")
  const customParsed = parseCustomModelValue(model)
  if (customParsed) {
    return { model: customParsed.modelId }
  }

  // Handle built-in models
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
        reasoning: { effort: paramValue as ReasoningEffort },
      }
    }
  }
  return { model: modelName }
}

export const getAllProviders = (): BuiltInProvider[] => {
  const providers = new Set<BuiltInProvider>()
  MODEL_OPTIONS.forEach((model) => {
    if (!isCustomProvider(model.provider)) {
      providers.add(model.provider as BuiltInProvider)
    }
  })
  return Array.from(providers)
}

export const getSelectedModel = (
  settings: AiAssistantSettings,
): string | null => {
  const selectedModel = settings.selectedModel
  if (selectedModel && typeof selectedModel === "string") {
    // Check if it's a valid built-in model
    if (MODEL_OPTIONS.find((m) => m.value === selectedModel)) {
      return selectedModel
    }
    // Check if it's a valid custom provider model
    const customParsed = parseCustomModelValue(selectedModel)
    if (customParsed) {
      const customProvider = settings.customProviders?.[customParsed.providerId]
      if (customProvider?.enabledModels.includes(customParsed.modelId)) {
        return selectedModel
      }
    }
  }

  return MODEL_OPTIONS.find((m) => m.default)?.value ?? null
}

export const getNextModel = (
  currentModel: string | undefined,
  enabledModels: Record<Provider, string[]>,
): string | null => {
  let nextModel: string | null | undefined = currentModel

  const modelProvider = currentModel ? providerForModel(currentModel) : null
  if (modelProvider && enabledModels[modelProvider].length > 0) {
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
  // Check built-in providers
  const hasBuiltInProvider = getAllProviders().some(
    (provider) => !!settings.providers?.[provider]?.apiKey,
  )
  if (hasBuiltInProvider) return true

  // Check custom providers (configured if has at least one enabled model)
  const customProviderIds = getCustomProviderIds(settings)
  return customProviderIds.some((id) => {
    const provider = settings.customProviders?.[id]
    return provider && provider.enabledModels.length > 0
  })
}

export const canUseAiAssistant = (settings: AiAssistantSettings): boolean => {
  return isAiAssistantConfigured(settings) && !!settings.selectedModel
}

export const hasSchemaAccess = (settings: AiAssistantSettings): boolean => {
  const selectedModel = getSelectedModel(settings)
  if (!selectedModel) return false

  // Check if it's a custom provider model
  const customParsed = parseCustomModelValue(selectedModel)
  if (customParsed) {
    const customProvider = settings.customProviders?.[customParsed.providerId]
    return customProvider?.grantSchemaAccess === true
  }

  // Check built-in providers
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

export const getAllModelsIncludingCustom = (
  settings: AiAssistantSettings,
): ModelOption[] => {
  const builtInModels = [...MODEL_OPTIONS]

  const customModels: ModelOption[] = []
  for (const [providerId, providerSettings] of Object.entries(
    settings.customProviders || {},
  )) {
    for (const model of providerSettings.availableModels) {
      customModels.push({
        label: model.name,
        value: `${providerId}:${model.id}`,
        provider: providerId,
        isCustom: true,
      })
    }
  }

  return [...builtInModels, ...customModels]
}

export const getEnabledModelsForCustomProvider = (
  settings: AiAssistantSettings,
  providerId: string,
): ModelOption[] => {
  const provider = settings.customProviders?.[providerId]
  if (!provider) return []

  return provider.enabledModels.map((modelId) => {
    const modelInfo = provider.availableModels.find((m) => m.id === modelId)
    return {
      label: modelInfo?.name || modelId,
      value: `${providerId}:${modelId}`,
      provider: providerId,
      isCustom: true,
    }
  })
}
