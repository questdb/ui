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

    // cy.get('div').contains("Table name").should("be.visible");
    // cy.get('div').contains("Table owner").should("not.exist");

    // cy.contains('div', "Table name").should("be.visible");
    // cy.contains('div', "Table owner").should("not.exist");
  });
});
