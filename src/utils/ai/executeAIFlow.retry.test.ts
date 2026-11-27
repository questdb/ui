// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { AIOperationStatus } from "../../providers/AIStatusProvider"
import type { AiAssistantSettings } from "../../providers/LocalStorageProvider/types"
import type { StreamingCallback } from "./aiAssistant"
import { createChatFlowConfig, executeAIFlow } from "./executeAIFlow"

vi.mock("../../modules/ConsoleEventTracker", () => ({
  trackEvent: () => Promise.resolve(),
}))

// One attempt shows a tool step and text, fails, and the retry answers.
vi.mock("./aiAssistant", async (importOriginal) => {
  const original = await importOriginal<typeof import("./aiAssistant")>()
  return {
    ...original,
    continueConversation: ({
      setStatus,
      streaming,
    }: {
      setStatus: (status: AIOperationStatus) => void
      streaming: StreamingCallback
    }) => {
      streaming.onBeforeStream?.()
      setStatus(AIOperationStatus.RetrievingTables)
      streaming.onTextChunk("Partial")
      streaming.onBeforeStream?.()
      streaming.onTextChunk("Done.")
      return Promise.resolve({ explanation: "Done.", sql: null })
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

describe("a retried answer", () => {
  it("starts over from the steps shown before its first attempt", async () => {
    // Given
    const setStatus = vi.fn()

    // When
    await executeAIFlow(
      createChatFlowConfig({
        conversationId: "c1",
        userMessage: "List the tables",
        conversationHistory: [],
        isFirstMessage: false,
        settings: { model: "openai:gpt-5", apiKey: "key" },
        aiAssistantSettings: settings,
        questClient: {} as never,
        hasSchemaAccess: true,
      }),
      {
        addMessage: vi.fn(),
        updateMessage: vi.fn(),
        setStatus: (...args: unknown[]) => {
          setStatus(...args)
          // Like the provider: report the steps so far.
          const onUpdate = args[2] as ((history: unknown[]) => void) | undefined
          onUpdate?.([{ type: AIOperationStatus.Processing, timestamp: 1 }])
        },
        setIsStreaming: vi.fn(),
        persistMessages: vi.fn(() => Promise.resolve()),
      },
    )

    // Then
    expect(setStatus).toHaveBeenCalledWith(
      AIOperationStatus.Processing,
      { truncateTo: 1 },
      expect.any(Function),
    )
  })
})
