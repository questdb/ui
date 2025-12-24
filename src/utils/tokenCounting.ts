import Anthropic from "@anthropic-ai/sdk"
import { encoding_for_model, TiktokenModel } from "tiktoken"
import type { Provider } from "./aiAssistantSettings"

export interface ConversationMessage {
  role: "user" | "assistant"
  content: string
}

export const CONTEXT_LIMITS: Record<Provider, number> = {
  anthropic: 200_000,
  openai: 400_000,
}

export const COMPACTION_THRESHOLDS: Record<Provider, number> = {
  anthropic: 150_000,
  openai: 350_000,
}

export async function countTokensAnthropic(
  client: Anthropic,
  messages: ConversationMessage[],
  systemPrompt: string,
  model: string,
): Promise<number> {
  const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const response = await client.messages.countTokens({
    model,
    system: systemPrompt,
    messages: anthropicMessages,
  })

  return response.input_tokens
}

let tiktokenEncoder: ReturnType<typeof encoding_for_model> | null = null

export function countTokensOpenAI(
  messages: ConversationMessage[],
  systemPrompt: string,
): number {
  if (!tiktokenEncoder) {
    tiktokenEncoder = encoding_for_model("gpt-5" as TiktokenModel)
  }

  let totalTokens = 0

  totalTokens += tiktokenEncoder.encode(systemPrompt).length
  // Add overhead for system message formatting
  totalTokens += 4 // <|start|>system<|end|> overhead

  for (const message of messages) {
    // Each message has overhead for role markers
    totalTokens += 4 // <|start|>{role}<|end|> overhead
    totalTokens += tiktokenEncoder.encode(message.content).length
  }

  // Add 2 tokens for assistant reply priming
  totalTokens += 2

  return totalTokens
}

export async function countTokens(
  provider: Provider,
  messages: ConversationMessage[],
  systemPrompt: string,
  options: {
    anthropicClient?: Anthropic
    model?: string
  } = {},
): Promise<number> {
  try {
    if (provider === "anthropic") {
      if (!options.anthropicClient || !options.model) {
        return -1
      }
      return await countTokensAnthropic(
        options.anthropicClient,
        messages,
        systemPrompt,
        options.model,
      )
    } else {
      return countTokensOpenAI(messages, systemPrompt)
    }
  } catch (error) {
    console.warn(
      "Failed to estimate tokens for conversation, using full messages list.",
      error,
    )
    return -1
  }
}
