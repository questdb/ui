import { beforeEach, describe, expect, it, vi } from "vitest"
import { createAnthropicProvider } from "./anthropicProvider"

const { createMock, streamMock, countTokensMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  streamMock: vi.fn(),
  countTokensMock: vi.fn(),
}))

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = {
      create: createMock,
      stream: streamMock,
      countTokens: countTokensMock,
    }
    models = { list: vi.fn() }
  },
}))

const message = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-test",
  content: [{ type: "text", text: "done" }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
}

const summaryStream = () =>
  (async function* () {
    await Promise.resolve()
    yield {
      type: "content_block_delta",
      delta: { type: "text_delta", text: "summary" },
    }
  })()

const capturedModels = (mock: {
  mock: { calls: unknown[][] }
}): Array<string | undefined> =>
  mock.mock.calls.map(
    (call) => (call[0] as { model?: string } | undefined)?.model,
  )

describe("anthropic provider model namespaces", () => {
  beforeEach(() => {
    createMock.mockReset().mockResolvedValue(message)
    streamMock.mockReset().mockImplementation(summaryStream)
    countTokensMock.mockReset().mockResolvedValue({ input_tokens: 7 })
  })

  it("sends raw model ids at every Anthropic request boundary", async () => {
    const provider = createAnthropicProvider("sk-test")
    const model = "anthropic:claude-test"

    await provider.executeFlow({
      model,
      config: {
        systemInstructions: "system",
        initialUserContent: "hello",
      },
      modelToolsClient: {} as never,
      tools: [],
      setStatus: () => {},
    })
    await provider.generateTitle({ model, prompt: "title" })
    await provider.generateSummary({
      model,
      systemPrompt: "system",
      userMessage: "summarize",
    })
    await provider.countTokens({
      model,
      systemPrompt: "system",
      messages: [{ role: "user", content: "hello" }],
    })

    expect(capturedModels(createMock)).toEqual(["claude-test", "claude-test"])
    expect(capturedModels(streamMock)).toEqual(["claude-test"])
    expect(capturedModels(countTokensMock)).toEqual(["claude-test"])
  })
})
