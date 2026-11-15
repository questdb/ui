/// <reference types="cypress" />

// An exported notebook carries which cells were showing a result, but not
// the rows. On import, read-only cells that were showing a result run again;
// cells with DDL/DML are held and the toast says so.

// The stored lastRunStatus of a notebook cell, polled until it matches: the
// imported cells run in the background, before the tab is opened.
const waitForStoredRunStatus = (label, cellId, expected) =>
  cy.window().then((win) => {
    const deadline = Date.now() + 10000
    const read = () =>
      new Cypress.Promise((resolve, reject) => {
        const request = win.indexedDB.open("web-console")
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction("buffers", "readonly")
          const rows = transaction.objectStore("buffers").getAll()
          transaction.onerror = () => {
            database.close()
            reject(transaction.error)
          }
          transaction.oncomplete = () => {
            database.close()
            const buffer = rows.result.find((row) => row.label === label)
            const cell = buffer?.notebookViewState?.cells.find(
              (candidate) => candidate.id === cellId,
            )
            resolve(cell?.lastRunStatus)
          }
        }
      })
    const poll = () =>
      read().then((actual) => {
        if (actual === expected) return
        if (Date.now() >= deadline) {
          throw new Error(
            `Cell ${cellId} lastRunStatus ${actual}, expected ${expected}`,
          )
        }
        return new Cypress.Promise((resolve) =>
          win.setTimeout(resolve, 50),
        ).then(poll)
      })
    return poll()
  })

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

    // The console ran the cell for the user, not an agent: once the run has
    // committed, no agent change is announced.
    waitForStoredRunStatus("Imported notebook runs", "dql", "success")
    // An announcement follows the commit; give it time to render before
    // checking that there is none.
    cy.wait(1000)
    cy.getByDataHook("agent-changes-popper").should("not.exist")
    cy.getByDataHook("mcp-status-pill").should("not.contain", "new changes")

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
