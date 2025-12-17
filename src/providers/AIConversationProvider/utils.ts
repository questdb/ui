import type { ConversationMessage } from "./types"

/**
 * Trims trailing semicolon from SQL for display purposes.
 * Also ensures the result ends with a newline for Monaco diff editor compatibility.
 */
export const trimSemicolonForDisplay = (
  sql: string | undefined | null,
): string => {
  if (!sql || typeof sql !== "string") return "\n"
  let trimmed = sql.trim()
  if (trimmed.endsWith(";")) {
    trimmed = trimmed.slice(0, -1).trim()
  }
  return trimmed + "\n"
}

/**
 * Finds the last visible assistant message with an unactioned SQL diff.
 * Returns the message if found, null otherwise.
 *
 * "Unactioned" means the message has SQL changes that haven't been accepted, rejected,
 * or implicitly rejected via follow-up.
 */
export const getLastUnactionedDiff = (
  messages: ConversationMessage[],
): ConversationMessage | null => {
  // Find last visible message
  const visibleMessages = messages.filter((m) => !m.hideFromUI)
  if (visibleMessages.length === 0) return null

  const lastVisible = visibleMessages[visibleMessages.length - 1]

  // Check if it's an assistant message with SQL that hasn't been actioned
  const hasUnactionedDiff =
    lastVisible.role === "assistant" &&
    lastVisible.sql !== undefined &&
    lastVisible.previousSQL !== undefined &&
    !lastVisible.isAccepted &&
    !lastVisible.isRejected &&
    !lastVisible.isRejectedWithFollowUp

  return hasUnactionedDiff ? lastVisible : null
}

/**
 * Checks if there's an unactioned diff in the conversation messages.
 * Simple boolean helper wrapping getLastUnactionedDiff.
 */
export const hasUnactionedDiff = (messages: ConversationMessage[]): boolean => {
  return getLastUnactionedDiff(messages) !== null
}
