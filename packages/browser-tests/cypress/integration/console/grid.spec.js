/// <reference types="cypress" />

describe("questdb grid", () => {
  before(() => {
    cy.visit("http://localhost:9999");
  });

  afterEach(() => {
    cy.clearEditor();
  });

  it("when results empty", () => {
    cy.runQuery("select x from long_sequence(0)");
    cy.getGridRows().should("have.length", 0);
  });

  it("when results have vertical scroll", () => {
    cy.runQuery(`select x from long_sequence(100)`);
    cy.getGridRows().should("have.length", 6);
    cy.getGridRow(0).should("contain", "1");

    cy.getGridViewport().scrollTo("bottom");
    cy.getGridRows().should("have.length", 6);
    cy.getGridRow(0).should("contain", "95");
  });

  it("multiple scrolls till the bottom", () => {
    cy.intercept("/exec*").as("exec");
    cy.runQuery(`select x from long_sequence(1000)`);

    for (let i = 1; i < 1000; i += 128) {
      cy.getGridViewport().scrollTo(0, (i - 1) * 28);
      cy.getGrid().contains(i).click();
    }

    cy.getGridViewport().scrollTo("bottom");
  });
});
