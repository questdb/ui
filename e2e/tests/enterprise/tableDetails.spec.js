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
      // The policy is polled every STORAGE_POLICY_POLL_MS (5s), so each retry
      // and the failure threshold behind the banner need more than the 5s
      // requestTimeout Cypress applies to an aliased wait by default.
      cy.wait("@storagePolicyUnavailable", { requestTimeout: 15000 })
      cy.wait("@storagePolicyUnavailable", { requestTimeout: 15000 })
      cy.wait("@storagePolicyUnavailable", { requestTimeout: 15000 })

      // Then
      cy.getByDataHook("table-details-storage-unavailable", { timeout: 12000 })
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
      cy.intercept({
        method: "GET",
        pathname: "/exec",
        query: { query: /storage_policies/ },
      }).as("storagePolicies")
      cy.openDetailsDrawer(TEST_TABLE)

      // When
      cy.getByDataHook("table-details-tab-details").click()
      cy.wait("@storagePolicies")

      // Then the catalogue is read as a bare identifier, not a table function
      cy.get("@storagePolicies")
        .its("request.url")
        .then((url) => {
          const query = decodeURIComponent(url)
          expect(query).to.contain("storage_policies WHERE table_dir_name")
          expect(query).not.to.contain("storage_policies(")
        })

      // Then each duration column renders through its own label
      cy.getByDataHook("table-details-storage-policy-section")
        .should("be.visible")
        .within(() => {
          cy.contains("To Parquet").should("be.visible")
          cy.contains("3 Days").should("be.visible")
          cy.contains("To Remote").should("be.visible")
          cy.contains("10 Days").should("be.visible")
          cy.contains("Drop Local").should("be.visible")
          cy.contains("1 Year").should("be.visible")
          // DROP REMOTE was never set, so the catalogue reports it as a zero
          // duration and the stage is omitted rather than shown as "0 Hours"
          cy.contains("Drop Remote").should("not.exist")
        })

      // When
      cy.execQuery(`ALTER TABLE ${TEST_TABLE} DISABLE STORAGE POLICY`)

      // Then the next poll picks the change up, up to 5s away
      cy.getByDataHook("table-details-storage-disabled", { timeout: 12000 })
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
