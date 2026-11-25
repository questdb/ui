import "../test/stubBrowserGlobals"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { decompressSync, strFromU8 } from "fflate"
import { db, type PersistedMessages } from "./db"
import { aiConversationStore } from "./aiConversations"
import type {
  AIConversation,
  ConversationMessage,
} from "../providers/AIConversationProvider/types"

// A distinct base64 payload per image, so a transcript that holds one shows it.
const image = (seed: string) => ({
  mimeType: "image/png",
  data: `iVBORw0KGgo${seed.repeat(32)}`,
})

const userMessage = (
  id: string,
  images?: ConversationMessage["images"],
): ConversationMessage => ({
  id,
  role: "user",
  content: `Question ${id}`,
  timestamp: 1,
  ...(images && { images }),
})

const assistantMessage = (id: string): ConversationMessage => ({
  id,
  role: "assistant",
  content: `Answer ${id}`,
  timestamp: 2,
})

const conversation = (
  id: string,
  messages: ConversationMessage[],
): AIConversation => ({
  id,
  conversationName: id,
  updatedAt: 1,
  messages,
})

const imageData = (messages: ConversationMessage[]) =>
  messages.flatMap((message) => message.images ?? []).map(({ data }) => data)

// What IndexedDB is asked to store, per object store.
let writes: { store: string; value: unknown }[] = []
const writesTo = (store: string) =>
  writes.filter((write) => write.store === store).map(({ value }) => value)
const deflatedTranscripts = () =>
  (writesTo("ai_conversation_messages") as PersistedMessages[]).map(
    ({ data }) => strFromU8(decompressSync(data)),
  )

const storedImageKeys = (conversationId: string) =>
  db.ai_message_images
    .where("conversationId")
    .equals(conversationId)
    .primaryKeys()

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
  writes = []
  const put = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, "put")
    ?.value as IDBObjectStore["put"]
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    writes.push({ store: this.name, value })
    return put.call(this, value, key)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("aiConversationStore", () => {
  // Every path that writes a transcript keeps the images out of the deflate pass.
  it.each([
    {
      path: "saveMessages",
      save: async (chat: AIConversation) => {
        const { messages, ...meta } = chat
        await aiConversationStore.saveMeta({ ...meta, hasMessages: false })
        await aiConversationStore.saveMessages(chat.id, messages)
      },
    },
    {
      path: "saveConversation",
      save: (chat: AIConversation) =>
        aiConversationStore.saveConversation(chat),
    },
  ])(
    "$path stores attached images outside the compressed transcript and loads them back with their messages",
    async ({ save }) => {
      // Given
      const chat = conversation("chat", [
        userMessage("ask", [image("a"), image("b")]),
        assistantMessage("answer"),
        userMessage("follow-up"),
      ])

      // When
      await save(chat)

      // Then
      const [transcript] = deflatedTranscripts()
      expect(transcript).toContain("Question ask")
      for (const data of imageData(chat.messages))
        expect(transcript).not.toContain(data)
      expect(await aiConversationStore.getMessages(chat.id)).toEqual(
        chat.messages,
      )
    },
  )

  it("writes a message's images once, however many times the chat is saved", async () => {
    // Given
    const first = userMessage("first", [image("a")])
    await aiConversationStore.saveConversation(conversation("chat", [first]))
    writes = []
    const second = userMessage("second", [image("b"), image("c")])
    const messages = [
      first,
      assistantMessage("first-answer"),
      second,
      assistantMessage("second-answer"),
    ]

    // When
    await aiConversationStore.saveMessages("chat", messages.slice(0, 3))
    await aiConversationStore.saveMessages("chat", messages)

    // Then
    const transcripts = deflatedTranscripts()
    expect(transcripts).toHaveLength(2)
    for (const transcript of transcripts)
      for (const data of imageData(messages))
        expect(transcript).not.toContain(data)
    expect(writesTo("ai_message_images")).toEqual([
      {
        conversationId: "chat",
        messageId: "second",
        images: second.images,
      },
    ])
    expect(await aiConversationStore.getMessages("chat")).toEqual(messages)
  })

  it("drops the images of a removed message, and all of a deleted chat's images", async () => {
    // Given
    const kept = userMessage("kept", [image("a")])
    await aiConversationStore.saveConversation(
      conversation("chat", [userMessage("removed", [image("b")]), kept]),
    )
    const other = conversation("other", [userMessage("other", [image("c")])])
    await aiConversationStore.saveConversation(other)

    // When
    await aiConversationStore.saveMessages("chat", [kept])

    // Then
    expect(await storedImageKeys("chat")).toEqual([["chat", "kept"]])
    expect(await aiConversationStore.getMessages("chat")).toEqual([kept])

    // When
    await aiConversationStore.deleteConversation("chat")
    await aiConversationStore.saveMessages("chat", [kept])

    // Then
    expect(await storedImageKeys("chat")).toEqual([])
    expect(await aiConversationStore.getMessages("chat")).toEqual([])
    expect(await aiConversationStore.getMessages("other")).toEqual(
      other.messages,
    )
  })
})
