import "../test/stubBrowserGlobals"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { decompressSync, strFromU8 } from "fflate"
import { db, type PersistedMessages } from "./db"
import { aiConversationStore } from "./aiConversations"
import { compressMessages } from "./compression"
import type { MessagePayloads } from "./messagePayloads"
import type {
  AIConversation,
  ConversationMessage,
} from "../providers/AIConversationProvider/types"
import { AIOperationStatus } from "../providers/AIStatusProvider"

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

// Text no other part of a test's chat holds, and that JSON does not escape.
const payloadText = (seed: string) =>
  Array.from({ length: 16 }, (_, line) => `${seed} line ${line}`).join("; ")
const base64 = (seed: string) => `iVBORw0KGgo${seed.repeat(48)}`

const agentToolSteps = (
  output: string,
  diff: { oldText: string; newText: string },
): ConversationMessage["operationHistory"] => [
  { type: AIOperationStatus.Processing, timestamp: 3 },
  {
    type: AIOperationStatus.UsingAgentTools,
    timestamp: 4,
    endedAt: 5,
    args: { name: "cat app.log", toolKind: "execute", callId: "run", output },
  },
  {
    type: AIOperationStatus.UsingAgentTools,
    timestamp: 6,
    endedAt: 7,
    args: {
      name: "Edit src/app.ts",
      toolKind: "edit",
      callId: "edit",
      diffs: [{ path: "src/app.ts", ...diff }],
    },
  },
]

// A message for each kind of payload the store keeps out of the transcript,
// with the payloads it carries. A new kind fails to compile until it has one.
const payloadSamples: {
  [Kind in keyof Required<MessagePayloads>]: {
    message: ConversationMessage
    payloads: string[]
  }
} = {
  images: {
    message: userMessage("attached", [image("a"), image("b")]),
    payloads: [image("a").data, image("b").data],
  },
  contentImages: {
    message: {
      id: "agent-images",
      role: "assistant",
      content: `Here: ![chart](data:image/png;base64,${base64("c")}) and ![](data:image/jpeg;base64,${base64("d")}).`,
      timestamp: 2,
    },
    payloads: [base64("c"), base64("d")],
  },
  toolContent: {
    message: {
      id: "agent-tools",
      role: "assistant",
      content: "Changed it.",
      timestamp: 2,
      operationHistory: agentToolSteps(payloadText("output"), {
        oldText: payloadText("old"),
        newText: payloadText("new"),
      }),
    },
    payloads: [payloadText("output"), payloadText("old"), payloadText("new")],
  },
}

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

  it.each(
    Object.entries(payloadSamples).map(([kind, sample]) => ({
      kind,
      ...sample,
    })),
  )(
    "keeps $kind out of the compressed transcript, writes it once and loads it back",
    async ({ message, payloads }) => {
      // Given
      const question = userMessage("question")
      await aiConversationStore.saveConversation(
        conversation("chat", [question, message]),
      )
      const messages = [question, message, userMessage("follow-up")]

      // When
      await aiConversationStore.saveMessages("chat", messages)

      // Then
      const transcripts = deflatedTranscripts()
      expect(transcripts).toHaveLength(2)
      for (const transcript of transcripts) {
        expect(transcript).toContain(`"id":"${message.id}"`)
        for (const payload of payloads)
          expect(transcript).not.toContain(payload)
      }
      expect(writesTo("ai_message_images")).toHaveLength(1)
      expect(await aiConversationStore.getMessages("chat")).toEqual(messages)
    },
  )

  it("stores a message's payloads again when the message changes", async () => {
    // Given
    const running: ConversationMessage = {
      id: "answer",
      role: "assistant",
      content: `Partial ![a](data:image/png;base64,${base64("a")})`,
      timestamp: 2,
      operationHistory: agentToolSteps(payloadText("partial output"), {
        oldText: payloadText("old"),
        newText: payloadText("partial"),
      }),
    }
    await aiConversationStore.saveConversation(
      conversation("chat", [userMessage("question"), running]),
    )
    const finished: ConversationMessage = {
      ...running,
      content: `${running.content as string} ![b](data:image/png;base64,${base64("b")})`,
      operationHistory: agentToolSteps(payloadText("full output"), {
        oldText: payloadText("old"),
        newText: payloadText("final"),
      }),
    }
    const messages = [userMessage("question"), finished]

    // When
    await aiConversationStore.saveMessages("chat", messages)

    // Then
    expect(await aiConversationStore.getMessages("chat")).toEqual(messages)
  })

  it("opens a chat an earlier build saved with its payloads in the transcript, and moves them out on the next save", async () => {
    // Given
    const reply = `Here: ![chart](data:image/png;base64,${base64("c")})`
    const saved: ConversationMessage[] = [
      userMessage("question", [image("a")]),
      {
        id: "answer",
        role: "assistant",
        content: reply,
        timestamp: 2,
        operationHistory: [
          ...(agentToolSteps(payloadText("output"), {
            oldText: payloadText("old"),
            newText: payloadText("new"),
          }) ?? []),
          // Earlier builds kept a copy of the reply in its step.
          {
            type: AIOperationStatus.GeneratingResponse,
            timestamp: 8,
            content: reply,
          },
        ],
      },
    ]
    const { images, ...questionTranscript } = saved[0]
    await db.ai_conversations.put({
      id: "chat",
      conversationName: "chat",
      updatedAt: 1,
      hasMessages: true,
    })
    await db.ai_conversation_messages.put({
      conversationId: "chat",
      data: compressMessages([questionTranscript, saved[1]]),
    })
    await db.ai_message_images.put({
      conversationId: "chat",
      messageId: "question",
      images: images!,
    })

    // When
    const opened = await aiConversationStore.getMessages("chat")

    // Then
    expect(opened).toEqual(saved)

    // When
    writes = []
    await aiConversationStore.saveMessages("chat", opened)

    // Then
    const [transcript] = deflatedTranscripts()
    const [question, answer] = JSON.parse(transcript) as ConversationMessage[]
    expect(question.images).toBeUndefined()
    expect(answer.content).toBe("Here: ![chart]()")
    for (const payload of [
      payloadText("output"),
      payloadText("old"),
      payloadText("new"),
    ])
      expect(transcript).not.toContain(payload)
    expect(await aiConversationStore.getMessages("chat")).toEqual(saved)
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
