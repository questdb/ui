// @vitest-environment jsdom
import {
  renderChat,
  openChat,
  sendMessage,
  chatServer,
  fixtures,
  getByHook,
  getAllByHook,
  queryByHook,
  gate,
} from "./support/chatHarness"
import { describe, expect, it, vi } from "vitest"
import { waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// A chat whose first answer waits until the test releases it.
const slowFirstAnswer = () => {
  const first = gate()
  const server = chatServer("openai", [
    async () => {
      await first.promise
      return fixtures.createFinalResponse("openai", "The first answer.")
    },
    fixtures.createFinalResponse("openai", "The second answer."),
  ])
  return { first, server }
}

// An SSE response that stays open until the request is aborted.
const streamUntilAborted = (signal: AbortSignal) => ({
  body: new ReadableStream({
    start(controller) {
      signal.addEventListener("abort", () =>
        controller.error(new DOMException("Aborted", "AbortError")),
      )
    },
  }),
  headers: { "Content-Type": "text/event-stream" },
})

const lastRequestText = (server: ReturnType<typeof chatServer>) =>
  JSON.stringify(server.requests[server.requests.length - 1].body.input)

describe("messages written while the assistant answers", () => {
  it("keeps the input open and queues the message until the answer ends", async () => {
    // Given
    const { first, server } = slowFirstAnswer()
    renderChat()
    await openChat()
    await sendMessage("Show the latest trades.")
    await waitFor(() => expect(server.requests).toHaveLength(1))
    expect(getByHook("chat-stop-button")).toBeVisible()

    // When
    await sendMessage("Group them by symbol.")

    // Then
    expect(getByHook("chat-queued-message-text")).toHaveTextContent(
      "Group them by symbol.",
    )
    expect(getByHook("chat-input-textarea")).toHaveValue("")
    expect(server.requests).toHaveLength(1)

    // When
    vi.setSystemTime(Date.now() + 3000)
    await first.release()

    // Then
    await waitFor(() => expect(server.requests).toHaveLength(2))
    expect(lastRequestText(server)).toContain("Group them by symbol.")
    expect(queryByHook("chat-queued-message")).not.toBeInTheDocument()
    await waitFor(() =>
      expect(getAllByHook("chat-message-assistant").at(-1)).toHaveTextContent(
        "The second answer.",
      ),
    )
  })

  it("replaces the answer with the queued message on Send now, without an error and with the new answer's status", async () => {
    // Given a first answer that streams until it is aborted, as the
    // provider's does
    const second = gate()
    const server: ReturnType<typeof chatServer> = chatServer("openai", [
      () =>
        Promise.resolve(streamUntilAborted(server.requests[0].request.signal)),
      async () => {
        await second.promise
        return fixtures.createFinalResponse("openai", "The steered answer.")
      },
    ])
    renderChat()
    await openChat()
    await sendMessage("Show the latest trades.")
    await waitFor(() => expect(server.requests).toHaveLength(1))
    await sendMessage("Only for BTC-USD.")

    // When
    vi.setSystemTime(Date.now() + 3000)
    await userEvent.click(getByHook("chat-queued-send-now"))
    await waitFor(() => expect(server.requests).toHaveLength(2))

    // Then the stopped answer winds down without touching the new one
    expect(lastRequestText(server)).toContain("Only for BTC-USD.")
    expect(queryByHook("chat-queued-message")).not.toBeInTheDocument()
    expect(getByHook("chat-stop-button")).toBeVisible()
    expect(getAllByHook("chat-message-assistant").at(-1)).toHaveTextContent(
      "Processing request",
    )
    expect(queryByHook("chat-message-error")).not.toBeInTheDocument()

    // When
    await second.release()

    // Then
    await waitFor(() =>
      expect(getAllByHook("chat-message-assistant").at(-1)).toHaveTextContent(
        "The steered answer.",
      ),
    )
    expect(queryByHook("chat-message-error")).not.toBeInTheDocument()
  })

  it("sends what the user wrote right away, stopping the answer, with Cmd+Enter", async () => {
    // Given
    const { first, server } = slowFirstAnswer()
    renderChat()
    await openChat()
    await sendMessage("Show the latest trades.")
    await waitFor(() => expect(server.requests).toHaveLength(1))

    // When
    vi.setSystemTime(Date.now() + 3000)
    await userEvent.type(getByHook("chat-input-textarea"), "Only for ETH-USD.")
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}")

    // Then
    await waitFor(() => expect(server.requests).toHaveLength(2))
    expect(lastRequestText(server)).toContain("Only for ETH-USD.")
    expect(getByHook("chat-input-textarea")).toHaveValue("")
    expect(queryByHook("chat-queued-message")).not.toBeInTheDocument()
    await first.release()
  })

  it("returns the queued message to the input when the user stops the answer", async () => {
    // Given
    const { first, server } = slowFirstAnswer()
    renderChat()
    await openChat()
    await sendMessage("Show the latest trades.")
    await waitFor(() => expect(server.requests).toHaveLength(1))
    await sendMessage("Group them by symbol.")

    // When
    await userEvent.click(getByHook("chat-stop-button"))

    // Then
    expect(queryByHook("chat-queued-message")).not.toBeInTheDocument()
    expect(getByHook("chat-input-textarea")).toHaveValue(
      "Group them by symbol.",
    )
    expect(server.requests).toHaveLength(1)
    await first.release()
  })
})
