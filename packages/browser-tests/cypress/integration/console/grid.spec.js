/// <reference types="cypress" />

describe("questdb grid", () => {
  before(() => {
    cy.visit("http://localhost:9999");
  });

  it("when results empty", () => {
    cy.runQuery("select x from long_sequence(0)");
    cy.getGrid().snapshot();
  });

  it("when results don't have vertical scroll", () => {
    const query = `select x from long_sequence(3)`;
    cy.runQuery(query);
    cy.getGrid().snapshot();
  });

  it("when results have vertical scroll", () => {
    cy.runQuery(`select x from long_sequence(1000)`);
    cy.getGrid().snapshot();
    cy.getGridViewport().scrollTo("bottom");
    cy.getGrid().snapshot();
  });

  it("multiple scrolls till the bottom", () => {
    cy.runQuery(`select x from long_sequence(1000)`);
    const grid = cy.getGrid();

    for (let i = 1; i < 1000; i += 128) {
      cy.getGridViewport().scrollTo(0, (i - 1) * 28);
      grid.contains(i).click();
    }

    cy.getGridViewport().scrollTo("bottom");
  });
});
