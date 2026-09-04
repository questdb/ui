/// <reference types="cypress" />

describe("questdb charts", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
  })

  it("should render the chart after a successful query invocation", () => {
    cy.typeQueryDirectly(
      "SELECT rnd_timestamp(to_timestamp('2024-07-19:00:00:00.000000', 'yyyy-MM-dd:HH:mm:ss.SSSUUU'), to_timestamp('2024-07-20:00:00:00.000000', 'yyyy-MM-dd:HH:mm:ss.SSSUUU'), 0), x FROM long_sequence(10);",
    )
    cy.clickRunIconInLine(1)
    cy.getByDataHook("chart-panel-button").should("be.visible").click()

    cy.getByDataHook("result-chart")
      .should("be.visible")
      .and("have.attr", "aria-hidden", "false")

    cy.getByDataHook("chart-settings-panel").within(() => {
      cy.get('button[aria-label^="X-axis"]').should(
        "contain.text",
        "rnd_timestamp",
      )
      cy.get('button[aria-label^="Chart type"]').should("contain.text", "Line")
      cy.get('button[aria-label^="Series"]').should("contain.text", "All (1)")
    })

    cy.getByDataHook("chart-settings-panel")
      .find('button[aria-label^="Series"]')
      .click()
    cy.contains('[role="menuitemcheckbox"]', "x")
      .should("have.attr", "data-state", "checked")
      .and("have.attr", "aria-checked", "true")
    cy.get("body").type("{esc}")

    cy.getByDataHook("chart-settings-panel")
      .find('button[aria-label^="Chart type"]')
      .click()
    cy.contains('[role="menuitemradio"]', "Bar").click()
    cy.getByDataHook("chart-settings-panel")
      .find('button[aria-label^="Chart type"]')
      .should("contain.text", "Bar")
    cy.getByDataHook("chart-settings-panel").contains("button", "Apply").click()

    cy.getByDataHook("result-chart")
      .find("canvas")
      .should("be.visible")
      .invoke("width")
      .should("be.gt", 0)
    cy.getByDataHook("result-chart")
      .find("canvas")
      .invoke("height")
      .should("be.gt", 0)
  })

  it("keeps reset zoom available when the responsive slider disappears", () => {
    cy.viewport(760, 900)
    cy.typeQueryDirectly(
      "SELECT rnd_timestamp(to_timestamp('2024-07-19:00:00:00.000000', 'yyyy-MM-dd:HH:mm:ss.SSSUUU'), to_timestamp('2024-07-20:00:00:00.000000', 'yyyy-MM-dd:HH:mm:ss.SSSUUU'), 0), x FROM long_sequence(500);",
    )
    cy.clickRunIconInLine(1)
    cy.getByDataHook("chart-panel-button").should("be.visible").click()

    cy.getByDataHook("result-chart")
      .find("canvas")
      .should("be.visible")
      .then(($canvas) => {
        const canvas = $canvas[0]
        const sliderY = canvas.getBoundingClientRect().height - 44

        cy.wrap(canvas).realMouseDown({ x: 54, y: sliderY })
        cy.wrap(canvas).realMouseMove(130, sliderY)
        cy.wrap(canvas).realMouseUp({ x: 130, y: sliderY })
      })

    cy.getByDataHook("result-chart-reset-zoom").should("be.visible")

    cy.viewport(1280, 900)
    cy.getByDataHook("result-chart-reset-zoom").should("be.visible").click()
    cy.getByDataHook("result-chart-reset-zoom").should("not.exist")
  })
})
