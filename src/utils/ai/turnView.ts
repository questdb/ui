import type { ConversationMessage } from "../../providers/AIConversationProvider/types"

export type AssistantTurn = {
  anchorIndex: number
  anchorMessage: ConversationMessage
  messages: ConversationMessage[]
}

export type VisibleEntry =
  | { type: "user"; message: ConversationMessage; index: number }
  | {
      type: "assistantTurn"
      anchorMessage: ConversationMessage
      anchorIndex: number
      turnMessages: ConversationMessage[]
    }

export type TurnProjection = {
  turns: AssistantTurn[]
  visibleEntries: VisibleEntry[]
  lastAssistantAnchorIndex: number
  previousVisibleUserByAnchorIndex: Map<number, ConversationMessage>
}

/**
 * Single-pass projection used by both UI rendering and turn-level helpers.
 * Keeps transcript order progressive while exposing bundled UI turn entries.
 */
export function projectConversationTurns(
  messages: ConversationMessage[],
): TurnProjection {
  const turns: AssistantTurn[] = []
  const visibleEntries: VisibleEntry[] = []
  const previousVisibleUserByAnchorIndex = new Map<
    number,
    ConversationMessage
  >()
  let currentTurn: AssistantTurn | null = null
  let lastVisibleUser: ConversationMessage | null = null

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]

    if (message.role === "user") {
      if (!message.hideFromUI) {
        visibleEntries.push({ type: "user", message, index: i })
        lastVisibleUser = message
        currentTurn = null
      }
      continue
    }

    if (message.role === "assistant" && currentTurn === null) {
      currentTurn = {
        anchorIndex: i,
        anchorMessage: message,
        messages: [message],
      }
      turns.push(currentTurn)
      if (lastVisibleUser) {
        previousVisibleUserByAnchorIndex.set(i, lastVisibleUser)
      }
      if (!message.hideFromUI) {
        visibleEntries.push({
          type: "assistantTurn",
          anchorMessage: currentTurn.anchorMessage,
          anchorIndex: currentTurn.anchorIndex,
          turnMessages: currentTurn.messages,
        })
      }
      continue
    }

    if (currentTurn) {
      currentTurn.messages.push(message)
    }
  }

  return {
    turns,
    visibleEntries,
    lastAssistantAnchorIndex:
      turns.length > 0 ? turns[turns.length - 1].anchorIndex : -1,
    previousVisibleUserByAnchorIndex,
  }
}

export function buildAssistantTurns(
  messages: ConversationMessage[],
): AssistantTurn[] {
  return projectConversationTurns(messages).turns
}

export function getLastTurnWithUnactionedDiff(
  messages: ConversationMessage[],
): ConversationMessage | null {
  const { turns } = projectConversationTurns(messages)
  for (let i = turns.length - 1; i >= 0; i--) {
    const anchor = turns[i].anchorMessage
    if (
      !anchor.hideFromUI &&
      anchor.sql !== undefined &&
      anchor.previousSQL !== undefined &&
      anchor.sql.trim() !== anchor.previousSQL.trim() &&
      !anchor.isAccepted &&
      !anchor.isRejected
    ) {
      return anchor
    }
  }
  return null
}

export function getScrollLength(
  isStreaming: boolean,
  messages: ConversationMessage[],
): number {
  if (messages.length === 0) return 0

  const headVisibleCount = messages
    .slice(0, -1)
    .filter((message) => !message.hideFromUI).length

  const lastMessage = messages[messages.length - 1]
  if (lastMessage.hideFromUI) return headVisibleCount

  if (!isStreaming || lastMessage.role !== "assistant") {
    return headVisibleCount + 1
  }

  const contentLength =
    typeof lastMessage.content === "string" ? lastMessage.content.length : 0
  const reasoningLength = lastMessage.reasoning?.content?.length ?? 0
  const toolCallCount = lastMessage.tool_calls?.length ?? 0

  return headVisibleCount + contentLength + reasoningLength + toolCallCount
}
