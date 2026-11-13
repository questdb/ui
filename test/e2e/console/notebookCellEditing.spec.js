/// <reference types="cypress" />

const cell = (id, position) => ({ id, position, value: "SELECT 1" })
const menuOf = (id) =>
  cy.get(`[data-cell-id="${id}"] button[aria-label="More actions"]`)

describe("notebook cell edit menu focus", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth(
      false,
      {},
      {
        buffers: [
          {
            label: "Editing",
            notebookViewState: {
              cells: [cell("source", 0), cell("target", 1)],
              focusedCellId: "source",
            },
          },
        ],
      },
    )
    menuOf("source").click()
    cy.contains('[role="menuitem"]', "Copy cell").click()
  })

  for (const method of ["menu", "shortcut"]) {
    it(`keeps the pasted cell selected after ${method} paste closes the menu`, () => {
      menuOf("target").click()
      if (method === "menu") {
        cy.contains('[role="menuitem"]', "Paste cell below").click()
      } else {
        cy.realPress([Cypress.platform === "darwin" ? "Meta" : "Control", "V"])
      }
      cy.get("[data-notebook-cell]")
        .should("have.length", 3)
        .last()
        .invoke("attr", "data-cell-id")
        .then((pastedId) => {
          // Radix restores trigger focus in deferred unmount cleanup. Check
          // after that cleanup, rather than accepting the transient rAF focus.
          cy.wait(200)
          cy.focused().should("have.attr", "data-cell-id", pastedId)
          cy.realPress("Delete")
          cy.get(`[data-cell-id="${pastedId}"]`).should("not.exist")
          cy.get('[data-cell-id="target"]').should("exist")
        })
    })
  }

  it("keeps the duplicate focused after its menu closes", () => {
    menuOf("target").click()
    cy.contains('[role="menuitem"]', "Duplicate").click()
    cy.get("[data-notebook-cell]")
      .should("have.length", 3)
      .last()
      .invoke("attr", "data-cell-id")
      .then((id) => {
        cy.wait(200)
        cy.focused().should("have.attr", "data-cell-id", id)
      })
  })

  it("restores trigger focus when the menu is dismissed normally", () => {
    menuOf("target").click()
    cy.realPress("Escape")
    menuOf("target").should("have.focus")
  })
})
