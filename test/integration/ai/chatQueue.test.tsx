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
import React from "react"
import { Button } from "../../../src/components/Button"
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { bufferStore } from "../../../src/store/buffers"
import { db } from "../../../src/store/db"
import * as notebookSnapshot from "../../../src/utils/ai/notebookSnapshot"
import { aiConversationStore } from "../../../src/store/aiConversations"
import { useAIConversationActions } from "../../../src/providers/AIConversationProvider"
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

const openHistoryChat = async (title: string) => {
  await userEvent.click(getByHook("chat-window-history"))
  await userEvent.click(
    await screen.findByText(title, {
      selector: '[data-hook="chat-history-item"] *',
    }),
  )
}

const holdNotebookSnapshot = async () => {
  const bufferId = await db.buffers.add({
    label: "Sample notebook",
    value: "",
    position: 0,
    notebookViewState: { cells: [] },
  })
  const snapshot = gate()
  const get = bufferStore.getById
  const reads = vi.spyOn(bufferStore, "getById").mockImplementation((id) =>
    get(id).then(async (buffer) => {
      if (id === bufferId) await snapshot.promise
      return buffer
    }),
  )
  const builds = vi.spyOn(notebookSnapshot, "buildSnapshot")
  const releasePreparedSnapshot = async () => {
    await snapshot.release()
    await act(async () => {
      expect(await builds.mock.results[0].value).toMatchObject({ status: "ok" })
    })
  }
  return { bufferId, snapshot, reads, releasePreparedSnapshot }
}

it("keeps a submitted first message when an empty notebook chat is closed", async () => {
  const { bufferId, snapshot, reads } = await holdNotebookSnapshot()
  const server = chatServer("openai", [
    fixtures.createFinalResponse("openai", "Here is the sample notebook."),
  ])
  const OpenNotebook = () => {
    const { openNotebookChat } = useAIConversationActions()
    return (
      <Button onClick={() => void openNotebookChat(bufferId)}>
        Open notebook chat
      </Button>
    )
  }
  renderChat("openai", <OpenNotebook />)
  try {
    await userEvent.click(
      screen.getByRole("button", { name: "Open notebook chat" }),
    )
    await screen.findByPlaceholderText(
      "Ask AI about your tables, or generate a query...",
    )
    const [original] = await aiConversationStore.getAllMetas()
    await sendMessage("Summarize the sample notebook.")
    await waitFor(() => expect(reads).toHaveBeenCalledWith(bufferId))
    await userEvent.click(getByHook("chat-window-close"))
    expect(queryByHook("ai-chat-window")).not.toBeInTheDocument()
    expect(await aiConversationStore.getMeta(original.id)).toBeDefined()
    await snapshot.release()
    await waitFor(() => expect(server.requests).toHaveLength(1))
    expect(lastRequestText(server)).toContain("Summarize the sample notebook.")
    await waitFor(async () => {
      const transcript = await aiConversationStore.getMessages(original.id)
      expect(
        transcript.some(
          (message) => message.content === "Here is the sample notebook.",
        ),
      ).toBe(true)
    })
    await userEvent.click(
      screen.getByRole("button", { name: "Open notebook chat" }),
    )
    await screen.findByText("Here is the sample notebook.")
  } finally {
    await snapshot.release()
  }
})

it("revokes the outgoing queue owner before waiting for the chat save", async () => {
  const { bufferId, snapshot, reads, releasePreparedSnapshot } =
    await holdNotebookSnapshot()
  const save = gate()
  const server = chatServer("openai", [
    fixtures.createFinalResponse("openai", "Resumed the sample."),
  ])
  await seedChat("Other sample chat")
  const original = await seedChat("Original sample chat", {
    notebookBufferId: bufferId,
  })
  const saveMessages =
    aiConversationStore.saveMessages.bind(aiConversationStore)
  const saves = vi
    .spyOn(aiConversationStore, "saveMessages")
    .mockImplementation(async (...args) => {
      if (args[0] === original.id && args[2] === undefined) await save.promise
      await saveMessages(...args)
    })
  renderChat()
  await openChat()
  try {
    await sendMessage("Continue the sample.")
    await waitFor(() => expect(reads).toHaveBeenCalledWith(bufferId))
    await openHistoryChat("Other sample chat")
    await waitFor(() =>
      expect(saves).toHaveBeenCalledWith(
        original.id,
        expect.any(Array),
        undefined,
      ),
    )
    await releasePreparedSnapshot()
    expect(server.requests).toHaveLength(0)
    await save.release()
    await screen.findByText("Question about Other sample chat")
    await openHistoryChat("Original sample chat")
    await screen.findByText("Resumed the sample.")
    expect(server.requests).toHaveLength(1)
    expect(lastRequestText(server)).toContain("Continue the sample.")
  } finally {
    await save.release()
    await snapshot.release()
  }
})

it("dispatches a different chat's queue while the outgoing snapshot is still pending", async () => {
  const { bufferId, snapshot, reads, releasePreparedSnapshot } =
    await holdNotebookSnapshot()
  const server = chatServer("openai", [
    fixtures.createFinalResponse("openai", "The other chat's answer."),
  ])
  await seedChat("Other sample chat")
  await seedChat("Original sample chat", { notebookBufferId: bufferId })
  renderChat()
  await openChat()
  try {
    await sendMessage("Continue the original sample.")
    await waitFor(() => expect(reads).toHaveBeenCalledWith(bufferId))
    await openHistoryChat("Other sample chat")
    await screen.findByText("Question about Other sample chat")
    await sendMessage("Explain the other sample.")
    await screen.findByText("The other chat's answer.")
    expect(server.requests).toHaveLength(1)
    expect(lastRequestText(server)).toContain("Explain the other sample.")
    await releasePreparedSnapshot()
    expect(server.requests).toHaveLength(1)
  } finally {
    await snapshot.release()
  }
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
        await screen.findByText("Question about Other sample chat")
      } else {
        await userEvent.click(getByHook("chat-model-picker"))
        await userEvent.click(
          await screen.findByRole("option", { name: "GPT 5" }),
        )
        expect(getByHook("chat-queued-message")).toHaveTextContent(
          "Restore the original destination",
        )
        expect(getByHook("chat-input-textarea")).toHaveValue("")
      }
      await snapshot.release()
      expect(server.requests).toHaveLength(1)
      expect(
        getAllByHook("chat-message-user").map((node) => node.textContent),
      ).not.toContain("Group the sample by symbol.")

      if (change === "chat switch") {
        await openHistoryChat("Original sample chat")
      } else {
        await userEvent.click(getByHook("chat-window-history"))
        await userEvent.click(
          screen.getByRole("button", { name: "Back to chat" }),
        )
        expect(getByHook("chat-queued-message-text")).toHaveTextContent(
          "Group the sample by symbol.",
        )
        await userEvent.click(getByHook("chat-model-picker"))
        await userEvent.click(
          await screen.findByRole("option", { name: "GPT 5 Mini" }),
        )
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

it("does not interrupt an answer when the queued destination changes in Settings", async () => {
  const { first, server } = slowFirstAnswer()
  server.other = () =>
    Response.json({
      object: "list",
      data: [
        { id: "gpt-5.4", object: "model", created: 1772000000 },
        { id: "gpt-5-mini", object: "model", created: 1754500000 },
      ],
    })
  renderChat("openai", undefined, {
    modelValueFormat: 2,
    selectedModel: "openai:gpt-5.4",
    providers: {
      openai: {
        apiKey: "mock",
        enabledModels: ["openai:gpt-5.4", "openai:gpt-5-mini"],
        grantSchemaAccess: false,
      },
    },
  })
  await openChat()
  await sendMessage("Show the latest trades.")
  await waitFor(() => expect(server.requests).toHaveLength(1))
  try {
    await sendMessage("Group them by symbol.")
    await userEvent.click(getByHook("chat-assistant-settings"))
    await userEvent.click(getByHook("ai-settings-manage-models"))
    const oldModel = await waitFor(() => {
      const row = getAllByHook("manage-models-model-row").find((item) =>
        item.textContent?.endsWith("gpt-5.4"),
      )
      expect(row).toBeDefined()
      return within(row!).getByRole("checkbox")
    })
    await userEvent.click(oldModel)
    await userEvent.click(getByHook("manage-models-save"))
    await userEvent.click(getByHook("ai-settings-save"))
    expect(getByHook("chat-model-picker")).toHaveTextContent("GPT 5 Mini")
    expect(getByHook("chat-queued-send-now")).toBeDisabled()
    await userEvent.click(getByHook("chat-queued-send-now"))
    await userEvent.click(getByHook("chat-input-textarea"))
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}")
    expect(server.requests[0].request.signal.aborted).toBe(false)
    expect(server.requests).toHaveLength(1)
    expect(getByHook("chat-queued-message-text")).toHaveTextContent(
      "Group them by symbol.",
    )
    await first.release()
    await screen.findByText("The first answer.")
    expect(getByHook("chat-queued-message-text")).toHaveTextContent(
      "Group them by symbol.",
    )
  } finally {
    await first.release()
  }
})

it("stopping another chat does not cancel a queue waiting on a completed answer", async () => {
  const notebookId = await db.buffers.add({
    label: "Sample notebook",
    value: "",
    position: 0,
    notebookViewState: { cells: [] },
  })
  const first = gate()
  const snapshot = gate()
  const server: ReturnType<typeof chatServer> = chatServer("openai", [
    async () => {
      await first.promise
      return fixtures.createFinalResponse("openai", "First chat answer.")
    },
    () =>
      Promise.resolve(streamUntilAborted(server.requests[1].request.signal)),
    fixtures.createFinalResponse("openai", "Queued answer."),
  ])
  await seedChat("Other sample chat")
  await seedChat("Original sample chat", {
    notebookBufferId: notebookId,
    messages: [
      {
        id: crypto.randomUUID(),
        role: "user",
        content: "What is in the notebook?",
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
  const get = bufferStore.getById
  const reads = vi.spyOn(bufferStore, "getById").mockImplementation((id) =>
    get(id).then(async (buffer) => {
      if (id === notebookId) await snapshot.promise
      return buffer
    }),
  )
  try {
    await sendMessage("Group the sample by symbol.")
    await first.release()
    await waitFor(() => expect(reads).toHaveBeenCalledWith(notebookId))
    await openHistoryChat("Other sample chat")
    await screen.findByText("Question about Other sample chat")
    vi.setSystemTime(Date.now() + 3000)
    await sendMessage("Explain the other sample.")
    await waitFor(() => expect(server.requests).toHaveLength(2))
    await userEvent.click(getByHook("chat-stop-button"))
    expect(server.requests[1].request.signal.aborted).toBe(true)
    expect(server.requests[0].request.signal.aborted).toBe(false)
    await openHistoryChat("Original sample chat")
    expect(getByHook("chat-input-textarea")).toHaveValue("")
    vi.setSystemTime(Date.now() + 3000)
    await snapshot.release()
    await screen.findByText("Queued answer.")
    expect(lastRequestText(server)).toContain("Group the sample by symbol.")
  } finally {
    await first.release()
    await snapshot.release()
  }
})
