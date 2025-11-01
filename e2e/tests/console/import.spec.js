/// <reference types="cypress" />

describe("questdb import", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth();
  });

  afterEach(() => {
    cy.loadConsoleWithAuth();
    cy.typeQueryDirectly("drop all tables;");
    cy.clickRunIconInLine(1);
    cy.getByDataHook("success-notification").should("be.visible");
    cy.clearEditor();
  });

  it("display import panel", () => {
    cy.getByDataHook("import-panel-button").click();
    cy.getByDataHook("import-dropbox").should("be.visible");
    cy.getByDataHook("import-browse-from-disk").should("be.visible");

    cy.get('input[type="file"]').selectFile("e2e/fixtures/test.csv", {
      force: true,
    });
    cy.getByDataHook("import-table-column-schema").should("be.visible");
    cy.getByDataHook("import-table-column-owner").should("not.exist");
  });

  it("should import csv with a nanosecond timestamp", () => {
    cy.getByDataHook("import-panel-button").click();
    cy.getByDataHook("import-dropbox").should("be.visible");
    cy.getByDataHook("import-browse-from-disk").should("be.visible");

    cy.get('input[type="file"]').selectFile("e2e/fixtures/nanos.csv", {
      force: true,
    });
    cy.getByDataHook("import-table-column-schema").should("be.visible");
    cy.getByDataHook("import-upload-button").should("be.enabled");
    cy.getByDataHook("import-upload-button").click();

    cy.getByDataHook("import-file-status").should("contain", "Imported 7 rows");
    cy.getByDataHook("schema-table-title").should("contain", "nanos.csv");

    cy.getByDataHook("schema-table-title").dblclick();
    cy.getByDataHook("schema-folder-title").contains("Columns").dblclick();
    cy.get('[data-id="questdb:expanded:tables:nanos.csv:columns:timestamp"]')
      .should("be.visible")
      .should("contain", "timestamp")
      .should("contain", "TIMESTAMP_NS");
    cy.getByDataHook("designated-timestamp-icon").should("not.exist");

    cy.getByDataHook("table-schema-dialog-trigger")
      .should("be.visible")
      .should("contain", "4 cols");
    cy.getByDataHook("table-schema-dialog-trigger").click();

    cy.getByDataHook("create-table-panel").should("be.visible");
    cy.getByDataHook("table-schema-dialog-column-0").should("be.visible");
    cy.get("input[name='schemaColumns.0.name']").should(
      "have.value",
      "timestamp"
    );

    cy.get("select[name='schemaColumns.0.type']")
      .get("option[value='TIMESTAMP_NS']")
      .should("be.selected");

    cy.getByDataHook("table-schema-dialog-column-0-designated-button").click();
    cy.getByDataHook("form-submit-button").click();

    cy.getByDataHook("create-table-panel").should("not.be.visible");

    cy.get('select[name="overwrite"]').select("true");

    cy.getByDataHook("import-upload-button").should("be.enabled");
    cy.getByDataHook("import-upload-button").click();

    cy.getByDataHook("import-file-status").should("contain", "Imported 7 rows");
    cy.getByDataHook("designated-timestamp-icon").should("be.visible");
  });
});
