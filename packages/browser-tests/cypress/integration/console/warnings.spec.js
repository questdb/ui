/// <reference types="cypress" />

const baseUrl = "http://localhost:9999";

describe("System configuration - no warnings", () => {
  before(() => {
    cy.loadConsoleWithAuth(true);
  });

  it("should not display warnings if there aren't any in /warnings", () => {
    cy.getByDataHook("warnings").should("not.exist");
  });
});

describe("System configuration - 3 warnings", () => {
  after(() => {
    cy.typeQuery("select simulate_warnings('', '');").runLine().clearEditor();
  });

  before(() => {
    cy.loadConsoleWithAuth(true);
    cy.getEditorContent().should("be.visible");
    cy.clearEditor();
    [
      "select simulate_warnings('UNSUPPORTED FILE SYSTEM', 'Unsupported file system [dir=/questdb/path/dbRoot, magic=0x6400A468]');",
      "select simulate_warnings('TOO MANY OPEN FILES', 'fs.file-max limit is too low [current=1024, recommended=1048576]');",
      "select simulate_warnings('OUT OF MMAP AREAS', 'vm.max_map_count limit is too low [current=4096, recommended=1048576]');",
    ].forEach((query) => {
      cy.typeQuery(query).runLine().clearEditor();
    });
    cy.loadConsoleWithAuth();
  });

  it("should show all three warnings in the UI", () => {
    cy.getByDataHook("warnings").should("be.visible");
    cy.getByDataHook("warning").should("have.length", 3);
    cy.getByDataHook("warning-text").should(
      "contain",
      "Unsupported file system"
    );
    cy.getByDataHook("warning-text").should(
      "contain",
      "fs.file-max limit is too low"
    );
    cy.getByDataHook("warning-text").should(
      "contain",
      "vm.max_map_count limit is too low"
    );
  });

  it("should clear out all the warnings", () => {
    [0, 1, 2].forEach((idx) => {
      cy.getByDataHook("warning-close-button").eq(0).click();
    });
    cy.getByDataHook("warnings").should("not.exist");
  });
});
