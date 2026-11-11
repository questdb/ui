// @vitest-environment jsdom
import {
  renderComponent,
  getHook,
  findHook,
  queryHook,
  requestUrl,
} from "../../../src/test/component"
import React from "react"
import { act, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { LocalStorageProvider } from "../../../src/providers/LocalStorageProvider"
import { MCPBridgeProvider } from "../../../src/providers/MCPBridgeProvider"
import { MCPBridgeStatus } from "../../../src/scenes/Footer/MCPBridgeStatus"
import rootReducer from "../../../src/store/reducers"
import queryActions from "../../../src/store/Query/actions"
import type { Table } from "../../../src/utils/questdb/types"
import {
  installFakeWebSocket,
  TEST_BRIDGE_URL,
  TEST_BRIDGE_TOKEN,
  type BridgeTestWindow,
} from "../../e2e/utils/mcpFakeWebSocket"

vi.mock("../../../src/modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))
const read = { grantSchemaAccess: true, read: true, write: false }
const none = { grantSchemaAccess: false, read: false, write: false }
const win = window as unknown as BridgeTestWindow

const mountBridge = async (permissions?: typeof read) => {
  const fetch = vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(
      Response.json(
        requestUrl(input).pathname === "/api/v1/sql/validate"
          ? {
              query: "SELECT 1",
              columns: [{ name: "c1", type: "LONG" }],
              timestamp: -1,
            }
          : { columns: [], dataset: [], count: 0 },
      ),
    ),
  )
  vi.stubGlobal("fetch", fetch)
  const original = window.WebSocket
  installFakeWebSocket(window)
  const transport = window.WebSocket
  window.WebSocket = original
  vi.stubGlobal("WebSocket", transport)
  if (permissions)
    localStorage.setItem("mcp:permissions", JSON.stringify(permissions))
  history.replaceState(
    null,
    "",
    `/?mcp-pair=1&mcp-ws=${encodeURIComponent(TEST_BRIDGE_URL)}&mcp-token=${TEST_BRIDGE_TOKEN}`,
  )
  const store = createStore(rootReducer)
  store.dispatch(
    queryActions.setTables([{ table_name: "private_trades" } as Table]),
  )
  renderComponent(
    <Provider store={store}>
      <LocalStorageProvider>
        <MCPBridgeProvider>
          <MCPBridgeStatus />
        </MCPBridgeProvider>
      </LocalStorageProvider>
    </Provider>,
  )
  await findHook("mcp-pair-consent-connect")
  return fetch
}

const connect = async () => {
  await userEvent.click(getHook("mcp-pair-consent-connect"))
  await waitFor(() =>
    expect(win.__mcpFakeWS.framesOfType("hello")).toHaveLength(1),
  )
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
  act(() => win.__mcpFakeWS.helloAck())
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000)
  })
  vi.useRealTimers()
  await waitFor(() =>
    expect(getHook("mcp-status-pill")).toHaveTextContent("MCP connected"),
  )
  await waitFor(() =>
    expect(queryHook("mcp-pair-consent-connect")).not.toBeInTheDocument(),
  )
  await waitFor(
    () => expect(document.body).not.toHaveStyle({ pointerEvents: "none" }),
    { timeout: 4000 },
  )
}

describe("MCP permission integration", () => {
  it("waits for consent and sends the chosen None grant in its first hello", async () => {
    // Given
    await mountBridge()
    expect(getHook("permissions-trigger")).toHaveTextContent("Read")
    expect(win.__mcpFakeSockets).toHaveLength(0)

    // When
    await userEvent.click(getHook("permissions-trigger"))
    await userEvent.click(getHook("permission-level-none"))
    expect(getHook("permissions-trigger")).toHaveTextContent("None")
    await connect()

    // Then
    expect(win.__mcpFakeWS.framesOfType("hello")[0]).toMatchObject({
      token: TEST_BRIDGE_TOKEN,
      permissions: none,
    })
  })

  it("denies SQL and cached schema disclosure with a committed None grant", async () => {
    // Given
    const fetch = await mountBridge(none)
    expect(getHook("permissions-trigger")).toHaveTextContent("None")
    await connect()

    // When
    act(() => {
      win.__mcpFakeWS.toolCall(
        "run_query",
        { sql: "SELECT 1", limit: 10 },
        "query",
      )
      win.__mcpFakeWS.toolCall("get_tables", {}, "schema")
    })

    // Then
    await waitFor(() => {
      const results = win.__mcpFakeWS.framesOfType("tool_result")
      for (const id of ["query", "schema"]) {
        const result = results.find((result) => result.requestId === id)
        expect(result).toMatchObject({ isError: true })
        expect(JSON.stringify(result?.content)).toContain("PERMISSION_DENIED")
        expect(JSON.stringify(result)).not.toContain("private_trades")
      }
      expect(
        JSON.stringify(results.find((result) => result.requestId === "schema")),
      ).toContain("grantSchemaAccess")
    })
    expect(
      fetch.mock.calls.filter(
        ([input]) => requestUrl(input).pathname === "/exec",
      ),
    ).toHaveLength(0)
  })

  it("discards an uncommitted Write choice on Cancel and restores Read on reopening", async () => {
    // Given
    await mountBridge()
    await connect()
    expect(JSON.parse(localStorage.getItem("mcp:permissions")!)).toEqual(read)

    // When
    await userEvent.click(getHook("mcp-status-pill"))
    await findHook("mcp-pair-popover")
    await userEvent.click(getHook("permissions-trigger"))
    await userEvent.click(getHook("permission-level-write"))
    await userEvent.click(getHook("mcp-pair-cancel"))

    // Then
    expect(JSON.parse(localStorage.getItem("mcp:permissions")!)).toEqual(read)
    await userEvent.click(getHook("mcp-status-pill"))
    expect(getHook("permissions-trigger")).toHaveTextContent("Read")
  })
})
