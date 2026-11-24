// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { getHook, queryHook, renderComponent } from "../../../test/component"
import { EXPECTED_MCP_VERSION } from "../../../utils/mcp/protocolVersion"
import { AgentPopover } from "./AgentPopover"
import type { AgentChanges } from "./useAgentChanges"

const bridge = vi.hoisted(() => ({
  status: "connected",
  versionMismatch: null as "minor" | "major" | null,
}))

vi.mock("../../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.mock("../../../providers/MCPBridgeProvider", () => ({
  useMCPBridge: () => ({
    status: bridge.status,
    versionMismatch: bridge.versionMismatch,
    url: "ws://127.0.0.1:52253",
    token: "pairing-token",
    disconnect: vi.fn(),
    permissions: { grantSchemaAccess: true, read: true, write: false },
    setPermissions: vi.fn(),
    pairedAgent: { label: "Claude Code", cwd: "~/work" },
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

const renderPopover = () =>
  renderComponent(
    <AgentPopover
      open
      onClose={vi.fn()}
      agentChanges={noAgentChanges}
      agentLabel="Claude Code"
    />,
  )

describe("AgentPopover", () => {
  it("shows the agent and where it works, with no MCP connection fields", () => {
    // Given
    bridge.status = "connected"
    bridge.versionMismatch = null

    // When
    renderPopover()

    // Then
    expect(screen.getByText("Claude Code")).toBeVisible()
    expect(getHook("agent-popover-workspace")).toHaveTextContent("~/work")
    expect(screen.queryByText(/WebSocket|Token|MCP/)).not.toBeInTheDocument()
  })

  it("asks to run the connect command again for a version update, not the MCP upgrade", () => {
    // Given
    bridge.status = "connected"
    bridge.versionMismatch = "minor"

    // When
    renderPopover()

    // Then
    const notice = getHook("agent-popover-version-mismatch")
    expect(notice).toHaveTextContent(
      `npx @questdb/mcp-server-questdb@${EXPECTED_MCP_VERSION} connect`,
    )
    expect(notice).not.toHaveTextContent(/upgrade|MCP server/)
  })

  it("shows the command to connect the agent again once it is disconnected", () => {
    // Given
    bridge.status = "disconnected"
    bridge.versionMismatch = null

    // When
    renderPopover()

    // Then
    expect(getHook("agent-popover-reconnect")).toHaveTextContent(
      "To connect Claude Code again, run this in your terminal:",
    )
    expect(queryHook("agent-popover-disconnect")).not.toBeInTheDocument()
  })
})
