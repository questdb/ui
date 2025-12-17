import type { ConversationId, AIConversation, QueryKey } from "./types"

export type ConversationIndices = {
  // Lookup by buffer + queryKey (for glyph clicks, buffer-specific operations)
  queryIndex: Map<string, ConversationId> // key: `${bufferId}:${queryKey}`

  // Lookup by schema identifier (for "Explain schema" reopening)
  schemaIndex: Map<string, ConversationId> // key: schemaIdentifier
}

/**
 * Builds lookup indices from the conversations map.
 * Called via useMemo whenever conversations change.
 */
export const buildIndices = (
  conversations: Map<ConversationId, AIConversation>,
): ConversationIndices => {
  const queryIndex = new Map<string, ConversationId>()
  const schemaIndex = new Map<string, ConversationId>()

  conversations.forEach((conv, id) => {
    // Index by buffer + queryKey (if both exist)
    if (conv.bufferId != null && conv.queryKey != null) {
      queryIndex.set(createQueryLookupKey(conv.bufferId, conv.queryKey), id)
    }

    // Index by schema identifier (if exists)
    if (conv.schemaIdentifier) {
      schemaIndex.set(conv.schemaIdentifier, id)
    }
  })

  return { queryIndex, schemaIndex }
}

/**
 * Creates a lookup key for finding conversations by buffer + queryKey.
 * Used for glyph widget hasConversation checks and opening conversations.
 */
export const createQueryLookupKey = (
  bufferId: string | number,
  queryKey: QueryKey,
): string => `${bufferId}:${queryKey}`

/**
 * Creates a schema identifier for schema conversations.
 * Format: "schema:tableName:ddlHash"
 * Used for reopening schema conversations for the same table.
 */
export const createSchemaIdentifier = (
  tableName: string,
  ddlHash: string,
): string => `schema:${tableName}:${ddlHash}`

/**
 * Simple hash function for DDL strings.
 * Used to detect if table schema has changed.
 */
export const hashString = (str: string): string => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}
