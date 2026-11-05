/// <reference types="cypress" />

// Cell controls that only a real browser exercises: the Stop control of a
// first run or first chart fetch.

const HELD_QUERY = /\/exec\?.*long_sequence/
const CHART_SQL =
  "select timestamp_sequence(0, 1000000) ts, x from long_sequence(50)"

const setCellSql = (sql) => {
  cy.focusNotebookCell()
  cy.withFocusedEditor((editor) => editor.setValue(sql))
}

const runFocusedCell = () =>
  cy.withFocusedEditor((editor) => editor.getAction("notebook-run").run())

// Holds the first matching request open until the test releases it, so the
// cell stays in its first run while the test drives the Stop control. The
// release must follow within Cypress's command timeout, or the held handler
// itself fails the test.
const holdFirstExec = () => {
  const held = {}
  cy.intercept(
    { url: HELD_QUERY, times: 1 },
    () =>
      new Cypress.Promise((resolve) => {
        held.release = resolve
      }),
  )
  return held
}

const awaitHeld = (held) =>
  cy.wrap(null).should(() => {
    expect(held.release, "the exec request is held").to.be.a("function")
  })

const clickStop = (label) => {
  cy.getByDataHook("cell-stop-button")
    .should("have.attr", "aria-label", label)
    .click()
}

describe("notebook cell controls", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
    cy.createNotebook()
  })

  describe("Stop", () => {
    it("cancels a first run and reports it in the result", () => {
      // Given a cell whose first run the server has not answered yet
      const held = holdFirstExec()
      setCellSql("select x from long_sequence(100)")
      runFocusedCell()
      awaitHeld(held)

      // When the run is stopped
      clickStop("Stop run")
      cy.then(() => held.release())

      // Then the result reports the cancelled run and Stop is gone
      cy.get("[data-notebook-cell]")
        .contains("Cancelled by user")
        .should("be.visible")
      cy.getByDataHook("cell-stop-button").should("not.exist")
    })

    it("cancels a first chart fetch and retries it", () => {
      // Given a draw cell whose first fetch the server has not answered yet
      const held = holdFirstExec()
      setCellSql(CHART_SQL)
      cy.get("[data-notebook-cell] button[aria-label='Draw']").click()
      awaitHeld(held)

      // When the fetch is stopped
      clickStop("Stop chart loading")
      cy.then(() => held.release())

      // Then the canvas offers a retry instead of a spinner
      cy.getByDataHook("draw-canvas-cancelled").should("be.visible")
      cy.getByDataHook("cell-stop-button").should("not.exist")

      // When the fetch is retried, the chart loads from an unheld request
      cy.getByDataHook("draw-canvas-retry").click()
      cy.getByDataHook("draw-canvas-cancelled").should("not.exist")
      cy.getByDataHook("draw-canvas").find("canvas").should("be.visible")
    })
  })
})
