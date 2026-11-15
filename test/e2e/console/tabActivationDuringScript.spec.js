/// <reference types="cypress" />

const {
  installFakeWebSocket,
  TEST_BRIDGE_TOKEN,
  TEST_BRIDGE_URL,
} = require("../utils/mcpFakeWebSocket")

const activateTab = (bufferId, requestId, expectedError) => {
  cy.window().then((win) => {
    win.__mcpFakeWS.toolCall("activate_tab", { buffer_id: bufferId }, requestId)
  })
  cy.window().should((win) => {
    const result = win.__mcpFakeWS
      .framesOfType("tool_result")
      .find((frame) => frame.requestId === requestId)
    expect(result).to.exist
    expect(result.isError).to.equal(expectedError !== undefined)
    if (expectedError) {
      expect(result.content[0].text).to.contain(
        `"error_code":"${expectedError}"`,
      )
      expect(result.content[0].text).to.contain("then retry")
    }
  })
}

describe("tab activation during scripts", () => {
  it("rejects agent activation during a script and keeps its completion in the original tab", () => {
    // Given a paired MCP client and a SQL script with its first query pending
    let releaseQuery
    let queryPending = false
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
          {
            label: "Script A",
            value: "select 1 as first;\nselect 2 as second;",
          },
          { label: "Editor B", value: "select 99 as unrelated;" },
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
    cy.intercept("GET", "**/exec*", (request) => {
      const query = new URL(request.url).searchParams.get("query")
      if (query?.toLowerCase() !== "select 1 as first") return
      queryPending = true
      return new Promise((resolve) => {
        releaseQuery = () => {
          request.reply({
            query,
            columns: [{ name: "first", type: "INT" }],
            dataset: [[1]],
            count: 1,
          })
          resolve()
        }
      })
    })
    cy.clickRunScript()
    cy.wrap(null).should(() => expect(queryPending).to.equal(true))
    cy.getByDataHook("editor-tabs-disabled").should("exist")

    // When the agent tries to activate another SQL tab
    activateTab(2, "switch-during-script", "tabs_locked")

    // Then the running tab stays active and both statements complete there
    cy.getEditorTabByTitle("Script A").should("have.attr", "active")
    cy.then(() => releaseQuery())
    cy.getByDataHook("editor-tabs").should("exist")
    cy.getByDataHook("notifications-collapsed")
      .should("contain", "Running completed")
      .and("contain", "2 successful")

    // And activation works afterward without moving the script's completion log
    activateTab(2, "switch-after-script")
    cy.getEditorTabByTitle("Editor B").should("have.attr", "active")
    cy.getByDataHook("notifications-wrapper").should(
      "not.contain",
      "Running completed",
    )
    cy.getByDataHook("expand-notifications").should("not.exist")
    activateTab(1, "return-to-script")
    cy.getByDataHook("expand-notifications").click()
    cy.getByDataHook("notifications-expanded")
      .should("contain", "Running completed")
      .and("contain", "2 successful")
  })
})
