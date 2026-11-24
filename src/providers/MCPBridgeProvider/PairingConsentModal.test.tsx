// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { getHook, queryHook, renderComponent } from "../../test/component"
import { PairingConsentModal } from "./PairingConsentModal"

const PERMISSIONS = { grantSchemaAccess: true, read: true, write: false }

const renderConsent = (agent?: { label: string; cwd: string }) =>
  renderComponent(
    <PairingConsentModal
      pending={{ url: "ws://127.0.0.1:52253", token: "pairing-token", agent }}
      isConnecting={false}
      succeeded={false}
      retryAttempt={0}
      error={null}
      versionMismatch={null}
      permissions={PERMISSIONS}
      onConnect={vi.fn()}
      onCancel={vi.fn()}
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
      screen.getByText("Chat with it here, about your data and notebooks."),
    ).toBeVisible()
    expect(
      getHook("mcp-pair-consent-workspace").parentElement,
    ).toHaveTextContent(
      "Your coding agent is going to work in ~/.questdb/mcp-server/workspace on your computer.",
    )
    expect(queryHook("mcp-pair-consent-ws")).not.toBeInTheDocument()
    expect(screen.queryByText(/Loopback only/)).not.toBeInTheDocument()

    // When
    await userEvent.click(getHook("mcp-pair-consent-details"))

    // Then
    expect(getHook("mcp-pair-consent-ws")).toHaveTextContent(
      "ws://127.0.0.1:52253",
    )
    expect(getHook("mcp-pair-consent-token")).toHaveTextContent("pairing-token")
  })

  it("shows the connection details of an MCP server pairing up front", () => {
    // Given
    renderConsent()

    // Then
    expect(
      screen.getByRole("heading", { name: "Connect to MCP server?" }),
    ).toBeVisible()
    expect(getHook("mcp-pair-consent-ws")).toHaveTextContent(
      "ws://127.0.0.1:52253",
    )
    expect(queryHook("mcp-pair-consent-details")).not.toBeInTheDocument()
    expect(screen.getByText(/Loopback only/)).toBeVisible()
  })
})
