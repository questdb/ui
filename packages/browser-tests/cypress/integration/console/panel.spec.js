/// <reference types="cypress" />

const baseUrl = "http://localhost:9999";

describe("URL deep linking", () => {
  it("should show import panel", () => {
    cy.visit(`${baseUrl}/?bottomPanel=p2`);
    cy.get('[data-hook="import-dropbox"]').should("be.visible");
    cy.matchImageSnapshot();
  });

  it("should show news panel", () => {
    cy.visit(`${baseUrl}/?sidebar=p1`);
    cy.get('[data-hook="news-content"]').should("be.visible");
    cy.get('[data-hook="news-panel-button"]').click();
    cy.url().should("not.contain", "sidebar=news");
    cy.matchImageSnapshot();
  });

  it("should show create table panel", () => {
    cy.visit(`${baseUrl}/?sidebar=p2`);
    cy.get('[data-hook="schema-content"]').should("be.visible");
    cy.get('[data-hook="create-table-panel-button"]').click();
    cy.url().should("not.contain", "sidebar=create");
    cy.matchImageSnapshot();
  });
});
