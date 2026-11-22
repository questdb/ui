// @vitest-environment jsdom
import React from "react"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { ThemeProvider } from "styled-components"
import { fixtures } from "../ai/support/chatHarness"
import { darkTheme } from "../../../src/theme"
import { Button } from "../../../src/components/Button"
import { TooltipProvider } from "../../../src/components/Tooltip"
import rootReducer from "../../../src/store/reducers"
import { LocalStorageProvider } from "../../../src/providers/LocalStorageProvider"
import { AIConversationProvider } from "../../../src/providers/AIConversationProvider"
import { AIStatusProvider } from "../../../src/providers/AIStatusProvider"
import {
  MCPBridgeProvider,
  useMCPBridge,
} from "../../../src/providers/MCPBridgeProvider"
import { getLocalAgentChannel } from "../../../src/utils/localAgent/localAgentChannel"
import { LOCAL_AGENT_MODEL } from "../../../src/utils/localAgent/localAgentModel"
import { EXPECTED_MCP_VERSION as v } from "../../../src/utils/mcp/protocolVersion"
import {
  registerController,
  unregisterController,
  type NotebookController,
} from "../../../src/utils/notebooks/notebookController"
import type { ViewParts } from "../../../src/utils/notebooks/notebookDexieView"
import { getBufferActionSeq } from "../../../src/utils/notebooks/notebookAIBridge"

const sockets: MemorySocket[] = []
class MemorySocket extends EventTarget {
  static OPEN = 1
  readyState = 0
  frames: Array<Record<string, unknown> & { type: string }> = []
  constructor() {
    super()
    sockets.push(this)
  }
  open() {
    this.readyState = MemorySocket.OPEN
    this.dispatchEvent(new Event("open"))
  }
  send(data: string) {
    this.frames.push(
      JSON.parse(data) as Record<string, unknown> & { type: string },
    )
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
}

const BUFFER = 9101
const mountLive = () => {
  const state: { parts: ViewParts } = {
    parts: {
      cells: [{ id: "c", position: 0, value: "ORIGINAL" }],
      settings: {},
      maximizedCellId: null,
      focusedCellId: null,
    },
  }
  const controller: NotebookController = {
    bufferId: BUFFER,
    kind: "live",
    mutate: (transition) => {
      try {
        const out = transition(state.parts)
        state.parts = out.parts
        return Promise.resolve(out.result)
      } catch (error) {
        return Promise.reject(error)
      }
    },
    mutateWithResultStatus: (transition) =>
      controller.mutate((parts) => transition(parts, () => "unrequested")),
    readView: () =>
      Promise.resolve({
        cells: state.parts.cells,
        settings: state.parts.settings,
        maximizedCellId: state.parts.maximizedCellId ?? undefined,
      }),
    runCell: () =>
      Promise.resolve({ success: true, queryCount: 1, results: ["success"] }),
    flushChartSnapshots: () => Promise.resolve(),
  } as NotebookController
  registerController(controller)
  return {
    value: () => state.parts.cells[0].value,
    release: () => unregisterController(BUFFER),
  }
}

const toolCall = (requestId: string, value: string) => ({
  v,
  type: "tool_call",
  requestId,
  name: "update_cell",
  arguments: { buffer_id: BUFFER, cell_id: "c", value },
  deadlineMs: null,
  conversationId: "conv-1",
})

const resultOf = (socket: MemorySocket, requestId: string) =>
  socket.frames.find(
    (f) => f.type === "tool_result" && f.requestId === requestId,
  ) as { isError: boolean; content: Array<{ text: string }> } | undefined

const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve()
}

it("keeps notebook tool calls of a stopped local-agent turn from changing the notebook", async () => {
  sockets.length = 0
  vi.stubGlobal("WebSocket", MemorySocket)
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
  localStorage.setItem(
    "ai.assistant.settings",
    JSON.stringify({
      ...JSON.parse(
        fixtures.getOpenAIConfiguredSettings()["ai.assistant.settings"],
      ),
      selectedModel: LOCAL_AGENT_MODEL,
    }),
  )
  const Probe = () => {
    const { connect } = useMCPBridge()
    return (
      <Button onClick={() => connect("ws://mock.invalid", "mock-token")}>
        Connect fake bridge
      </Button>
    )
  }
  render(
    <ThemeProvider theme={darkTheme}>
      <TooltipProvider>
        <Provider store={createStore(rootReducer)}>
          <LocalStorageProvider>
            <AIConversationProvider>
              <MCPBridgeProvider>
                <AIStatusProvider>
                  <Probe />
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
  const [socket] = sockets
  act(() => {
    socket.open()
    socket.receive({
      v,
      type: "hello_ack",
      sessionId: "memory-session",
      seenToolCount: 0,
      resumed: false,
      agent: { id: "mock-local", label: "Mock local agent", cwd: "/tmp/mock" },
    })
    socket.receive({
      v,
      type: "agent_status",
      state: "ready",
      config: null,
      error: null,
    })
  })
  const channel = getLocalAgentChannel()
  expect(channel).not.toBeNull()
  const live = mountLive()
  vi.useRealTimers()
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
  try {
    const stop = new AbortController()
    const turn = channel!.prompt({
      conversationId: "conv-1",
      text: "edit the cell",
      notebookRead: { bufferId: BUFFER, readSeq: getBufferActionSeq(BUFFER) },
      signal: stop.signal,
      onUpdate: () => undefined,
      onToolStatus: () => undefined,
    })
    const settled = vi.fn()
    void turn.then(settled)

    // A call received while the turn runs, still pending at Stop.
    act(() => {
      socket.receive(toolCall("before-stop", "BEFORE-STOP"))
      stop.abort() // the user's Stop / Send-now
    })
    await act(flush)
    expect(live.value()).toBe("ORIGINAL")
    expect(socket.frames.some((f) => f.type === "agent_cancel")).toBe(true)
    expect(settled).not.toHaveBeenCalled() // turn is `stopping`

    // A late call from the stopped turn, while the agent has not ended it.
    act(() => {
      socket.receive(toolCall("while-stopping", "WHILE-STOPPING"))
    })
    await act(flush)
    expect(resultOf(socket, "while-stopping")).toBeUndefined()
    expect(live.value()).toBe("ORIGINAL")

    // The local grace settles the turn before the agent confirms the cancel.
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(settled).toHaveBeenCalledWith(
      expect.objectContaining({ stopReason: "cancelled" }),
    )
    act(() => {
      socket.receive(toolCall("after-grace", "AFTER-GRACE"))
    })
    await act(flush)
    expect(resultOf(socket, "after-grace")).toBeUndefined()
    expect(live.value()).toBe("ORIGINAL")

    // Once the agent ends the stopped turn, the same harness commits.
    const prompt = socket.frames.find((f) => f.type === "agent_prompt")
    act(() => {
      socket.receive({
        v,
        type: "agent_turn_end",
        conversationId: "conv-1",
        turnId: prompt?.turnId,
        result: { outcome: "completed", stopReason: "cancelled", usage: null },
      })
      socket.receive(toolCall("after-end", "AFTER-END"))
    })
    await act(flush)
    expect(resultOf(socket, "after-end")?.isError).toBe(false)
    expect(live.value()).toBe("AFTER-END")
  } finally {
    vi.useRealTimers()
    live.release()
  }
})
