import "../../test/stubBrowserGlobals"
import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AIConversationProvider, useAIConversation } from "."
import { db, type ConversationMeta } from "../../store/db"
import { aiConversationStore } from "../../store/aiConversations"
import type { ConversationMessage } from "./types"

const mocks = vi.hoisted(() => ({
  // Deliberately keep the live-query cache stale after IndexedDB writes.
  metas: [] as ConversationMeta[],
  sidebar: null as { type: string } | null,
  dispatch: vi.fn((action: { type: string }) => {
    mocks.sidebar = action.type === "open-chat" ? { type: "aiChat" } : null
  }),
}))
vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: () => mocks.metas,
}))
vi.mock("react-redux", () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: () => mocks.sidebar,
}))
vi.mock("../../store", () => ({
  actions: {
    console: {
      pushSidebarHistory: () => ({ type: "open-chat" }),
      closeSidebar: () => ({ type: "close-chat" }),
    },
  },
  selectors: { console: { getActiveSidebar: vi.fn() } },
}))
vi.mock("../EditorProvider", () => ({
  useEditor: () => ({ activeBuffer: { id: 1 } }),
}))
vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.mock("../../components/Toast", () => ({ toast: { error: vi.fn() } }))

let renderer: ReactTestRenderer | undefined
let conversation: ReturnType<typeof useAIConversation>
const Consumer = () => {
  conversation = useAIConversation()
  return null
}
const tree = () => (
  <AIConversationProvider>
    <Consumer />
  </AIConversationProvider>
)
const meta = (id: string, updatedAt: number): ConversationMeta => ({
  id,
  conversationName: "AI Assistant",
  updatedAt,
  hasMessages: false,
})

beforeEach(async () => {
  mocks.metas = [meta("empty-chat", 2)]
  mocks.sidebar = null
  mocks.dispatch.mockClear()
  await db.ai_conversations.clear()
  await db.ai_conversation_messages.clear()
  await db.ai_conversations.bulkPut(mocks.metas)
})
afterEach(() => {
  act(() => renderer?.unmount())
  vi.restoreAllMocks()
})

const openEmptyChat = async () => {
  act(() => {
    renderer = create(tree())
  })
  await act(async () => {
    await conversation.openChatWindow("empty-chat")
  })
  act(() => renderer!.update(tree()))
  expect(conversation.chatWindowState.activeConversationId).toBe("empty-chat")
}
const closeAndReopen = async () => {
  act(() => {
    conversation.closeChatWindow()
    renderer!.update(tree())
  })
  // Reopen without waiting for the delete transaction or live-query update.
  await act(async () => {
    await conversation.openOrCreateBlankChatWindow()
  })
}

describe("AIConversationProvider chat reopening", () => {
  it("creates a new blank chat instead of reopening the chat being deleted", async () => {
    await openEmptyChat()
    await closeAndReopen()

    const activeId = conversation.chatWindowState.activeConversationId!
    expect(activeId).not.toBe("empty-chat")
    expect(await aiConversationStore.getMeta("empty-chat")).toBeUndefined()
    expect(await aiConversationStore.getMeta(activeId)).toMatchObject({
      hasMessages: false,
    })
    expect(await aiConversationStore.getAllMetas()).toHaveLength(1)
  })

  it("falls back to the latest remaining chat, not a deleted cached chat", async () => {
    const savedChat = meta("saved-chat", 1)
    const messages: ConversationMessage[] = [
      { id: "message", role: "user", content: "Hello", timestamp: 1 },
    ]
    mocks.metas.push(savedChat)
    await aiConversationStore.saveConversation({ ...savedChat, messages })
    await openEmptyChat()
    await closeAndReopen()

    expect(conversation.chatWindowState.activeConversationId).toBe("saved-chat")
    expect(await aiConversationStore.getMeta("empty-chat")).toBeUndefined()
    expect(await aiConversationStore.getMessages("saved-chat")).toEqual(
      messages,
    )
  })

  it("preserves the active chat and its messages when closing a nonempty chat", async () => {
    const messages: ConversationMessage[] = [
      { id: "message", role: "user", content: "Hello", timestamp: 1 },
    ]
    await aiConversationStore.saveMessages("empty-chat", messages)
    await openEmptyChat()
    const deleteSpy = vi.spyOn(aiConversationStore, "deleteConversation")
    await closeAndReopen()

    expect(conversation.chatWindowState.activeConversationId).toBe("empty-chat")
    expect(deleteSpy).not.toHaveBeenCalled()
    expect(await aiConversationStore.getMessages("empty-chat")).toEqual(
      messages,
    )
  })

  it("can reopen the chat if deleting it fails", async () => {
    await openEmptyChat()
    const error = new Error("Storage unavailable")
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(aiConversationStore, "deleteConversation").mockRejectedValueOnce(
      error,
    )
    await closeAndReopen()

    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to delete empty conversation:",
      error,
    )
    expect(conversation.chatWindowState.activeConversationId).toBe("empty-chat")
    expect(await aiConversationStore.getMeta("empty-chat")).toBeDefined()
  })
})
