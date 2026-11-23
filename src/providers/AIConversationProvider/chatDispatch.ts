import type { ConversationId, ConversationMessage } from "./types"

type ChatDispatchState = {
  owner: symbol
  messages: ConversationMessage[]
} | null

// Captures the chat a flow starts from. The returned check tells, after any
// await, whether the same owner still holds the same transcript.
export const captureChatDispatch = (
  getChatDispatchState: (id: ConversationId) => ChatDispatchState,
  id: ConversationId,
): (() => boolean) => {
  const captured = getChatDispatchState(id)
  return () => {
    const current = getChatDispatchState(id)
    return (
      captured !== null &&
      current?.owner === captured.owner &&
      current.messages === captured.messages
    )
  }
}
