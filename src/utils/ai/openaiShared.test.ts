import { describe, it, expect } from "vitest"
import OpenAI from "openai"
import { classifyOpenAIError, isReasoningRejection } from "./openaiShared"

const apiError = (status: number, param: string | null, message: string) =>
  new OpenAI.APIError(
    status,
    { message, param, type: "invalid_request_error" },
    message,
    undefined,
  )

describe("isReasoningRejection", () => {
  it("matches a 400 whose param names reasoning", () => {
    // Given the Responses API rejects reasoning on a non-reasoning model
    const responsesError = apiError(
      400,
      "reasoning.effort",
      "Unsupported parameter: 'reasoning.effort' is not supported with this model.",
    )
    const chatError = apiError(
      400,
      "reasoning_effort",
      "Unsupported parameter: 'reasoning_effort' is not supported with this model.",
    )

    // Then both wire formats are recognized
    expect(isReasoningRejection(responsesError)).toBe(true)
    expect(isReasoningRejection(chatError)).toBe(true)
  })

  it("ignores a 400 that only mentions reasoning in its message", () => {
    // Given an unrelated 400 whose message contains the word "reasoning"
    const error = apiError(
      400,
      null,
      "Item of type 'reasoning' was provided without its required following item.",
    )

    // Then it is not treated as a reasoning rejection
    expect(isReasoningRejection(error)).toBe(false)
  })

  it("ignores non-400 statuses and non-API errors", () => {
    expect(
      isReasoningRejection(apiError(429, "reasoning.effort", "rate limited")),
    ).toBe(false)
    expect(isReasoningRejection(new Error("reasoning failed"))).toBe(false)
  })
})

describe("classifyOpenAIError", () => {
  it("reports a 429 as a rate or usage limit", () => {
    const error = new OpenAI.RateLimitError(
      429,
      {
        message: "Rate limit reached",
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
      },
      "Rate limit reached",
      new Headers(),
    )

    expect(classifyOpenAIError(error, () => {})).toMatchObject({
      type: "rate_limit",
      message:
        "The provider's rate or usage limit was reached. Check your provider account limits or try again later.",
    })
  })
})
