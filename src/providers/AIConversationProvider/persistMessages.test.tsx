// @vitest-environment jsdom
import React, { act } from "react"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../test/component"
import rootReducer from "../../store/reducers"
import type { ConversationMessage } from "./types"

const store = vi.hoisted(() => ({
  messages: new Map<string, unknown[]>(),
  saveMessages: vi.fn<[string, unknown[], unknown?], Promise<void>>(),
}))

vi.mock("../../store/aiConversations", () => ({
  aiConversationStore: {
    getMessages: (id: string) => Promise.resolve(store.messages.get(id) ?? []),
    saveMessages: store.saveMessages,
    deleteConversation: vi.fn(),
  },
}))
vi.mock("dexie-react-hooks", () => ({ useLiveQuery: () => [] }))
vi.mock("../EditorProvider", () => ({
  useEditor: () => ({ buffers: [], activeBuffer: { id: 1 } }),
}))

import { AIConversationProvider, useAIConversationActions } from "."

const message = (id: string): ConversationMessage => ({
  id,
  role: "user",
  content: id,
  timestamp: 0,
})

let actions!: ReturnType<typeof useAIConversationActions>
const Probe = () => {
  actions = useAIConversationActions()
  return null
}

afterEach(() => {
  store.messages.clear()
  vi.resetAllMocks()
})

describe("persistMessages", () => {
  // A stopped reply's flow can still be saving when the user opens another chat.
  it("does not save the next chat's messages under the chat a flow ran in", async () => {
    store.messages.set("A", [message("a1")])
    store.messages.set("B", [message("b1")])
    renderComponent(
      <Provider store={createStore(rootReducer, undefined)}>
        <AIConversationProvider>
          <Probe />
        </AIConversationProvider>
      </Provider>,
    )
    await act(() => actions.openChatWindow("A"))
    store.saveMessages.mockClear()

    await act(async () => {
      await actions.openChatWindow("B")
      // act holds the switch's render, as the browser may for a moment: the
      // flow of chat A finishes before it.
      await actions.persistMessages("A")
    })

    for (const [conversationId, messages] of store.saveMessages.mock.calls) {
      if (conversationId === "A") expect(messages).toEqual([message("a1")])
    }
  })
})

describe("markHistorySeen", () => {
  const anchor: ConversationMessage = {
    id: "a2",
    role: "assistant",
    content: null,
    timestamp: 0,
  }
  const marked = { ...anchor, localAgentSessionId: "session-a" }

  const openChats = async (...ids: string[]) => {
    renderComponent(
      <Provider store={createStore(rootReducer, undefined)}>
        <AIConversationProvider>
          <Probe />
        </AIConversationProvider>
      </Provider>,
    )
    for (const id of ids) await act(() => actions.openChatWindow(id))
    store.saveMessages.mockClear()
  }

  // The bridge accepts a stopped turn when the agent ends it, maybe after
  // the user opened another chat.
  it("marks the turn in the saved transcript of a chat that is not open", async () => {
    // Given chat A's turn, saved when the user opened chat B
    store.messages.set("A", [message("a1"), anchor])
    store.messages.set("B", [message("b1")])
    await openChats("A", "B")

    // When the agent session accepts the turn
    await act(() => actions.markHistorySeen("A", "a2", "session-a"))

    // Then
    expect(store.saveMessages.mock.calls).toEqual([
      ["A", [message("a1"), marked]],
    ])
  })

  it("marks the turn in the open chat, which saves it with the chat", async () => {
    // Given chat A open with its turn
    store.messages.set("A", [message("a1"), anchor])
    await openChats("A")

    // When the agent session accepts the turn
    await act(() => actions.markHistorySeen("A", "a2", "session-a"))

    // Then
    expect(store.saveMessages).not.toHaveBeenCalled()
    await act(() => actions.persistMessages("A"))
    expect(
      store.saveMessages.mock.calls.map((call) => call.slice(0, 2)),
    ).toEqual([["A", [message("a1"), marked]]])
  })

  it("leaves a chat alone whose saved transcript no longer has the turn", async () => {
    // Given chat A deleted while chat B is open
    store.messages.set("B", [message("b1")])
    await openChats("B")

    // When the agent session accepts chat A's turn
    await act(() => actions.markHistorySeen("A", "a2", "session-a"))

    // Then
    expect(store.saveMessages).not.toHaveBeenCalled()
  })

  // The flow that the bridge accepted does not wait for the mark.
  it("reports a mark it cannot save instead of rejecting", async () => {
    // Given chat A's turn, saved when the user opened chat B, and a database
    // that refuses the next write
    store.messages.set("A", [message("a1"), anchor])
    store.messages.set("B", [message("b1")])
    await openChats("A", "B")
    const failure = new Error("QuotaExceededError")
    store.saveMessages.mockRejectedValueOnce(failure)
    const logError = vi.spyOn(console, "error").mockImplementation(() => {})

    // When the agent session accepts the turn
    const marking = actions.markHistorySeen("A", "a2", "session-a")

    // Then
    await expect(marking).resolves.toBeUndefined()
    expect(logError).toHaveBeenCalledWith(
      "Failed to save the agent's history mark:",
      failure,
    )
    logError.mockRestore()
  })
})
