/// <reference types="cypress" />

describe("schema tree: Query action", () => {
  before(() => {
    cy.loadConsoleWithAuth()
    cy.getEditorContent().should("be.visible")
    cy.executeSQL("DROP TABLE IF EXISTS query_action_trades;")
    cy.executeSQL(
      "CREATE TABLE IF NOT EXISTS query_action_trades (symbol SYMBOL, price DOUBLE, timestamp TIMESTAMP) timestamp(timestamp) PARTITION BY DAY WAL;",
    )
    cy.executeSQL(
      "INSERT INTO query_action_trades VALUES ('BTC-USD', 1.0, now()), ('ETH-USD', 2.0, now());",
    )
  })

  after(() => {
    // executeSQL needs the SQL editor tab active
    cy.getEditorTabByTitle("SQL").find(".chrome-tab-drag-handle").click()
    cy.getEditorContent().should("be.visible")
    cy.executeSQL("DROP TABLE IF EXISTS query_action_trades;")
  })

  it("opens a live notebook reading the table's newest rows, and reuses it on a second click", () => {
    cy.refreshSchema()
    cy.expandTables()
    cy.get('[data-hook="schema-row"]')
      .contains("query_action_trades")
      .parents('[data-hook="schema-row"]')
      .first()
      .as("row")

    // When the user clicks the row's Query action
    cy.get("@row")
      .find('[data-hook="table-query-button"]')
      .click({ force: true })

    // Then a notebook named after the table opens, with the SQL visible and a result
    cy.getEditorTabByTitle("query_action_trades").should("have.attr", "active")
    cy.get("[data-notebook-root]").should(
      "contain",
      "Latest rows of query_action_trades",
    )
    cy.get("[data-notebook-root]").should(
      "contain",
      "SELECT * FROM query_action_trades ORDER BY timestamp DESC",
    )
    cy.get("[data-notebook-root]").should("contain", "2 rows")

    // When the user clicks it again
    cy.getEditorTabByTitle("SQL").find(".chrome-tab-drag-handle").click()
    cy.get("@row")
      .find('[data-hook="table-query-button"]')
      .click({ force: true })

    // Then the existing notebook is activated, not duplicated
    cy.getEditorTabByTitle("query_action_trades").should("have.attr", "active")
    cy.getEditorTabs().should("have.length", 2)
  })
})
