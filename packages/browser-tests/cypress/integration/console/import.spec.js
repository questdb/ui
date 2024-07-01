/// <reference types="cypress" />

describe("questdb import", () => {
  before(() => {
    cy.visit("http://localhost:9999");
  });

  it("display import panel", () => {
    cy.getByDataHook("import-panel-button").click();
    cy.getByDataHook("import-dropbox").should("be.visible");
    cy.matchImageSnapshot();
  });
});
