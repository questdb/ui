// @vitest-environment jsdom
import React from "react"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { ThemeProvider } from "styled-components"
import {
  fixtures,
  gate,
  getByHook,
  queryByHook,
  sendMessage,
} from "./support/chatHarness"
import { darkTheme } from "../../../src/theme"
import { Button } from "../../../src/components/Button"
import { ToastContainer } from "../../../src/components/Toast"
import { createQueryKey } from "../../../src/scenes/Editor/Monaco/utils"
import { TooltipProvider } from "../../../src/components/Tooltip"
import rootReducer from "../../../src/store/reducers"
import { db } from "../../../src/store/db"
import { aiConversationStore } from "../../../src/store/aiConversations"
import { LocalStorageProvider } from "../../../src/providers/LocalStorageProvider"
import {
  AIConversationProvider,
  useAIConversationActions,
} from "../../../src/providers/AIConversationProvider"
import {
  AIStatusProvider,
  useAIStatus,
} from "../../../src/providers/AIStatusProvider"
import {
  MCPBridgeProvider,
  useMCPBridge,
} from "../../../src/providers/MCPBridgeProvider"
import { AIChatWindowLazy } from "../../../src/scenes/Editor/AIChatWindow/AIChatWindowLazy"
import { getLocalAgentChannel } from "../../../src/utils/localAgent/localAgentChannel"
import { LOCAL_AGENT_MODEL } from "../../../src/utils/localAgent/localAgentModel"
import { EXPECTED_MCP_VERSION as v } from "../../../src/utils/mcp/protocolVersion"
import * as notebookSnapshot from "../../../src/utils/ai/notebookSnapshot"
import type {
  AgentPromptMessage,
  AgentTurnResult,
} from "../../../src/utils/localAgent/protocol"

const sockets: MemorySocket[] = []
class MemorySocket extends EventTarget {
  static OPEN = 1
  readyState = 0
  frames: Array<{ type: string }> = []
  constructor() {
    super()
    sockets.push(this)
  }
  open() {
    this.readyState = MemorySocket.OPEN
    this.dispatchEvent(new Event("open"))
  }
  send(data: string) {
    expect(this.readyState).toBe(MemorySocket.OPEN)
    this.frames.push(JSON.parse(data) as { type: string })
  }
  close(code = 1000, reason = "") {
    this.readyState = 3
    this.dispatchEvent(new CloseEvent("close", { code, reason }))
  }
  receive(frame: object) {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(frame) }),
    )
  }
  prompts() {
    return this.frames.filter(
      (frame) => frame.type === "agent_prompt",
    ) as AgentPromptMessage[]
  }
}

const ack = (socket: MemorySocket, resumed = false) =>
  socket.receive({
    v,
    type: "hello_ack",
    sessionId: "memory-session",
    seenToolCount: 0,
    resumed,
    agent: { id: "mock-local", label: "Mock local agent", cwd: "/tmp/mock" },
  })
const answer = (
  socket: MemorySocket,
  text: string,
  result: AgentTurnResult = {
    outcome: "completed",
    stopReason: "end_turn",
    usage: null,
  },
) => {
  const { conversationId, turnId } = socket.prompts().at(-1)!
  const ids = { v, conversationId, turnId }
  socket.receive({
    ...ids,
    type: "agent_update",
    update: {
      kind: "message_chunk",
      messageId: "mock-reply",
      text,
    },
  })
  socket.receive({ ...ids, type: "agent_turn_end", result })
}

const openLocalChat = async (query = false) => {
  sockets.length = 0
  vi.stubGlobal("WebSocket", MemorySocket)
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
  const bufferId = await db.buffers.add({
    label: "Sample notebook",
    value: "",
    position: 0,
    ...(!query && { notebookViewState: { cells: [] } }),
  })
  const Probe = () => {
    const { connect, status } = useMCPBridge()
    const { openNotebookChat, handleGlyphClick } = useAIConversationActions()
    const { canUse } = useAIStatus()
    return (
      <>
        <Button onClick={() => connect("ws://mock.invalid", "mock-token")}>
          Connect fake bridge
        </Button>
        <Button
          onClick={() =>
            void (query
              ? handleGlyphClick({
                  bufferId,
                  queryKey: createQueryKey("SELECT 1", 0),
                })
              : openNotebookChat(bufferId))
          }
        >
          Open sample chat
        </Button>
        <output data-hook="bridge-status">{`${status}/${canUse}`}</output>
      </>
    )
  }
  localStorage.setItem(
    "ai.assistant.settings",
    JSON.stringify({
      ...JSON.parse(
        fixtures.getOpenAIConfiguredSettings()["ai.assistant.settings"],
      ),
      selectedModel: LOCAL_AGENT_MODEL,
    }),
  )
  render(
    <ThemeProvider theme={darkTheme}>
      <TooltipProvider>
        <Provider store={createStore(rootReducer)}>
          <LocalStorageProvider>
            <AIConversationProvider>
              <MCPBridgeProvider>
                <AIStatusProvider>
                  <div id="side-panel-right" />
                  <AIChatWindowLazy />
                  <Probe />
                  <ToastContainer />
                </AIStatusProvider>
              </MCPBridgeProvider>
            </AIConversationProvider>
          </LocalStorageProvider>
        </Provider>
      </TooltipProvider>
    </ThemeProvider>,
  )
  await userEvent.click(
    screen.getByRole("button", { name: "Connect fake bridge" }),
  )
  const [first] = sockets
  act(() => {
    first.open()
    ack(first)
    first.receive({
      v,
      type: "agent_status",
      state: "ready",
      config: null,
      error: null,
    })
  })
  const channel = getLocalAgentChannel()
  expect(channel).not.toBeNull()
  await userEvent.click(
    screen.getByRole("button", { name: "Open sample chat" }),
  )
  await waitFor(() => expect(getByHook("chat-input-textarea")).toBeVisible())
  const reconnect = () => {
    act(() => {
      first.close(1006)
    })
    expect(getByHook("bridge-status")).toHaveTextContent("reconnecting/true")
    expect(getLocalAgentChannel()).toBe(channel)
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(sockets).toHaveLength(2)
    const second = sockets[1]
    act(() => {
      second.open()
    })
    expect(second.frames.map(({ type }) => type)).toEqual(["hello"])
    return second
  }
  const replace = async () => {
    await userEvent.click(
      screen.getByRole("button", { name: "Connect fake bridge" }),
    )
    const replacement = sockets.at(-1)!
    act(() => {
      replacement.open()
      ack(replacement)
      replacement.receive({
        v,
        type: "agent_status",
        state: "ready",
        config: null,
        error: null,
      })
    })
    return replacement
  }
  return { bufferId, first, channel, reconnect, replace }
}

const openNotebookChat = () => openLocalChat()

const holdSnapshot = () => {
  const snapshot = gate()
  const original = notebookSnapshot.buildSnapshot
  const build = vi
    .spyOn(notebookSnapshot, "buildSnapshot")
    .mockImplementationOnce(async (id) => {
      await snapshot.promise
      return original(id)
    })
  const release = async () => {
    await snapshot.release()
    await act(async () => {
      expect(await build.mock.results[0].value).toMatchObject({ status: "ok" })
    })
  }
  return { build, release, snapshot }
}

it("keeps a prepared prompt queued until the replacement socket acknowledges hello", async () => {
  const { bufferId, first, channel, reconnect } = await openNotebookChat()
  const { build, release, snapshot } = holdSnapshot()
  const text = "Summarize the sample notebook."
  try {
    await sendMessage(text)
    await waitFor(() => expect(build).toHaveBeenCalledWith(bufferId))
    const second = reconnect()
    await release()
    expect(first.prompts()).toHaveLength(0)
    expect(second.prompts()).toHaveLength(0)
    expect(getByHook("chat-queued-message-text")).toHaveTextContent(text)
    expect(getByHook("chat-queued-message")).toHaveTextContent(
      "Waiting for the local agent bridge",
    )
    expect(queryByHook("chat-message-user")).not.toBeInTheDocument()

    act(() => {
      ack(second, true)
    })
    expect(getLocalAgentChannel()).toBe(channel)
    await waitFor(() => expect(second.prompts()).toHaveLength(1))
    expect(JSON.stringify(second.prompts()[0].prompt)).toContain(text)
    expect(queryByHook("chat-queued-message")).not.toBeInTheDocument()
    act(() => {
      answer(second, "Sample notebook answer.")
    })
    await screen.findByText("Sample notebook answer.")
    expect(fetch).not.toHaveBeenCalled()
  } finally {
    await snapshot.release()
  }
})

it("does not record Explain while the bridge is waiting for hello", async () => {
  const { first, reconnect } = await openLocalChat(true)
  const second = reconnect()
  await userEvent.click(getByHook("button-explain-query"))
  const feedback = await screen.findByText(/Waiting for the local agent bridge/)
  expect(feedback.closest('[role="alert"]')).not.toBeNull()
  expect(first.prompts()).toHaveLength(0)
  expect(second.prompts()).toHaveLength(0)
  expect(queryByHook("chat-message-user")).not.toBeInTheDocument()
  expect(queryByHook("chat-message-error")).not.toBeInTheDocument()

  act(() => ack(second, true))
  await userEvent.click(getByHook("button-explain-query"))
  await waitFor(() => expect(second.prompts()).toHaveLength(1))
  act(() => answer(second, "This query returns one row."))
  await screen.findByText("This query returns one row.")
  await waitFor(async () => {
    const messages = await aiConversationStore.getMessages(
      second.prompts()[0].conversationId,
    )
    expect(messages.map(({ role }) => role)).toEqual(["user", "assistant"])
  })
  expect(fetch).not.toHaveBeenCalled()
})

it.each(["cancel", "delete"] as const)(
  "pauses a reconnecting queue during delete confirmation (%s)",
  async (decision) => {
    const { first, reconnect } = await openNotebookChat()
    await sendMessage("Show a sample query.")
    await waitFor(() => expect(first.prompts()).toHaveLength(1))
    const { conversationId } = first.prompts()[0]
    act(() => answer(first, "Sample query."))
    await waitFor(() => expect(getByHook("chat-window-history")).toBeEnabled())
    const second = reconnect()
    await sendMessage("Explain the sample result.")
    expect(getByHook("chat-queued-message-text")).toHaveTextContent(
      "Explain the sample result.",
    )
    await userEvent.click(getByHook("chat-window-history"))
    await userEvent.click(getByHook("chat-history-delete"))
    const dialog = screen.getByRole("alertdialog", {
      name: "Delete conversation",
    })
    expect(dialog).toBeVisible()

    act(() => ack(second, true))
    expect(second.prompts()).toHaveLength(0)
    if (decision === "cancel") {
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
      await waitFor(() => expect(second.prompts()).toHaveLength(1))
      expect(second.prompts()[0].conversationId).toBe(conversationId)
      act(() => answer(second, "Sample follow-up."))
      await waitFor(async () => {
        expect(
          await aiConversationStore.getMessages(conversationId),
        ).toHaveLength(4)
      })
    } else {
      await userEvent.click(screen.getByRole("button", { name: "Delete" }))
      await waitFor(() => expect(getByHook("chat-history-empty")).toBeVisible())
      expect(await aiConversationStore.getMeta(conversationId)).toBeUndefined()
      expect(second.prompts()).toHaveLength(0)
    }
    expect(fetch).not.toHaveBeenCalled()
  },
)

it("restores the draft on Stop while leaving the cancel queued for reconnect", async () => {
  const { first, reconnect } = await openNotebookChat()
  await sendMessage("Show a sample query.")
  await waitFor(() => expect(first.prompts()).toHaveLength(1))
  await sendMessage("Keep this follow-up.")
  await userEvent.type(getByHook("chat-input-textarea"), "Unsent draft.")
  const { conversationId, turnId } = first.prompts()[0]
  const question = {
    v,
    type: "agent_question",
    conversationId,
    requestId: "sample-question",
    message: "Choose a display style",
    fields: [
      {
        id: "style",
        kind: "choice",
        title: null,
        prompt: "Display style?",
        options: [{ value: "compact", label: "Compact", description: null }],
        multiple: false,
        required: true,
        otherFieldId: null,
      },
    ],
  }
  act(() => first.receive(question))
  expect(getByHook("chat-question-card")).toBeVisible()
  const second = reconnect()
  await userEvent.click(screen.getByRole("button", { name: "Stop the agent" }))
  expect(queryByHook("chat-question-card")).not.toBeInTheDocument()
  expect(getByHook("chat-input-textarea")).toHaveValue(
    "Keep this follow-up.\n\nUnsent draft.",
  )
  expect(second.frames.map(({ type }) => type)).toEqual(["hello"])

  act(() => {
    ack(second, true)
    second.receive({ ...question, requestId: "late-question" })
  })
  expect(second.frames.some(({ type }) => type === "agent_cancel")).toBe(true)
  expect(queryByHook("chat-question-card")).not.toBeInTheDocument()
  expect(getByHook("chat-input-textarea")).toBeEnabled()
  expect(second.prompts()).toHaveLength(0)
  await act(() => {
    second.receive({
      v,
      type: "agent_turn_end",
      conversationId,
      turnId,
      result: { outcome: "completed", stopReason: "cancelled", usage: null },
    })
    return Promise.resolve()
  })
  expect(fetch).not.toHaveBeenCalled()
})

it("resends seen history to a new channel advertising the same agent ID, but not on reconnect", async () => {
  const { first, channel, reconnect, replace } = await openNotebookChat()
  const question = "What is in the sample notebook?"
  const reply = "There is a sample chart."
  await sendMessage(question)
  await waitFor(() => expect(first.prompts()).toHaveLength(1))
  const [{ conversationId }] = first.prompts()
  act(() => answer(first, reply))
  await screen.findByText(reply)
  await waitFor(async () => {
    const messages = await aiConversationStore.getMessages(conversationId)
    expect(
      messages.find((message) => message.role === "assistant"),
    ).toMatchObject({
      localAgentSessionId: channel?.sessionId,
    })
  })

  const reconnected = reconnect()
  act(() => ack(reconnected, true))
  expect(getLocalAgentChannel()).toBe(channel)
  await sendMessage("Describe its axes.")
  await waitFor(() => expect(reconnected.prompts()).toHaveLength(1))
  expect(reconnected.prompts()[0].conversationId).toBe(conversationId)
  const nextPrompt = reconnected.prompts()[0].prompt[0]
  expect(nextPrompt?.type === "text" && nextPrompt.text).toContain(
    "Describe its axes.",
  )
  expect(nextPrompt?.type === "text" && nextPrompt.text).not.toContain(
    "<earlier_conversation>",
  )
  act(() => answer(reconnected, "It plots daily totals."))
  await screen.findByText("It plots daily totals.")

  const replacement = await replace()
  expect(getLocalAgentChannel()?.info.id).toBe(channel?.info.id)
  expect(getLocalAgentChannel()?.sessionId).not.toBe(channel?.sessionId)
  await sendMessage("Summarize the chart.")
  await waitFor(() => expect(replacement.prompts()).toHaveLength(1))
  expect(replacement.prompts()[0].conversationId).toBe(conversationId)
  const handoff = replacement.prompts()[0].prompt[0]
  expect(handoff?.type === "text" && handoff.text).toContain(
    `User: ${question}\nAssistant: ${reply}`,
  )
  act(() => answer(replacement, "The chart shows daily totals."))
  await screen.findByText("The chart shows daily totals.")
  expect(fetch).not.toHaveBeenCalled()
})

it("keeps the original failed turn if a reconnect starts while Retry prepares", async () => {
  const { bufferId, first, channel, reconnect } = await openNotebookChat()
  await sendMessage("Show a sample query")
  await waitFor(() => expect(first.prompts()).toHaveLength(1))
  const [{ conversationId }] = first.prompts()
  const partial = "A sample query starts with SELECT."
  const error = "The sample answer was incomplete."
  act(() => {
    answer(first, partial, { outcome: "failed", error })
  })
  await waitFor(() => {
    expect(getByHook("retry-button")).toBeEnabled()
    expect(getByHook("chat-message-error")).toHaveTextContent(error)
    expect(screen.getByText(partial)).toBeVisible()
  })
  const original = await aiConversationStore.getMessages(conversationId)
  const { build, release, snapshot } = holdSnapshot()
  try {
    await userEvent.click(getByHook("retry-button"))
    await waitFor(() => expect(build).toHaveBeenCalledWith(bufferId))
    const second = reconnect()
    await release()
    const retry = getByHook("retry-button")
    expect(retry).toBeDisabled()
    await userEvent.click(retry)
    expect(second.prompts()).toHaveLength(0)
    expect(getByHook("chat-message-error")).toHaveTextContent(error)
    expect(screen.getByText(partial)).toBeVisible()
    expect(await aiConversationStore.getMessages(conversationId)).toEqual(
      original,
    )

    act(() => {
      ack(second, true)
    })
    expect(getLocalAgentChannel()).toBe(channel)
    expect(retry).toBeEnabled()
    expect(second.prompts()).toHaveLength(0)
    await userEvent.click(retry)
    await waitFor(() => expect(second.prompts()).toHaveLength(1))
    expect(second.prompts()[0].conversationId).toBe(conversationId)
    act(() => {
      answer(second, "Completed sample answer.")
    })
    await screen.findByText("Completed sample answer.")
    expect(fetch).not.toHaveBeenCalled()
  } finally {
    await snapshot.release()
  }
})
