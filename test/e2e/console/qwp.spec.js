/// <reference types="cypress" />

// The console sends its SQL over QWP, QuestDB's binary WebSocket protocol,
// and over `/exec` only where QWP cannot serve a request.

const baseUrl = Cypress.config("baseUrl")
const table = `qwp_e2e_${Date.now()}`
const sleepQuery = "sleep(30.0) /* qwp_cancel_journey */"

let httpQueries = []

const loadConsole = (query) => {
  httpQueries = []
  cy.intercept("GET", "**/exec*", (request) => {
    httpQueries.push(new URL(request.url).searchParams.get("query"))
  })
  cy.loadConsoleWithAuth(false, {}, { buffers: [{ value: query }] })
  // The console's first reads open the first connection.
  cy.window().its("__sqlRequests.qwp").should("be.above", 0)
}

const sentOverHttp = (text) =>
  cy.then(() => httpQueries.filter((query) => query?.includes(text)))

// A run with `--expose sqlTransport=http` has no QWP to test.
const describeQwp =
  Cypress.expose("sqlTransport") === "http" ? describe.skip : describe

describeQwp("SQL over QWP", () => {
  after(() => {
    cy.execAdminQuery(`DROP TABLE IF EXISTS ${table};`)
    cy.execAdminQuery(
      "select query_id from query_activity() where query like '%qwp_cancel_journey%'",
    ).then(({ body }) => {
      for (const [id] of body.dataset ?? []) {
        cy.request({
          url: `${baseUrl}/exec`,
          qs: { query: `CANCEL QUERY ${id}` },
          headers: { Authorization: `Basic ${btoa("admin:quest")}` },
          failOnStatusCode: false,
        })
      }
    })
  })

  it("shows the values QuestDB streams, as /exec would send them", () => {
    // Given
    loadConsole(
      "select x, x * 9007199254740993L l, 0.1::float f, " +
        "'2024-01-02T03:04:05.123456Z'::timestamp ts, " +
        "'11111111-2222-3333-4444-555555555555'::uuid u, " +
        "cast(null as varchar) n from long_sequence(2)",
    )

    // When
    cy.clickRunQuery()

    // Then
    cy.getGridCellAt(0, 0).should("have.text", "1")
    cy.getGridCellAt(1, 1).should("have.text", "18014398509481986")
    cy.getGridCellAt(0, 2).should("have.text", "0.1")
    cy.getGridCellAt(0, 3).should("have.text", "2024-01-02T03:04:05.123456Z")
    cy.getGridCellAt(0, 4).should(
      "have.text",
      "11111111-2222-3333-4444-555555555555",
    )
    cy.getGridCellAt(0, 5).should("have.text", "null")
    sentOverHttp("9007199254740993L").should("be.empty")
  })

  it("loads deep pages over QWP", () => {
    // Given
    loadConsole("select x a, x * 10 b from long_sequence(5000)")
    cy.clickRunQuery()
    cy.getGridCellAt(0, 0).should("have.text", "1")

    // When
    cy.getGridViewport().scrollTo("bottom")

    // Then
    cy.getGridCellAt(4999, 0).should("have.text", "5000")
    cy.getGridCellAt(4999, 1).should("have.text", "50000")
    sentOverHttp("long_sequence(5000)").should("be.empty")
  })

  it("marks where the query fails", () => {
    // Given
    loadConsole("select foo from long_sequence(1)")

    // When
    cy.clickRunQuery()

    // Then
    cy.getByDataHook("error-notification").should(
      "contain",
      "Invalid column: foo",
    )
    cy.window().should((win) => {
      const model = win.monaco.editor.getEditors()[0].getModel()
      const markers = win.monaco.editor.getModelMarkers({
        resource: model.uri,
      })
      expect(markers.map((marker) => model.getValueInRange(marker))).to.include(
        "foo",
      )
    })
    sentOverHttp("select foo").should("be.empty")
  })

  it("runs statements", () => {
    // Given
    loadConsole(
      `CREATE TABLE ${table} (ts TIMESTAMP, x LONG) TIMESTAMP(ts) PARTITION BY DAY WAL;`,
    )

    // When
    cy.clickRunQuery()

    // Then
    cy.getByDataHook("success-notification").should("contain", table)

    // When
    cy.clearEditor()
    cy.typeQueryDirectly(`INSERT INTO ${table} VALUES (now(), 42);`)
    cy.clickRunQuery()

    // Then
    cy.getByDataHook("success-notification").should("contain", "INSERT")
    sentOverHttp(table).should("be.empty")
  })

  it("leaves results QWP cannot carry to /exec", () => {
    // Given
    const query = "select interval(0::timestamp, 1000000::timestamp) i"
    loadConsole(query)

    // When
    cy.clickRunQuery()

    // Then
    cy.getGridCellAt(0, 0).should("contain", "1970-01-01T00:00:01")
    sentOverHttp("select interval(").should("have.length", 1)
  })

  it("cancels a running query and runs the next one", () => {
    // Given
    loadConsole(sleepQuery)
    cy.getByDataHook("button-run-query").click()
    cy.getByDataHook("button-cancel-query").should("be.visible")

    // When
    cy.getByDataHook("button-cancel-query").click()

    // Then
    cy.getByDataHook("button-run-query").should("be.visible")
    cy.expandNotifications()
    cy.getExpandedNotifications().should("contain", "Cancelled by user")

    // When
    cy.clearEditor()
    cy.typeQueryDirectly("select 7 seven")
    cy.clickRunQuery()

    // Then
    cy.getGridCellAt(0, 0).should("have.text", "7")
    sentOverHttp("qwp_cancel_journey").should("be.empty")
  })
})
