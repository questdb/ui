import type { AIProvider } from "./types"
import { createOpenAIProvider } from "./openaiProvider"
import { createOpenAIChatCompletionsProvider } from "./openaiChatCompletionsProvider"
import { createAnthropicProvider } from "./anthropicProvider"
import { PROVIDERS } from "./settings"
import type { ProviderId, ProviderType } from "./settings"

export function createProvider(
  providerId: ProviderId,
  apiKey: string,
): AIProvider {
  const providerType = PROVIDERS[providerId].type
  return createProviderByType(providerType, providerId, apiKey)
}

export function createProviderByType(
  providerType: ProviderType,
  providerId: ProviderId,
  apiKey: string,
): AIProvider {
  switch (providerType) {
    case "openai":
      return createOpenAIProvider(apiKey, providerId)
    case "openai-chat-completions":
      return createOpenAIChatCompletionsProvider(apiKey, providerId)
    case "anthropic":
      return createAnthropicProvider(apiKey, providerId)
    default:
      throw new Error(`Unknown provider type: ${providerType}`)
  }
}
