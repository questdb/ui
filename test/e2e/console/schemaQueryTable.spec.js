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
  // Through the HTTP API, not the editor: a statement run from the editor may
  // still be running when the next one starts, which opens the "Cancel
  // current query?" dialog.
  const dropTables = () => {
    cy.execAdminQuery("DROP TABLE IF EXISTS query_action_trades")
    cy.execAdminQuery("DROP TABLE IF EXISTS query_action_spaced")
    cy.execAdminQuery('DROP TABLE IF EXISTS "limit"')
  }

  // WAL rows become visible once applied, a moment after the insert.
  const waitForRowCount = (table, count) => {
    const poll = (attempt) =>
      cy
        .execAdminQuery(`SELECT count() FROM ${table}`)
        .its("body.dataset")
        .then((dataset) => {
          if (dataset[0][0] === count) return
          if (attempt >= 50) {
            throw new Error(`${table} has ${dataset[0][0]} rows, not ${count}`)
          }
          cy.wait(200)
          poll(attempt + 1)
        })
    poll(0)
  }

  before(() => {
    dropTables()
    cy.execAdminQuery(
      "CREATE TABLE query_action_trades (symbol SYMBOL, price DOUBLE, timestamp TIMESTAMP) timestamp(timestamp) PARTITION BY DAY WAL",
    )
    cy.execAdminQuery(
      "INSERT INTO query_action_trades VALUES ('BTC-USD', 1.0, now()), ('ETH-USD', 2.0, now())",
    )
    cy.execAdminQuery(
      'CREATE TABLE query_action_spaced (v INT, "my ts" TIMESTAMP) timestamp("my ts") PARTITION BY DAY BYPASS WAL',
    )
    cy.execAdminQuery("INSERT INTO query_action_spaced VALUES (7, now())")
    cy.execAdminQuery(
      'CREATE TABLE "limit" (v INT, ts TIMESTAMP) timestamp(ts) PARTITION BY DAY BYPASS WAL',
    )
    cy.execAdminQuery('INSERT INTO "limit" VALUES (3, now())')
    waitForRowCount("query_action_trades", 2)
    cy.loadConsoleWithAuth()
    cy.getEditorContent().should("be.visible")
  })

  after(dropTables)

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

    // And it refreshes on Auto as the notebook default, with no cell override
    cy.get('[aria-label="Notebook auto-refresh: Auto"]').should("be.visible")

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
  it("double-quotes a table name that is an SQL keyword", () => {
    // Given a table named like a keyword
    cy.getEditorTabByTitle("SQL").find(".chrome-tab-drag-handle").click()
    cy.refreshSchema()
    cy.expandTables()

    // When the user clicks its Query action
    clickQuery("limit")

    // Then the query quotes the name and returns the row
    cy.getEditorTabByTitle("limit").should("have.attr", "active")
    shouldContainText(
      cy.get("[data-notebook-root]"),
      'SELECT * FROM "limit" ORDER BY ts DESC',
    )
    cy.get("[data-notebook-root]").should("contain", "1 row")
  })

  it("creates one notebook when the Query button is double-clicked", () => {
    // Given no notebook for the table yet
    cy.getEditorTabByTitle("SQL").find(".chrome-tab-drag-handle").click()
    cy.getEditorTabs().each(($tab) => {
      if ($tab.text().trim() === "query_action_spaced") {
        cy.wrap($tab).find(".chrome-tab-close").click({ force: true })
      }
    })
    cy.refreshSchema()
    cy.expandTables()

    // When the user double-clicks the button
    tableRow("query_action_spaced")
      .find('[data-hook="table-query-button"]')
      .dblclick({ force: true })

    // Then one notebook opens
    cy.getEditorTabByTitle("query_action_spaced").should("have.attr", "active")
    cy.wait(1000)
    cy.get(".chrome-tab")
      .filter(':contains("query_action_spaced")')
      .should("have.length", 1)
  })

  it("places the new notebook after tabs opened since the schema rendered", () => {
    // Given the schema tree is rendered and then two tabs are added
    cy.loadConsoleWithAuth()
    cy.getEditorContent().should("be.visible")
    cy.refreshSchema()
    cy.expandTables()
    tableRow("query_action_trades").should("be.visible")
    cy.addEditorTab()
    cy.getEditorTabs().should("have.length", 2)
    cy.addEditorTab()
    cy.getEditorTabs().should("have.length", 3)

    // When the user queries a table from the tree
    clickQuery("query_action_trades")

    // Then its notebook is the last tab
    cy.getEditorTabByTitle("query_action_trades").should("have.attr", "active")
    cy.getEditorTabs().should("have.length", 4)
    cy.getEditorTabs().last().should("contain", "query_action_trades")
  })

  it("queries a table from the keyboard and from the context menu", () => {
    cy.loadConsoleWithAuth()
    cy.getEditorContent().should("be.visible")
    cy.refreshSchema()
    cy.expandTables()

    // When the user presses Ctrl/Cmd+Enter on a focused table row
    tableRow("query_action_spaced").click()
    tableRow("query_action_spaced").should("be.focused")
    cy.realPress([Cypress.platform === "darwin" ? "Meta" : "Control", "Enter"])

    // Then the table's notebook opens, and the details drawer does not
    cy.getEditorTabByTitle("query_action_spaced").should("have.attr", "active")
    cy.getByDataHook("table-details-drawer").should("not.exist")

    // When the user picks "Query in a notebook" from the context menu
    cy.getEditorTabByTitle("SQL").find(".chrome-tab-drag-handle").click()
    tableRow("query_action_trades").rightclick()
    cy.getByDataHook("table-context-menu-query").click()

    // Then that table's notebook opens
    cy.getEditorTabByTitle("query_action_trades").should("have.attr", "active")
  })

  it("keeps the details button clickable while the Query tooltip shows", () => {
    cy.loadConsoleWithAuth()
    cy.getEditorContent().should("be.visible")
    cy.refreshSchema()
    cy.expandTables()

    // Given the Query tooltip is showing
    tableRow("query_action_trades").realHover()
    cy.hoverForTooltip(() =>
      tableRow("query_action_trades").find('[data-hook="table-query-button"]'),
    )
    cy.getByDataHook("tooltip").should("contain", "Query in a notebook")

    // Then nothing covers the details button next to it
    tableRow("query_action_trades")
      .find('[data-hook="table-menu-button"]')
      .then(($info) => {
        const rect = $info[0].getBoundingClientRect()
        const top = $info[0].ownerDocument.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        )
        expect($info[0].contains(top), "details button is on top").to.equal(
          true,
        )
      })
  })
})
