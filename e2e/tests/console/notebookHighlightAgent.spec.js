/// <reference types="cypress" />

// E2E coverage for the highlight rules drawer while the assistant edits the
// same cell over the MCP bridge: the drawer must step aside instead of
// overwriting the assistant's rules on Save.

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl = `http://localhost:9999${contextPath}`

const {
  installFakeWebSocket,
  TEST_BRIDGE_TOKEN,
  TEST_BRIDGE_URL,
} = require("../../utils/mcpFakeWebSocket")
const { seedNotebookOnboarding } = require("../../utils")

const NOTEBOOK_LABEL = "Highlight NB"

const deepLinkSuffix = () =>
  `?mcp-pair=1&mcp-ws=${encodeURIComponent(TEST_BRIDGE_URL)}` +
  `&mcp-token=${encodeURIComponent(TEST_BRIDGE_TOKEN)}`

const loginAndVisitDeepLink = () => {
  cy.visit(`${baseUrl}/${deepLinkSuffix()}`, {
    onBeforeLoad: (win) => {
      win.localStorage.clear()
      win.sessionStorage.clear()
      win.indexedDB.deleteDatabase("web-console")
      seedNotebookOnboarding(win)
      win.localStorage.setItem(
        "mcp:permissions",
        JSON.stringify({ grantSchemaAccess: true, read: true, write: true }),
      )
      installFakeWebSocket(win)
    },
  })
  cy.loginWithUserAndPassword()
}

const waitForPaired = () => {
  cy.window({ timeout: 10000 }).its("__mcpFakeWS").should("exist")
  cy.window({ timeout: 10000 }).should((win) => {
    expect(win.__mcpFakeWS.framesOfType("hello").length).to.be.greaterThan(0)
  })
  cy.window().then((win) => win.__mcpFakeWS.helloAck())
  cy.getByDataHook("mcp-status-pill", { timeout: 10000 }).should(
    "contain",
    "MCP connected",
  )
}

const toolResult = (win, requestId) =>
  win.__mcpFakeWS
    .framesOfType("tool_result")
    .find((r) => r.requestId === requestId)

const awaitToolResult = (id) => {
  cy.window({ timeout: 10000 }).should((win) => {
    expect(toolResult(win, id), `result for ${id}`).to.exist
  })
  return cy.window().then((win) => {
    const result = toolResult(win, id)
    expect(result.isError, `tool ${id} errored`).to.not.equal(true)
    const text = result.content[0].text
    const payloadLine = text
      .split("\n")
      .find((line) => line.trimStart().startsWith("{"))
    expect(payloadLine, `JSON payload in result for ${id}`).to.exist
    return JSON.parse(payloadLine)
  })
}

const callTool = (name, args) =>
  cy
    .window()
    .then((win) => awaitToolResult(win.__mcpFakeWS.toolCall(name, args)))

const openHighlightDrawer = () => {
  cy.get("[data-notebook-cell] button[aria-label='More actions']").click()
  cy.contains("[role='menuitem']", "Highlight rules").click()
  cy.getByDataHook("highlight-settings-drawer").should("be.visible")
}

describe("notebook highlight rules with the assistant (e2e)", () => {
  it("closes the drawer when the assistant changes the rules, keeping its rules", () => {
    // Given the browser is paired and the assistant has run a cell
    loginAndVisitDeepLink()
    cy.getByDataHook("mcp-pair-consent-connect").click()
    waitForPaired()
    callTool("create_notebook", { label: NOTEBOOK_LABEL }).then((created) => {
      callTool("add_cell", {
        buffer_id: created.bufferId,
        sql: "select 'A' as k, 5 as v",
        after_cell_id: null,
        run: true,
        type: "sql",
      })
      cy.wrap(created.bufferId).as("bufferId")
    })
    cy.getByDataHook("agent-changes-view", { timeout: 10000 }).click()
    cy.contains("[data-hook='grid-cell']", "A", { timeout: 10000 }).should(
      "exist",
    )

    // Given the user has the drawer open with an unsaved rule
    openHighlightDrawer()
    cy.contains("button", "+ Add rule").click()
    cy.getByDataHook("highlight-rule").should("have.length", 1)

    // When the assistant sets a rule on that cell
    cy.get("[data-cell-id]")
      .first()
      .invoke("attr", "data-cell-id")
      .then((cellId) => {
        cy.get("@bufferId").then((bufferId) => {
          callTool("set_cell_highlight_config", {
            buffer_id: bufferId,
            cell_id: cellId,
            highlight_config: {
              identity_columns: ["k"],
              rules: [
                {
                  kind: "value",
                  column: "v",
                  op: "lt",
                  value: 100,
                  color: "blue",
                },
              ],
            },
          })
        })
      })

    // Then the drawer closes with a notice, and the assistant's rule is what applies
    cy.getByDataHook("highlight-settings-drawer").should("not.exist")
    cy.contains("updated by the assistant").should("be.visible")
    cy.get("[data-hook='grid-cell'][data-highlight='always']").should(
      "have.length",
      1,
    )
    openHighlightDrawer()
    cy.getByDataHook("highlight-rule").should("have.length", 1)
    cy.getByDataHook("highlight-rule").should("contain", "100")
  })
})
