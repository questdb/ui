// @vitest-environment jsdom
import React from "react"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
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
import { db } from "../../../src/store/db"
import { mcpTools } from "../../../src/utils/tools/tools"
import { dispatchMCPTool } from "../../../src/utils/mcp/dispatchMCPTool"
import { STATE_STALE_MESSAGE } from "../../../src/utils/notebooks/notebookToolMessages"
import {
  registerWorkspace,
  signalUserEdit,
  unregisterWorkspace,
} from "../../../src/utils/notebooks/notebookAIBridge"

// Observes whether a call reaches the dispatcher; it still runs for real.
vi.mock("../../../src/utils/mcp/dispatchMCPTool", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../src/utils/mcp/dispatchMCPTool")
    >()
  return { ...actual, dispatchMCPTool: vi.fn(actual.dispatchMCPTool) }
})

// The answer to a call of a turn the user stopped.
const STOPPED_CALL_RESULT = {
  v,
  type: "tool_result",
  content: [
    {
      type: "text",
      text: "CANCELLED: the user stopped this turn, so the call did not run.",
    },
  ],
  isError: true,
}

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
    // The user types in the cell, which stales the agent's earlier reads.
    userEdit: (value: string) => {
      state.parts = {
        ...state.parts,
        cells: [{ ...state.parts.cells[0], value }],
      }
      signalUserEdit(BUFFER)
    },
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

const callOf = (
  name: string,
  requestId: string,
  args: Record<string, unknown> = { buffer_id: BUFFER },
) => ({
  v,
  type: "tool_call",
  requestId,
  name,
  arguments: args,
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
    const { connect, setPermissions } = useMCPBridge()
    return (
      <>
        <Button onClick={() => connect("ws://mock.invalid", "mock-token")}>
          Connect fake bridge
        </Button>
        <Button
          onClick={() =>
            setPermissions({ grantSchemaAccess: true, read: true, write: true })
          }
        >
          Grant write
        </Button>
      </>
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

    // Then neither edit lands: the one in flight is dropped, and the late one
    // is answered as cancelled
    expect(socket.frames.some((f) => f.type === "agent_cancel")).toBe(true)
    expect(resultOf(socket, "before-stop")).toBeUndefined()
    expect(resultOf(socket, "while-stopping")).toEqual({
      ...STOPPED_CALL_RESULT,
      requestId: "while-stopping",
    })
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

      // Then neither the edit nor the query runs, and both are answered as
      // cancelled
      expect(resultOf(socket, "stopped-edit")).toEqual({
        ...STOPPED_CALL_RESULT,
        requestId: "stopped-edit",
      })
      expect(resultOf(socket, "stopped-query")).toEqual({
        ...STOPPED_CALL_RESULT,
        requestId: "stopped-query",
      })
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

it.each([
  ["arrives after Stop", STOPPED_CALL_RESULT],
  ["is in flight at Stop", undefined],
])(
  "keeps the user's actions for the next result when a stopped turn's call %s",
  async (when, stoppedResult) => {
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

    // When the stopped turn's call gets no result with the actions, and the
    // agent then asks again
    const call = () => socket.receive(runQueryCall("stopped", "SELECT 1"))
    act(() => {
      if (when === "arrives after Stop") {
        stop.abort()
        call()
      } else {
        call()
        stop.abort()
      }
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
    expect(resultOf(socket, "stopped")).toEqual(
      stoppedResult && { ...stoppedResult, requestId: "stopped" },
    )
    expect(resultOf(socket, "delivered")?.content[0].text).toContain(
      "added: [c2]",
    )
  },
)

// Starts a local-agent turn on conv-1 that the user can stop.
const startStoppableTurn = (
  socket: MemorySocket,
  notebookRead: { bufferId: number; readSeq: number } | null = null,
) => {
  const stop = new AbortController()
  void getLocalAgentChannel()!.prompt({
    conversationId: "conv-1",
    text: "work on the notebook",
    notebookRead,
    signal: stop.signal,
    onUpdate: () => undefined,
    onToolStatus: () => undefined,
  })
  const prompt = socket.frames.filter((f) => f.type === "agent_prompt").at(-1)
  const end = () =>
    act(() => {
      socket.receive({
        v,
        type: "agent_turn_end",
        conversationId: "conv-1",
        turnId: prompt?.turnId,
        result: { outcome: "completed", stopReason: "cancelled", usage: null },
      })
    })
  return { stop: () => stop.abort(), end }
}

describe.each(mcpTools.map(({ name }) => name))(
  "a stopped turn's %s call",
  (name) => {
    it("is answered as cancelled and never dispatched", async () => {
      // Given a turn the user stopped, which the agent has not ended yet
      const socket = await connectLocalAgent()
      const turn = startStoppableTurn(socket, {
        bufferId: BUFFER,
        readSeq: getBufferActionSeq(BUFFER),
      })
      act(() => turn.stop())
      vi.mocked(dispatchMCPTool).mockClear()

      // When the agent still calls the tool
      act(() => socket.receive(callOf(name, "late")))
      await act(flush)

      // Then the call is answered as cancelled, and nothing of it runs
      expect(resultOf(socket, "late")).toEqual({
        ...STOPPED_CALL_RESULT,
        requestId: "late",
      })
      expect(dispatchMCPTool).not.toHaveBeenCalled()
    })
  },
)

it.each([
  ["delete_notebook", "deleteNotebook"],
  ["activate_notebook", "activateNotebook"],
] as const)(
  "keeps a stopped turn's %s from changing the workspace",
  async (name, method) => {
    // Given a turn the user stopped, which read the notebook it works on
    const workspace = {
      createNotebook: vi.fn(),
      duplicateNotebook: vi.fn(),
      deleteNotebook: vi.fn(() => Promise.resolve()),
      activateNotebook: vi.fn(() => Promise.resolve(true)),
      listNotebookBuffers: () => [],
    }
    registerWorkspace(workspace)
    try {
      const socket = await connectLocalAgent()
      const turn = startStoppableTurn(socket, {
        bufferId: BUFFER,
        readSeq: getBufferActionSeq(BUFFER),
      })
      act(() => turn.stop())

      // When the agent still calls the tool, then ends the stopped turn
      act(() => socket.receive(callOf(name, "late")))
      await act(flush)
      const calledBeforeEnd = workspace[method].mock.calls.length
      turn.end()
      act(() => socket.receive(callOf(name, "after-end")))
      await act(flush)

      // Then only the call after the end reaches the workspace
      expect(calledBeforeEnd).toBe(0)
      expect(workspace[method]).toHaveBeenCalledOnce()
      expect(resultOf(socket, "after-end")?.isError).toBe(false)
    } finally {
      unregisterWorkspace()
    }
  },
)

it("keeps a read in flight at Stop from vouching for the next turn's edit", async () => {
  // Given the agent read a notebook its chat is not bound to, and the user
  // then edited the cell
  await db.buffers.put({
    id: BUFFER,
    label: "Sample notebook",
    value: "",
    position: 0,
    notebookViewState: { cells: [{ id: "c", position: 0, value: "ORIGINAL" }] },
  })
  const socket = await connectLocalAgent()
  const live = mountLive()
  try {
    const turn = startStoppableTurn(socket)
    act(() => socket.receive(callOf("get_notebook_state", "read")))
    await waitFor(() => expect(resultOf(socket, "read")?.isError).toBe(false))
    live.userEdit("USER-EDIT")

    // When the agent reads it again as the user stops the turn, and edits the
    // cell in the next turn without reading it
    act(() => {
      socket.receive(callOf("get_notebook_state", "stopped-read"))
      turn.stop()
    })
    const stoppedRead = vi.mocked(dispatchMCPTool).mock.results.at(-1)
      ?.value as ReturnType<typeof dispatchMCPTool>
    await act(() => stoppedRead)
    turn.end()
    startStoppableTurn(socket)
    act(() => socket.receive(toolCall("edit", "AGENT-FROM-ORIGINAL")))
    await act(flush)

    // Then the read never reached the agent, the edit is refused as stale, and
    // the user's edit stays
    expect(resultOf(socket, "stopped-read")).toBeUndefined()
    expect(resultOf(socket, "edit")).toMatchObject({ isError: true })
    expect(resultOf(socket, "edit")?.content[0].text).toContain(
      STATE_STALE_MESSAGE,
    )
    expect(live.value()).toBe("USER-EDIT")
  } finally {
    live.release()
  }
})

const PERMISSIONS_NOTICE =
  /^\[Permissions updated since last call: read=true, write=true\./

const stubQueries = () => {
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
    queryId: 44,
  })) as unknown as typeof questClient.queryRaw)
}

describe.each(mcpTools.map(({ name }) => name))(
  "a %s call in flight when the user stops its turn",
  (name) => {
    it("leaves the permission notice for the next result that is sent", async () => {
      // Given the user granted write while a turn runs
      stubQueries()
      const socket = await connectLocalAgent()
      const turn = startStoppableTurn(socket)
      await userEvent.click(screen.getByRole("button", { name: "Grant write" }))

      // When a call of the turn is in flight as the user stops it, and the
      // next turn calls a tool
      act(() => {
        socket.receive(callOf(name, "in-flight"))
        turn.stop()
      })
      await act(flush)
      turn.end()
      startStoppableTurn(socket)
      act(() => socket.receive(runQueryCall("delivered", "SELECT 2")))
      await act(flush)

      // Then the stopped call gets no result, and the next one tells the
      // agent about the change
      expect(resultOf(socket, "in-flight")).toBeUndefined()
      expect(resultOf(socket, "delivered")?.content[0].text).toMatch(
        PERMISSIONS_NOTICE,
      )
    })
  },
)

it("leaves the permission notice for the next result when the bridge cancels a call", async () => {
  // Given the user granted write while the agent's call runs
  stubQueries()
  const socket = await connectLocalAgent()
  await userEvent.click(screen.getByRole("button", { name: "Grant write" }))
  // An agent working from the terminal names no conversation.
  const terminalCall = (requestId: string, sql: string) => {
    const { conversationId: _, ...call } = runQueryCall(requestId, sql)
    return call
  }

  // When the bridge cancels that call, and the agent calls again
  act(() => {
    socket.receive(terminalCall("cancelled", "SELECT 1"))
    socket.receive({ v, type: "cancel", requestId: "cancelled" })
  })
  await act(flush)
  act(() => socket.receive(terminalCall("delivered", "SELECT 2")))
  await act(flush)

  // Then the cancelled call gets no result, and the next one carries the notice
  expect(resultOf(socket, "cancelled")).toBeUndefined()
  expect(resultOf(socket, "delivered")?.content[0].text).toMatch(
    PERMISSIONS_NOTICE,
  )
})
