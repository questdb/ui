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

  saveMessages: (
    conversationId: ConversationId,
    messages: ConversationMessage[],
  ) =>
    db.ai_conversation_messages.put({
      conversationId,
      data: compressMessages(messages),
    }),

  async saveConversation(conversation: AIConversation) {
    const { messages, ...meta } = conversation
    await Promise.all([
      this.saveMeta(meta),
      this.saveMessages(conversation.id, messages),
    ])
  },

  deleteConversation: (conversationId: ConversationId) =>
    Promise.all([
      db.ai_conversations.delete(conversationId),
      db.ai_conversation_messages.delete(conversationId),
    ]),

  updateMeta: (
    conversationId: ConversationId,
    updates: Partial<ConversationMeta>,
  ) => db.ai_conversations.update(conversationId, updates),
}
