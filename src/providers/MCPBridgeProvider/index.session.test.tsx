import "../../test/stubBrowserGlobals"
import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, expect, it, vi } from "vitest"
import { authSessionState } from "../../modules/OAuth2/ssoAuthState"
import {
  createModelToolsClient,
  type ModelToolsClient,
} from "../../utils/ai/aiAssistant"
import { EXPECTED_MCP_VERSION } from "../../utils/mcp/protocolVersion"
import type { AnyMessage, ToolResultMessage } from "../../utils/mcp/types"
import { Client } from "../../utils/questdb/client"
import { clearStatementClassCache } from "../../utils/tools/permissions"
import { UNVERIFIED_RUN_NOTE } from "../../scenes/Editor/Notebook/notebookUtils"
import { QuestContext } from "../QuestProvider"
import { MCPBridgeProvider, useMCPBridge } from "."

const mocks = vi.hoisted(() => ({
  tools: undefined as ModelToolsClient | undefined,
}))

vi.mock("../QuestProvider", async () => {
  const { createContext } = await import("react")
  return { QuestContext: createContext(null) }
})
vi.mock("../LocalStorageProvider", () => ({
  useLocalStorage: () => ({
    notebookOnboarding: { mcpEverConnected: true },
    updateNotebookOnboarding: () => {},
  }),
}))
vi.mock("./useBridgeToolRunner", () => ({
  useBridgeToolRunner: () => ({
    modelToolsClient: mocks.tools,
    metaToolContext: {
      getActiveBufferId: () => null,
      getWorkspace: () => null,
      getDigest: () => null,
      consumeDigest: () => null,
    },
  }),
}))
vi.mock("./PairingConsentModal", () => ({ PairingConsentModal: () => null }))
vi.mock("../../modules/ConsoleEventTracker", () => ({
  trackEvent: () => Promise.resolve(),
}))
vi.mock("../../utils/mcp/consumePendingPair", () => ({
  consumePendingPairFromUrl: () => false,
}))
vi.mock("../../utils/mcp/mcpBridgeStorage", () => ({
  clearLegacyLocalStorage: () => {},
  clearPendingPair: () => {},
  markPendingPairConsented: () => {},
  readPendingPair: () => null,
  readPermissions: () => ({ grantSchemaAccess: true, read: true, write: true }),
  writePendingPair: () => {},
  writePermissions: () => {},
}))

class FakeWebSocket extends EventTarget {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static latest: FakeWebSocket
  readyState = FakeWebSocket.CONNECTING
  onSend?: (data: string) => void

  constructor(_url: string) {
    super()
    FakeWebSocket.latest = this
  }

  send(data: string) {
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error("Socket closed")
    this.onSend?.(data)
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
    this.dispatchEvent(new Event("close"))
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.dispatchEvent(new Event("open"))
  }

  receive(payload: unknown) {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(payload) }),
    )
  }
}

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  mocks.tools = undefined
  authSessionState.endSession()
  clearStatementClassCache()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("warns MCP that an INSERT outcome is unverified when its session ends before passive teardown", async () => {
  authSessionState.setAuthPayload({ access_token: "old", token_type: "Bearer" })
  const quest = new Client()
  vi.spyOn(quest, "validateQuery").mockResolvedValue({ queryType: "INSERT" })
  mocks.tools = createModelToolsClient(quest)
  vi.stubGlobal("WebSocket", FakeWebSocket)
  let bridge!: ReturnType<typeof useMCPBridge>
  const Consumer = () => {
    bridge = useMCPBridge()
    return null
  }
  act(() => {
    renderer = create(
      <QuestContext.Provider value={{ quest } as never}>
        <MCPBridgeProvider>
          <Consumer />
        </MCPBridgeProvider>
      </QuestContext.Provider>,
    )
  })
  act(() => bridge.connect("ws://127.0.0.1:57123", "pairing-token"))
  const socket = FakeWebSocket.latest
  act(() => {
    socket.open()
    socket.receive({
      v: EXPECTED_MCP_VERSION,
      type: "hello_ack",
      sessionId: "s1",
      heartbeatIntervalMs: 5000,
      seenToolCount: 1,
    })
  })
  let finish!: (response: Response) => void
  const requestStarted = new Promise<void>((started) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve
            started()
          }),
      ),
    )
  })
  const toolResultSent = new Promise<ToolResultMessage>((resolve) => {
    socket.onSend = (data) => {
      const message = JSON.parse(data) as AnyMessage
      if (message.type === "tool_result") resolve(message)
    }
  })
  socket.receive({
    v: EXPECTED_MCP_VERSION,
    type: "tool_call",
    requestId: "insert1",
    name: "run_query",
    arguments: { sql: "INSERT INTO t VALUES (1)" },
    deadlineMs: 15_000,
  })
  await requestStarted

  authSessionState.endSession()
  // AuthProvider replaces the ready subtree synchronously. Do not use act:
  // the bridge's passive abort/disconnect has not happened at this point.
  renderer!.update(<div>Sign in</div>)
  finish(new Response(JSON.stringify({ dml: "OK" })))
  const result = await toolResultSent

  expect(socket.readyState).toBe(FakeWebSocket.OPEN)
  expect(result.isError).toBe(true)
  expect(JSON.parse(result.content[0].text)).toEqual({
    error: "Your session has ended. Please sign in again.",
    position: -1,
    unverified: true,
    note: UNVERIFIED_RUN_NOTE,
  })
})
