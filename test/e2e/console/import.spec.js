/// <reference types="cypress" />

const assertStoredRows = () => {
  cy.readFile("test/e2e/fixtures/nanos.csv").then((csv) => {
    const expected = csv
      .trim()
      .split("\n")
      .slice(1)
      .map((line) => line.match(/^"([^"]+)","([^"]+)"/).slice(1))
    cy.execAdminQuery(
      'select timestamp, symbol from "nanos.csv" order by timestamp',
    )
      .its("body.dataset")
      .should("deep.equal", expected)
  })
}

describe("questdb import", () => {
  beforeEach(() => {
    cy.execAdminQuery('DROP TABLE IF EXISTS "nanos.csv"')
    cy.loadConsoleWithAuth()
    cy.window()
      .its("localStorage")
      .invoke("getItem", "RELEASE_TYPE")
      .should("equal", "OSS")
  })

  afterEach(() => {
    cy.execAdminQuery('DROP TABLE IF EXISTS "nanos.csv"')
  })

  it("should import csv with a nanosecond timestamp", () => {
    cy.intercept("POST", "**/imp?*").as("import")
    cy.getByDataHook("import-panel-button").click()
    cy.getByDataHook("import-dropbox").should("be.visible")
    cy.getByDataHook("import-browse-from-disk").should("be.visible")

    cy.get('input[type="file"]').selectFile("test/e2e/fixtures/nanos.csv", {
      force: true,
    })
    cy.getByDataHook("import-table-column-schema").should("be.visible")
    cy.getByDataHook("import-table-column-owner").should("not.exist")
    cy.getByDataHook("import-upload-button").should("be.enabled")
    cy.getByDataHook("import-upload-button").click()
    cy.wait("@import").its("response.statusCode").should("equal", 200)
    assertStoredRows()

    cy.getByDataHook("import-file-status").should("contain", "Imported 7 rows")
    cy.getByDataHook("schema-table-title").should("contain", "nanos.csv")

    cy.contains('[data-hook="schema-table-title"]', "nanos.csv").dblclick()
    cy.getByDataHook("schema-folder-title").contains("Columns").dblclick()
    cy.get('[data-id="questdb:expanded:tables:nanos.csv:columns:timestamp"]')
      .should("be.visible")
      .should("contain", "timestamp")
      .should("contain", "TIMESTAMP_NS")
    cy.get('[data-id="questdb:expanded:tables:nanos.csv:columns:timestamp"]')
      .find('[data-hook="designated-timestamp-icon"]')
      .should("not.exist")

    cy.getByDataHook("table-schema-dialog-trigger")
      .should("be.visible")
      .should("contain", "4 cols")
    cy.getByDataHook("table-schema-dialog-trigger").click()

    cy.getByDataHook("create-table-panel").should("be.visible")
    cy.getByDataHook("table-schema-dialog-column-0").should("be.visible")
    cy.get("input[name='schemaColumns.0.name']").should(
      "have.value",
      "timestamp",
    )

    cy.getByDataHook("table-schema-dialog-column-0-type").should(
      "contain",
      "TIMESTAMP_NS",
    )

    cy.getByDataHook("table-schema-dialog-column-0-designated-button").click()
    cy.getByDataHook("form-submit-button").click()

    cy.getByDataHook("create-table-panel").should("not.exist")

    cy.getByDataHook("import-write-mode-trigger").click()
    cy.getByDataHook("import-write-mode-overwrite").click()

    cy.getByDataHook("import-upload-button").should("be.enabled")
    cy.getByDataHook("import-upload-button").click()
    cy.wait("@import").then(({ request, response }) => {
      expect(response.statusCode).to.equal(200)
      const params = new URL(request.url).searchParams
      expect(params.get("overwrite")).to.equal("true")
      expect(params.get("timestamp")).to.equal("timestamp")
      expect(request.body).to.contain("TIMESTAMP_NS")
      expect(request.body).to.contain("SSSUUUNNN")
    })
    assertStoredRows()

    cy.getByDataHook("import-file-status").should("contain", "Imported 7 rows")
    cy.get('[data-id="questdb:expanded:tables:nanos.csv:columns:timestamp"]')
      .should("contain", "TIMESTAMP_NS")
      .find('[data-hook="designated-timestamp-icon"]')
      .should("be.visible")
    cy.contains("button", "Result").click()
    cy.getGrid().should("be.visible")
    cy.getGridRow(0).should("contain", "USDCHF")
  })
})
