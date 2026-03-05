import type { AIProvider } from "./types"
import { createOpenAIProvider } from "./openaiProvider"
import { createAnthropicProvider } from "./anthropicProvider"
import type { Provider } from "../aiAssistantSettings"

export function createProvider(
  providerId: Provider,
  apiKey: string,
): AIProvider {
  switch (providerId) {
    case "openai":
      return createOpenAIProvider(apiKey)
    case "anthropic":
      return createAnthropicProvider(apiKey)
    default:
      throw new Error(`Unknown provider: ${providerId}`)
  }
}
