import { db, ConversationMeta } from "./db"
import { compressMessages, decompressMessages } from "./compression"
import type {
  AIConversation,
  ConversationMessage,
  ConversationId,
} from "../providers/AIConversationProvider/types"

export const aiConversationStore = {
  getAllMetas: () => db.ai_conversations.toArray(),

  async getMessages(
    conversationId: ConversationId,
  ): Promise<ConversationMessage[]> {
    const record = await db.ai_conversation_messages.get(conversationId)
    return record ? decompressMessages(record.data) : []
  },

  saveMeta: (meta: ConversationMeta) => db.ai_conversations.put(meta),

  async saveMessages(
    conversationId: ConversationId,
    messages: ConversationMessage[],
    extraMetaUpdates?: Partial<ConversationMeta>,
  ) {
    const hasMessages = messages.length > 0
    await db.transaction(
      "rw",
      db.ai_conversations,
      db.ai_conversation_messages,
      async () => {
        await db.ai_conversation_messages.put({
          conversationId,
          data: compressMessages(messages),
        })
        await db.ai_conversations.update(conversationId, {
          hasMessages,
          ...extraMetaUpdates,
        })
      },
    )
  },

  async saveConversation(conversation: AIConversation) {
    const { messages, ...rest } = conversation
    const meta: ConversationMeta = { ...rest, hasMessages: messages.length > 0 }
    await db.transaction(
      "rw",
      db.ai_conversations,
      db.ai_conversation_messages,
      async () => {
        await db.ai_conversations.put(meta)
        await db.ai_conversation_messages.put({
          conversationId: conversation.id,
          data: compressMessages(messages),
        })
      },
    )
  },

  deleteConversation: (conversationId: ConversationId) =>
    db.transaction(
      "rw",
      db.ai_conversations,
      db.ai_conversation_messages,
      async () => {
        await db.ai_conversations.delete(conversationId)
        await db.ai_conversation_messages.delete(conversationId)
      },
    ),

  updateMeta: (
    conversationId: ConversationId,
    updates: Partial<ConversationMeta>,
  ) => db.ai_conversations.update(conversationId, updates),
}
