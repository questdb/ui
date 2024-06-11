/// <reference types="cypress" />

describe("questdb import", () => {
  before(() => {
    cy.visit("http://localhost:9999");
  });

  it("display import panel", () => {
    cy.get('[data-hook="import-panel-button"]').click();
    cy.get('[data-hook="import-dropbox"]').should("be.visible");
    // cy.matchImageSnapshot();
  });
});
