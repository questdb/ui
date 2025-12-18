import type { ConversationId, AIConversation, QueryKey } from "./types"

export type ConversationIndices = {
  queryIndex: Map<string, ConversationId> // key: `${bufferId}:${queryKey}`

  tableIndex: Map<number, ConversationId> // key: tableId
}

/**
 * Builds lookup indices from the conversations map.
 * Called via useMemo whenever conversations change.
 */
export const buildIndices = (
  conversations: Map<ConversationId, AIConversation>,
): ConversationIndices => {
  const queryIndex = new Map<string, ConversationId>()
  const tableIndex = new Map<number, ConversationId>()

  conversations.forEach((conv, id) => {
    // Index by buffer + queryKey (if both exist)
    if (conv.bufferId != null && conv.queryKey != null) {
      queryIndex.set(createQueryLookupKey(conv.bufferId, conv.queryKey), id)
    }

    if (conv.tableId != null) {
      tableIndex.set(conv.tableId, id)
    }
  })

  return { queryIndex, tableIndex }
}

/**
 * Creates a lookup key for finding conversations by buffer + queryKey.
 * Used for glyph widget hasConversation checks and opening conversations.
 */
export const createQueryLookupKey = (
  bufferId: string | number,
  queryKey: QueryKey,
): string => `${bufferId}:${queryKey}`
