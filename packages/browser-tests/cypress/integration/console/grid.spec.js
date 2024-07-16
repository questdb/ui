/// <reference types="cypress" />

const baseUrl = "http://localhost:9999";

describe("questdb grid", () => {
  beforeEach(() => {
    cy.visit(baseUrl);
    cy.waitForEditorLoad();
    cy.clearEditor();
  });

  it("when results empty", () => {
    cy.typeQuery("select x from long_sequence(0)");
    cy.runLine();
    cy.getGridRows().should("have.length", 0);
  });

  it("when results have vertical scroll", () => {
    cy.typeQuery(`select x from long_sequence(100)`);
    cy.runLine();
    cy.wait(100);

    cy.getGridRows().should("have.length", 7);
    cy.getGridRow(0).should("contain", "1");

    cy.getGridViewport().scrollTo("bottom");
    cy.getGridRows().should("have.length", 7);
    cy.getGridRow(0).should("contain", "94");
    cy.matchImageSnapshot();
  });

  it("multiple scrolls till the bottom", () => {
    const rows = 1000;
    const rowsPerPage = 128;
    const rowHeight = 30;
    cy.typeQuery(`select x from long_sequence(${rows})`);
    cy.runLine();

    for (let i = 0; i < rows; i += rowsPerPage) {
      cy.getGridViewport().scrollTo(0, i * rowHeight);
      cy.wait(100);
      cy.getGrid()
        .contains(i + 1)
        .click();
    }

    cy.getGridViewport().scrollTo("bottom");
  });

  it("copy cell into the clipboard", () => {
    cy.typeQuery("select x from long_sequence(10)");
    cy.runLine();
    cy.getGridCol(0).type("{ctrl}c");
    cy.getGridCol(0).should("have.class", "qg-c-active-pulse");
  });
});
