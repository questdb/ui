import { withoutInlineImages } from "../ai/inlineImages"
import type { ConversationMessage } from "../../providers/AIConversationProvider/types"

const MAX_MESSAGES = 20
const MAX_MESSAGE_CHARS = 2_000
const MAX_TOTAL_CHARS = 12_000
const SUMMARY_PREFIX = "## PREVIOUS CONVERSATION SUMMARY:\n\n"
const SUMMARY_SUFFIX =
  "\n\n\n**Continue helping the user from where we left off.**"

const truncate = (text: string, limit: number): string =>
  text.length > limit ? `${text.slice(0, limit)}…` : text

const truncateWithin = (text: string, budget: number): string =>
  text.length > budget ? truncate(text, budget - 1) : text

const withAttachedSql = (text: string, sql: string): string => {
  if (text.slice(0, MAX_MESSAGE_CHARS).includes(sql)) return text
  const heading = `${text ? "\n" : ""}Attached SQL:\n`
  const budget = MAX_MESSAGE_CHARS - heading.length
  // Leave room for both the request and the SQL, even if either is long.
  const requestBudget = Math.max(Math.floor(budget / 2), budget - sql.length)
  const request = truncateWithin(text, requestBudget)
  return `${request}${heading}${truncateWithin(sql, budget - request.length)}`
}

const visibleText = (message: ConversationMessage): string | null => {
  if (message.hideFromUI || message.isCompacted) return null
  if (message.role === "user") {
    const text =
      message.displayUserMessage ??
      (typeof message.content === "string" ? message.content : "")
    const sql = message.sql?.trim()
    return sql ? withAttachedSql(text, sql) : text
  }
  if (message.role === "assistant") {
    const text = typeof message.content === "string" ? message.content : ""
    if (message.isRejected) {
      const previousSQL = message.previousSQL?.trim()
      return [
        "The user rejected this SQL suggestion and reverted to the previous version.",
        previousSQL && `Restored SQL at that point:\n${previousSQL}`,
        text && `Historical reply (not an accepted draft):\n${text}`,
      ]
        .filter(Boolean)
        .join("\n")
    }
    return [
      text,
      message.sql &&
        `${message.isAccepted ? "SQL accepted at that point" : "Suggested SQL"}:\n${message.sql}`,
    ]
      .filter(Boolean)
      .join("\n")
  }
  return null
}

// A transcript covers everything since the last answer on this channel, not
// answers from another bridge advertising the same agent ID. Legacy markers
// lack that distinction and cannot suppress history.
export const priorConversationFor = (
  history: ConversationMessage[],
  sessionId: string,
  currentSQL?: string,
): string | null => {
  const lastSeenTurn = history.findLastIndex(
    (message) =>
      message.role === "assistant" && message.localAgentSessionId === sessionId,
  )
  const unseen = history.slice(lastSeenTurn + 1)
  const lines: string[] = []
  // Compaction already keeps the old turns out of the live context. Carry
  // their summary separately so a busy recent tail cannot crowd it out.
  const summary = unseen.findLast(
    (message) =>
      message.role === "user" &&
      message.hideFromUI &&
      !message.isCompacted &&
      typeof message.content === "string" &&
      message.content.startsWith(SUMMARY_PREFIX) &&
      message.content.endsWith(SUMMARY_SUFFIX),
  )?.content
  const carriedSummary =
    typeof summary === "string"
      ? `Summary of older turns: ${truncate(withoutInlineImages(summary.slice(SUMMARY_PREFIX.length, -SUMMARY_SUFFIX.length)).trim(), MAX_TOTAL_CHARS / 2)}`
      : null
  const canonical = currentSQL?.trim()
  const current = canonical
    ? `Current canonical SQL (use this version, not historical SQL above):\n${truncateWithin(canonical, MAX_MESSAGE_CHARS)}`
    : currentSQL === ""
      ? "There is no current canonical SQL query."
      : null
  let total = (carriedSummary?.length ?? 0) + (current?.length ?? 0)
  for (let i = unseen.length - 1; i >= 0 && lines.length < MAX_MESSAGES; i--) {
    const message = unseen[i]
    const text = withoutInlineImages(visibleText(message) ?? "").trim()
    if (!text) continue
    const line = `${message.role === "user" ? "User" : "Assistant"}: ${truncate(text, MAX_MESSAGE_CHARS)}`
    if (total + line.length > MAX_TOTAL_CHARS) break
    lines.unshift(line)
    total += line.length
  }
  if (carriedSummary) lines.unshift(carriedSummary)
  if (lines.length === 0) return null
  return [
    "<earlier_conversation>",
    "The user talked to another assistant in this chat before switching to you. Earlier messages, oldest first:",
    ...lines,
    ...(current ? [current] : []),
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
