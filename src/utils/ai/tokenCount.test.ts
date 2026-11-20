import { describe, expect, it } from "vitest"
import type { ConversationMessage } from "../../providers/AIConversationProvider/types"
import {
  formatTokenCount,
  latestContextUsage,
  latestTokenUsage,
  totalTokenUsage,
} from "./tokenCount"

const message = (
  overrides: Partial<ConversationMessage>,
): ConversationMessage => ({
  id: crypto.randomUUID(),
  role: "assistant",
  content: "",
  timestamp: 0,
  ...overrides,
})

describe("latestTokenUsage", () => {
  it("takes the usage of the latest answer that reported one", () => {
    // Given
    const messages = [
      message({ tokenUsage: { inputTokens: 100, outputTokens: 10 } }),
      message({ tokenUsage: { inputTokens: 2400, outputTokens: 180 } }),
      message({ role: "user", content: "And now?" }),
      message({ content: "Still answering" }),
    ]

    // When
    const usage = latestTokenUsage(messages)

    // Then
    expect(usage).toEqual({ inputTokens: 2400, outputTokens: 180 })
    expect(formatTokenCount(usage!.inputTokens)).toBe("2.4K")
    expect(formatTokenCount(usage!.outputTokens)).toBe("180")
  })

  it("has nothing to show before any answer reported its usage", () => {
    // Then
    expect(latestTokenUsage([message({ role: "user" })])).toBeNull()
  })
})

describe("latestContextUsage", () => {
  it("takes the latest answer that reported how full the context was", () => {
    // Given
    const messages = [
      {
        id: "1",
        role: "assistant",
        content: "a",
        timestamp: 1,
        contextUsage: { used: 10, size: 100 },
      },
      {
        id: "2",
        role: "assistant",
        content: "b",
        timestamp: 2,
        contextUsage: { used: 30, size: 100 },
      },
      { id: "3", role: "user", content: "c", timestamp: 3 },
    ] as ConversationMessage[]

    // Then
    expect(latestContextUsage(messages)).toEqual({ used: 30, size: 100 })
    expect(latestContextUsage([])).toBeNull()
  })
})

describe("totalTokenUsage", () => {
  it("adds up the tokens every answer in the chat read and wrote", () => {
    // Given
    const messages = [
      message({
        role: "assistant",
        tokenUsage: { inputTokens: 1_000, outputTokens: 50 },
      }),
      message({ role: "user" }),
      message({
        role: "assistant",
        tokenUsage: { inputTokens: 2_500, outputTokens: 70 },
      }),
    ]

    // Then
    expect(totalTokenUsage(messages)).toEqual({
      inputTokens: 3_500,
      outputTokens: 120,
    })
    expect(totalTokenUsage([message({ role: "user" })])).toBeNull()
  })
})

describe("formatTokenCount", () => {
  it("keeps one decimal only while it says something", () => {
    expect(formatTokenCount(180)).toBe("180")
    expect(formatTokenCount(2_400)).toBe("2.4K")
    expect(formatTokenCount(42_000)).toBe("42K")
    expect(formatTokenCount(475_000)).toBe("475K")
    expect(formatTokenCount(1_200_000)).toBe("1.2M")
  })
})
