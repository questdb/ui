/// <reference types="cypress" />

describe("questdb import", () => {
  before(() => {
    cy.visit("http://localhost:9999");
  });

  it("display import screen", () => {
    cy.get('[data-hook="navigation-import-button"]').click();
    cy.matchImageSnapshot();
  });
});
