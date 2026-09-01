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

    it("shows loading before the 'Not configured' placeholder", () => {
      // Given
      cy.intercept(
        {
          method: "GET",
          pathname: "/exec",
          query: { query: /storage_policies/ },
        },
        (req) => {
          req.continue((res) => {
            res.setDelay(1000)
          })
        },
      ).as("storagePolicy")

      // When
      cy.openDetailsDrawer(TEST_TABLE)
      cy.getByDataHook("table-details-tab-details").click()

      // Then
      cy.getByDataHook("table-details-storage-loading").should("be.visible")
      cy.wait("@storagePolicy")
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

      // When
      cy.intercept(
        {
          method: "GET",
          pathname: "/exec",
          query: { query: /storage_policies/ },
        },
        {
          statusCode: 500,
          body: { error: "Storage policy unavailable", position: 0 },
        },
      ).as("storagePolicyUnavailable")
      cy.wait("@storagePolicyUnavailable")
      cy.wait("@storagePolicyUnavailable")
      cy.wait("@storagePolicyUnavailable")

      // Then
      cy.getByDataHook("table-details-storage-unavailable", { timeout: 5000 })
        .should("be.visible")
        .and("contain", "Unavailable")
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("with a STORAGE POLICY", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.execQuery(
        `ALTER TABLE ${TEST_TABLE} SET STORAGE POLICY(TO PARQUET 3 DAYS, TO REMOTE 10 DAYS, DROP LOCAL 1 YEARS)`,
      )
      cy.refreshSchema()
    })

    it("renders catalog policy values and disabled status", () => {
      // Given
      cy.openDetailsDrawer(TEST_TABLE)

      // When
      cy.getByDataHook("table-details-tab-details").click()

      // Then
      cy.getByDataHook("table-details-storage-policy-section")
        .should("be.visible")
        .within(() => {
          cy.contains("To Parquet").should("be.visible")
          cy.contains("3 Days").should("be.visible")
          cy.contains("To Remote").should("be.visible")
          cy.contains("10 Days").should("be.visible")
          cy.contains("Drop Local").should("be.visible")
          cy.contains("1 Year").should("be.visible")
        })

      // When
      cy.execQuery(`ALTER TABLE ${TEST_TABLE} DISABLE STORAGE POLICY`)

      // Then
      cy.getByDataHook("table-details-storage-disabled", { timeout: 5000 })
        .should("be.visible")
        .and("contain", "Disabled")
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
