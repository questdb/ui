// Shared fake transport; MCPBridgeProvider and dispatch remain real.
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
import { expect, vi } from "vitest"
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

type Permissions = { grantSchemaAccess: boolean; read: boolean; write: boolean }
export const win = window as unknown as BridgeTestWindow

export const mountBridge = async (
  permissions?: Permissions,
  children?: React.ReactNode,
) => {
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
          {children}
        </MCPBridgeProvider>
      </LocalStorageProvider>
    </Provider>,
  )
  await findHook("mcp-pair-consent-connect")
  return fetch
}

export const connect = async () => {
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
