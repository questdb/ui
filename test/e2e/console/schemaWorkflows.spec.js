/// <reference types="cypress" />

const createMaterializedView = () => {
  cy.expandTables()
  cy.getByDataHook("schema-table-title").contains("btc_trades").rightclick()
  cy.getByDataHook("table-context-menu-create-matview").should(
    "not.have.attr",
    "data-disabled",
  )
  cy.getByDataHook("table-context-menu-create-matview").click()
}

const expectGeneratedCell = (count) => {
  cy.get("[data-notebook-cell]").should("have.length", count)
  cy.get("[data-notebook-cell]")
    .last()
    .find(".view-lines")
    .should("contain.text", "MATERIALIZED")
  cy.get("[data-notebook-cell]")
    .last()
    .find(".monaco-editor textarea")
    .should("have.focus")
}

describe("schema notebook workflows", () => {
  beforeEach(() => cy.createTable("btc_trades"))
  afterEach(() => cy.dropTableIfExists("btc_trades"))

  it("creates and focuses a notebook from a metrics tab and saves its generated DDL", () => {
    // Given
    cy.loadConsoleWithAuth(false, {}, { buffers: [{}] })
    cy.getEditorTabs().should("have.length", 1)
    cy.getByDataHook("schema-add-metrics-button").click()
    cy.getByDataHook("metrics-root").should("be.visible")
    cy.getEditorTabs().should("have.length", 2)
    // When
    createMaterializedView()
    // Then
    cy.getEditorTabs().should("have.length", 3)
    cy.getByDataHook("notebook-toolbar").should("be.visible")
    expectGeneratedCell(1)
    // When
    cy.reload()
    // Then
    cy.getEditorTabs().should("have.length", 3)
    cy.get("[data-notebook-cell]").should("have.length", 1)
    cy.get("[data-notebook-cell] .view-lines").should(
      "contain.text",
      "MATERIALIZED",
    )
  })

  it("appends generated DDL without changing the existing notebook cell", () => {
    // Given
    cy.loadConsoleWithAuth(
      false,
      {},
      {
        buffers: [
          {
            notebookViewState: {
              cells: [
                {
                  id: "existing-cell",
                  position: 0,
                  value: "select 'keep this cell'",
                  paneView: "editor_result",
                },
              ],
            },
          },
        ],
      },
    )
    // When
    createMaterializedView()
    // Then
    cy.getEditorTabs().should("have.length", 1)
    expectGeneratedCell(2)
    cy.get("[data-notebook-cell]")
      .first()
      .find(".view-lines")
      .should(($lines) =>
        expect($lines.text().replace(/\u00a0/g, " ")).to.contain(
          "select 'keep this cell'",
        ),
      )
    // When
    cy.reload()
    // Then
    cy.getEditorTabs().should("have.length", 1)
    cy.get("[data-notebook-cell]").should("have.length", 2)
    cy.get("[data-notebook-cell]")
      .first()
      .find(".view-lines")
      .should(($lines) =>
        expect($lines.text().replace(/\u00a0/g, " ")).to.contain(
          "select 'keep this cell'",
        ),
      )
    cy.get("[data-notebook-cell]")
      .last()
      .find(".view-lines")
      .should("contain.text", "MATERIALIZED")
  })
})

describe("read-only console", () => {
  it("blocks CSV import through pointer and keyboard when server configuration is read-only", () => {
    // Given
    cy.intercept("GET", "**/assets/console-configuration.json", {
      savedQueries: [],
      readOnly: true,
    })
    cy.loadConsoleWithAuth()
    const control = () => cy.getByDataHook("import-panel-button")
    // When
    cy.hoverForTooltip(control)
    // Then
    control().should("have.attr", "aria-disabled", "true")
    cy.getByDataHook("tooltip")
      .should("be.visible")
      .and(
        "contain",
        "To use this feature, turn off read-only mode in the configuration file",
      )
    // When
    control().click()
    // Then
    control().should("have.attr", "aria-pressed", "false")
    // When
    control().focus()
    cy.realPress("Enter")
    cy.realPress("Space")
    // Then
    control().should("have.attr", "aria-pressed", "false")
    cy.getByDataHook("import-dropbox").should("not.be.visible")
    cy.getByDataHook("create-table-panel").should("not.exist")
  })
})
