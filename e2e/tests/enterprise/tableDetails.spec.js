/// <reference types="cypress" />

const TEST_TABLE = "btc_trades"
const TEST_LIVE_VIEW = "btc_trades_lv"

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

  describe("hides the STORAGE POLICY section for a live view", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.createLiveView(TEST_LIVE_VIEW)
      cy.refreshSchema()
      cy.expandLiveViews()
    })

    it("shows no storage policy section, unlike a table on the same server", () => {
      // Given: enterprise renders the section for a table, so a live view that
      // hides it proves the kind guard rather than the enterprise flag.
      cy.openDetailsDrawer(TEST_TABLE)
      cy.getByDataHook("table-details-tab-details").click()
      cy.getByDataHook("table-details-storage-policy-section").should(
        "be.visible",
      )

      // When
      cy.openDetailsDrawer(TEST_LIVE_VIEW, "liveview")
      cy.getByDataHook("table-details-tab-details").click()

      // Then
      cy.getByDataHook("table-details-flush-every-card").should("be.visible")
      cy.getByDataHook("table-details-storage-policy-section").should(
        "not.exist",
      )
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropLiveViewIfExists(TEST_LIVE_VIEW)
      cy.dropTable(TEST_TABLE)
    })
  })
})
