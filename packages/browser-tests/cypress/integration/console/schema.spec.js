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

describe("questdb schema with suspended tables", () => {
  before(() => {
    tables.forEach((table) => {
      cy.createTable(table);
    });
  });
  beforeEach(() => {
    cy.interceptQuery("wal_tables()", {
      query: "wal_tables()",
      columns: [
        {
          name: "name",
          type: "STRING",
        },
        {
          name: "suspended",
          type: "BOOLEAN",
        },
        {
          name: "writerTxn",
          type: "LONG",
        },
        {
          name: "writerLagTxnCount",
          type: "LONG",
        },
        {
          name: "sequencerTxn",
          type: "LONG",
        },
      ],
      timestamp: -1,
      dataset: [
        ["ecommerce_stats", true, "0", "0", "0"],
        ["sys.acl_entities", false, "3", "0", "3"],
        ["sys.acl_permissions", false, "30", "0", "30"],
        ["sys.acl_jwk_tokens", false, "0", "0", "0"],
        ["sys.acl_rest_tokens", false, "13", "0", "13"],
        ["sys.acl_links", false, "0", "0", "0"],
        ["btc_trades", true, "0", "0", "0"],
        ["sys.acl_external_groups", false, "1", "0", "1"],
        ["chicago_weather_stations", false, "0", "0", "0"],
        ["sys.acl_passwords", false, "0", "0", "0"],
        ["gitlog", false, "0", "0", "0"],
      ],
      count: 11,
      timings: {
        authentication: 7708,
        compiler: 553334,
        execute: 2788250,
        count: 0,
      },
    });
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

  it("should show the suspension popover on click with details", () => {
    cy.getByDataHook("schema-suspension-popover-trigger").first().click();
    cy.getByDataHook("schema-suspension-popover").should(
      "have.attr",
      "data-table-name",
      "btc_trades"
    );
  });

  after(() => {
    tables.forEach((table) => {
      cy.dropTable(table);
    });
  });
});
