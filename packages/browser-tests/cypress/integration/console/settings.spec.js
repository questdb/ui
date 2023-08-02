/// <reference types="cypress" />

describe("questdb grid", () => {
  before(() => {
    cy.visit("http://localhost:9999");
  });

  it("display import screen", () => {
    cy.get('[data-hook="navigation-settings-button"]').click();
    cy.matchImageSnapshot();
  });
});
