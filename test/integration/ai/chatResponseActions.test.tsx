// @vitest-environment jsdom
import {
  renderChat,
  openChat,
  sendMessage,
  chatServer,
  fixtures,
  getByHook,
  queryByHook,
  getAllByHook,
  seedChat,
} from "./support/chatHarness"
import { describe, expect, it, vi } from "vitest"
import { waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { copyToClipboard } = vi.hoisted(() => ({
  copyToClipboard: vi.fn(() => Promise.resolve()),
}))
vi.mock("../../../src/utils/copyToClipboard", () => ({ copyToClipboard }))

describe("a finished answer", () => {
  it("can be copied whole, and its token usage shows beside the assistant settings", async () => {
    // Given
    chatServer("openai", [
      fixtures.createFinalResponse(
        "openai",
        "Use `SAMPLE BY 1h` to bucket trades by hour.",
      ),
    ])
    renderChat()
    await openChat()
    expect(queryByHook("chat-token-usage")).not.toBeInTheDocument()

    // When
    await sendMessage("How do I bucket trades by hour?")
    await waitFor(() => {
      const content = getByHook("chat-response-content")
      expect(content).toHaveTextContent("Use SAMPLE BY 1h")
      expect(content).toContainElement(getByHook("chat-response-copy"))
    })
    await userEvent.click(getByHook("chat-response-copy"))

    // Then
    expect(copyToClipboard).toHaveBeenCalledWith(
      "Use `SAMPLE BY 1h` to bucket trades by hour.",
    )
    // The tokens the chat spent show beside the assistant settings
    expect(getByHook("chat-token-usage")).toHaveTextContent(
      /^[\d.]+K?\/[\d.]+K?$/,
    )
    expect(getByHook("chat-response-metadata")).not.toHaveTextContent(
      /\d+\/\d+/,
    )
    expect(queryByHook("chat-context-usage")).not.toBeInTheDocument()
  })

  it("shows the saved model and total duration below the reply without inventing a time for older replies", async () => {
    // Given
    await seedChat("Model history", {
      messages: [
        { id: "u1", role: "user", timestamp: 1, content: "Earlier question" },
        {
          id: "a1",
          role: "assistant",
          timestamp: 2,
          content: "Earlier answer",
          model: "Sonnet",
        },
        { id: "u2", role: "user", timestamp: 3, content: "Later question" },
        {
          id: "a2",
          role: "assistant",
          timestamp: 4,
          content: "Later answer",
          model: "Claude Opus 5.5",
          turnDurationMs: 20_000,
        },
      ],
    })
    renderChat()

    // When
    await openChat()

    // Then
    await waitFor(() => {
      const [earlier, later] = getAllByHook("chat-response-metadata")
      expect(earlier).toHaveTextContent(/^Sonnet$/)
      expect(later).toHaveTextContent(/^Claude Opus 5\.5 · 20s$/)
      const reply = getAllByHook("chat-response-content")[1]
      expect(reply.nextElementSibling).toBe(later)
    })
  })
})
