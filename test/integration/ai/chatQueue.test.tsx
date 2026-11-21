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
  seedChat,
} from "./support/chatHarness"
import { describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { bufferStore } from "../../../src/store/buffers"
import { db } from "../../../src/store/db"
import { LOCAL_AGENT_MODEL } from "../../../src/utils/localAgent/localAgentModel"

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

  it("keeps a queued follow-up when the user closes and reopens the chat", async () => {
    const { first, server } = slowFirstAnswer()
    renderChat()
    await openChat()
    await sendMessage("Show the latest trades.")
    await waitFor(() => expect(server.requests).toHaveLength(1))
    await sendMessage("Group them by symbol.")
    expect(getByHook("chat-queued-message-text")).toHaveTextContent(
      "Group them by symbol.",
    )

    await userEvent.click(getByHook("chat-window-close"))
    expect(queryByHook("ai-chat-window")).not.toBeInTheDocument()
    vi.setSystemTime(Date.now() + 3000)
    await first.release()

    await waitFor(() => expect(server.requests).toHaveLength(2))
    expect(lastRequestText(server)).toContain("Group them by symbol.")
    await openChat()
    expect(queryByHook("chat-queued-message")).not.toBeInTheDocument()
  })

  it("does not stop the answer when the steering shortcut refuses a console command", async () => {
    const { first, server } = slowFirstAnswer()
    renderChat()
    await openChat()
    await sendMessage("Show the latest trades.")
    await waitFor(() => expect(server.requests).toHaveLength(1))

    await userEvent.type(getByHook("chat-input-textarea"), "/model")
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}")

    try {
      expect(server.requests[0].request.signal.aborted).toBe(false)
      expect(server.requests).toHaveLength(1)
      expect(getByHook("chat-input-textarea")).toHaveValue("/model")
    } finally {
      await first.release()
    }
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

it.each(["chat switch", "model change"])(
  "revalidates a queued follow-up after a %s during preparation",
  async (change) => {
    const { first, server } = slowFirstAnswer()
    const snapshot = gate()
    const bufferId = await db.buffers.add({
      label: "Sample notebook",
      value: "",
      position: 0,
      notebookViewState: { cells: [] },
    })
    await seedChat("Other sample chat")
    await seedChat("Original sample chat", {
      notebookBufferId: bufferId,
      messages: [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Question about Original sample chat",
          timestamp: Date.now(),
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Previous sample answer.",
          timestamp: Date.now(),
        },
      ],
    })
    renderChat()
    await openChat()
    await sendMessage("Show a sample.")
    await waitFor(() => expect(server.requests).toHaveLength(1))
    await sendMessage("Group the sample by symbol.")

    const get = bufferStore.getById
    const reads = vi.spyOn(bufferStore, "getById").mockImplementation((id) =>
      get(id).then(async (buffer) => {
        if (id === bufferId) await snapshot.promise
        return buffer
      }),
    )
    const openHistoryChat = async (title: string) => {
      await userEvent.click(getByHook("chat-window-history"))
      await userEvent.click(
        await screen.findByText(title, {
          selector: '[data-hook="chat-history-item"] *',
        }),
      )
      await screen.findByText(`Question about ${title}`)
    }
    try {
      vi.setSystemTime(Date.now() + 3000)
      await first.release()
      await waitFor(() => expect(reads).toHaveBeenCalledWith(bufferId))
      if (change === "chat switch") {
        // Closing and reopening changes the drawer without changing queue ownership.
        await userEvent.click(getByHook("chat-window-close"))
        await openChat()
        expect(reads).toHaveBeenCalledTimes(1)
        await openHistoryChat("Other sample chat")
      } else {
        await userEvent.click(getByHook("chat-model-picker"))
        await userEvent.click(
          await screen.findByRole("option", { name: "GPT 5" }),
        )
        expect(getByHook("chat-input-textarea")).toHaveValue(
          "Group the sample by symbol.",
        )
      }
      await snapshot.release()
      expect(server.requests).toHaveLength(1)
      expect(
        getAllByHook("chat-message-user").map((node) => node.textContent),
      ).not.toContain("Group the sample by symbol.")

      if (change === "chat switch") {
        await openHistoryChat("Original sample chat")
      } else {
        await userEvent.click(getByHook("chat-send-button"))
      }
      await waitFor(() => expect(server.requests).toHaveLength(2))
      expect(lastRequestText(server)).toContain("Group the sample by symbol.")
      await screen.findByText("The second answer.")
    } finally {
      await snapshot.release()
    }
  },
)

it("stops an answer while keeping an unsubmitted follow-up in the composer", async () => {
  const server: ReturnType<typeof chatServer> = chatServer("openai", [
    () =>
      Promise.resolve(streamUntilAborted(server.requests[0].request.signal)),
  ])
  renderChat()
  await openChat()
  await sendMessage("Show the latest trades.")
  await waitFor(() => expect(server.requests).toHaveLength(1))
  await userEvent.type(getByHook("chat-input-textarea"), "Group by symbol.")
  expect(screen.getByRole("button", { name: "Queue message" })).toBeEnabled()
  await userEvent.click(
    screen.getByRole("button", { name: "Stop AI generation" }),
  )
  expect(server.requests[0].request.signal.aborted).toBe(true)
  expect(server.requests).toHaveLength(1)
  expect(getByHook("chat-input-textarea")).toHaveValue("Group by symbol.")
  expect(queryByHook("chat-queued-message")).not.toBeInTheDocument()
})

it("reopens with an unavailable local selection and requires an explicit API pick", async () => {
  const server = chatServer("openai", [])
  const settings = JSON.parse(
    fixtures.getOpenAIConfiguredSettings()["ai.assistant.settings"],
  ) as import("../../../src/providers/LocalStorageProvider/types").AiAssistantSettings
  const selectedModel = () =>
    (
      JSON.parse(localStorage.getItem("ai.assistant.settings") ?? "{}") as {
        selectedModel?: string
      }
    ).selectedModel
  renderChat("openai", undefined, {
    ...settings,
    selectedModel: LOCAL_AGENT_MODEL,
  })
  await openChat()
  expect(getByHook("chat-input-textarea")).toBeDisabled()
  expect(selectedModel()).toBe(LOCAL_AGENT_MODEL)
  await userEvent.click(getByHook("chat-model-picker"))
  await userEvent.click(
    await screen.findByRole("option", { name: "GPT 5 Mini" }),
  )
  expect(getByHook("chat-input-textarea")).toBeEnabled()
  expect(selectedModel()).toBe("openai:gpt-5-mini")
  expect(server.requests).toHaveLength(0)
})
