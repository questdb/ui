// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { getHook, queryHook, renderComponent } from "../../../test/component"
import { EXPECTED_MCP_VERSION } from "../../../utils/mcp/protocolVersion"
import { ChatAgentPopover } from "./ChatAgentPopover"
import { NEVER_SAID, wordingOf } from "../../../test/wording"
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

const renderPopover = (agentLabel = "Claude Code") =>
  renderComponent(
    <ChatAgentPopover
      open
      onClose={vi.fn()}
      agentChanges={noAgentChanges}
      agentLabel={agentLabel}
    />,
  )

describe("ChatAgentPopover", () => {
  it("shows the agent and where it works, with no MCP connection fields", () => {
    // Given
    bridge.status = "connected"
    bridge.versionMismatch = null

    // When
    renderPopover()

    // Then the title follows the pill, while the agent starts
    expect(screen.getByText("Claude Code connecting…")).toBeVisible()
    expect(getHook("agent-popover-workspace")).toHaveTextContent("~/work")
    expect(wordingOf(getHook("agent-popover"))).not.toMatch(NEVER_SAID)
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
      "Start Claude Code again",
    )
    expect(queryHook("agent-popover-disconnect")).not.toBeInTheDocument()
  })

  it("runs the same agent again, not the default one", () => {
    // Given
    bridge.status = "disconnected"
    bridge.versionMismatch = null

    // When
    renderPopover("Codex")

    // Then
    expect(getHook("agent-popover-reconnect")).toHaveTextContent(
      `npx @questdb/mcp-server-questdb@${EXPECTED_MCP_VERSION} connect http://localhost:3000 --agent codex`,
    )
  })

  it("does not offer a command that would start another agent than a custom one", () => {
    // Given an agent started with --agent-command
    bridge.status = "disconnected"
    bridge.versionMismatch = null

    // When
    renderPopover("My agent")

    // Then
    const reconnect = getHook("agent-popover-reconnect")
    expect(reconnect).toHaveTextContent(
      "To connect My agent again, run the connect command you started it with in your terminal.",
    )
    expect(reconnect).not.toHaveTextContent("npx")
  })

  it("titles a version update like the terminal mode does", () => {
    // Given
    bridge.status = "connected"
    bridge.versionMismatch = "minor"

    // When
    renderPopover("Codex")

    // Then
    const notice = getHook("agent-popover-version-mismatch")
    expect(notice).toHaveTextContent("Update recommended")
    expect(notice).toHaveTextContent("--agent codex")
  })
})
