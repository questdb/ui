/// <reference types="cypress" />

const { createNotebookBuffer } = require("../utils/editorBuffers")

const QUERY_SQL = "SELECT * FROM query_action_trades ORDER BY timestamp DESC"

const tableRow = (name) =>
  cy
    .get('[data-hook="schema-row"]')
    .contains(name)
    .parents('[data-hook="schema-row"]')
    .first()

const clickQuery = (name) =>
  tableRow(name).find('[data-hook="table-query-button"]').click({ force: true })

// Monaco renders spaces as non-breaking spaces.
const shouldContainText = (cell, text) =>
  cell.should(($cell) => {
    expect($cell.text().replace(/\u00a0/g, " ")).to.include(text)
  })

const notebookCells = () => cy.get("[data-notebook-root] [data-notebook-cell]")

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
    cy.executeSQL("DROP TABLE IF EXISTS query_action_spaced;")
    cy.executeSQL(
      'CREATE TABLE query_action_spaced (v INT, "my ts" TIMESTAMP) timestamp("my ts") PARTITION BY DAY BYPASS WAL;',
    )
    cy.executeSQL("INSERT INTO query_action_spaced VALUES (7, now());")
  })

  after(() => {
    // executeSQL needs the SQL editor tab active
    cy.getEditorTabByTitle("SQL").find(".chrome-tab-drag-handle").click()
    cy.getEditorContent().should("be.visible")
    cy.executeSQL("DROP TABLE IF EXISTS query_action_trades;")
    cy.executeSQL("DROP TABLE IF EXISTS query_action_spaced;")
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

  it("orders by a designated timestamp whose name needs quoting", () => {
    // Given a table whose designated timestamp is not a plain identifier
    cy.getEditorTabByTitle("SQL").find(".chrome-tab-drag-handle").click()
    cy.refreshSchema()
    cy.expandTables()

    // When the user clicks its Query action
    clickQuery("query_action_spaced")

    // Then the query double-quotes the column and returns the row
    cy.getEditorTabByTitle("query_action_spaced").should("have.attr", "active")
    cy.get("[data-notebook-root]").should(
      "contain",
      'SELECT * FROM query_action_spaced ORDER BY "my ts" DESC',
    )
    cy.get("[data-notebook-root]").should("contain", "1 row")
    cy.get("[data-notebook-root]").should("not.contain", "Invalid column")
  })

  it("adds the query to a notebook of the same name once, then focuses it", () => {
    // Given the user's own notebook named after the table, with another query
    cy.loadConsoleWithAuth(
      false,
      {},
      {
        activeBufferId: 1,
        buffers: [
          { label: "SQL", value: "" },
          {
            ...createNotebookBuffer("SELECT 'my unrelated analysis'"),
            label: "query_action_trades",
          },
        ],
      },
    )
    cy.getEditorContent().should("be.visible")
    cy.refreshSchema()
    cy.expandTables()

    // When the user clicks the table's Query action
    clickQuery("query_action_trades")

    // Then that notebook opens with its cell kept and the query appended, run
    cy.getEditorTabByTitle("query_action_trades").should("have.attr", "active")
    cy.getEditorTabs().should("have.length", 2)
    notebookCells().should("have.length", 2)
    shouldContainText(notebookCells().first(), "my unrelated analysis")
    shouldContainText(notebookCells().last(), QUERY_SQL)
    notebookCells().last().should("contain", "2 rows")
    notebookCells().last().find(".monaco-editor textarea").should("have.focus")

    // When the user clicks it again from another tab
    cy.getEditorTabByTitle("SQL").find(".chrome-tab-drag-handle").click()
    cy.getEditorContent().should("be.visible")
    clickQuery("query_action_trades")

    // Then the existing query cell is reused, not added again
    cy.getEditorTabByTitle("query_action_trades").should("have.attr", "active")
    cy.getEditorTabs().should("have.length", 2)
    notebookCells().should("have.length", 2)
    notebookCells().last().find(".monaco-editor textarea").should("have.focus")
  })
})
