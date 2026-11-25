// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { getHook, queryHook, renderComponent } from "../../test/component"
import { PairingConsentModal } from "./PairingConsentModal"
import { NEVER_SAID, wordingOf } from "../../test/wording"

const PERMISSIONS = { grantSchemaAccess: true, read: true, write: false }

const renderConsent = (
  agent?: { label: string; cwd: string },
  mcpClient?: string,
  onCancel = vi.fn(),
  isConnecting = false,
) =>
  renderComponent(
    <PairingConsentModal
      pending={{
        url: "ws://127.0.0.1:52253",
        token: "pairing-token",
        agent,
        mcpClient,
      }}
      isConnecting={isConnecting}
      succeeded={false}
      retryAttempt={0}
      error={null}
      versionMismatch={null}
      permissions={PERMISSIONS}
      onConnect={vi.fn()}
      onCancel={onCancel}
    />,
  )

describe("PairingConsentModal", () => {
  it("asks to connect a coding agent with where it works, and keeps the connection details folded", async () => {
    // Given
    renderConsent({
      label: "Claude Code",
      cwd: "~/.questdb/mcp-server/workspace",
    })

    // Then
    expect(
      screen.getByRole("heading", { name: "Connect Claude Code?" }),
    ).toBeVisible()
    expect(
      screen.getByText(
        "It works in the AI Assistant: analyze your data, monitor your instance and build dashboards.",
      ),
    ).toBeVisible()
    expect(
      getHook("mcp-pair-consent-workspace").parentElement,
    ).toHaveTextContent("Workspace~/.questdb/mcp-server/workspace")
    expect(queryHook("mcp-pair-consent-ws")).not.toBeInTheDocument()
    expect(screen.queryByText(/On this computer only/)).not.toBeInTheDocument()

    // When
    await userEvent.click(getHook("mcp-pair-consent-details"))

    // Then
    expect(getHook("mcp-pair-consent-ws")).toHaveTextContent(
      "ws://127.0.0.1:52253",
    )
    expect(getHook("mcp-pair-consent-token")).toHaveTextContent("pairing-token")
  })

  it("names the coding agent that works from the terminal, and keeps the connection details folded", async () => {
    // Given
    renderConsent(undefined, "codex-mcp-client")

    // Then
    expect(
      screen.getByRole("heading", { name: "Connect Codex?" }),
    ).toBeVisible()
    expect(
      screen.getByText(
        "It works from your terminal and can read and edit notebooks, run SQL and inspect schemas.",
      ),
    ).toBeVisible()
    expect(screen.queryByText(/On this computer only/)).not.toBeInTheDocument()
    expect(queryHook("mcp-pair-consent-ws")).not.toBeInTheDocument()

    // When
    await userEvent.click(getHook("mcp-pair-consent-details"))

    // Then
    expect(getHook("mcp-pair-consent-ws").previousSibling).toHaveTextContent(
      "Address:",
    )
    expect(getHook("mcp-pair-consent-token").previousSibling).toHaveTextContent(
      "Key:",
    )
    expect(screen.getByText(/On this computer only/)).toBeVisible()
  })

  it("says your agent when it does not know the agent, and never MCP", () => {
    // Given
    const { container } = renderConsent(undefined, "some-new-agent")

    // Then
    expect(
      screen.getByRole("heading", { name: "Connect your agent?" }),
    ).toBeVisible()
    expect(wordingOf(container.ownerDocument.body)).not.toMatch(NEVER_SAID)
  })

  it("cancels on a click outside, except while connecting", async () => {
    // Given
    const onCancel = vi.fn()
    const { unmount } = renderConsent(undefined, "claude-code", onCancel)

    // When
    await userEvent.click(getHook("mcp-pair-consent-overlay"))

    // Then
    expect(onCancel).toHaveBeenCalledTimes(1)

    // Given a dialog that is connecting
    unmount()
    const whileConnecting = vi.fn()
    renderConsent(undefined, "claude-code", whileConnecting, true)

    // When
    await userEvent.click(getHook("mcp-pair-consent-overlay"))

    // Then
    expect(whileConnecting).not.toHaveBeenCalled()
  })
})
