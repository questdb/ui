import { db, ConversationMeta, PersistedMessagePayloads } from "./db"
import { compressMessages, decompressMessages } from "./compression"
import {
  joinMessagePayloads,
  splitMessagePayloads,
  type SplitMessage,
} from "./messagePayloads"
import type {
  AIConversation,
  ConversationMessage,
  ConversationId,
} from "../providers/AIConversationProvider/types"

const conversationPayloads = (conversationId: ConversationId) =>
  db.ai_message_images.where("conversationId").equals(conversationId)

// A chat replaces a message to change it. So a message keeps the transcript
// form it was split into, and one whose payloads were stored or loaded as
// they are needs no write until it is replaced.
const splitMessages = new WeakMap<ConversationMessage, SplitMessage>()
const storedPayloads = new WeakMap<ConversationMessage, ConversationId>()

const splitOf = (message: ConversationMessage) => {
  let split = splitMessages.get(message)
  if (!split) {
    split = splitMessagePayloads(message)
    splitMessages.set(message, split)
  }
  return split
}

// Large payloads stay out of the compressed transcript, in a row per message.
// A save writes the rows of messages whose payloads are not stored as they
// are, and drops those of messages no longer in the chat. Returns the
// messages it wrote a row for, to mark once the transaction commits.
const putMessages = async (
  conversationId: ConversationId,
  messages: ConversationMessage[],
) => {
  const storedKeys = await conversationPayloads(conversationId).primaryKeys()
  const stored = new Set(storedKeys.map(([, messageId]) => messageId))
  const withPayloads = new Set<string>()
  const written: ConversationMessage[] = []
  const newRows: PersistedMessagePayloads[] = []
  const transcript = messages.map((message) => {
    const { transcript, payloads } = splitOf(message)
    if (!payloads) return transcript
    withPayloads.add(message.id)
    if (
      !stored.has(message.id) ||
      storedPayloads.get(message) !== conversationId
    ) {
      newRows.push({ conversationId, messageId: message.id, ...payloads })
      written.push(message)
    }
    return transcript
  })
  await db.ai_message_images.bulkDelete(
    storedKeys.filter(([, messageId]) => !withPayloads.has(messageId)),
  )
  await db.ai_message_images.bulkPut(newRows)
  await db.ai_conversation_messages.put({
    conversationId,
    data: compressMessages(transcript),
  })
  return written
}

const markPayloadsStored = (
  conversationId: ConversationId,
  messages: ConversationMessage[],
) => {
  for (const message of messages) storedPayloads.set(message, conversationId)
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
        const rows = await conversationPayloads(conversationId).toArray()
        const payloadsByMessage = new Map(
          rows.map(({ conversationId: _, messageId, ...payloads }) => [
            messageId,
            payloads,
          ]),
        )
        return decompressMessages(record.data).map((transcript) => {
          const payloads = payloadsByMessage.get(transcript.id) ?? null
          const message = payloads
            ? joinMessagePayloads(transcript, payloads)
            : transcript
          // A transcript an earlier build saved can hold payloads; the next
          // save moves them out.
          if (splitMessagePayloads(transcript).payloads === null) {
            splitMessages.set(message, { transcript, payloads })
            if (payloads) storedPayloads.set(message, conversationId)
          }
          return message
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
    const written = await db.transaction(
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
        if (!updated) return []
        return putMessages(conversationId, messages)
      },
    )
    markPayloadsStored(conversationId, written)
  },

  async saveConversation(conversation: AIConversation) {
    const { messages, ...rest } = conversation
    const meta: ConversationMeta = { ...rest, hasMessages: messages.length > 0 }
    const written = await db.transaction(
      "rw",
      db.ai_conversations,
      db.ai_conversation_messages,
      db.ai_message_images,
      async () => {
        await db.ai_conversations.put(meta)
        return putMessages(conversation.id, messages)
      },
    )
    markPayloadsStored(conversation.id, written)
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
        await conversationPayloads(conversationId).delete()
      },
    ),

  updateMeta: (
    conversationId: ConversationId,
    updates: Partial<ConversationMeta>,
  ) => db.ai_conversations.update(conversationId, updates),
}
