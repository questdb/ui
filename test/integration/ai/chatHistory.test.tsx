// @vitest-environment jsdom
import {
  renderChat,
  openChat,
  getByHook,
  queryByHook,
  seedChat,
  getAllByHook,
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
