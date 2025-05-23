/// <reference types="cypress" />

describe("questdb import", () => {
  before(() => {
    cy.loadConsoleWithAuth();
  });

  it("display import panel", () => {
    cy.getByDataHook("import-panel-button").click();
    cy.getByDataHook("import-dropbox").should("be.visible");
    cy.getByDataHook("import-browse-from-disk").should("be.visible");

    cy.get('input[type="file"]').selectFile("cypress/fixtures/test.csv", { force: true });
    cy.getByDataHook("import-table-column-schema").should("be.visible");
    cy.getByDataHook("import-table-column-owner").should("not.exist");
  });
});
