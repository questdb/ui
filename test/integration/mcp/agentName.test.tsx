// @vitest-environment jsdom
import { renderComponent, getHook, findHook } from "../../../src/test/component"
import React from "react"
import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { LocalStorageProvider } from "../../../src/providers/LocalStorageProvider"
import { AIConversationProvider } from "../../../src/providers/AIConversationProvider"
import { MCPBridgeProvider } from "../../../src/providers/MCPBridgeProvider"
import { MCPBridgeStatus } from "../../../src/scenes/Footer/MCPBridgeStatus"
import rootReducer from "../../../src/store/reducers"
import {
  installFakeWebSocket,
  TEST_BRIDGE_URL,
  TEST_BRIDGE_TOKEN,
  type BridgeTestWindow,
} from "../../e2e/utils/mcpFakeWebSocket"

vi.mock("../../../src/modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))
const win = window as unknown as BridgeTestWindow

// A console opened from a pairing link, with its consent dialog showing.
const openLink = async (extraParams = "") => {
  const original = window.WebSocket
  installFakeWebSocket(window)
  const transport = window.WebSocket
  window.WebSocket = original
  vi.stubGlobal("WebSocket", transport)
  history.replaceState(
    null,
    "",
    `/?mcp-pair=1&mcp-ws=${encodeURIComponent(TEST_BRIDGE_URL)}&mcp-token=${TEST_BRIDGE_TOKEN}${extraParams}`,
  )
  renderComponent(
    <Provider store={createStore(rootReducer)}>
      <LocalStorageProvider>
        <AIConversationProvider>
          <MCPBridgeProvider>
            <MCPBridgeStatus />
          </MCPBridgeProvider>
        </AIConversationProvider>
      </LocalStorageProvider>
    </Provider>,
  )
  await findHook("mcp-pair-consent-connect")
}

const acceptWith = async (ack: Record<string, unknown>) => {
  await userEvent.click(getHook("mcp-pair-consent-connect"))
  await waitFor(() =>
    expect(win.__mcpFakeWS.framesOfType("hello")).toHaveLength(1),
  )
  act(() => win.__mcpFakeWS.helloAck(ack))
}

describe("naming the coding agent that works from the terminal", () => {
  it("names it from the pairing link before it connects, then in the bottom bar", async () => {
    // Given
    await openLink("&mcp-client=claude-code")

    // Then
    expect(
      screen.getByRole("heading", { name: "Connect Claude Code?" }),
    ).toBeVisible()

    // When
    await acceptWith({ mcpClient: { name: "claude-code" } })

    // Then
    await waitFor(() =>
      expect(getHook("mcp-status-pill")).toHaveTextContent(
        "Claude Code connected",
      ),
    )
    expect(getHook("mcp-status-pill")).toHaveAttribute(
      "title",
      "Claude Code works from your terminal. Click to manage.",
    )
  })

  it("learns the name when the agent connects, and says Agent while it does not know it", async () => {
    // Given a link without a name
    await openLink()

    // Then
    expect(
      screen.getByRole("heading", { name: "Connect your agent?" }),
    ).toBeVisible()

    // When the agent names itself, then an agent leaves out the name
    await acceptWith({ mcpClient: { name: "codex-mcp-client" } })
    await waitFor(() =>
      expect(getHook("mcp-status-pill")).toHaveTextContent("Codex connected"),
    )
    act(() => win.__mcpFakeWS.helloAck({ mcpClient: { name: 42 } }))

    // Then
    await waitFor(() =>
      expect(getHook("mcp-status-pill")).toHaveTextContent("Agent connected"),
    )
  })
})
