/// <reference types="cypress" />

// E2E coverage for result grid highlight rules in a notebook cell: the drawer
// saves rules, a re-run flashes changed cells with a direction glyph, and a
// value rule colors a cell on the first run.

const openHighlightDrawer = () => {
  cy.get("[data-notebook-cell] button[aria-label='More actions']").click()
  cy.contains("[role='menuitem']", "Highlight rules").click()
  cy.getByDataHook("highlight-settings-drawer").should("be.visible")
}

const pickOption = (rule, label, option) => {
  cy.wrap(rule).find(`button[aria-label^="${label}"]`).click()
  cy.contains("[role^='menuitem']", option).click()
}

const addRule = (column, condition) => {
  cy.contains("button", "+ Add rule").click()
  cy.getByDataHook("highlight-rule")
    .last()
    .then(($rule) => {
      pickOption($rule, "Column", column)
      pickOption($rule, "Condition", condition)
    })
}

const runCell = () => {
  cy.get("[data-notebook-cell] button[aria-label='Run cell']").click()
  cy.get("[data-notebook-cell] [data-hook='grid-cell']").should("exist")
}

describe("notebook highlight rules", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
    cy.getEditorContent().should("be.visible")
    cy.createNotebook()
    cy.focusNotebookCell()
  })

  it("flashes changed values with a direction glyph after up and down rules are saved", () => {
    // Given a cell whose value changes on every run
    cy.focused().type("select 'A' as k, rnd_double() as v", { delay: 0 })
    runCell()

    // When an up rule and a down rule on v are saved
    openHighlightDrawer()
    cy.getByDataHook("highlight-identity-status").should("not.exist")
    addRule("v", "> previous")
    addRule("v", "< previous")
    cy.getByDataHook("highlight-rule").should("have.length", 2)
    cy.contains("button", "Save").click()
    cy.getByDataHook("highlight-settings-drawer").should("not.exist")

    // And the cell runs again
    cy.get("[data-notebook-cell] button[aria-label='Re-run query']").click()

    // Then the changed cell flashes and shows a direction
    cy.get("[data-hook='grid-cell'][data-highlight='temporary']").should(
      "have.length",
      1,
    )
    cy.get("[data-hook='grid-cell'][data-direction]").should("have.length", 1)
    openHighlightDrawer()
    cy.getByDataHook("highlight-identity-status").should("not.exist")
  })

  it("colors a cell that passes a value rule without a previous result", () => {
    // Given a cell with a constant value
    cy.focused().type("select 'A' as k, 5 as v", { delay: 0 })
    runCell()

    // When a "> value" rule on v is saved with a threshold of 1
    openHighlightDrawer()
    addRule("v", "> value")
    cy.getByDataHook("highlight-rule").within(() => {
      cy.get("[aria-label='Value']").clear().type("1")
    })
    cy.contains("button", "Save").click()

    // Then the cell is highlighted as a persistent match
    cy.get("[data-hook='grid-cell'][data-highlight='always']").should(
      "have.length",
      1,
    )

    // And Clear all removes the rules and the badge
    openHighlightDrawer()
    cy.contains("button", "Clear all").click()
    cy.get("[data-hook='grid-cell'][data-highlight]").should("not.exist")
  })

  it("colors every cell of the row when a rule applies to the row", () => {
    // Given a cell with two columns and a constant value
    cy.focused().type("select 'A' as k, 5 as v", { delay: 0 })
    runCell()

    // When a "> value" rule on v is saved with "Applies to" set to Row
    openHighlightDrawer()
    addRule("v", "> value")
    cy.getByDataHook("highlight-rule").within(() => {
      cy.get("[aria-label='Value']").clear().type("1")
    })
    cy.getByDataHook("highlight-rule").then(($rule) =>
      pickOption($rule, "Applies to", "Row"),
    )
    cy.contains("button", "Save").click()

    // Then both cells of the row are highlighted
    cy.get("[data-hook='grid-row'][data-highlight-row]").should(
      "have.length",
      1,
    )
    cy.get("[data-hook='grid-cell'][data-highlight='always']").should(
      "have.length",
      2,
    )
  })
})
