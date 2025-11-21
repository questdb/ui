import { ReasoningEffort } from "openai/resources/shared"
import type { AiAssistantSettings } from "../providers/LocalStorageProvider/types"

export type Provider = "anthropic" | "openai"

export type ModelOption = {
  label: string
  value: string
  provider: Provider
  isSlow?: boolean
  isTestModel?: boolean
  default?: boolean
  defaultEnabled?: boolean
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
    label: "Claude Opus 4.1",
    value: "claude-opus-4-1",
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
  return MODEL_OPTIONS.find((m) => m.value === model)!.provider
}

export const getModelProps = (
  model: ModelOption["value"],
): {
  model: string
  reasoning?: { effort: ReasoningEffort }
} => {
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

export const getAllProviders = (): Provider[] => {
  const providers = new Set<Provider>()
  MODEL_OPTIONS.forEach((model) => {
    providers.add(model.provider)
  })
  return Array.from(providers)
}

export const getSelectedModel = (
  settings: AiAssistantSettings,
): string | null => {
  const selectedModel = settings.selectedModel
  if (
    selectedModel &&
    typeof selectedModel === "string" &&
    MODEL_OPTIONS.find((m) => m.value === selectedModel)
  ) {
    return selectedModel
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
  return getAllProviders().some(
    (provider) => !!settings.providers?.[provider]?.apiKey,
  )
}

export const canUseAiAssistant = (settings: AiAssistantSettings): boolean => {
  return isAiAssistantConfigured(settings) && !!settings.selectedModel
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
