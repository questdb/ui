// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  findHook,
  getHook,
  queryHook,
  renderComponent,
} from "../../../test/component"
import { ConnectCodingAgentProvider } from "../../../components/ConnectCodingAgent"
import { mcpClientOf, type McpClient } from "../../../utils/mcp/mcpClients"
import { EXPECTED_MCP_VERSION } from "../../../utils/mcp/protocolVersion"
import { McpAgentPopover } from "./McpAgentPopover"
import { NEVER_SAID, wordingOf } from "../../../test/wording"
import type { AgentChanges } from "./useAgentChanges"

const bridge = vi.hoisted(() => ({
  status: "connected",
  paired: true,
  mcpClient: null as McpClient | null,
}))

vi.mock("../../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.mock("../../../providers/MCPBridgeProvider", () => ({
  useMCPBridge: () => ({
    status: bridge.status,
    lastError: null,
    retryAttempt: 0,
    versionMismatch: null,
    url: bridge.paired ? "ws://127.0.0.1:52253" : null,
    token: bridge.paired ? "pairing-token" : null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    permissions: { grantSchemaAccess: true, read: true, write: false },
    setPermissions: vi.fn(),
    mcpClient: bridge.mcpClient,
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
      <McpAgentPopover open onClose={onClose} agentChanges={noAgentChanges} />
    </ConnectCodingAgentProvider>,
  )
  return onClose
}

const connectedTo = (client: McpClient | null) => {
  bridge.status = "connected"
  bridge.paired = true
  bridge.mcpClient = client
}

afterEach(() => {
  connectedTo(null)
})

describe("the coding agent popover in MCP mode", () => {
  it("offers both ways to connect a coding agent, chat first, and keeps the address and key folded", async () => {
    // Given no agent connected
    bridge.status = "disconnected"
    bridge.paired = false

    // When
    renderPopover()

    // Then
    const popover = getHook("mcp-pair-popover")
    expect(popover).toHaveTextContent("Connect your agent")
    expect(popover).toHaveTextContent(
      "Analyze your data, monitor your instance and build dashboards with the coding agent you already have.",
    )
    const chat = getHook("mcp-pair-chat-option")
    const terminal = getHook("mcp-pair-setup-notice")
    expect(chat.compareDocumentPosition(terminal)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(chat).toHaveTextContent(
      `Use your agent herenpx @questdb/mcp-server-questdb@${EXPECTED_MCP_VERSION} connect http://localhost:3000`,
    )
    expect(terminal).toHaveTextContent(
      `Use your agent in your terminalnpx @questdb/mcp-server-questdb@${EXPECTED_MCP_VERSION} setupThen ask your agent to connect to the QuestDB Web Console.`,
    )
    expect(queryHook("mcp-pair-chat-invite")).not.toBeInTheDocument()
    expect(queryHook("mcp-pair-url-input")).not.toBeInTheDocument()
    expect(queryHook("mcp-pair-submit")).not.toBeInTheDocument()
    expect(wordingOf(popover)).not.toMatch(NEVER_SAID)

    // When
    await userEvent.click(getHook("mcp-pair-manual-toggle"))

    // Then
    expect(screen.getByLabelText("Address")).toBe(getHook("mcp-pair-url-input"))
    expect(screen.getByLabelText("Key")).toBe(getHook("mcp-pair-token-input"))
    expect(getHook("mcp-pair-submit")).toHaveTextContent("Connect")
  })

  it("leaves the agent out of the command, so connect asks which one to run", () => {
    // Given no agent connected
    bridge.status = "disconnected"
    bridge.paired = false

    // When
    renderPopover()

    // Then
    expect(getHook("mcp-pair-chat-option")).not.toHaveTextContent("--agent")
  })

  it("names the connected agent, says where the user talks to it, and saves permission changes", () => {
    // Given
    connectedTo(mcpClientOf("codex-mcp-client"))

    // When
    renderPopover()

    // Then
    const popover = getHook("mcp-pair-popover")
    expect(popover).toHaveTextContent("Codex connected")
    expect(popover).toHaveTextContent("Codex works from your terminal.")
    expect(queryHook("mcp-pair-setup-notice")).not.toBeInTheDocument()
    expect(getHook("mcp-pair-submit")).toHaveTextContent("Save")
    expect(wordingOf(popover)).not.toMatch(NEVER_SAID)
  })

  it("invites to chat with the same agent, with the command that runs it", async () => {
    // Given
    connectedTo(mcpClientOf("codex-mcp-client"))
    const onClose = renderPopover()

    // When
    expect(getHook("mcp-pair-chat-invite")).toHaveTextContent(
      "Codex can also work in the AI Assistant.",
    )
    await userEvent.click(getHook("mcp-pair-chat-invite-setup"))

    // Then the popover closes and the setup opens for Codex
    expect(onClose).toHaveBeenCalled()
    const dialog = await findHook("connect-agent-dialog")
    expect(dialog).toHaveTextContent(
      `npx @questdb/mcp-server-questdb@${EXPECTED_MCP_VERSION} connect http://localhost:3000 --agent codex`,
    )
  })

  it("says Agent when it does not know the agent", () => {
    // Given
    connectedTo(null)

    // When
    renderPopover()

    // Then
    const popover = getHook("mcp-pair-popover")
    expect(popover).toHaveTextContent("Agent connected")
    expect(popover).toHaveTextContent("Your agent works from your terminal.")
  })

  it("does not invite while the agent is away", () => {
    // Given the agent stopped responding
    bridge.status = "disconnected"
    bridge.paired = true
    bridge.mcpClient = mcpClientOf("claude-code")

    // When
    renderPopover()

    // Then
    expect(getHook("mcp-pair-popover")).toHaveTextContent(
      "Claude Code disconnected",
    )
    expect(queryHook("mcp-pair-chat-invite")).not.toBeInTheDocument()
  })
})
