import type { AIProvider } from "./types"
import type { AiAssistantSettings } from "../../providers/LocalStorageProvider/types"
import { createOpenAIProvider } from "./openaiProvider"
import { createOpenAIChatCompletionsProvider } from "./openaiChatCompletionsProvider"
import { createAnthropicProvider } from "./anthropicProvider"
import { BUILTIN_PROVIDERS } from "./settings"
import type { ProviderId, ProviderType } from "./settings"

type ProviderOptions = {
  baseURL?: string
  contextWindow?: number
  isCustom?: boolean
}

export function createProvider(
  providerId: ProviderId,
  apiKey: string,
  settings?: AiAssistantSettings,
): AIProvider {
  // Check built-in providers first
  const builtin = BUILTIN_PROVIDERS[providerId]
  if (builtin) {
    return createProviderByType(builtin.type, providerId, apiKey)
  }

  // Check custom providers
  const custom = settings?.customProviders?.[providerId]
  if (custom) {
    return createProviderByType(custom.type, providerId, apiKey, {
      baseURL: custom.baseURL,
      contextWindow: custom.contextWindow,
      isCustom: true,
    })
  }

  throw new Error(`Unknown provider: ${providerId}`)
}

export function createProviderByType(
  providerType: ProviderType,
  providerId: ProviderId,
  apiKey: string,
  options?: ProviderOptions,
): AIProvider {
  switch (providerType) {
    case "openai":
      return createOpenAIProvider(apiKey, providerId, options)
    case "openai-chat-completions":
      return createOpenAIChatCompletionsProvider(apiKey, providerId, options)
    case "anthropic":
      return createAnthropicProvider(apiKey, providerId, options)
    default:
      throw new Error(`Unknown provider type: ${providerType}`)
  }
}
