import { withoutInlineImages } from "../ai/inlineImages"
import type { ConversationMessage } from "../../providers/AIConversationProvider/types"

const MAX_MESSAGES = 20
const MAX_MESSAGE_CHARS = 2_000
const MAX_TOTAL_CHARS = 12_000

const visibleText = (message: ConversationMessage): string | null => {
  if (message.hideFromUI || message.isCompacted) return null
  if (message.role === "user") {
    return (
      message.displayUserMessage ??
      (typeof message.content === "string" ? message.content : null)
    )
  }
  if (message.role === "assistant" && typeof message.content === "string") {
    return message.content
  }
  return null
}

const truncate = (text: string, limit: number): string =>
  text.length > limit ? `${text.slice(0, limit)}…` : text

const unseenByAgent = (
  history: ConversationMessage[],
  agentId: string,
): ConversationMessage[] => {
  const lastAgentTurn = history.findLastIndex(
    (message) => message.localAgentId === agentId,
  )
  return history.slice(lastAgentTurn + 1)
}

// The agent keeps its own history per conversation. When a chat switches to
// the agent after talking to another model, the agent has not seen those
// turns, so its next message carries a transcript of everything since its
// last answered turn.
export const priorConversationFor = (
  history: ConversationMessage[],
  agentId: string,
): string | null => {
  const unseen = unseenByAgent(history, agentId)
  const lines: string[] = []
  let total = 0
  for (const message of unseen.slice(-MAX_MESSAGES).reverse()) {
    const text = withoutInlineImages(visibleText(message) ?? "").trim()
    if (!text) continue
    const line = `${message.role === "user" ? "User" : "Assistant"}: ${truncate(text, MAX_MESSAGE_CHARS)}`
    if (total + line.length > MAX_TOTAL_CHARS) break
    lines.unshift(line)
    total += line.length
  }
  if (lines.length === 0) return null
  return [
    "<earlier_conversation>",
    "The user talked to another assistant in this chat before switching to you. Earlier messages, oldest first:",
    ...lines,
    "</earlier_conversation>",
  ].join("\n")
}

const MAX_TITLE_LENGTH = 48

// A chat title from the user's first message, cut at a word boundary.
export const titleFromMessage = (message: string): string | null => {
  const singleLine = message.replace(/\s+/g, " ").trim()
  if (!singleLine) return null
  if (singleLine.length <= MAX_TITLE_LENGTH) return singleLine
  const cut = singleLine.slice(0, MAX_TITLE_LENGTH)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}
