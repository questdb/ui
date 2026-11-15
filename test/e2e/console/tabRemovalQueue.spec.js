/// <reference types="cypress" />

const {
  installFakeWebSocket,
  TEST_BRIDGE_TOKEN,
  TEST_BRIDGE_URL,
} = require("../utils/mcpFakeWebSocket")

describe("tab removal queue", () => {
  it("rejects removing the last open tab when agent removals overlap", () => {
    // Given two SQL tabs and a paired MCP client
    const baseUrl = Cypress.config("baseUrl")
    const pairing =
      `mcp-pair=1&mcp-ws=${encodeURIComponent(TEST_BRIDGE_URL)}` +
      `&mcp-token=${encodeURIComponent(TEST_BRIDGE_TOKEN)}`
    cy.intercept("GET", "**/assets/console-configuration.json", {
      ctaBanner: false,
      readOnly: false,
    })
    cy.loadConsoleWithAuth(
      false,
      {
        "mcp:permissions": JSON.stringify({
          grantSchemaAccess: true,
          read: true,
          write: true,
        }),
      },
      {
        url: `${baseUrl}/?${pairing}`,
        onBeforeLoad: installFakeWebSocket,
        buffers: [
          { label: "A", value: "select 1;" },
          { label: "B", value: "select 2;" },
        ],
        activeBufferId: 1,
      },
    )
    cy.getByDataHook("mcp-pair-consent-connect").click()
    cy.window().should((win) => {
      expect(win.__mcpFakeWS.framesOfType("hello")).not.to.be.empty
    })
    cy.window().then((win) => win.__mcpFakeWS.helloAck())
    cy.getByDataHook("mcp-status-pill").should("contain", "MCP connected")

    // When delete and archive requests arrive before either finishes
    cy.window().then((win) => {
      win.__mcpFakeWS.toolCall("delete_tab", { buffer_id: 1 }, "delete-a")
      win.__mcpFakeWS.toolCall("archive_tab", { buffer_id: 2 }, "archive-b")
    })

    // Then deletion completes and archiving returns a last-tab error
    cy.window().should((win) => {
      const results = win.__mcpFakeWS.framesOfType("tool_result")
      const deleted = results.find((result) => result.requestId === "delete-a")
      const archived = results.find(
        (result) => result.requestId === "archive-b",
      )
      expect(deleted).to.exist
      expect(deleted.isError).to.equal(false)
      expect(archived).to.exist
      expect(archived.isError).to.equal(true)
      expect(archived.content[0].text).to.contain("last_tab")
    })
    cy.getEditorTabs().should("have.length", 1)
    cy.getEditorTabByTitle("B").should("have.attr", "active")
    cy.waitForActiveBufferValue("select 2;")
    cy.getEditorContent().should("be.visible")
  })
})
