// @vitest-environment jsdom
import React from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
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
  seedChat,
  failQuery,
  editorAdapter,
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
import {
  HELLO_TIMEOUT_MS,
  MAX_RECONNECT_ATTEMPTS,
} from "../../../src/utils/mcp/MCPBridgeClient"
import * as notebookSnapshot from "../../../src/utils/ai/notebookSnapshot"
import { emitUserAction } from "../../../src/utils/notebooks/notebookAIBridge"
import type {
  AgentCommand,
  AgentConfigSetting,
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

const mockAgent = {
  id: "mock-local",
  label: "Mock local agent",
  cwd: "/tmp/mock",
}
const ack = (socket: MemorySocket, resumed = false, agent = mockAgent) =>
  socket.receive({
    v,
    type: "hello_ack",
    sessionId: "memory-session",
    seenToolCount: 0,
    resumed,
    agent,
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

const reportReady = (
  socket: MemorySocket,
  {
    model,
    commands = [],
    acceptsImages = false,
    effort = null,
  }: {
    model?: string
    effort?: AgentConfigSetting | null
    commands?: AgentCommand[]
    acceptsImages?: boolean
  } = {},
) =>
  socket.receive({
    v,
    type: "agent_status",
    state: "ready",
    config: model
      ? { model: { id: "model", current: model, choices: [] }, effort }
      : null,
    error: null,
    commands,
    acceptsImages,
  })

const openLocalChat = async (
  query = false,
  starting = false,
  failedQuery = false,
) => {
  sockets.length = 0
  vi.stubGlobal("WebSocket", MemorySocket)
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
  const bufferId = await db.buffers.add({
    label: "Sample notebook",
    value: "",
    position: 0,
    ...(!query && { notebookViewState: { cells: [] } }),
  })
  if (failedQuery) {
    editorAdapter.overrides = {
      ...editorAdapter.overrides,
      activeBuffer: {
        id: bufferId,
        value: "SELECT 1",
        position: 0,
        label: "Query",
      },
    }
    failQuery(bufferId, "SELECT 1", {
      message: "unexpected token [1]",
      position: 7,
    })
  }
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
    if (!starting) reportReady(first)
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
  const replace = async (agent = mockAgent) => {
    await userEvent.click(
      screen.getByRole("button", { name: "Connect fake bridge" }),
    )
    const replacement = sockets.at(-1)!
    act(() => {
      replacement.open()
      ack(replacement, false, agent)
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

it("settles a pending turn when replacement sockets never acknowledge hello", async () => {
  const { first, reconnect } = await openNotebookChat()
  await sendMessage("Describe the sample notebook.")
  await waitFor(() => expect(first.prompts()).toHaveLength(1))
  expect(screen.getByRole("button", { name: "Chat history" })).toBeDisabled()

  // The chat harness only fakes Date. Include the handshake and retry timers.
  const now = Date.now()
  vi.useRealTimers()
  vi.useFakeTimers({ now, toFake: ["Date", "setTimeout", "clearTimeout"] })
  try {
    let waiting = reconnect()
    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
      act(() => {
        vi.advanceTimersByTime(HELLO_TIMEOUT_MS)
      })
      expect(waiting.readyState).toBe(3)
      if (attempt < MAX_RECONNECT_ATTEMPTS) {
        // Foregrounding speeds up a scheduled retry without resetting it.
        act(() => {
          document.dispatchEvent(new Event("visibilitychange"))
        })
        const next = sockets.at(-1)!
        expect(next).not.toBe(waiting)
        act(() => next.open())
        waiting = next
      }
    }
    expect(sockets).toHaveLength(1 + MAX_RECONNECT_ATTEMPTS)
    expect(getByHook("bridge-status")).toHaveTextContent("disconnected/")
    expect(getLocalAgentChannel()).toBeNull()
  } finally {
    vi.useRealTimers()
  }
  await screen.findByText("The connection to Mock local agent was lost.")
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Chat history" })).toBeEnabled(),
  )
  expect(fetch).not.toHaveBeenCalled()
})

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
      "Waiting for Mock local agent",
    )
    expect(queryByHook("chat-message-user")).not.toBeInTheDocument()
    const picker = getByHook("chat-model-picker")
    await userEvent.click(picker)
    expect(
      screen.getByRole("combobox", { name: "Search models" }),
    ).toHaveFocus()

    act(() => {
      ack(second, true)
    })
    expect(getLocalAgentChannel()).toBe(channel)
    await waitFor(() => expect(second.prompts()).toHaveLength(1))
    expect(picker).toBeDisabled()
    expect(queryByHook("chat-model-picker-menu")).not.toBeInTheDocument()
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

it.each(["initial model only", "later model change"])(
  "revalidates a startup prompt during notebook preparation: %s",
  async (transition) => {
    const { bufferId, first, channel } = await openLocalChat(false, true)
    expect(channel?.getSnapshot().state).toBe("starting")
    const { build, release, snapshot } = holdSnapshot()
    const text = "Summarize the sample notebook."
    try {
      await sendMessage(text)
      await waitFor(() => expect(build).toHaveBeenCalledWith(bufferId))
      expect(first.prompts()).toHaveLength(0)
      act(() => {
        reportReady(first, { model: "mock-default" })
        if (transition === "later model change")
          reportReady(first, { model: "mock-other" })
      })
      expect(getLocalAgentChannel()).toBe(channel)
      await release()
      if (transition === "later model change") {
        expect(first.prompts()).toHaveLength(0)
        expect(getByHook("chat-queued-message")).toHaveTextContent(
          "Restore the original destination",
        )
        act(() => reportReady(first, { model: "mock-default" }))
      }
      await waitFor(() => expect(first.prompts()).toHaveLength(1))
      const firstBlock = first.prompts()[0].prompt[0]
      expect(firstBlock?.type === "text" && firstBlock.text).toContain(text)
      expect(queryByHook("chat-queued-message")).not.toBeInTheDocument()
      act(() => answer(first, "Sample notebook answer."))
      await screen.findByText("Sample notebook answer.")
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      await snapshot.release()
    }
  },
)

it("shows the query preview through /effort and keeps query actions out of a fresh chat", async () => {
  const { first } = await openLocalChat(true)
  act(() =>
    reportReady(first, {
      model: "mock-default",
      effort: {
        id: "effort",
        current: "high",
        choices: [
          { value: "high", name: "High", description: null, group: null },
          { value: "low", name: "Low", description: null, group: null },
        ],
      },
    }),
  )

  await sendMessage("/effort low")
  expect(getByHook("chat-command-done")).toHaveTextContent("Effort set to Low")
  expect.soft(queryByHook("chat-initial-query-box")).toBeVisible()
  expect(getByHook("button-explain-query")).toBeVisible()

  await userEvent.click(getByHook("chat-window-new"))
  await waitFor(() => expect(getByHook("chat-blank-state")).toBeVisible())

  await sendMessage("/effort low")
  expect(getByHook("chat-command-done")).toHaveTextContent("Effort set to Low")
  expect(queryByHook("button-explain-query")).not.toBeInTheDocument()
  expect(queryByHook("button-fix-query")).not.toBeInTheDocument()
  expect(getByHook("chat-window-new")).toBeDisabled()
  expect(first.prompts()).toHaveLength(0)
})

it.each([
  ["Explain", "button-explain-query", "explain this SQL query"],
  ["Fix", "button-fix-query", "unexpected token [1]"],
])(
  "does not record %s while the bridge is waiting for hello",
  async (_action, hook, asks) => {
    const { first, reconnect } = await openLocalChat(
      true,
      false,
      hook === "button-fix-query",
    )
    const second = reconnect()
    await userEvent.click(getByHook(hook))
    const feedback = await screen.findByText(/Waiting for Mock local agent/)
    expect(feedback.closest('[role="alert"]')).not.toBeNull()
    expect(first.prompts()).toHaveLength(0)
    expect(second.prompts()).toHaveLength(0)
    expect(queryByHook("chat-message-user")).not.toBeInTheDocument()
    expect(queryByHook("chat-message-error")).not.toBeInTheDocument()

    act(() => ack(second, true))
    await userEvent.click(getByHook(hook))
    await waitFor(() => expect(second.prompts()).toHaveLength(1))
    expect(JSON.stringify(second.prompts()[0].prompt)).toContain(asks)
    act(() => answer(second, "This query returns one row."))
    await screen.findByText("This query returns one row.")
    await waitFor(async () => {
      const messages = await aiConversationStore.getMessages(
        second.prompts()[0].conversationId,
      )
      expect(messages.map(({ role }) => role)).toEqual(["user", "assistant"])
    })
    expect(fetch).not.toHaveBeenCalled()
  },
)

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

it.each(["Edit", "Remove"])(
  "Stop cancels immediately and holds a native command for explicit %s",
  async (action) => {
    const { first } = await openNotebookChat()
    act(() =>
      reportReady(first, {
        acceptsImages: true,
        commands: [
          { name: "review", description: "Review a sample", hint: "[topic]" },
        ],
      }),
    )
    await sendMessage("Show a sample query.")
    await waitFor(() => expect(first.prompts()).toHaveLength(1))
    const { conversationId, turnId } = first.prompts()[0]
    const command = "/review formatting"
    await sendMessage(command)
    expect(getByHook("chat-queued-message-text")).toHaveTextContent(command)
    const input = getByHook("chat-input-textarea")
    await userEvent.type(input, "Unsent draft.")
    await userEvent.upload(
      getByHook("chat-attach-image-input"),
      new File(["sample"], "draft.png", { type: "image/png" }),
    )
    const draftImage = await screen.findByRole("img", { name: "Attachment 1" })
    const imageSource = draftImage.getAttribute("src")

    await userEvent.click(getByHook("chat-stop-button"))
    expect(first.frames).toContainEqual({
      v,
      type: "agent_cancel",
      conversationId,
    })
    expect(first.prompts()).toHaveLength(1)
    expect(getByHook("chat-queued-message-text")).toHaveTextContent(command)
    expect(input).toHaveValue("Unsent draft.")
    expect(queryByHook("chat-queued-send-now")).not.toBeInTheDocument()
    await act(() => {
      first.receive({
        v,
        type: "agent_turn_end",
        conversationId,
        turnId,
        result: { outcome: "completed", stopReason: "cancelled", usage: null },
      })
      return Promise.resolve()
    })
    expect(first.prompts()).toHaveLength(1)
    expect(getByHook("chat-queued-message-text")).toHaveTextContent(command)
    expect(input).toHaveValue("Unsent draft.")
    expect(screen.getByRole("img", { name: "Attachment 1" })).toHaveAttribute(
      "src",
      imageSource,
    )

    if (action === "Remove") {
      await userEvent.click(getByHook("chat-queued-remove"))
      expect(input).toHaveValue("Unsent draft.")
      expect(screen.getByRole("img", { name: "Attachment 1" })).toHaveAttribute(
        "src",
        imageSource,
      )
      expect(first.prompts()).toHaveLength(1)
    } else {
      await userEvent.clear(input)
      await userEvent.click(
        screen.getByRole("button", { name: "Remove image 1" }),
      )
      await userEvent.click(screen.getByRole("button", { name: "Edit" }))
      expect(input).toHaveValue(command)
      expect(first.prompts()).toHaveLength(1)
      await userEvent.click(
        screen.getByRole("button", { name: "Send message" }),
      )
      await waitFor(() => expect(first.prompts()).toHaveLength(2))
      expect(first.prompts()[1].prompt).toEqual([
        { type: "text", text: command },
      ])
      act(() => answer(first, "Reviewed the sample."))
      await screen.findByText("Reviewed the sample.")
    }
    expect(queryByHook("chat-queued-message")).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  },
)

it.each(["", "Circle"])(
  "Escape closes only the custom answer (draft: %j) and preserves earlier answers",
  async (draft) => {
    const { first } = await openNotebookChat()
    await sendMessage("Show a sample query.")
    await waitFor(() => expect(first.prompts()).toHaveLength(1))
    const { conversationId } = first.prompts()[0]
    act(() =>
      first.receive({
        v,
        type: "agent_question",
        requestId: "sample-question",
        conversationId,
        message: "Choose both display settings",
        fields: [
          {
            id: "color",
            kind: "choice",
            title: null,
            prompt: "Pick a color",
            options: [{ value: "blue", label: "Blue", description: null }],
            multiple: false,
            required: true,
            otherFieldId: null,
          },
          {
            id: "shape",
            kind: "choice",
            title: null,
            prompt: "Pick a shape",
            options: [{ value: "square", label: "Square", description: null }],
            multiple: false,
            required: true,
            otherFieldId: "custom-shape",
          },
        ],
      }),
    )
    await userEvent.click(screen.getByRole("radio", { name: /Blue/ }))
    await userEvent.click(
      screen.getByRole("radio", { name: /Type your own answer/ }),
    )
    const custom = screen.getByRole("textbox", { name: "Your own answer" })
    expect(custom).toHaveFocus()
    if (draft) await userEvent.type(custom, draft)
    await userEvent.keyboard("{Escape}")
    expect(custom).not.toBeInTheDocument()
    expect(getByHook("ai-chat-window")).toBeVisible()
    await userEvent.click(screen.getByRole("tab", { name: "Review" }))
    expect(
      screen.getByRole("button", { name: /Pick a color\s*Blue/ }),
    ).toBeVisible()
    expect(
      first.frames.some(({ type }) => type === "agent_question_answer"),
    ).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  },
)

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

// A message queued during an answer, then a full reconnect: the old channel
// is gone for good, and the agent that answers is `agent`.
const queueThenReplace = async (agent: typeof mockAgent) => {
  const { first, replace } = await openNotebookChat()
  await sendMessage("Show a sample query.")
  await waitFor(() => expect(first.prompts()).toHaveLength(1))
  const [{ conversationId }] = first.prompts()
  await sendMessage("Keep this follow-up.")
  expect(getByHook("chat-queued-message-text")).toHaveTextContent(
    "Keep this follow-up.",
  )
  const replacement = await replace(agent)
  await screen.findByText("The connection to Mock local agent was lost.")
  return { conversationId, replacement }
}

it("sends a queued message to the same agent after a full reconnect", async () => {
  // Given a follow-up queued while the agent answers
  // When the connection is replaced and the same agent comes back
  const { conversationId, replacement } = await queueThenReplace(mockAgent)

  // Then the follow-up goes to the new connection, in its chat
  await waitFor(() => expect(replacement.prompts()).toHaveLength(1))
  expect(replacement.prompts()[0].conversationId).toBe(conversationId)
  const sent = replacement.prompts()[0].prompt[0]
  expect(sent?.type === "text" && sent.text).toContain("Keep this follow-up.")
  expect(queryByHook("chat-queued-message")).not.toBeInTheDocument()
  act(() => answer(replacement, "Here is the follow-up."))
  await screen.findByText("Here is the follow-up.")
  expect(fetch).not.toHaveBeenCalled()
})

it("keeps a queued message for its agent when another agent connects", async () => {
  // Given a follow-up queued while the agent answers
  // When the connection is replaced and another agent answers
  const { replacement } = await queueThenReplace({
    id: "other-local",
    label: "Other local agent",
    cwd: "/tmp/other",
  })

  // Then the follow-up is not sent to it, and waits for the user
  expect(replacement.prompts()).toHaveLength(0)
  expect(getByHook("chat-queued-message")).toHaveTextContent(
    "Restore the original destination or edit the queued message.",
  )
  expect(fetch).not.toHaveBeenCalled()
})

it("does not resend a stopped turn to the agent that already received it", async () => {
  const { first } = await openNotebookChat()
  await sendMessage("Count from 1 to 3000.")
  await waitFor(() => expect(first.prompts()).toHaveLength(1))
  const { conversationId, turnId } = first.prompts()[0]
  act(() =>
    first.receive({
      v,
      conversationId,
      turnId,
      type: "agent_update",
      update: { kind: "message_chunk", messageId: "partial", text: "1 2 3" },
    }),
  )
  await screen.findByText("1 2 3")
  await userEvent.click(
    screen.getByRole("button", { name: "Stop AI generation" }),
  )
  await act(() => {
    first.receive({
      v,
      type: "agent_turn_end",
      conversationId,
      turnId,
      result: { outcome: "completed", stopReason: "cancelled", usage: null },
    })
    return Promise.resolve()
  })

  await sendMessage("What did I ask last?")
  await waitFor(() => expect(first.prompts()).toHaveLength(2))
  const next = first.prompts()[1].prompt[0]
  expect(next?.type === "text" && next.text).not.toContain(
    "<earlier_conversation>",
  )
  act(() => answer(first, "You asked me to count."))
  expect(await screen.findByText("You asked me to count.")).toBeVisible()
  expect(fetch).not.toHaveBeenCalled()
})

const promptText = (prompt: AgentPromptMessage | undefined) => {
  const block = prompt?.prompt[0]
  return block?.type === "text" ? block.text : ""
}

const endCancelled = (socket: MemorySocket, prompt: AgentPromptMessage) =>
  act(() => {
    socket.receive({
      v,
      type: "agent_turn_end",
      conversationId: prompt.conversationId,
      turnId: prompt.turnId,
      result: { outcome: "completed", stopReason: "cancelled", usage: null },
    })
    return Promise.resolve()
  })

it("does not repeat a request replaced before the agent's first update in the message sent now", async () => {
  // Given an answered message, and a request the agent has not started on
  const { first } = await openNotebookChat()
  await sendMessage("Show a sample query.")
  await waitFor(() => expect(first.prompts()).toHaveLength(1))
  act(() => answer(first, "Here is a sample query."))
  await screen.findByText("Here is a sample query.")
  await sendMessage("Count from 1 to 3000.")
  await waitFor(() => expect(first.prompts()).toHaveLength(2))
  const replaced = first.prompts()[1]

  // When the user sends the next message now, and the agent then ends the
  // replaced turn
  await sendMessage("Explain the sample query.")
  await userEvent.click(getByHook("chat-queued-send-now"))
  await waitFor(() =>
    expect(first.frames).toContainEqual({
      v,
      type: "agent_cancel",
      conversationId: replaced.conversationId,
    }),
  )
  await endCancelled(first, replaced)

  // Then the message goes to the agent without the replaced request, which
  // the agent already has
  await waitFor(() => expect(first.prompts()).toHaveLength(3))
  const text = promptText(first.prompts()[2])
  expect(text).toContain("Explain the sample query.")
  expect(text).not.toContain("<earlier_conversation>")
  expect(text).not.toContain("Count from 1 to 3000.")
  act(() => answer(first, "It selects one row."))
  expect(await screen.findByText("It selects one row.")).toBeVisible()
  expect(fetch).not.toHaveBeenCalled()
})

it("keeps that the agent read the earlier history when it ends a stopped request after the user left the chat", async () => {
  // Given a chat another model answered, open on the agent
  const { first, channel } = await openNotebookChat()
  const earlier = await seedChat("Earlier sample chat", {
    messages: [
      {
        id: "api-question",
        role: "user",
        content: "Which tables hold trades?",
        timestamp: Date.now(),
      },
      {
        id: "api-answer",
        role: "assistant",
        content: "The trades table.",
        timestamp: Date.now(),
      },
    ],
  })
  const other = await seedChat("Other sample chat")
  const openChat = async (name: string) => {
    await userEvent.click(getByHook("chat-window-history"))
    await userEvent.click(await screen.findByText(name))
    await waitFor(() => expect(getByHook("chat-input-textarea")).toBeVisible())
  }
  await openChat(earlier.conversationName)
  await screen.findByText("The trades table.")

  // When the user sends a request that carries that history, stops it before
  // the agent's first update, and opens another chat, where the agent ends
  // the stopped turn
  await sendMessage("Count the trades.")
  await waitFor(() => expect(first.prompts()).toHaveLength(1))
  const stopped = first.prompts()[0]
  expect(promptText(stopped)).toContain(
    "User: Which tables hold trades?\nAssistant: The trades table.",
  )
  await userEvent.click(
    screen.getByRole("button", { name: "Stop AI generation" }),
  )
  await openChat(other.conversationName)
  await endCancelled(first, stopped)

  // Then the chat's saved transcript keeps that the agent read the history
  await waitFor(async () => {
    const saved = await aiConversationStore.getMessages(earlier.id)
    expect(
      saved
        .filter((message) => message.role === "assistant")
        .map((message) => message.localAgentSessionId),
    ).toEqual([undefined, channel?.sessionId])
  })

  // And the next message in the chat repeats neither that history nor the
  // stopped request
  await openChat(earlier.conversationName)
  await sendMessage("Chart the trades.")
  await waitFor(() => expect(first.prompts()).toHaveLength(2))
  const text = promptText(first.prompts()[1])
  expect(text).toContain("Chart the trades.")
  expect(text).not.toContain("<earlier_conversation>")
  expect(text).not.toContain("Count the trades.")
  act(() => answer(first, "Here is a chart query."))
  expect(await screen.findByText("Here is a chart query.")).toBeVisible()
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

it.each(["reopen", "delete"])(
  "keeps Stop with its original chat when the bridge settles after switching (%s)",
  async (action) => {
    const { first, reconnect } = await openNotebookChat()
    const other = await seedChat("Other sample chat")
    await sendMessage("Summarize the sample notebook.")
    await waitFor(() => expect(first.prompts()).toHaveLength(1))
    const { conversationId, turnId } = first.prompts()[0]
    const partial = "The sample notebook contains a chart."
    const cancelled = "Operation has been cancelled"
    act(() =>
      first.receive({
        v,
        type: "agent_update",
        conversationId,
        turnId,
        update: {
          kind: "message_chunk",
          messageId: "sample-reply",
          text: partial,
        },
      }),
    )
    expect(await screen.findByText(partial)).toBeVisible()
    const second = reconnect()
    await userEvent.click(
      screen.getByRole("button", { name: "Stop AI generation" }),
    )
    expect(second.frames.map(({ type }) => type)).toEqual(["hello"])
    const original = await aiConversationStore.getMeta(conversationId)
    const otherMessages = await aiConversationStore.getMessages(other.id)
    const openHistory = () => userEvent.click(getByHook("chat-window-history"))
    await openHistory()
    await userEvent.click(await screen.findByText(other.conversationName))
    await waitFor(() => expect(getByHook("chat-input-textarea")).toBeVisible())
    expect(screen.queryByText(partial)).not.toBeInTheDocument()
    expect(queryByHook("chat-message-error")).not.toBeInTheDocument()
    expect(
      (await aiConversationStore.getMessages(conversationId)).at(-1),
    ).toMatchObject({
      content: partial,
      error: cancelled,
    })

    if (action === "delete") {
      await openHistory()
      const item = (
        await screen.findByText(original!.conversationName)
      ).closest('[data-hook="chat-history-item"]')!
      await userEvent.click(
        item.querySelector('[data-hook="chat-history-delete"]')!,
      )
      await userEvent.click(screen.getByRole("button", { name: "Delete" }))
      await waitFor(async () =>
        expect(
          await aiConversationStore.getMeta(conversationId),
        ).toBeUndefined(),
      )
    }

    await act(() => {
      ack(second, true)
      expect(
        second.frames.filter(({ type }) => type === "agent_cancel"),
      ).toEqual([{ v, type: "agent_cancel", conversationId }])
      second.receive({
        v,
        type: "agent_turn_end",
        conversationId,
        turnId,
        result: { outcome: "completed", stopReason: "cancelled", usage: null },
      })
      return Promise.resolve()
    })
    expect(await aiConversationStore.getMessages(other.id)).toEqual(
      otherMessages,
    )
    expect(queryByHook("chat-message-error")).not.toBeInTheDocument()
    if (action === "delete") {
      expect(await aiConversationStore.getMeta(conversationId)).toBeUndefined()
      expect(await aiConversationStore.getMessages(conversationId)).toEqual([])
    } else {
      await openHistory()
      await userEvent.click(await screen.findByText(original!.conversationName))
      await waitFor(() => expect(screen.getByText(partial)).toBeVisible())
      expect(getByHook("chat-message-error")).toHaveTextContent(cancelled)
      expect(getByHook("retry-button")).toBeEnabled()
    }
    expect(fetch).not.toHaveBeenCalled()
  },
)

it.each(["written", "stopped", "failed write"])(
  "consumes only notebook events actually sent by a waiting follow-up (%s)",
  async (outcome) => {
    const { bufferId, first } = await openNotebookChat()
    const emitDeletion = (cellId: string) =>
      emitUserAction({
        kind: "user_deleted_cell",
        bufferId,
        cellId,
      })
    await sendMessage("Show a sample query.")
    await waitFor(() => expect(first.prompts()).toHaveLength(1))
    const { conversationId, turnId } = first.prompts()[0]
    emitDeletion("first-sample-cell")
    await sendMessage("Explain the result.")
    await userEvent.click(getByHook("chat-queued-send-now"))
    await screen.findByText("Explain the result.")
    expect(queryByHook("chat-queued-message-text")).not.toBeInTheDocument()
    expect(first.prompts()).toHaveLength(1)
    emitDeletion("second-sample-cell")

    if (outcome === "stopped") {
      await userEvent.click(
        screen.getByRole("button", { name: "Stop AI generation" }),
      )
    } else if (outcome === "failed write") {
      vi.spyOn(first, "send").mockImplementationOnce(() => {
        throw new Error("Simulated write failure")
      })
    }
    await act(() => {
      first.receive({
        v,
        type: "agent_turn_end",
        conversationId,
        turnId,
        result: { outcome: "completed", stopReason: "cancelled", usage: null },
      })
      return Promise.resolve()
    })
    const promptText = (index: number) => {
      const block = first.prompts()[index]?.prompt[0]
      return block?.type === "text" ? block.text : undefined
    }
    if (outcome === "written") {
      await waitFor(() => expect(first.prompts()).toHaveLength(2))
      expect(promptText(1)).toContain("first-sample-cell")
      expect(promptText(1)).not.toContain("second-sample-cell")
      act(() => answer(first, "Sample explanation."))
      await waitFor(() =>
        expect(getByHook("chat-window-history")).toBeEnabled(),
      )
      await sendMessage("Show the remaining sample cells.")
    } else {
      expect(first.prompts()).toHaveLength(1)
      await waitFor(() => expect(getByHook("retry-button")).toBeEnabled())
      await userEvent.click(getByHook("retry-button"))
    }
    const nextIndex = outcome === "written" ? 2 : 1
    await waitFor(() => expect(first.prompts()).toHaveLength(nextIndex + 1))
    expect(promptText(nextIndex)).toContain("second-sample-cell")
    if (outcome === "written") {
      expect(promptText(nextIndex)).not.toContain("first-sample-cell")
    } else {
      expect(promptText(nextIndex)).toContain("first-sample-cell")
    }
    act(() => answer(first, "Completed sample answer."))
    expect(await screen.findByText("Completed sample answer.")).toBeVisible()
    expect(fetch).not.toHaveBeenCalled()
  },
)

// The chat harness fakes only Date; the Stop grace needs setTimeout too. User
// events wait on timers, so these steps click and type through the DOM, and
// let the app settle on real immediates.
const fakeStopGrace = () => {
  const now = Date.now()
  vi.useRealTimers()
  vi.useFakeTimers({ now, toFake: ["Date", "setTimeout", "clearTimeout"] })
  const settle = async (done: () => boolean) => {
    for (let i = 0; i < 200 && !done(); i++) {
      await act(() => new Promise<void>((resolve) => setImmediate(resolve)))
    }
    expect(done()).toBe(true)
  }
  const send = async (text: string) => {
    fireEvent.change(getByHook("chat-input-textarea"), {
      target: { value: text },
    })
    await settle(
      () => !(getByHook("chat-send-button") as HTMLButtonElement).disabled,
    )
    act(() => getByHook("chat-send-button").click())
  }
  const endGrace = () => act(() => vi.advanceTimersByTimeAsync(5000))
  return { settle, send, endGrace }
}

it.each(["Retry", "a new message"])(
  "keeps a message the bridge refuses while the agent stops, and its notebook events, for %s",
  async (next) => {
    // Given a running agent turn
    const { bufferId, first } = await openNotebookChat()
    await sendMessage("Show a sample query.")
    await waitFor(() => expect(first.prompts()).toHaveLength(1))
    const stopped = first.prompts()[0]
    const grace = fakeStopGrace()
    try {
      // When the user stops it, deletes a cell and sends a message, which the
      // bridge refuses: the agent did not end the stopped turn within the grace
      act(() => getByHook("chat-stop-button").click())
      emitUserAction({
        kind: "user_deleted_cell",
        bufferId,
        cellId: "sample-cell",
      })
      await grace.send("Explain the result.")
      await grace.settle(
        () => screen.queryByText("Explain the result.") !== null,
      )
      await grace.endGrace()
      await grace.settle(() => first.prompts().length === 2)
      const refused = first.prompts()[1]
      act(() =>
        first.receive({
          v,
          type: "agent_turn_end",
          conversationId: refused.conversationId,
          turnId: refused.turnId,
          result: {
            outcome: "failed",
            error: "The agent is still answering the previous message.",
          },
        }),
      )
    } finally {
      vi.useRealTimers()
    }

    // Then the chat says the agent is still stopping, and offers Retry
    await waitFor(() =>
      expect(
        Array.from(
          document.querySelectorAll('[data-hook="chat-message-error"]'),
          (error) => error.textContent,
        ),
      ).toEqual([
        "Operation has been cancelled",
        "Mock local agent is still stopping the previous answer. Send your message again in a moment.Retry",
      ]),
    )
    expect(getByHook("retry-button")).toBeEnabled()

    // And once the agent ends the stopped turn, the next prompt carries the
    // deleted cell. The agent never read the refused message: Retry sends it
    // again, and a new message does not repeat it.
    act(() =>
      first.receive({
        v,
        type: "agent_turn_end",
        conversationId: stopped.conversationId,
        turnId: stopped.turnId,
        result: { outcome: "completed", stopReason: "cancelled", usage: null },
      }),
    )
    if (next === "Retry") await userEvent.click(getByHook("retry-button"))
    else await sendMessage("So, the chart?")
    await waitFor(() => expect(first.prompts()).toHaveLength(3))
    const text = promptText(first.prompts()[2])
    expect(text).toContain("sample-cell")
    expect(text).not.toContain("<earlier_conversation>")
    expect(text).not.toContain("Show a sample query.")
    if (next === "Retry") expect(text).toContain("Explain the result.")
    else expect(text).not.toContain("Explain the result.")
    act(() => answer(first, "Sample explanation."))
    expect(await screen.findByText("Sample explanation.")).toBeVisible()
    expect(fetch).not.toHaveBeenCalled()
  },
)

it("sends a message waiting on a stopped turn once the bridge reconnects", async () => {
  // Given a running agent turn, and a message queued behind it
  const { first, reconnect } = await openNotebookChat()
  await sendMessage("Show a sample query.")
  await waitFor(() => expect(first.prompts()).toHaveLength(1))
  const stopped = first.prompts()[0]
  await sendMessage("Explain the result.")
  const grace = fakeStopGrace()
  let second: MemorySocket
  try {
    // When the user sends it now, and the bridge socket drops until after the
    // stopped turn's grace
    act(() => getByHook("chat-queued-send-now").click())
    await grace.settle(
      () =>
        screen.queryByText("Explain the result.") !== null &&
        queryByHook("chat-queued-message-text") === null,
    )
    second = reconnect()
    await grace.endGrace()
    expect(queryByHook("chat-message-error")).not.toBeInTheDocument()
    act(() => ack(second, true))
    await grace.settle(() => second.prompts().length === 1)
  } finally {
    vi.useRealTimers()
  }

  // Then the message goes out on the new socket, after the replayed Stop
  expect(first.prompts()).toHaveLength(1)
  expect(second.frames.map(({ type }) => type)).toEqual([
    "hello",
    "agent_settings",
    "agent_cancel",
    "agent_prompt",
  ])
  expect(JSON.stringify(second.prompts()[0].prompt)).toContain(
    "Explain the result.",
  )
  act(() =>
    second.receive({
      v,
      type: "agent_turn_end",
      conversationId: stopped.conversationId,
      turnId: stopped.turnId,
      result: { outcome: "completed", stopReason: "cancelled", usage: null },
    }),
  )
  act(() => answer(second, "Sample explanation."))
  expect(await screen.findByText("Sample explanation.")).toBeVisible()
  expect(queryByHook("chat-message-error")).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})
