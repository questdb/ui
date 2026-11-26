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
import {
  emitUserAction,
  getBufferActionSeq,
} from "../../../src/utils/notebooks/notebookAIBridge"
import { questClient } from "../../../src/utils/questdb/queryClient"

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

const runQueryCall = (requestId: string, sql: string) => ({
  v,
  type: "tool_call",
  requestId,
  name: "run_query",
  arguments: { sql, limit: null },
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

// The chat harness already fakes Date, and Vitest keeps the first fake-timer
// setup, so faking the timeouts needs the real timers back first.
const fakeTimeouts = () => {
  vi.useRealTimers()
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
}

const connectLocalAgent = async () => {
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
  return socket
}

it("keeps notebook tool calls of a stopped local-agent turn from changing the notebook", async () => {
  // Given a local-agent turn that edits a live notebook
  const socket = await connectLocalAgent()
  const live = mountLive()
  try {
    const stop = new AbortController()
    void getLocalAgentChannel()!.prompt({
      conversationId: "conv-1",
      text: "edit the cell",
      notebookRead: { bufferId: BUFFER, readSeq: getBufferActionSeq(BUFFER) },
      signal: stop.signal,
      onUpdate: () => undefined,
      onToolStatus: () => undefined,
    })

    // When the user stops it with one edit pending and the agent sends another
    act(() => {
      socket.receive(toolCall("before-stop", "BEFORE-STOP"))
      stop.abort()
    })
    act(() => {
      socket.receive(toolCall("while-stopping", "WHILE-STOPPING"))
    })
    await act(flush)

    // Then neither edit lands, and none is answered
    expect(socket.frames.some((f) => f.type === "agent_cancel")).toBe(true)
    expect(resultOf(socket, "while-stopping")).toBeUndefined()
    expect(live.value()).toBe("ORIGINAL")

    // And once the agent ends the stopped turn, edits commit again
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
    live.release()
  }
})

it("stops the queries of a stopped local-agent turn", async () => {
  // Given a local-agent turn whose first query is still running
  vi.spyOn(questClient, "validateQuery").mockResolvedValue({
    query: "",
    columns: [],
    timestamp: -1,
  })
  const executedSql: string[] = []
  vi.spyOn(questClient, "queryRaw").mockImplementation(((sql: string) => {
    executedSql.push(sql)
    return { promise: new Promise(() => undefined), queryId: 41 }
  }) as unknown as typeof questClient.queryRaw)
  const abortQuery = vi.spyOn(questClient, "abort").mockImplementation(() => {})
  const socket = await connectLocalAgent()
  fakeTimeouts()
  const stop = new AbortController()
  void getLocalAgentChannel()!.prompt({
    conversationId: "conv-1",
    text: "inspect trades",
    notebookRead: null,
    signal: stop.signal,
    onUpdate: () => undefined,
    onToolStatus: () => undefined,
  })
  act(() => {
    socket.receive(runQueryCall("running", "SELECT * FROM trades"))
  })
  await act(flush)
  expect(executedSql).toEqual(["SELECT * FROM trades"])

  // When the user stops the turn, and the agent sends more queries, also
  // after the local grace ended without the agent confirming the cancel
  act(() => stop.abort())
  act(() => {
    socket.receive(runQueryCall("late", "SELECT count() FROM trades"))
  })
  await act(flush)
  await act(() => vi.advanceTimersByTimeAsync(5000))
  act(() => {
    socket.receive(runQueryCall("after-grace", "SELECT max(price) FROM trades"))
  })
  await act(flush)
  vi.useRealTimers()

  // Then the running query is cancelled and the late ones never run
  expect(abortQuery).toHaveBeenCalledWith(41)
  expect(executedSql).toEqual(["SELECT * FROM trades"])
})

it.each([
  ["before the bridge answers it", false],
  ["after the bridge rejects it", true],
])(
  "keeps a stopped turn's late edits and queries out of the next message's turn %s",
  async (_, rejectNext) => {
    // Given a stopped local-agent turn whose agent did not confirm the cancel
    // within the local grace
    vi.spyOn(questClient, "validateQuery").mockResolvedValue({
      query: "",
      columns: [],
      timestamp: -1,
    })
    const executedSql: string[] = []
    vi.spyOn(questClient, "queryRaw").mockImplementation(((sql: string) => {
      executedSql.push(sql)
      return { promise: new Promise(() => undefined), queryId: 43 }
    }) as unknown as typeof questClient.queryRaw)
    const socket = await connectLocalAgent()
    const live = mountLive()
    fakeTimeouts()
    try {
      const channel = getLocalAgentChannel()!
      const stop = new AbortController()
      const stopped = channel.prompt({
        conversationId: "conv-1",
        text: "edit the cell",
        notebookRead: {
          bufferId: BUFFER,
          readSeq: getBufferActionSeq(BUFFER),
        },
        signal: stop.signal,
        onUpdate: () => undefined,
        onToolStatus: () => undefined,
      })
      act(() => stop.abort())
      await act(() => vi.advanceTimersByTimeAsync(5000))
      await expect(stopped).resolves.toMatchObject({ stopReason: "cancelled" })

      // When the user sends the next message, and the stopped turn's agent
      // still edits the cell and runs a query
      void channel.prompt({
        conversationId: "conv-1",
        text: "next message",
        notebookRead: null,
        onUpdate: () => undefined,
        onToolStatus: () => undefined,
      })
      const [stoppedPrompt, nextPrompt] = socket.frames.filter(
        (f) => f.type === "agent_prompt",
      )
      expect(nextPrompt).toBeDefined()
      act(() => {
        if (rejectNext) {
          socket.receive({
            v,
            type: "agent_turn_end",
            conversationId: "conv-1",
            turnId: nextPrompt.turnId,
            result: {
              outcome: "failed",
              error: "The agent is still answering the previous message.",
            },
          })
        }
        socket.receive(toolCall("stopped-edit", "STOPPED-TURN-EDIT"))
        socket.receive(
          runQueryCall("stopped-query", "SELECT count() FROM trades"),
        )
      })
      await act(flush)

      // Then neither the edit nor the query runs
      expect(resultOf(socket, "stopped-edit")).toBeUndefined()
      expect(live.value()).toBe("ORIGINAL")
      expect(executedSql).toEqual([])

      // And once the agent ends the stopped turn, edits commit again
      act(() => {
        socket.receive({
          v,
          type: "agent_turn_end",
          conversationId: "conv-1",
          turnId: stoppedPrompt.turnId,
          result: {
            outcome: "completed",
            stopReason: "cancelled",
            usage: null,
          },
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
  },
)

it("keeps the user's actions for the next result when a stopped call drops its own", async () => {
  // Given the user added a cell while a local-agent turn runs
  vi.spyOn(questClient, "validateQuery").mockResolvedValue({
    query: "",
    columns: [],
    timestamp: -1,
  })
  vi.spyOn(questClient, "queryRaw").mockImplementation((() => ({
    promise: Promise.resolve({
      type: "dql",
      columns: [],
      dataset: [],
      count: 0,
    }),
    queryId: 42,
  })) as unknown as typeof questClient.queryRaw)
  const socket = await connectLocalAgent()
  const stop = new AbortController()
  void getLocalAgentChannel()!.prompt({
    conversationId: "conv-1",
    text: "inspect trades",
    notebookRead: null,
    signal: stop.signal,
    onUpdate: () => undefined,
    onToolStatus: () => undefined,
  })
  emitUserAction({ kind: "user_added_cell", bufferId: BUFFER, cellId: "c2" })

  // When the stopped turn's call is dropped, and the agent then asks again
  act(() => stop.abort())
  act(() => {
    socket.receive(runQueryCall("dropped", "SELECT 1"))
  })
  await act(flush)
  const prompt = socket.frames.find((f) => f.type === "agent_prompt")
  act(() => {
    socket.receive({
      v,
      type: "agent_turn_end",
      conversationId: "conv-1",
      turnId: prompt?.turnId,
      result: { outcome: "completed", stopReason: "cancelled", usage: null },
    })
    socket.receive(runQueryCall("delivered", "SELECT 2"))
  })
  await act(flush)

  // Then the delivered result still tells the agent about the new cell
  expect(resultOf(socket, "dropped")).toBeUndefined()
  expect(resultOf(socket, "delivered")?.content[0].text).toContain(
    "added: [c2]",
  )
})
