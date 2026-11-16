/// <reference types="cypress" />

const loadChartConsole = (query) =>
  cy.loadConsoleWithAuth(false, {}, { buffers: [{ value: query }] })

describe("questdb charts", () => {
  it("should render the chart after a successful query invocation", () => {
    loadChartConsole(
      "SELECT rnd_timestamp(to_timestamp('2024-07-19:00:00:00.000000', 'yyyy-MM-dd:HH:mm:ss.SSSUUU'), to_timestamp('2024-07-20:00:00:00.000000', 'yyyy-MM-dd:HH:mm:ss.SSSUUU'), 0), x FROM long_sequence(10);",
    )
    let executedSQL
    cy.intercept("**/exec*", (request) => {
      if (String(request.query.query).includes("long_sequence(10)")) {
        request.alias =
          request.query.src === "vis" ? "chartData" : "executedQuery"
      }
    })
    cy.clickRunIconInLine(1)
    cy.wait("@executedQuery").then(({ request, response }) => {
      executedSQL = request.query.query
      expect(response.statusCode).to.equal(200)
    })
    cy.getByDataHook("chart-panel-button").should("be.visible").click()
    cy.wait("@chartData").then(({ request, response }) => {
      expect(request.query.query).to.equal(executedSQL)
      expect(request.query.src).to.equal("vis")
      expect(request.query.limit).to.equal("0,10000")
      expect(response.statusCode).to.equal(200)
    })

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
})

const chartPointValue = (fraction) => {
  cy.getByDataHook("result-chart")
    .find("canvas")
    .then(($canvas) => {
      const { width, height } = $canvas[0].getBoundingClientRect()
      cy.wrap($canvas).realMouseMove(
        60 + (width - 96) * fraction,
        height * 0.4,
        {
          position: "topLeft",
        },
      )
    })
  return cy
    .contains("span", /^probe_value$/)
    .should("be.visible")
    .parent()
    .find("span")
    .last()
    .invoke("text")
    .then(Number)
}

describe("chart zoom across viewport changes", () => {
  it("keeps the visible data range after resizing and restores excluded points with Reset", () => {
    // Given
    cy.viewport(760, 900)
    loadChartConsole(
      "SELECT timestamp_sequence(0, 1000000) ts, x probe_value FROM long_sequence(500);",
    )
    cy.clickRunIconInLine(1)
    cy.getByDataHook("chart-panel-button").click()
    cy.getByDataHook("result-chart").find("canvas").should("be.visible")
    chartPointValue(0.1).should("be.lt", 90)

    // When
    cy.getByDataHook("result-chart")
      .find("canvas")
      .then(($canvas) => {
        const y = $canvas[0].getBoundingClientRect().height - 44
        cy.wrap($canvas).realMouseDown({ x: 54, y })
        cy.wrap($canvas).realMouseMove(130, y)
        cy.wrap($canvas).realMouseUp({ x: 130, y })
      })

    // Then
    cy.getByDataHook("result-chart-reset-zoom").should("be.visible")
    chartPointValue(0.1).then((zoomedStart) => {
      expect(zoomedStart).to.be.greaterThan(100)
      chartPointValue(0.8).then((zoomedEnd) => {
        // When
        cy.viewport(1280, 900)
        cy.getByDataHook("result-chart")
          .find("canvas")
          .should(($canvas) => {
            expect($canvas[0].getBoundingClientRect().width).to.be.within(
              650,
              1500,
            )
          })

        // Then
        chartPointValue(0.1).should("be.closeTo", zoomedStart, 15)
        chartPointValue(0.8).should("be.closeTo", zoomedEnd, 15)
        cy.getByDataHook("result-chart-reset-zoom").should("be.visible").click()
        cy.getByDataHook("result-chart-reset-zoom").should("not.exist")
        chartPointValue(0.1).should("be.lt", 90)
        chartPointValue(0.8).should("be.within", 380, 420)
      })
    })
  })
})
