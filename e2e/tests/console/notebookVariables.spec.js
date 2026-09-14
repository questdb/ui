/// <reference types="cypress" />

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl = `http://localhost:9999${contextPath}`

const {
  installFakeWebSocket,
  TEST_BRIDGE_TOKEN,
  TEST_BRIDGE_URL,
} = require("../../utils/mcpFakeWebSocket")
const { seedNotebookOnboarding } = require("../../utils")

const NOTEBOOK_LABEL = "Variables NB"
const PAIR_QUERY = "select 'EURUSD' as symbol"
const CELL_SQL = "select @pair as chosen"
const DECLARED_VALUE = "@pair := 'EURUSD'"

const pairList = {
  name: "pair",
  kind: "list",
  source: { type: "query", query: PAIR_QUERY, refresh: "onLoad" },
  sort: "none",
  multi: true,
  include_all: true,
  all: { mode: "list" },
  selected: "all",
}

const cellRequest = (value) => ({
  id: null,
  name: null,
  value,
  preserve_value: null,
  type: "sql",
  mode: "run",
  auto_refresh: null,
  editor_height: null,
  result_height: null,
  view: null,
  chart_config: null,
  grid: null,
})

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
  cy.window({ timeout: 15000 }).should((win) => {
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

const decodedQuery = (call) => decodeURIComponent(call.request.url)

const dismissPairingConsent = () =>
  cy.get("body").then(($body) => {
    if ($body.find('[data-hook="mcp-pair-consent-cancel"]').length > 0) {
      cy.getByDataHook("mcp-pair-consent-cancel").click()
    }
  })

describe("notebook query-list variable values (e2e)", () => {
  it("stores fetched values, declares them headlessly, and shows them on reload before the refetch", () => {
    // Given the browser is paired to the bridge and every query is observed
    loginAndVisitDeepLink()
    cy.getByDataHook("mcp-pair-consent-connect").click()
    waitForPaired()
    cy.intercept("**/exec*").as("exec")

    // When the agent builds a notebook with a query list in the background
    callTool("create_notebook", { label: NOTEBOOK_LABEL }).then((created) => {
      callTool("get_notebook_state", { buffer_id: created.bufferId })
      callTool("apply_notebook_state", {
        buffer_id: created.bufferId,
        layout_mode: null,
        auto_refresh_default: null,
        maximized_cell_id: null,
        variables: [pairList],
        cells: [cellRequest(CELL_SQL)],
      }).then((applied) => {
        // Then the values were fetched and stored before the auto-run
        expect(applied.variable_values).to.have.length(1)
        expect(applied.variable_values[0]).to.include({
          name: "pair",
          count: 1,
        })
        expect(applied.runs[0].success).to.equal(true)

        // When the agent runs the cell again while the notebook is closed
        const cellId = applied.applied.added[0]
        callTool("run_cell", {
          buffer_id: created.bufferId,
          cell_id: cellId,
        }).then((run) => {
          expect(run.success).to.equal(true)
        })

        // Then the stored value was declared and the option query ran only once
        cy.get("@exec.all").should((calls) => {
          const queries = calls.map(decodedQuery)
          const optionFetches = queries.filter((q) => q.includes(PAIR_QUERY))
          const cellRuns = queries.filter(
            (q) => q.includes(CELL_SQL) && q.includes(DECLARED_VALUE),
          )
          expect(optionFetches, "option fetches").to.have.length(1)
          expect(cellRuns, "declared cell runs").to.have.length(2)
        })

        // When the user is taken to the notebook
        callTool("activate_notebook", {
          buffer_id: created.bufferId,
          cell_to_focus: null,
        }).then((activated) => {
          // Then the activation waited for the open's refresh of the list
          expect(activated.variable_values.map((v) => v.name)).to.include(
            "pair",
          )
        })
        cy.get(".chrome-tab[active]").should(
          "have.attr",
          "data-tab-title",
          NOTEBOOK_LABEL,
        )
        cy.getByDataHook("variable-list-pair").should("be.visible")
      })
    })

    // When the page reloads and the option query is slow
    cy.intercept("**/exec*", (req) => {
      if (decodeURIComponent(req.url).includes(PAIR_QUERY)) {
        req.on("response", (res) => res.setDelay(4000))
      }
    })
    cy.reload()
    dismissPairingConsent()

    // Then the picker lists the stored value while the refetch is still running
    cy.getByDataHook("variable-list-pair", { timeout: 15000 }).click()
    cy.getByDataHook("variable-list-status-pair").should(
      "contain",
      "Loading values",
    )
    cy.contains('[role="menuitemcheckbox"]', "EURUSD").should("exist")
  })
})
