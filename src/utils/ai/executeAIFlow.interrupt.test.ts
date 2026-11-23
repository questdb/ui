// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { STEERED_ABORT_REASON } from "../../providers/AIStatusProvider"
import type { AiAssistantSettings } from "../../providers/LocalStorageProvider/types"
import type { ConversationMessage } from "../../providers/AIConversationProvider/types"
import type { StreamingCallback } from "./aiAssistant"
import {
  createChatFlowConfig,
  executeAIFlow,
  INTERRUPTED_TOOL_RESULT,
  type AIFlowCallbacks,
} from "./executeAIFlow"

vi.mock("../../modules/ConsoleEventTracker", () => ({
  trackEvent: () => Promise.resolve(),
}))

let finishTool: () => void = () => undefined
let toolRunning = false

// Like a provider whose tool does not listen to the abort signal: the call
// is made, the tool keeps running, and its result arrives after the stop.
vi.mock("./aiAssistant", async (importOriginal) => {
  const original = await importOriginal<typeof import("./aiAssistant")>()
  return {
    ...original,
    continueConversation: async ({
      streaming,
      abortSignal,
    }: {
      streaming: StreamingCallback
      abortSignal?: AbortSignal
    }) => {
      streaming.onBeforeStream?.()
      streaming.onToolCall?.({
        id: "call-1",
        name: "get_tables",
        arguments: "{}",
      })
      toolRunning = true
      await new Promise<void>((resolve) => (finishTool = resolve))
      streaming.onToolResult?.({
        tool_call_id: "call-1",
        name: "get_tables",
        content: "trades",
      })
      streaming.onResponseStart?.()
      streaming.onTextChunk("Late answer")
      return abortSignal?.aborted
        ? { type: "aborted" as const, message: "Operation was cancelled" }
        : { explanation: "Late answer", sql: null }
    },
  }
})

const settings: AiAssistantSettings = {
  modelValueFormat: 2,
  selectedModel: "openai:gpt-5",
  providers: {
    openai: {
      apiKey: "key",
      enabledModels: ["openai:gpt-5"],
      grantSchemaAccess: true,
    },
  },
}

// A conversation that applies the flow's writes like the provider does.
const conversation = () => {
  const messages: ConversationMessage[] = []
  const callbacks: AIFlowCallbacks = {
    addMessage: (message) => {
      messages.push({
        id: crypto.randomUUID(),
        ...message,
      } as ConversationMessage)
    },
    updateMessage: (_conversationId, messageId, updates) => {
      const index = messages.findIndex((message) => message.id === messageId)
      if (index >= 0) messages[index] = { ...messages[index], ...updates }
    },
    removeMessages: (ids) => {
      for (const id of ids) {
        const index = messages.findIndex((message) => message.id === id)
        if (index >= 0) messages.splice(index, 1)
      }
    },
    setStatus: vi.fn(),
    setIsStreaming: vi.fn(),
    persistMessages: vi.fn(() => Promise.resolve()),
  }
  return { messages, callbacks }
}

const unansweredToolCalls = (messages: ConversationMessage[]) => {
  const answered = new Set(
    messages.flatMap((message) =>
      message.role === "tool" && message.tool_call_id
        ? [message.tool_call_id]
        : [],
    ),
  )
  return messages.flatMap((message) =>
    (message.tool_calls ?? [])
      .map((call) => call.id)
      .filter((id) => !answered.has(id)),
  )
}

afterEach(() => {
  finishTool()
  toolRunning = false
})

describe("an answer stopped while a tool runs", () => {
  it.each([
    ["sends a message in its place", STEERED_ABORT_REASON],
    ["is stopped", undefined],
  ])(
    "leaves a transcript the provider accepts at once when the user %s",
    async (_case, reason) => {
      // Given
      const abort = new AbortController()
      const { messages, callbacks } = conversation()
      const flow = executeAIFlow(
        createChatFlowConfig({
          conversationId: "c1",
          userMessage: "List the tables",
          conversationHistory: [],
          isFirstMessage: false,
          settings: { model: "openai:gpt-5", apiKey: "key" },
          aiAssistantSettings: settings,
          questClient: {} as never,
          hasSchemaAccess: true,
          abortSignal: abort.signal,
        }),
        callbacks,
      )
      // The call is on screen while the tool runs.
      await vi.waitFor(() => {
        expect(toolRunning).toBe(true)
        expect(unansweredToolCalls(messages)).toEqual(["call-1"])
      })

      // When
      abort.abort(reason)

      // Then
      expect(unansweredToolCalls(messages)).toEqual([])
      expect(messages).toContainEqual(
        expect.objectContaining({
          role: "tool",
          tool_call_id: "call-1",
          content: INTERRUPTED_TOOL_RESULT,
        }),
      )

      // When
      const stoppedTranscript = messages.map((message) => message.id)
      finishTool()
      await flow

      // Then
      expect(messages.map((message) => message.id)).toEqual(stoppedTranscript)
      expect(unansweredToolCalls(messages)).toEqual([])
    },
  )
})
