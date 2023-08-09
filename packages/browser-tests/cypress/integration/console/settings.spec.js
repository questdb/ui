/// <reference types="cypress" />

describe("questdb settings", () => {
  before(() => {
    cy.visit("http://localhost:9999");
  });

  it("display settings screen", () => {
    cy.get('[data-hook="navigation-settings-button"]').click();
    cy.matchImageSnapshot();
  });
});
