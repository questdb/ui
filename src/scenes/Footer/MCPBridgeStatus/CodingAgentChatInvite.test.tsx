// @vitest-environment jsdom
import React from "react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { findHook, queryHook, renderComponent } from "../../../test/component"
import { ConnectCodingAgentProvider } from "../../../components/ConnectCodingAgent"
import { MCPBridgePairPopover } from "./PairPopover"
import type { AgentChanges } from "./useAgentChanges"

const bridge = vi.hoisted(() => ({ status: "connected" }))

vi.mock("../../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.mock("../../../providers/MCPBridgeProvider", () => ({
  useMCPBridge: () => ({
    status: bridge.status,
    lastError: null,
    retryAttempt: 0,
    versionMismatch: null,
    url: "ws://127.0.0.1:52253",
    token: "pairing-token",
    connect: vi.fn(),
    disconnect: vi.fn(),
    permissions: { grantSchemaAccess: true, read: true, write: false },
    setPermissions: vi.fn(),
  }),
}))

const noAgentChanges: AgentChanges = {
  hasUnseen: false,
  showPopper: false,
  unread: false,
  label: "",
  view: () => Promise.resolve(),
  dismiss: vi.fn(),
  markPopoverOpened: vi.fn(),
  setAutoHidePaused: vi.fn(),
}

const renderPopover = (onClose = vi.fn()) => {
  renderComponent(
    <ConnectCodingAgentProvider>
      <MCPBridgePairPopover
        open
        onClose={onClose}
        agentChanges={noAgentChanges}
      />
    </ConnectCodingAgentProvider>,
  )
  return onClose
}

describe("the MCP server popover", () => {
  it("invites an MCP user to chat with their coding agent in the console", async () => {
    // Given a console paired with an MCP server
    bridge.status = "connected"
    const onClose = renderPopover()

    // When
    await userEvent.click(await findHook("mcp-pair-chat-invite-setup"))

    // Then the popover closes and the setup opens
    expect(onClose).toHaveBeenCalled()
    expect(await findHook("connect-agent-dialog")).toBeVisible()
  })

  it("does not invite while no MCP server is connected", () => {
    // Given
    bridge.status = "disconnected"

    // When
    renderPopover()

    // Then
    expect(queryHook("mcp-pair-chat-invite")).not.toBeInTheDocument()
  })
})
