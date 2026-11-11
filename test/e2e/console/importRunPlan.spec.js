/// <reference types="cypress" />

// An exported notebook carries which cells were showing a result, but not
// the rows. On import, read-only cells that were showing a result run again;
// cells with DDL/DML are held and the toast says so.
describe("import runs read-only cells", () => {
  beforeEach(() => {
    // A plain console: no example dashboards, whatever the served config says.
    cy.intercept("GET", "**/assets/console-configuration.json", {
      body: { ctaBanner: false, readOnly: false },
    })
    cy.loadConsoleWithAuth()
    cy.getEditorTabs().should("be.visible")
  })

  it("re-runs DQL cells that were showing results and holds DDL/DML ones", () => {
    cy.getByDataHook("editor-tabs-menu-button").click()
    cy.getByDataHook("editor-tabs-menu-import").click()
    cy.getByDataHook("editor-tabs-import-input").selectFile(
      "test/e2e/fixtures/notebook-run-plan-export.json",
      { force: true },
    )

    cy.get(".toast-success-container")
      .should("be.visible")
      .should("contain", "Imported 1 tab successfully.")
      .should("contain", "1 cell containing DDL/DML was not run automatically.")

    cy.getEditorTabByTitle("Imported notebook runs")
      .find(".chrome-tab-drag-handle")
      .click()
    cy.get("[data-notebook-root]").should("be.visible")

    // The read-only cell has its rows back; the write cell shows its editor
    // only (nothing ran); the cell that never ran stays as it was.
    const cell = (id) => cy.get(`[data-notebook-cell][data-cell-id="${id}"]`)
    cell("dql").find('[data-hook="grid-cell"]').should("contain", "7")
    cell("dml").find('[data-hook="grid-cell"]').should("not.exist")
    cell("never").find('[data-hook="grid-cell"]').should("not.exist")
    cy.execQuery(
      "SELECT count() FROM tables() WHERE table_name = 'import_run_plan_t'",
    ).then((res) => expect(res.body.dataset[0][0]).to.equal(0))
  })
})
