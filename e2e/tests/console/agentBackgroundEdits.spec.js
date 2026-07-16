/// <reference types="cypress" />

// E2E coverage for background (passive) agent notebook edits over the MCP
// bridge: creating and editing a notebook never steals the active tab, the
// footer popper announces the change, and View lands on the edited notebook
// with the agent's cells persisted.

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl = `http://localhost:9999${contextPath}`

const {
  installFakeWebSocket,
  TEST_BRIDGE_TOKEN,
  TEST_BRIDGE_URL,
} = require("../../utils/mcpFakeWebSocket")

const deepLinkSuffix = () =>
  `?mcp-pair=1&mcp-ws=${encodeURIComponent(TEST_BRIDGE_URL)}` +
  `&mcp-token=${encodeURIComponent(TEST_BRIDGE_TOKEN)}`

const loginAndVisitDeepLink = () => {
  cy.visit(`${baseUrl}/${deepLinkSuffix()}`, {
    onBeforeLoad: (win) => {
      win.localStorage.clear()
      win.sessionStorage.clear()
      win.indexedDB.deleteDatabase("web-console")
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
  cy.getByDataHook("mcp-bridge-status-pill", { timeout: 10000 }).should(
    "contain",
    "MCP connected",
  )
}

const toolResult = (win, requestId) =>
  win.__mcpFakeWS
    .framesOfType("tool_result")
    .find((r) => r.requestId === requestId)

const activeTabTitle = () =>
  cy.get(".chrome-tab[active]").first().invoke("attr", "data-tab-title")

const expectActiveTabTitle = (title) =>
  cy.get(".chrome-tab[active]").should("have.attr", "data-tab-title", title)

const awaitToolResult = (id) => {
  cy.window({ timeout: 10000 }).should((win) => {
    expect(toolResult(win, id), `result for ${id}`).to.exist
  })
  return cy.window().then((win) => {
    const result = toolResult(win, id)
    expect(result.isError, `tool ${id} errored`).to.not.equal(true)
    // The single-line JSON payload may be wrapped by a permissions notice
    // above and a since-last-check block below.
    const text = result.content[0].text
    const payloadLine = text
      .split("\n")
      .find((line) => line.trimStart().startsWith("{"))
    expect(payloadLine, `JSON payload in result for ${id}`).to.exist
    return JSON.parse(payloadLine)
  })
}

describe("agent background notebook edits (e2e)", () => {
  it("creates and fills a notebook in the background; View opens it with the cells persisted", () => {
    loginAndVisitDeepLink()
    cy.getByDataHook("mcp-pair-consent-connect").click()
    waitForPaired()

    activeTabTitle().then((initialTab) => {
      // Agent creates a notebook — the active tab must not change.
      cy.window()
        .then((win) =>
          awaitToolResult(
            win.__mcpFakeWS.toolCall("create_notebook", {
              label: "Agent NB",
            }),
          ),
        )
        .then((created) => {
          expect(created.bufferId).to.be.a("number")
          expect(created.hint).to.match(/background/i)
          cy.get(`.chrome-tab[data-tab-title="Agent NB"]`).should("exist")
          expectActiveTabTitle(initialTab)

          // Read → edit, per the freshness gate; still fully in the background.
          cy.window().then((win) =>
            awaitToolResult(
              win.__mcpFakeWS.toolCall("get_notebook_state", {
                buffer_id: created.bufferId,
              }),
            ),
          )
          cy.window().then((win) =>
            awaitToolResult(
              win.__mcpFakeWS.toolCall("add_cell", {
                buffer_id: created.bufferId,
                sql: "SELECT 123 as agent_made_this",
                after_cell_id: null,
                run: false,
                type: "sql",
              }),
            ),
          )
          expectActiveTabTitle(initialTab)

          // The footer popper announces the background change.
          cy.getByDataHook("agent-changes-popper", { timeout: 10000 })
            .should("be.visible")
            .and("contain", "Agent NB")

          // View lands on the notebook with the agent's cell persisted.
          cy.getByDataHook("agent-changes-view").click()
          expectActiveTabTitle("Agent NB")
          cy.contains("agent_made_this", { timeout: 10000 }).should("exist")
        })
    })
  })
})
