/// <reference types="cypress" />

const { createNotebookBuffer } = require("../utils/editorBuffers")

const loadNotebookCell = (sql) => {
  cy.loadConsoleWithAuth(false, {}, { buffers: [createNotebookBuffer(sql)] })
  cy.focusNotebookCell()
}

// Every run returns a larger value than the run before it.
const RISING_VALUE_QUERY = "select 'A' as k, cast(now() as long) as v"

const openHighlightDrawer = () => {
  cy.get("[data-notebook-cell] button[aria-label='More actions']").click()
  cy.contains("[role='menuitem']", "Highlight rules").click()
  cy.getByDataHook("highlight-settings-drawer").should("be.visible")
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

const watchDrawerExit = () =>
  cy.getByDataHook("highlight-settings-drawer").then(($drawer) => {
    const drawer = $drawer[0]
    let exit
    const onAnimationStart = (event) => {
      if (event.target !== drawer) return
      exit = drawer
        .getAnimations()
        .find(
          (animation) =>
            "animationName" in animation &&
            animation.animationName === event.animationName,
        )
      exit?.pause()
      drawer.removeEventListener("animationstart", onAnimationStart)
    }
    drawer.addEventListener("animationstart", onAnimationStart)
    return {
      drawer,
      animation: () => {
        expect(exit, "the drawer exit animation").not.to.equal(undefined)
        expect(
          drawer.isConnected,
          "drawer remains mounted during exit",
        ).to.equal(true)
        expect(Number(exit.effect.getTiming().duration)).to.be.greaterThan(0)
        expect(exit.playState).to.equal("paused")
        return exit
      },
    }
  })

const setThreshold = (value) =>
  cy
    .getByDataHook("highlight-rule")
    .last()
    .find("[aria-label=Value]")
    .clear()
    .type(value)
const openChartDrawer = () => {
  cy.get("[data-notebook-cell] button[aria-label='More actions']").click()
  cy.contains("[role='menuitem']", "Chart settings").click()
  cy.getByDataHook("chart-settings-drawer").should("be.visible")
}

describe("notebook highlight rules", () => {
  it("flashes changed values with a direction glyph after up and down rules are saved", () => {
    // Given a cell whose value grows on every run
    loadNotebookCell(RISING_VALUE_QUERY)
    runCell()
    let previousValue
    cy.get("[data-notebook-cell] #cell-0-1")
      .invoke("text")
      .then((value) => {
        previousValue = Number(value)
      })

    // When an up rule and a down rule on v are saved
    openHighlightDrawer()
    cy.getByDataHook("highlight-identity-status").should("not.exist")
    addRule("v", "> previous")
    addRule("v", "< previous")
    cy.getByDataHook("highlight-rule").should("have.length", 2)
    cy.contains("button", "Save").click()
    cy.getByDataHook("highlight-settings-drawer").should("not.exist")

    // And the cell runs again
    cy.intercept("**/exec*", (request) => {
      if (request.query.query === RISING_VALUE_QUERY) request.alias = "rerun"
    })
    cy.get("[data-notebook-cell] button[aria-label='Re-run query']").click()

    cy.wait("@rerun").then(({ request, response }) => {
      expect(request.query.query).to.equal(RISING_VALUE_QUERY)
      expect(response.statusCode).to.equal(200)
      expect(Number(response.body.dataset[0][1])).to.be.greaterThan(
        previousValue,
      )
    })

    // Then the changed cell flashes in the up rule's color with an up glyph
    cy.get(
      "[data-notebook-cell] [data-hook='grid-cell'][data-highlight='temporary']",
    )
      .should("have.length", 1)
      .and("have.attr", "data-highlight-color", "dataPositive")
      .and("have.attr", "data-direction", "up")
      .and("contain.text", "▲")
    cy.get("[data-hook='grid-cell'][data-direction]").should("have.length", 1)
    const assertFlash = (direction) => {
      cy.get("[data-hook=grid-cell][data-direction]")
        .should("have.attr", "data-direction", direction)
        .then(($cell) => {
          const animation = $cell[0].getAnimations()[0]
          expect(animation, "native flash animation").to.exist
          animation.pause()
          animation.currentTime = 0
        })
      cy.get("[data-hook=grid-cell][data-direction]")
        .should(($cell) => {
          const style = getComputedStyle($cell[0])
          const flash = style.getPropertyValue("--grid-flash").trim()
          expect(flash).not.to.be.oneOf(["", "transparent", "rgba(0, 0, 0, 0)"])
          expect(style.backgroundImage).to.contain(flash)
        })
        .then(($cell) => $cell[0].getAnimations()[0].finish())
      cy.get("[data-hook=grid-cell][data-direction]").should(($cell) =>
        expect(
          getComputedStyle($cell[0]).getPropertyValue("--grid-flash").trim(),
        ).to.equal("rgba(0, 0, 0, 0)"),
      )
    }
    assertFlash("up")
    cy.intercept("**/exec*", (request) => {
      if (request.query.query === RISING_VALUE_QUERY) {
        request.alias = "downRun"
        request.continue((response) => {
          response.body.dataset = [["A", 1]]
        })
      }
    })
    cy.get("[data-notebook-cell] button[aria-label='Re-run query']").click()
    cy.wait("@downRun")
    cy.get("[data-hook=grid-cell][data-direction]")
      .should("have.attr", "data-highlight-color", "dataNegative")
      .and("contain.text", "▼")
    assertFlash("down")
    cy.get("[data-notebook-cell] #cell-0-0").should(
      "not.have.attr",
      "data-highlight",
    )
    openHighlightDrawer()
    cy.getByDataHook("highlight-identity-status").should("not.exist")
  })

  it("does not bring the drawer back after a run that failed while it was open", () => {
    // Given the drawer is open with an unsaved rule
    loadNotebookCell("select 'A' as k, 5 as v")
    runCell()
    openHighlightDrawer()
    addRule("v", "> value")

    // When the run-all shortcut fires from inside the drawer and the run fails
    let failed = false
    cy.intercept("**/exec*", (request) => {
      if (request.query.query === "select 'A' as k, 5 as v" && !failed) {
        failed = true
        request.alias = "failedRun"
        request.reply({
          statusCode: 400,
          body: {
            query: request.query.query,
            error: "simulated failure",
            position: 0,
          },
        })
      }
    })
    cy.contains("button", "+ Add rule").focus()
    cy.realPress(["Control", "Shift", "Enter"])
    cy.wait("@failedRun")
      .its("response.body.error")
      .should("eq", "simulated failure")
    cy.get("[data-notebook-cell]")
      .contains("simulated failure")
      .should("be.visible")
    cy.getByDataHook("highlight-settings-drawer").should("not.exist")
    cy.get("[data-hook='grid-cell']").should("not.exist")

    // And the cell is refreshed and mounts its grid panel again
    cy.get("[data-notebook-cell] button[aria-label='Refresh']")
      .should("not.have.attr", "aria-busy", "true")
      .click()
    cy.getByDataHook("grid-viewport").should("exist")

    // Then the drawer stays closed
    cy.get("[data-notebook-cell] #cell-0-0").should("have.text", "A")
    cy.get("[data-notebook-cell] #cell-0-1").should("have.text", "5")
    cy.getByDataHook("highlight-settings-drawer").should("not.exist")
    openHighlightDrawer()
    cy.getByDataHook("highlight-rule").should("not.exist")
  })

  it("flashes a changed cell on an auto-refresh tick", () => {
    // Given a saved "changed" rule on a value that grows on every run
    loadNotebookCell(RISING_VALUE_QUERY)
    runCell()
    openHighlightDrawer()
    addRule("v", "changed")
    cy.contains("button", "Save").click()
    cy.getByDataHook("highlight-settings-drawer").should("not.exist")
    cy.get("[data-hook='grid-cell'][data-highlight]").should("not.exist")

    let previousValue
    cy.get("[data-notebook-cell] #cell-0-1")
      .invoke("text")
      .then((value) => {
        previousValue = Number(value)
      })
    cy.intercept("**/exec*", (request) => {
      if (request.query.query === RISING_VALUE_QUERY)
        request.alias = "automaticRun"
    })

    // When the cell auto-refreshes every second
    cy.get(
      "[data-notebook-cell] button[aria-label^='Auto-refresh interval']",
    ).click()
    cy.contains("[role='menuitemradio']", /^1s$/).click()

    cy.wait("@automaticRun").then(({ request, response }) => {
      expect(request.query.query).to.equal(RISING_VALUE_QUERY)
      expect(Number(response.body.dataset[0][1])).to.be.greaterThan(
        previousValue,
      )
    })

    // Then the refreshed value flashes in the rule's color
    cy.get(
      "[data-notebook-cell] [data-hook='grid-cell'][data-highlight='temporary']",
    )
      .should("have.length", 1)
      .and("have.attr", "data-highlight-color", "dataSeries2")
    cy.get(
      "[data-notebook-cell] button[aria-label^='Auto-refresh interval']",
    ).click()
    cy.contains("[role='menuitemradio']", /^Off$/).click()
  })
  it("does not submit a dismissed draft when Enter arrives during exit", () => {
    // Given
    loadNotebookCell("select 'A' as k, 5 as v")
    runCell()
    openHighlightDrawer()
    addRule("v", "> value")
    setThreshold("1")

    // When
    watchDrawerExit().then((exit) => {
      cy.realPress("Escape")
      cy.wrap(null).should(() => exit.animation())
      cy.realPress("Enter")
      cy.then(() => exit.animation().finish())
    })

    // Then
    cy.getByDataHook("highlight-settings-drawer").should("not.exist")
    cy.get("[data-hook=grid-cell][data-highlight]").should("not.exist")
    openHighlightDrawer()
    cy.getByDataHook("highlight-rule").should("not.exist")
  })

  it("does not clear saved rules when repeated clicks hit Save coordinates during exit", () => {
    // Given
    loadNotebookCell("select 'A' as k, 5 as v")
    runCell()
    openHighlightDrawer()
    addRule("v", "> value")
    setThreshold("1")

    // When
    watchDrawerExit().then((exit) => {
      cy.wrap(exit.drawer)
        .contains("button", "Clear all")
        .then(($clearAll) => {
          cy.contains("button", "Save").then(($save) => {
            const rect = $save[0].getBoundingClientRect()
            const x = rect.left + rect.width / 2
            const y = rect.top + rect.height / 2
            let clearAllUnderPointer = 0
            cy.wrap($save).click()
            cy.wrap(null).should(() => exit.animation())
            // Dense sweep (0.08..0.96 of the exit) so every footer control,
            // Clear all included, slides under the Save coordinates.
            for (let step = 1; step <= 12; step += 1) {
              cy.then(() => {
                const animation = exit.animation()
                animation.currentTime =
                  (Number(animation.effect.getTiming().duration) * step * 8) /
                  100
                const clearAll = $clearAll[0].getBoundingClientRect()
                if (
                  x >= clearAll.left &&
                  x <= clearAll.right &&
                  y >= clearAll.top &&
                  y <= clearAll.bottom
                ) {
                  clearAllUnderPointer += 1
                }
              })
              cy.get("body").realClick({ x, y, position: "topLeft" })
            }
            cy.then(() => {
              expect(
                clearAllUnderPointer,
                "sweeps with Clear all under the pointer",
              ).to.be.greaterThan(0)
              exit.animation().finish()
            })
          })
        })
    })

    // Then
    cy.getByDataHook("highlight-settings-drawer").should("not.exist")
    cy.get("[data-hook=grid-cell][data-highlight]")
      .should("have.length", 1)
      .and("have.attr", "data-highlight", "always")
    openHighlightDrawer()
    cy.getByDataHook("highlight-rule").should("have.length", 1)
    cy.getByDataHook("highlight-rule")
      .find('button[aria-label^="Edit rule"]')
      .click()
    cy.getByDataHook("highlight-rule")
      .find("[aria-label='Value']")
      .should("have.value", "1")
  })

  it("saves cell and row rules, then clears the persisted highlight settings", () => {
    // Given
    loadNotebookCell("select 'A' k, 5 v union all select 'B' k, 0 v")
    runCell()
    openHighlightDrawer()
    addRule("v", "> value")
    setThreshold("1")
    openHighlightDrawer()
    cy.getByDataHook("highlight-rule")
      .find("[aria-label=Value]")
      .should("have.value", "1")
    // When / Then
    cy.contains("button", "Save").click()
    cy.getByDataHook("highlight-settings-drawer").should("not.exist")
    cy.get("[data-hook=grid-cell][data-highlight]")
      .should("have.length", 1)
      .and("have.id", "cell-0-1")
      .and("have.attr", "data-highlight-color", "dataSeries2")
    openHighlightDrawer()
    cy.getByDataHook("highlight-rule")
      .find('button[aria-label^="Edit rule"]')
      .click()
    cy.getByDataHook("highlight-rule").then(($rule) =>
      pickOption($rule, "Applies to", "Row"),
    )
    cy.contains("button", "Save").click()
    cy.getByDataHook("highlight-settings-drawer").should("not.exist")
    cy.get("[data-hook=grid-cell][data-highlight]")
      .should("have.length", 2)
      .each(($cell) => {
        expect($cell.attr("id")).to.be.oneOf(["cell-0-0", "cell-0-1"])
        expect($cell.attr("data-highlight-color")).to.equal("dataSeries2")
      })
    openHighlightDrawer()
    cy.contains("button", "Clear all").click()
    cy.get("[data-hook=grid-cell][data-highlight]").should("not.exist")
    openHighlightDrawer()
    cy.getByDataHook("highlight-rule").should("not.exist")
  })

  it("keeps a chart draft, saves it, and discards a later change", () => {
    // Given
    loadNotebookCell("select x, x * 2 y from long_sequence(5)")
    runCell()
    cy.get("[data-notebook-cell] button[aria-label='View chart']").click()
    cy.getByDataHook("draw-canvas").should("be.visible")
    openChartDrawer()
    cy.getByDataHook("chart-settings-drawer")
      .find('button[aria-label^="Chart type"]')
      .click()
    cy.contains('[role="menuitemradio"]', "Line").click()
    // When / Then
    openChartDrawer()
    cy.getByDataHook("chart-settings-drawer")
      .find('button[aria-label^="Chart type"]')
      .should("contain.text", "Line")
    cy.contains("button", "Save").click()
    cy.getByDataHook("chart-settings-drawer").should("not.exist")
    openChartDrawer()
    cy.getByDataHook("chart-settings-drawer")
      .find('button[aria-label^="Chart type"]')
      .should("contain.text", "Line")
      .click()
    cy.contains('[role="menuitemradio"]', "Scatter").click()
    cy.contains("button", "Cancel").click()
    cy.getByDataHook("chart-settings-drawer").should("not.exist")
    openChartDrawer()
    cy.getByDataHook("chart-settings-drawer")
      .find('button[aria-label^="Chart type"]')
      .should("contain.text", "Line")
  })

  it("selects the last virtualized column with stable menu row heights", () => {
    // Given
    const columns = Array.from(
      { length: 80 },
      (_, i) => `x c${String(i).padStart(2, "0")}`,
    ).join(", ")
    loadNotebookCell(`select ${columns} from long_sequence(1)`)
    runCell()
    openHighlightDrawer()
    cy.contains("button", "+ Add rule").click()
    cy.getByDataHook("highlight-rule")
      .find('button[aria-label="Column"]')
      .click()
    cy.get("[role=option]").each(($row) =>
      expect($row[0].getBoundingClientRect().height).to.equal(32),
    )
    // When
    cy.get(
      '[role="listbox"][aria-label="Column"] [data-virtuoso-scroller]',
    ).scrollTo("bottom")
    cy.contains("[role=option]", /^c79$/).click()
    // Then
    cy.getByDataHook("highlight-rule")
      .find('button[aria-label="Column"]')
      .should("contain.text", "c79")
      .click()
    cy.get('input[aria-label="Column"]').type("c79")
    cy.get("[role=option]")
      .should("have.length", 1)
      .and("have.attr", "aria-selected", "true")
      .should(($row) =>
        expect($row[0].getBoundingClientRect().height).to.equal(32),
      )
  })
})
