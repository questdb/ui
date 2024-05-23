/// <reference types="cypress" />

const tables = [
  "btc_trades",
  "chicago_weather_stations",
  "ecommerce_stats",
  "gitlog",
];

describe("questdb schema", () => {
  before(() => {
    cy.visit("http://localhost:9999");
    tables.forEach((table) => {
      cy.createTable(table);
    });
  });

  it("should show all the tables when there are no suspended", () => {
    tables.forEach((table) => {
      cy.getByDataHook("schema-table-title").should("contain", table);
    });
    cy.getByDataHook("schema-filter-suspended-button").should("be.disabled");
    cy.getByDataHook("schema-suspended-popover-trigger").should("not.exist");
  });

  it("should filter the table with input field", () => {
    // Table name search
    cy.get('input[name="table_filter"]').type("_");
    cy.getByDataHook("schema-search-clear-button").should("exist");
    cy.getByDataHook("schema-table-title").should("contain", "btc_trades");
    cy.getByDataHook("schema-table-title").should(
      "contain",
      "chicago_weather_stations"
    );
    cy.getByDataHook("schema-table-title").should("contain", "ecommerce_stats");
    cy.getByDataHook("schema-table-title").should("not.contain", "gitlog");
    cy.getByDataHook("schema-search-clear-button").click();
    cy.getByDataHook("schema-table-title").should("have.length", tables.length);

    // Column name search
    cy.get('input[name="table_filter"]').type("timestamp");
    cy.getByDataHook("schema-table-title").should("contain", "btc_trades");
    cy.getByDataHook("schema-table-title").should("have.length", 1);
    cy.getByDataHook("schema-search-clear-button").click();
  });

  after(() => {
    tables.forEach((table) => {
      cy.dropTable(table);
    });
  });
});
