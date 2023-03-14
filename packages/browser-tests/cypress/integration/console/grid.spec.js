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
    cy.getGridRows().should("have.length", 5);
    cy.getGridRow(0).should("contain", "1");

    cy.getGridViewport().scrollTo("bottom");
    cy.getGridRows().should("have.length", 5);
    cy.getGridRow(0).should("contain", "96");
  });

  it("multiple scrolls till the bottom", () => {
    const rows = 1000;
    const rowsPerPage = 128;
    const rowHeight = 30;
    cy.runQuery(`select x from long_sequence(${rows})`);

    for (let i = 0; i < rows; i += rowsPerPage) {
      cy.getGridViewport().scrollTo(0, i * rowHeight);
      cy.wait(100);
      cy.getGrid()
        .contains(i + 1)
        .click();
    }

    cy.getGridViewport().scrollTo("bottom");
  });
});
