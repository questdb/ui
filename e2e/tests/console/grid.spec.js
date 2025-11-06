/// <reference types="cypress" />

const rowHeight = 30

const assertRowCount = () => {
  cy.get(".qg-viewport").then(($el) => {
    cy.getGridRows().should("have.length", Math.ceil($el.height() / rowHeight))
  })
}

describe("questdb grid", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
  })

  it("when results empty", () => {
    cy.typeQuery("select x from long_sequence(0)")
    cy.runLine()
    cy.getGridRows().should("have.length", 0)
  })

  it("when results have vertical scroll", () => {
    cy.typeQuery(`select x from long_sequence(100)`)
    cy.runLine()
    cy.wait(100)
    cy.getGridViewport().then(($el) => {
      cy.getGridRows().should(
        "have.length",
        Math.ceil($el.height() / rowHeight),
      )
      cy.getGridRow(0).should("contain", "1")
    })

    cy.getGridViewport().scrollTo("bottom")
    cy.getGridViewport().then(($el) => {
      const totalRows = Math.ceil($el.height() / rowHeight)
      cy.getGridRows().should("have.length", totalRows)
      cy.getGridRow(totalRows - 1).should("contain", "100")
    })
  })

  it("multiple scrolls till the bottom", () => {
    const rows = 1000
    const rowsPerPage = 128
    cy.typeQuery(`select x from long_sequence(${rows})`)
    cy.runLine()

    for (let i = 0; i < rows; i += rowsPerPage) {
      cy.getGridViewport().scrollTo(0, i * rowHeight)
      cy.wait(100)
      cy.getGrid()
        .contains(i + 1)
        .click()
    }

    cy.getGridViewport().scrollTo("bottom")
  })

  it("multiple scrolls till the bottom with error", () => {
    const rows = 1200
    cy.typeQuery(`select simulate_crash('P') from long_sequence(${rows})`)
    cy.runLine()

    cy.getGridViewport().scrollTo(0, 999 * rowHeight)
    cy.getCollapsedNotifications().should("contain", "1,200 rows in")

    cy.getGridViewport().scrollTo("bottom")
    cy.wait(100)
    cy.getCollapsedNotifications().should(
      "contain",
      "simulated cairo exception",
    )
  })

  it("copy cell into the clipboard", () => {
    cy.typeQuery("select x from long_sequence(10)")
    cy.runLine()
    cy.getGridCol(0).type("{ctrl}c")
    cy.getGridCol(0).should("have.class", "qg-c-active-pulse")
  })
})
