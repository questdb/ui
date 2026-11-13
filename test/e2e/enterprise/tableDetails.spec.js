/// <reference types="cypress" />

const TEST_TABLE = "btc_trades"

describe("TableDetailsDrawer in enterprise", () => {
  beforeEach(() => {
    cy.dropTableIfExists(TEST_TABLE)
    cy.createTable(TEST_TABLE)
    cy.loadConsoleWithAuth()
  })

  afterEach(() => {
    cy.dropTableIfExists(TEST_TABLE)
  })

  it("adds a storage policy to a table and shows its disabled state after disabling it", () => {
    // Given
    cy.intercept({
      method: "GET",
      pathname: "**/exec",
      query: { query: /storage_policies/ },
    }).as("storagePolicies")
    cy.openDetailsDrawer(TEST_TABLE)
    cy.getByDataHook("table-details-tab-details").click()
    cy.wait("@storagePolicies")
      .its("request.url")
      .then((url) => {
        const query = new URL(url).searchParams.get("query")
        expect(query).to.contain("storage_policies WHERE table_dir_name")
        expect(query).not.to.contain("storage_policies(")
      })
    cy.getByDataHook("table-details-storage-policy-section").within(() => {
      cy.contains("Not configured").should("be.visible")
      cy.contains("To Parquet").should("not.exist")
      cy.contains("To Remote").should("not.exist")
      cy.contains("Drop Local").should("not.exist")
      cy.contains("Drop Remote").should("not.exist")
    })
    cy.getByDataHook("table-details-details-section").should(
      "not.contain",
      "TTL",
    )

    // When
    cy.execAdminQuery(
      `ALTER TABLE ${TEST_TABLE} SET STORAGE POLICY(TO PARQUET 3 DAYS, TO REMOTE 10 DAYS, DROP LOCAL 1 YEARS)`,
    )

    // Then
    cy.getByDataHook("table-details-storage-policy-section").within(() => {
      cy.contains(/^To Parquet$/, { timeout: 12000 })
        .parent()
        .should("contain", "3 Days")
      cy.contains(/^To Remote$/)
        .parent()
        .should("contain", "10 Days")
      cy.contains(/^Drop Local$/)
        .parent()
        .should("contain", "1 Year")
      cy.contains("Drop Remote").should("not.exist")
      cy.contains("Not configured").should("not.exist")
    })
    cy.getByDataHook("table-details-storage-disabled").should("not.exist")

    // When
    cy.execAdminQuery(`ALTER TABLE ${TEST_TABLE} DISABLE STORAGE POLICY`)

    // Then
    cy.getByDataHook("table-details-storage-disabled", { timeout: 12000 })
      .should("be.visible")
      .and("contain", "Disabled")
  })
})
