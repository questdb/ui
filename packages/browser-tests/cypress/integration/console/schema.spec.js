/// <reference types="cypress" />

const baseUrl = "http://localhost:9999";

const tables = [
  "btc_trades",
  "chicago_weather_stations",
  "ecommerce_stats",
  "gitlog",
];

describe("questdb schema with working tables", () => {
  before(() => {
    cy.visit(baseUrl);
    tables.forEach((table) => {
      cy.createTable(table);
    });
  });

  it("should show all the tables when there are no suspended", () => {
    tables.forEach((table) => {
      cy.getByDataHook("schema-table-title").should("contain", table);
    });
    cy.getByDataHook("schema-filter-suspended-button").should("not.exist");
    cy.getByDataHook("schema-suspension-popover-trigger").should("not.exist");
  });

  it("should filter the table with input field", () => {
    // Table name search
    cy.get('input[name="table_filter"]').type("btc_trades");
    cy.getByDataHook("schema-search-clear-button").should("exist");
    cy.getByDataHook("schema-table-title").should("contain", "btc_trades");
    cy.getByDataHook("schema-table-title").should("not.contain", "ź");
    cy.getByDataHook("schema-table-title").should(
      "not.contain",
      "ecommerce_stats"
    );
    cy.getByDataHook("schema-table-title").should("not.contain", "gitlog");
    cy.getByDataHook("schema-search-clear-button").click();
    cy.getByDataHook("schema-table-title").should(
      "have.length.least",
      tables.length
    );

    // Column name search
    cy.get('input[name="table_filter"]').type("timestamp");
    cy.getByDataHook("schema-table-title").should("contain", "btc_trades");
    cy.getByDataHook("schema-table-title").should(
      "not.contain",
      "chicago_weather_stations"
    );
    cy.getByDataHook("schema-search-clear-button").click();
    cy.getByDataHook("schema-table-title").should(
      "contain",
      "chicago_weather_stations"
    );
  });

  after(() => {
    tables.forEach((table) => {
      cy.dropTable(table);
    });
  });
});

describe("questdb schema with suspended tables with Linux OS error codes", () => {
  before(() => {
    tables.forEach((table) => {
      cy.createTable(table);
    });
    cy.typeQuery(
      "ALTER TABLE btc_trades SUSPEND WAL WITH 24, 'Too many open files';"
    )
      .clickRun()
      .clearEditor();

    cy.typeQuery(
      "ALTER TABLE ecommerce_stats SUSPEND WAL WITH 12, 'Out of memory';"
    )
      .clickRun()
      .clearEditor();
  });
  beforeEach(() => {
    cy.visit(baseUrl);
  });

  it("should work with 2 suspended tables, btc_trades and ecommerce_stats", () => {
    cy.getByDataHook("schema-filter-suspended-button").should(
      "not.be.disabled"
    );
    cy.getByDataHook("schema-filter-suspended-button").should("contain", "2");
  });

  it("should filter out non-suspended tables on click", () => {
    cy.getByDataHook("schema-filter-suspended-button").click();
    cy.getByDataHook("schema-table-title").should("have.length", 2);
    cy.getByDataHook("schema-table-title").should("contain", "btc_trades");
    cy.getByDataHook("schema-table-title").should("contain", "ecommerce_stats");
    cy.getByDataHook("schema-table-title").should("not.contain", "gitlog");
    cy.getByDataHook("schema-table-title").should(
      "not.contain",
      "chicago_weather_stations"
    );
    cy.getByDataHook("schema-filter-suspended-button").click();
  });

  it("should show the suspension popover on click with details for btc_trades", () => {
    cy.get('input[name="table_filter"]').click().type("btc_trades");
    cy.contains('Suspended').click();
    cy.getByDataHook("schema-suspension-popover").should(
      "have.attr",
      "data-table-name",
      "btc_trades"
    );
    cy.getByDataHook("schema-suspension-popover-error-message").should(
      "contain",
      "Too many open files"
    );
    cy.getByDataHook("schema-suspension-popover-error-link").should(
      "have.attr",
      "href",
      "https://questdb.io/docs/deployment/capacity-planning/#maximum-open-files"
    );
    cy.getByDataHook("schema-suspension-popover-restart-transaction").click();
    cy.getByDataHook("schema-suspension-popover").should("not.exist");
    cy.getByDataHook("schema-suspension-popover-trigger").should("not.exist");
  });

  after(() => {
    tables.forEach((table) => {
      cy.dropTable(table);
    });
  });
});
