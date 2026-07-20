/// <reference types="cypress" />

// E2E coverage for notebook result persistence: a run cell's grid must survive
// a scroll far away and back (release → re-hydrate from IndexedDB) and a full
// page reload (snapshot restore), never degrading into a permanent shimmer or
// a collapsed cell.

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl = `http://localhost:9999${contextPath}`

const {
  installFakeWebSocket,
  TEST_BRIDGE_TOKEN,
  TEST_BRIDGE_URL,
} = require("../../utils/mcpFakeWebSocket")
const { seedNotebookOnboarding } = require("../../utils")

// Computed in SQL so the sentinel appears ONLY in the result grid — asserting
// on it can never match the cell editor's SQL text.
const PROBE_SQL = "select concat('sen', 'tinel_val') as probe_col"
const PROBE_VALUE = "sentinel_val"
const NOTEBOOK_LABEL = "Restore NB"
// Enough collapsed cells below the probe to push it past the ±3-viewport
// retain band when scrolled to the bottom, so its result releases.
const FILLER_CELL_COUNT = 20

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
  cy.getByDataHook("mcp-bridge-status-pill", { timeout: 10000 }).should(
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

const probeGridCell = (options = {}) =>
  cy.contains('[data-hook="grid-cell"]', PROBE_VALUE, options)

describe("notebook result restore (e2e)", () => {
  it("restores a run cell's grid after a far scroll round-trip and after a reload", () => {
    loginAndVisitDeepLink()
    cy.getByDataHook("mcp-pair-consent-connect").click()
    waitForPaired()

    // Given a notebook with a run cell followed by a tall stack of cells,
    // built and run in the background over the bridge.
    callTool("create_notebook", { label: NOTEBOOK_LABEL }).then((created) => {
      callTool("get_notebook_state", { buffer_id: created.bufferId })
      callTool("add_cell", {
        buffer_id: created.bufferId,
        sql: PROBE_SQL,
        after_cell_id: null,
        run: true,
        type: "sql",
      })
      for (let i = 0; i < FILLER_CELL_COUNT; i++) {
        callTool("add_cell", {
          buffer_id: created.bufferId,
          sql: `select ${i}`,
          after_cell_id: null,
          run: false,
          type: "sql",
        })
      }
    })

    // When the notebook is opened
    cy.getByDataHook("agent-changes-view", { timeout: 10000 }).click()
    cy.get(".chrome-tab[active]").should(
      "have.attr",
      "data-tab-title",
      NOTEBOOK_LABEL,
    )

    // Then the run cell's grid hydrates from its persisted snapshot
    probeGridCell({ timeout: 10000 }).should("exist")

    // When the user scrolls far past the retain band, the grid unmounts
    // (content drop) and its data releases back to IndexedDB
    cy.get("[data-cell-id]").last().scrollIntoView()
    probeGridCell({ timeout: 10000 }).should("not.exist")

    // Then scrolling back re-hydrates the same grid — not a stuck shimmer
    cy.get("[data-cell-id]").first().scrollIntoView()
    probeGridCell({ timeout: 10000 }).should("exist")

    // When the page reloads with the notebook still the active tab
    cy.reload()

    // Then the run cell restores its grid from the snapshot
    cy.get(".chrome-tab[active]", { timeout: 10000 }).should(
      "have.attr",
      "data-tab-title",
      NOTEBOOK_LABEL,
    )
    probeGridCell({ timeout: 15000 }).should("exist")
  })
})
