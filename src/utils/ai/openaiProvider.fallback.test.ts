import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createOpenAIProvider } from "./openaiProvider"
import { onReasoningUnsupported } from "./reasoningFallback"

const { createMock, toastInfoMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  toastInfoMock: vi.fn(),
}))

vi.mock("openai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openai")>()
  class MockOpenAI {
    static APIError = actual.default.APIError
    static APIUserAbortError = actual.default.APIUserAbortError
    responses = { create: createMock }
  }
  return { default: MockOpenAI }
})

vi.mock("../../components/Toast", () => ({
  toast: { info: toastInfoMock },
}))

const reasoningRejection = async () => {
  const OpenAI = (await import("openai")).default
  const message =
    "Unsupported parameter: 'reasoning.effort' is not supported with this model."
  return new OpenAI.APIError(
    400,
    { message, param: "reasoning.effort", type: "invalid_request_error" },
    message,
    undefined,
  )
}

const requestBodies = () =>
  createMock.mock.calls.map(
    (call: unknown[]) => call[0] as Record<string, unknown>,
  )

const textStream = (text: string) =>
  (async function* () {
    await Promise.resolve()
    yield { type: "response.output_text.delta", delta: text }
  })()

describe("openai reasoning fallback", () => {
  let unsupportedProviders: string[]
  let unregister: () => void

  beforeEach(() => {
    createMock.mockReset()
    toastInfoMock.mockReset()
    unsupportedProviders = []
    unregister = onReasoningUnsupported((providerId) =>
      unsupportedProviders.push(providerId),
    )
  })

  afterEach(() => {
    unregister()
  })

  it("sends high effort, then strips reasoning and retries once on a rejection", async () => {
    // Given a model that rejects the reasoning parameter
    createMock
      .mockRejectedValueOnce(await reasoningRejection())
      .mockReturnValueOnce(textStream("summary"))
    const provider = createOpenAIProvider("sk-test", "openai", {
      reasoning: { effort: "high" },
    })

    // When generating a summary
    const text = await provider.generateSummary({
      model: "gpt-4o",
      systemPrompt: "sys",
      userMessage: "user",
    })

    // Then the first request carried reasoning and the retry dropped it
    expect(text).toBe("summary")
    expect(createMock).toHaveBeenCalledTimes(2)
    expect(requestBodies()[0].reasoning).toEqual({
      effort: "high",
      summary: "auto",
    })
    expect("reasoning" in requestBodies()[1]).toBe(false)

    // And the downgrade was surfaced and reported exactly once
    expect(toastInfoMock).toHaveBeenCalledWith(
      "Reasoning preference changed to Default",
    )
    expect(unsupportedProviders).toEqual(["openai"])
  })

  it("stops sending reasoning on later requests after a rejection", async () => {
    createMock
      .mockRejectedValueOnce(await reasoningRejection())
      .mockReturnValue(textStream("again"))
    const provider = createOpenAIProvider("sk-test", "openai", {
      reasoning: { effort: "high" },
    })
    await provider.generateSummary({
      model: "gpt-4o",
      systemPrompt: "sys",
      userMessage: "user",
    })

    // When a second request runs on the same provider instance
    await provider.generateSummary({
      model: "gpt-4o",
      systemPrompt: "sys",
      userMessage: "user",
    })

    // Then it goes out once, without reasoning, and nothing is re-reported
    expect(createMock).toHaveBeenCalledTimes(3)
    expect("reasoning" in requestBodies()[2]).toBe(false)
    expect(toastInfoMock).toHaveBeenCalledTimes(1)
    expect(unsupportedProviders).toEqual(["openai"])
  })

  it("rethrows unrelated 400s without retrying", async () => {
    const OpenAI = (await import("openai")).default
    const message = "Item of type 'reasoning' was provided without its pair."
    createMock.mockRejectedValueOnce(
      new OpenAI.APIError(
        400,
        { message, param: null, type: "invalid_request_error" },
        message,
        undefined,
      ),
    )
    const provider = createOpenAIProvider("sk-test", "openai", {
      reasoning: { effort: "high" },
    })

    await expect(
      provider.generateSummary({
        model: "gpt-4o",
        systemPrompt: "sys",
        userMessage: "user",
      }),
    ).rejects.toThrow()

    expect(createMock).toHaveBeenCalledTimes(1)
    expect(toastInfoMock).not.toHaveBeenCalled()
    expect(unsupportedProviders).toEqual([])
  })

  it("sends no reasoning at all when effort is default", async () => {
    createMock.mockReturnValueOnce(textStream("plain"))
    const provider = createOpenAIProvider("sk-test", "openai")

    await provider.generateSummary({
      model: "gpt-5.4",
      systemPrompt: "sys",
      userMessage: "user",
    })

    expect(createMock).toHaveBeenCalledTimes(1)
    expect("reasoning" in requestBodies()[0]).toBe(false)
  })
})
