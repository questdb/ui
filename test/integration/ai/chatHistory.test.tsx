// @vitest-environment jsdom
import {
  renderChat,
  openChat,
  getByHook,
  queryByHook,
  seedChat,
  getAllByHook,
  chatServer,
  fixtures,
  sendMessage,
} from "./support/chatHarness"
import { describe, expect, it } from "vitest"
import { fireEvent, waitFor, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { db } from "../../../src/store/db"

describe("chat history", () => {
  it("deletes an unsent conversation on close and opens a fresh conversation", async () => {
    // Given
    renderChat()
    await openChat()
    expect(getByHook("chat-blank-state")).toBeVisible()
    await waitFor(async () => expect(await db.ai_conversations.count()).toBe(1))

    // When
    await userEvent.click(getByHook("chat-window-close"))

    // Then
    expect(queryByHook("ai-chat-window")).not.toBeInTheDocument()
    await waitFor(async () => {
      expect(await db.ai_conversations.count()).toBe(0)
      expect(await db.ai_conversation_messages.count()).toBe(0)
    })
    await openChat()
    expect(getByHook("chat-blank-state")).toBeVisible()
  })

  it("reopens the latest stored conversation when opened before the stored list loads", async () => {
    // Given
    await seedChat("Older chat")
    await seedChat("Latest chat")
    renderChat()

    // When
    fireEvent.click(screen.getByRole("button", { name: "Open AI Assistant" }))

    // Then
    await waitFor(() =>
      expect(getByHook("chat-message-user")).toHaveTextContent(
        "Question about Latest chat",
      ),
    )
    expect(await db.ai_conversations.count()).toBe(2)
  })

  it("opens saved chats offline on a local-only selection without changing the destination", async () => {
    await seedChat("Saved local chat")
    const settings = {
      modelValueFormat: 2 as const,
      selectedModel: "local-agent",
      providers: {},
    }
    const mounted = renderChat("openai", undefined, settings)
    await screen.findByRole("button", { name: "Open AI Assistant" })
    await openChat()
    expect(getByHook("chat-message-user")).toHaveTextContent(
      "Question about Saved local chat",
    )
    expect(getByHook("chat-input-textarea")).toBeDisabled()
    await userEvent.click(getByHook("chat-window-close"))
    await openChat()
    expect(getByHook("chat-input-textarea")).toBeDisabled()
    expect(
      JSON.parse(localStorage.getItem("ai.assistant.settings") ?? "{}"),
    ).toMatchObject({ selectedModel: "local-agent" })
    expect(fetch).not.toHaveBeenCalled()
    mounted.unmount()
  })

  it("shows an image-only message without displaying the agent's workspace context", async () => {
    // Given
    await seedChat("Image-only chat", {
      messages: [
        {
          id: crypto.randomUUID(),
          role: "user",
          timestamp: Date.now(),
          content: "<workspace>Internal workspace context</workspace>",
          displayUserMessage: "",
          images: [{ mimeType: "image/png", data: "iVBORw0KGgo=" }],
        },
      ],
    })
    renderChat()

    // When
    await openChat()

    // Then
    await waitFor(() => {
      const bubble = getByHook("chat-message-user")
      expect(bubble).toContainElement(getByHook("chat-image-enlarge"))
      expect(bubble).not.toHaveTextContent(/workspace/i)
    })
  })

  it("keeps a user's literal Markdown while stripping inline images from assistant history", async () => {
    const userImage = "![dot](data:image/png;base64,iVBORw0KGgo=)"
    const assistantImage = "![preview](data:image/png;base64,iVBORw0KGgo=)"
    await seedChat("Markdown discussion", {
      messages: [
        {
          id: "user",
          role: "user",
          content: `Explain ${userImage}`,
          timestamp: 1,
        },
        {
          id: "assistant",
          role: "assistant",
          content: `Here is ${assistantImage}`,
          timestamp: 2,
        },
      ],
    })
    const server = chatServer("openai", [
      fixtures.createFinalResponse("openai", "That is an inline image."),
    ])
    renderChat()
    await openChat()
    await sendMessage("What was the exact Markdown syntax?")
    await screen.findByText("That is an inline image.")
    const history = JSON.stringify(server.requests[0]?.body.input)
    expect(history).toContain(userImage)
    expect(history).toContain("Here is [image: preview]")
    expect(history).not.toContain(assistantImage)
  })

  it("filters stored conversations and handles clear and Escape without closing too early", async () => {
    // Given
    for (const name of [
      "Database Queries",
      "Performance Tips",
      "Schema Design",
    ])
      await seedChat(name)
    renderChat()
    await openChat()
    await userEvent.click(getByHook("chat-window-history"))
    await waitFor(() =>
      expect(getAllByHook("chat-history-item")).toHaveLength(3),
    )
    const search = getByHook("chat-history-search")

    // When
    for (const name of ["Database", "Performance", "Schema"]) {
      await userEvent.clear(search)
      await userEvent.type(search, name)
      // Then
      expect(getAllByHook("chat-history-item")).toHaveLength(1)
      expect(getByHook("chat-history-title")).toHaveTextContent(name)
    }
    await userEvent.clear(search)
    await userEvent.type(search, "e")
    expect(getAllByHook("chat-history-item")).toHaveLength(3)
    await userEvent.clear(search)
    await userEvent.type(search, "xyz123")
    expect(screen.getByText("No chats match your search")).toBeVisible()
    await userEvent.click(getByHook("chat-history-search-clear"))
    expect(search).toHaveValue("")
    expect(getAllByHook("chat-history-item")).toHaveLength(3)
    await userEvent.type(search, "Database{Escape}")
    expect(search).toHaveValue("")
    expect(getByHook("ai-chat-window")).toBeVisible()
    await userEvent.keyboard("{Escape}")
    await waitFor(() =>
      expect(queryByHook("ai-chat-window")).not.toBeInTheDocument(),
    )
  })
})
