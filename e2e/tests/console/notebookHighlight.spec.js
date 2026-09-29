/// <reference types="cypress" />

// E2E coverage for result grid highlight rules in a notebook cell: the drawer
// saves rules, a re-run flashes changed cells with a direction glyph, and a
// value rule colors a cell on the first run.

// Every run returns a larger value than the run before it.
const RISING_VALUE_QUERY = "select 'A' as k, cast(now() as long) as v"

const openHighlightDrawer = () => {
  cy.get("[data-notebook-cell] button[aria-label='More actions']").click()
  cy.contains("[role='menuitem']", "Highlight rules").click()
  cy.getByDataHook("highlight-settings-drawer").should("be.visible")
}

const openChartDrawer = () => {
  cy.get("[data-notebook-cell] button[aria-label='More actions']").click()
  cy.contains("[role='menuitem']", "Chart settings").click()
  cy.getByDataHook("chart-settings-drawer").should("be.visible")
}

const pickOption = (rule, label, option) => {
  cy.wrap(rule).find(`button[aria-label^="${label}"]`).click()
  cy.contains("[role^='menuitem']", option).click()
}

const pickColumn = (rule, column) => {
  cy.wrap(rule).find("button[aria-label='Column']").click()
  cy.contains("[role='option']", new RegExp(`^${column}$`)).click()
}

const addRule = (column, condition) => {
  cy.contains("button", "+ Add rule").click()
  cy.getByDataHook("highlight-rule")
    .last()
    .then(($rule) => {
      pickColumn($rule, column)
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
    // Given a cell whose value grows on every run
    cy.focused().type(RISING_VALUE_QUERY, { delay: 0 })
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

    // Then the changed cell flashes in the up rule's color with an up glyph
    cy.get("[data-hook='grid-cell'][data-highlight='temporary']")
      .should("have.length", 1)
      .and("have.attr", "data-highlight-color", "dataPositive")
      .and("have.attr", "data-direction", "up")
      .and("contain.text", "▲")
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

    // Then the cell is painted as a persistent match in the rule's color
    cy.get("[data-hook='grid-cell'][data-highlight='always']")
      .should("have.length", 1)
      .and("have.attr", "data-highlight-color", "dataSeries2")

    // And Clear all removes the rules and the highlight
    openHighlightDrawer()
    cy.contains("button", "Clear all").click()
    cy.get("[data-hook='grid-cell'][data-highlight]").should("not.exist")
  })

  it("keeps an open draft when Highlight rules is chosen again from the menu", () => {
    // Given a drafted rule in the open drawer
    cy.focused().type("select 'A' as k, 5 as v", { delay: 0 })
    runCell()
    openHighlightDrawer()
    addRule("v", "> value")

    // When the menu entry is chosen again
    cy.get("[data-notebook-cell] button[aria-label='More actions']").click()
    cy.contains("[role='menuitem']", "Highlight rules").click()

    // Then the drawer stays open with the draft
    cy.getByDataHook("highlight-settings-drawer").should("be.visible")
    cy.getByDataHook("highlight-rule").should("have.length", 1)
  })

  it("does not save a dismissed draft when Enter follows Escape", () => {
    // Given a drafted rule whose value input has focus
    cy.focused().type("select 'A' as k, 5 as v", { delay: 0 })
    runCell()
    openHighlightDrawer()
    addRule("v", "> value")
    cy.getByDataHook("highlight-rule").within(() => {
      cy.get("[aria-label='Value']").clear().type("1")
    })

    // When the drawer is dismissed and Enter arrives while it slides out
    cy.realPress("Escape")
    cy.realPress("Enter")
    cy.getByDataHook("highlight-settings-drawer").should("not.exist")

    // Then nothing was saved
    cy.get("[data-hook='grid-cell'][data-highlight]").should("not.exist")
    openHighlightDrawer()
    cy.getByDataHook("highlight-rule").should("have.length", 0)
  })

  it("keeps the saved rules when Save is clicked again while the drawer slides out", () => {
    // Given a drafted rule
    cy.focused().type("select 'A' as k, 5 as v", { delay: 0 })
    runCell()
    openHighlightDrawer()
    addRule("v", "> value")
    cy.getByDataHook("highlight-rule").within(() => {
      cy.get("[aria-label='Value']").clear().type("1")
    })

    // When Save is clicked, and clicks keep landing on that spot while the
    // footer (Clear all included) slides under it
    cy.contains("button", "Save").then(($save) => {
      const rect = $save[0].getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      cy.wrap($save).click()
      for (let time = 20; time <= 240; time += 20) {
        cy.document().then((doc) =>
          doc.getAnimations().forEach((animation) => {
            animation.pause()
            animation.currentTime = time
          }),
        )
        cy.get("body").realClick({ x, y })
      }
      cy.document().then((doc) =>
        doc.getAnimations().forEach((animation) => animation.finish()),
      )
    })
    cy.getByDataHook("highlight-settings-drawer").should("not.exist")

    // Then the rule is still saved
    cy.get("[data-hook='grid-cell'][data-highlight='always']").should(
      "have.length",
      1,
    )
    openHighlightDrawer()
    cy.getByDataHook("highlight-rule").should("have.length", 1)
  })

  it("blocks Save on a bad threshold instead of storing another value", () => {
    // Given a "changed by at least" rule
    cy.focused().type("select 'A' as k, 5 as v", { delay: 0 })
    runCell()
    openHighlightDrawer()
    addRule("v", "changed by at least")

    // When a negative threshold is typed and saved
    cy.get("[aria-label='Change threshold']").clear().type("-5")
    cy.contains("button", "Save").click()

    // Then Save is blocked with the reason, and the field keeps what was typed
    cy.contains("Should be non-negative").should("be.visible")
    cy.get("[aria-label='Change threshold']").should("have.value", "-5")

    // When the field is emptied and saved
    cy.get("[aria-label='Change threshold']").clear()
    cy.contains("button", "Save").click()

    // Then Save is still blocked
    cy.contains("Should be a number").should("be.visible")
    cy.getByDataHook("highlight-settings-drawer").should("exist")
  })

  it("does not bring the drawer back after a run that failed while it was open", () => {
    // Given the drawer is open with an unsaved rule
    cy.focused().type("select 'A' as k, 5 as v", { delay: 0 })
    runCell()
    openHighlightDrawer()
    addRule("v", "> value")

    // When the run-all shortcut fires from inside the drawer and the run fails
    cy.intercept({ url: /\/exec\?/, times: 1 }, (req) =>
      req.reply({
        statusCode: 400,
        body: { query: "", error: "simulated failure", position: 0 },
      }),
    )
    cy.contains("button", "+ Add rule").focus()
    cy.realPress(["Control", "Shift", "Enter"])
    cy.getByDataHook("highlight-settings-drawer").should("not.exist")
    cy.get("[data-hook='grid-cell']").should("not.exist")

    // And the cell is refreshed and mounts its grid panel again
    cy.get("[data-notebook-cell] button[aria-label='Refresh']").click()
    cy.getByDataHook("grid-viewport").should("exist")

    // Then the drawer stays closed
    cy.getByDataHook("highlight-settings-drawer").should("not.exist")
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

    // Then both cells of the row are highlighted in the rule's color
    cy.get("[data-hook='grid-row'][data-highlight-row]").should(
      "have.length",
      1,
    )
    cy.get("[data-hook='grid-cell'][data-highlight='always']")
      .should("have.length", 2)
      .each(($cell) =>
        cy
          .wrap($cell)
          .should("have.attr", "data-highlight-color", "dataSeries2"),
      )
  })

  it("flashes a changed cell on an auto-refresh tick", () => {
    // Given a saved "changed" rule on a value that grows on every run
    cy.focused().type(RISING_VALUE_QUERY, { delay: 0 })
    runCell()
    openHighlightDrawer()
    addRule("v", "changed")
    cy.contains("button", "Save").click()
    cy.getByDataHook("highlight-settings-drawer").should("not.exist")
    cy.get("[data-hook='grid-cell'][data-highlight]").should("not.exist")

    // When the cell auto-refreshes every second
    cy.get(
      "[data-notebook-cell] button[aria-label^='Auto-refresh interval']",
    ).click()
    cy.contains("[role='menuitemradio']", /^1s$/).click()

    // Then the refreshed value flashes in the rule's color
    cy.get("[data-hook='grid-cell'][data-highlight='temporary']")
      .should("have.length", 1)
      .and("have.attr", "data-highlight-color", "dataSeries2")
  })

  it("keeps an open chart draft when Chart settings is chosen again from the menu", () => {
    // Given a chart drawer with the type changed to Line, not saved
    cy.focused().type("select x, x * 2 as y from long_sequence(5)", {
      delay: 0,
    })
    runCell()
    cy.get("[data-notebook-cell] button[aria-label='View chart']").click()
    cy.getByDataHook("cell-chart").should("be.visible")
    openChartDrawer()
    cy.getByDataHook("chart-settings-drawer")
      .find('button[aria-label^="Chart type"]')
      .click()
    cy.contains('[role="menuitemradio"]', "Line").click()

    // When the menu entry is chosen again
    cy.get("[data-notebook-cell] button[aria-label='More actions']").click()
    cy.contains("[role='menuitem']", "Chart settings").click()

    // Then the drawer stays open with the draft
    cy.getByDataHook("chart-settings-drawer")
      .should("be.visible")
      .find('button[aria-label^="Chart type"]')
      .should("contain.text", "Line")
  })

  it("saves a chart setting from the drawer and shows it again on reopen", () => {
    // Given a cell shown as a chart
    cy.focused().type("select x, x * 2 as y from long_sequence(5)", {
      delay: 0,
    })
    runCell()
    cy.get("[data-notebook-cell] button[aria-label='View chart']").click()
    cy.getByDataHook("cell-chart").should("be.visible")

    // When the chart type is changed to Line and saved from the drawer
    openChartDrawer()
    cy.getByDataHook("chart-settings-drawer")
      .find('button[aria-label^="Chart type"]')
      .click()
    cy.contains('[role="menuitemradio"]', "Line").click()
    cy.contains("button", "Save").click()
    cy.getByDataHook("chart-settings-drawer").should("not.exist")

    // Then the drawer opens again with Line, and Cancel leaves it saved
    openChartDrawer()
    cy.getByDataHook("chart-settings-drawer")
      .find('button[aria-label^="Chart type"]')
      .should("contain.text", "Line")
    cy.contains("button", "Cancel").click()
    cy.getByDataHook("chart-settings-drawer").should("not.exist")
    openChartDrawer()
    cy.getByDataHook("chart-settings-drawer")
      .find('button[aria-label^="Chart type"]')
      .should("contain.text", "Line")
  })
})
