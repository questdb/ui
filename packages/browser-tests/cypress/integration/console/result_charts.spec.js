/// <reference types="cypress" />

describe("questdb charts", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth();
  });

  it("should render the chart after a successful query invocation", () => {
    cy.typeQueryDirectly(
      "SELECT rnd_timestamp(to_timestamp('2024-07-19:00:00:00.000000', 'yyyy-MM-dd:HH:mm:ss.SSSUUU'), to_timestamp('2024-07-20:00:00:00.000000', 'yyyy-MM-dd:HH:mm:ss.SSSUUU'), 0), x FROM long_sequence(10);"
    );
    cy.clickRun();
    cy.getByDataHook("chart-panel-button").should("be.visible").click();
    cy.get(".quick-vis-canvas").click();
    cy.getByDataHook("chart-panel-labels-select").should(
      "have.value",
      "rnd_timestamp"
    );
    cy.getByDataHook("chart-panel-series-select").then(($element) => {
      expect($element[0].options[$element[0].selectedIndex].text).to.equal("x");
    });
    cy.getByDataHook("chart-panel-draw-button").click();
    cy.get(".quick-vis-canvas canvas").invoke("width").should("be.gt", 0);
    cy.get(".quick-vis-canvas canvas").invoke("height").should("be.gt", 0);
  });
});
