import { db, ConversationMeta, PersistedMessageImages } from "./db"
import { compressMessages, decompressMessages } from "./compression"
import type {
  AIConversation,
  ConversationMessage,
  ConversationId,
} from "../providers/AIConversationProvider/types"

const conversationImages = (conversationId: ConversationId) =>
  db.ai_message_images.where("conversationId").equals(conversationId)

// Images stay out of the compressed transcript, in a row per message. A
// message's images never change once it is sent, so a save writes only the
// rows it does not find, and drops those of messages no longer in the chat.
const putMessages = async (
  conversationId: ConversationId,
  messages: ConversationMessage[],
) => {
  const storedKeys = await conversationImages(conversationId).primaryKeys()
  const stored = new Set(storedKeys.map(([, messageId]) => messageId))
  const withImages = new Set<string>()
  const newRows: PersistedMessageImages[] = []
  const transcript = messages.map((message) => {
    if (!message.images?.length) return message
    const { images, ...rest } = message
    withImages.add(message.id)
    if (!stored.has(message.id))
      newRows.push({ conversationId, messageId: message.id, images })
    return rest
  })
  await db.ai_message_images.bulkDelete(
    storedKeys.filter(([, messageId]) => !withImages.has(messageId)),
  )
  await db.ai_message_images.bulkPut(newRows)
  await db.ai_conversation_messages.put({
    conversationId,
    data: compressMessages(transcript),
  })
}

export const aiConversationStore = {
  getAllMetas: () => db.ai_conversations.toArray(),

  getMeta: (conversationId: ConversationId) =>
    db.ai_conversations.get(conversationId),

  getMessages(conversationId: ConversationId): Promise<ConversationMessage[]> {
    return db.transaction(
      "r",
      db.ai_conversation_messages,
      db.ai_message_images,
      async () => {
        const record = await db.ai_conversation_messages.get(conversationId)
        if (!record) return []
        const imageRows = await conversationImages(conversationId).toArray()
        const imagesByMessage = new Map(
          imageRows.map(({ messageId, images }) => [messageId, images]),
        )
        return decompressMessages(record.data).map((message) => {
          const images = imagesByMessage.get(message.id)
          return images ? { ...message, images } : message
        })
      },
    )
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
      db.ai_message_images,
      async () => {
        const updated = await db.ai_conversations.update(conversationId, {
          hasMessages,
          ...extraMetaUpdates,
        })
        // A late save must not recreate a deleted conversation's transcript.
        if (!updated) return
        await putMessages(conversationId, messages)
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
      db.ai_message_images,
      async () => {
        await db.ai_conversations.put(meta)
        await putMessages(conversation.id, messages)
      },
    )
  },

  deleteConversation: (conversationId: ConversationId) =>
    db.transaction(
      "rw",
      db.ai_conversations,
      db.ai_conversation_messages,
      db.ai_message_images,
      async () => {
        await db.ai_conversations.delete(conversationId)
        await db.ai_conversation_messages.delete(conversationId)
        await conversationImages(conversationId).delete()
      },
    ),

  updateMeta: (
    conversationId: ConversationId,
    updates: Partial<ConversationMeta>,
  ) => db.ai_conversations.update(conversationId, updates),
}
