/// <reference types="cypress" />

const TEST_TABLE = "btc_trades"

describe("TableDetailsDrawer in enterprise", () => {
  describe("without a STORAGE POLICY shows 'Not configured'", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.refreshSchema()
    })

    it("renders the section with the 'Not configured' placeholder", () => {
      cy.openDetailsDrawer(TEST_TABLE)
      cy.getByDataHook("table-details-tab-details").click()

      cy.getByDataHook("table-details-storage-policy-section")
        .should("be.visible")
        .within(() => {
          cy.contains("Not configured").should("be.visible")
          cy.contains("To Parquet").should("not.exist")
          cy.contains("To Remote").should("not.exist")
          cy.contains("Drop Local").should("not.exist")
          cy.contains("Drop Remote").should("not.exist")
        })

      cy.getByDataHook("table-details-details-section")
        .should("be.visible")
        .within(() => {
          cy.contains("TTL").should("not.exist")
        })
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable(TEST_TABLE)
    })
  })
})
