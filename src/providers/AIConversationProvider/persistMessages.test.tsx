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
  saveMessages: vi.fn(),
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
