/// <reference types="cypress" />

const queryOf = (call) => new URL(call.request.url).searchParams.get("query")

const openCellTimeDialog = () => {
  cy.get("[data-notebook-cell]")
    .first()
    .find('button[aria-label="More actions"]')
    .click({ force: true })
  cy.getByDataHook("cell-time-range-item").click()
  cy.getByDataHook("cell-time-dialog").should("be.visible")
}

describe("Notebook cell time range", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
  })

  it("overrides and shifts one cell's range, shows it in the header, and clears back to the notebook", () => {
    // Given a notebook on the last hour
    cy.createNotebook()
    cy.getByDataHook("notebook-time-range").click()
    cy.getByDataHook("time-range-preset")
      .contains(/^Last 1 hour$/)
      .click()
    cy.getByDataHook("time-range-picker").should("not.exist")
    cy.intercept("GET", "**/exec*").as("exec")

    // When the user gives the cell its own range and a shift
    openCellTimeDialog()
    cy.getByDataHook("cell-time-preset")
      .contains(/^Last 15 minutes$/)
      .click()
    cy.getByDataHook("time-range-dateFrom").should("have.value", "now-15m")
    cy.getByDataHook("cell-time-shift").type("-1d")
    cy.getByDataHook("cell-time-show-header").check({ force: true })
    cy.getByDataHook("cell-time-preview")
      .invoke("text")
      .should("match", /dateadd\('d',\s-1,\snow\(\)\)/)
    cy.getByDataHook("cell-time-apply").click()
    cy.getByDataHook("cell-time-dialog").should("not.exist")

    // Then the header shows it and the run declares the cell window, shifted once
    cy.getByDataHook("cell-time-control").should("contain", "Last 15 minutes, -1d")
    cy.runNotebookQuery("select datediff('h', @timeFrom, now()) as hours_back")
    cy.getGridRow(0).should("contain", "24")
    cy.get("@exec.all").then((calls) => {
      const runs = calls
        .map(queryOf)
        .filter((q) => q && q.includes("hours_back"))
      expect(runs.length).to.be.greaterThan(0)
      runs.forEach((q) => {
        expect(q).to.contain("@timeTo := dateadd('d', -1, now())")
        expect(q).to.contain("@timeFrom := dateadd('m', -15, @timeTo)")
        expect(q).not.to.contain("dateadd('h', -1")
      })
    })

    // When the user clears it from the header control
    cy.getByDataHook("cell-time-control").click()
    cy.getByDataHook("cell-time-dialog").should("be.visible")
    cy.getByDataHook("cell-time-clear").click()
    cy.getByDataHook("cell-time-dialog").should("not.exist")
    cy.getByDataHook("cell-time-control").should("not.exist")

    // Then the cell follows the notebook again
    cy.runNotebookQuery(
      "select datediff('m', @timeFrom, now()) as minutes_back",
    )
    cy.getGridRow(0).should("contain", "60")

    // When the user shifts the notebook range forward for this cell only
    openCellTimeDialog()
    cy.getByDataHook("cell-time-shift-preset")
      .contains(/^\+1d$/)
      .click()
    cy.getByDataHook("cell-time-show-header").check({ force: true })
    cy.getByDataHook("cell-time-apply").click()
    cy.getByDataHook("cell-time-dialog").should("not.exist")
    cy.getByDataHook("cell-time-control").should("contain", "+1d")

    // Then @timeFrom lands one day ahead of the notebook value
    cy.runNotebookQuery("select datediff('h', now(), @timeFrom) as hours_ahead")
    cy.getGridRow(0).should("contain", "23")
  })
})
