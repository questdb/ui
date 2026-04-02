import OpenAI from "openai"
import type { Tiktoken, TiktokenBPE } from "js-tiktoken/lite"
import type { StatusCallback, AiAssistantAPIError } from "../aiAssistant"
import { StreamingError, RefusalError, MaxTokensError } from "./shared"

let tiktokenEncoder: Tiktoken | null = null

export async function countTokensFromNativePayload(
  systemPrompt: string,
  nativePayload: unknown,
): Promise<number> {
  if (!tiktokenEncoder) {
    const { Tiktoken } = await import("js-tiktoken/lite")
    const o200k_base = await import("js-tiktoken/ranks/o200k_base").then(
      (module: { default: TiktokenBPE }) => module.default,
    )
    tiktokenEncoder = new Tiktoken(o200k_base)
  }

  const nativeText = JSON.stringify(nativePayload)
  let totalTokens = 0
  totalTokens += tiktokenEncoder.encode(systemPrompt).length
  totalTokens += 4 // system message formatting overhead
  totalTokens += tiktokenEncoder.encode(nativeText).length
  totalTokens += 2 // assistant reply priming
  return totalTokens
}

export function classifyOpenAIError(
  error: unknown,
  setStatus: StatusCallback,
): AiAssistantAPIError {
  if (
    error instanceof OpenAI.APIUserAbortError ||
    (error instanceof StreamingError && error.errorType === "interrupted")
  ) {
    return { type: "aborted", message: "Operation was cancelled" }
  }
  setStatus(null)

  if (error instanceof RefusalError) {
    return {
      type: "unknown",
      message: "The model refused to generate a response for this request.",
      details: error.message,
    }
  }

  if (error instanceof MaxTokensError) {
    return {
      type: "unknown",
      message:
        "The response exceeded the maximum token limit for the selected model. Please try again with a different prompt or model.",
      details: error.message,
    }
  }

  if (error instanceof StreamingError) {
    switch (error.errorType) {
      case "network":
        return {
          type: "network",
          message:
            "Network error during streaming. Please check your connection.",
          details: error.message,
        }
      case "failed":
      default:
        return {
          type: "unknown",
          message: error.message || "Stream failed unexpectedly.",
          details:
            error.originalError instanceof Error
              ? error.originalError.message
              : undefined,
        }
    }
  }

  if (error instanceof OpenAI.AuthenticationError) {
    return {
      type: "invalid_key",
      message: "Invalid API key. Please check your OpenAI API key.",
      details: error.message,
    }
  }

  if (error instanceof OpenAI.RateLimitError) {
    return {
      type: "rate_limit",
      message: "Rate limit exceeded. Please try again later.",
      details: error.message,
    }
  }

  if (error instanceof OpenAI.APIConnectionError) {
    return {
      type: "network",
      message: "Network error. Please check your connection.",
      details: error.message,
    }
  }

  if (error instanceof OpenAI.APIError) {
    return {
      type: "unknown",
      message: error.message,
      details: `Status ${error.status}`,
    }
  }

  return {
    type: "unknown",
    message: "An unexpected error occurred. Please try again.",
    details: error instanceof Error ? error.message : String(error),
  }
}

export function isOpenAINonRetryableError(error: unknown): boolean {
  if (error instanceof StreamingError) {
    return error.errorType === "interrupted" || error.errorType === "failed"
  }
  if (
    error instanceof OpenAI.APIError &&
    error.status != null &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 429
  ) {
    return true
  }
  return (
    error instanceof RefusalError ||
    error instanceof MaxTokensError ||
    error instanceof OpenAI.APIUserAbortError
  )
}
