import type { ConversationMessage } from "../../providers/AIConversationProvider/types"
import type { ContextUsage } from "./aiAssistant"

// 180, 2.4K, 24.4K, 475K, 1.2M: one decimal while it says something.
export const formatTokenCount = (count: number): string => {
  const scaled = (value: number, unit: string) =>
    `${value >= 100 ? Math.round(value) : Number(value.toFixed(1))}${unit}`
  if (count >= 1_000_000) return scaled(count / 1_000_000, "M")
  if (count >= 1000) return scaled(count / 1000, "K")
  return count.toString()
}

type TokenUsage = { inputTokens: number; outputTokens: number }

const isTokenUsage = (value: unknown): value is TokenUsage => {
  const usage = value as Partial<TokenUsage> | null | undefined
  return (
    typeof usage?.inputTokens === "number" &&
    typeof usage.outputTokens === "number"
  )
}

// The tokens every answer in the conversation read and wrote; null before
// any answer reported them.
export const totalTokenUsage = (
  messages: ConversationMessage[],
): TokenUsage | null => {
  const reported = messages.flatMap((message) => {
    const usage: unknown = message.tokenUsage
    return isTokenUsage(usage) ? [usage] : []
  })
  if (reported.length === 0) return null
  return {
    inputTokens: reported.reduce((sum, usage) => sum + usage.inputTokens, 0),
    outputTokens: reported.reduce((sum, usage) => sum + usage.outputTokens, 0),
  }
}

// The token usage of the conversation's latest answer that reported one.
export const latestTokenUsage = (
  messages: ConversationMessage[],
): TokenUsage | null => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const usage = messages[index].tokenUsage
    if (isTokenUsage(usage)) return usage
  }
  return null
}

const isContextUsage = (value: unknown): value is ContextUsage => {
  const usage = value as Partial<ContextUsage> | null | undefined
  return (
    typeof usage?.used === "number" &&
    typeof usage.size === "number" &&
    usage.size > 0
  )
}

// How full the session's context was after the conversation's latest answer
// that reported it; null until a new session reports its own.
export const latestContextUsage = (
  messages: ConversationMessage[],
  sessionId: string | undefined,
): ContextUsage | null => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const usage = messages[index].contextUsage
    if (isContextUsage(usage)) {
      return usage.sessionId === sessionId ? usage : null
    }
  }
  return null
}
