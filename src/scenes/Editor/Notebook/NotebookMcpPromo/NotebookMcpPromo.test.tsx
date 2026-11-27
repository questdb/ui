// @vitest-environment jsdom
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { getHook, renderComponent } from "../../../../test/component"
import { EXPECTED_MCP_VERSION } from "../../../../utils/mcp/protocolVersion"
import { NotebookMcpPromo } from "./index"
import { NEVER_SAID, wordingOf } from "../../../../test/wording"

vi.mock("../../../../modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))
vi.mock("../../../../providers/LocalStorageProvider", () => ({
  useLocalStorage: () => ({
    notebookOnboarding: { showMcpPromo: true, mcpEverConnected: false },
    updateNotebookOnboarding: vi.fn(),
  }),
}))

describe("the notebook's coding agent promo", () => {
  it("offers both ways to connect a coding agent, the AI Assistant first", () => {
    // When
    renderComponent(<NotebookMcpPromo />)

    // Then
    expect(wordingOf(document.body)).not.toMatch(NEVER_SAID)
    expect(document.body).toHaveTextContent(
      "Analyze your data, monitor your instance and build dashboards with the coding agent you already have.",
    )
    const assistant = getHook("notebook-promo-ai-assistant-option")
    const terminal = getHook("notebook-promo-terminal-option")
    expect(assistant.compareDocumentPosition(terminal)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(assistant).toHaveTextContent(
      `npx @questdb/mcp-server-questdb@${EXPECTED_MCP_VERSION} connect http://localhost:3000`,
    )
    expect(terminal).toHaveTextContent(
      `npx @questdb/mcp-server-questdb@${EXPECTED_MCP_VERSION} setup`,
    )
  })
})
