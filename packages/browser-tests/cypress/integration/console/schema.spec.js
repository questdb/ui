/// <reference types="cypress" />

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl = `http://localhost:9999${contextPath}`;

const tables = [
  "btc_trades",
  "chicago_weather_stations",
  "ecommerce_stats",
  "gitlog",
];

const materializedViews = ["btc_trades_mv"];

describe("questdb schema with working tables", () => {
  before(() => {
    cy.loadConsoleWithAuth();

    tables.forEach((table) => {
      cy.createTable(table);
    });
    cy.refreshSchema();
  });

  afterEach(() => {
    cy.realPress("Home");
    cy.collapseTables();
    cy.refreshSchema();
    cy.expandTables();
  });

  it("should show all the tables when there are no suspended", () => {
    tables.forEach((table) => {
      cy.getByDataHook("schema-table-title").should("contain", table);
    });
    cy.getByDataHook("schema-filter-suspended-button").should("not.exist");
    cy.getByDataHook("schema-row-error-icon").should("not.exist");
  });

  it("should show the symbol column details", () => {
    cy.getByDataHook("schema-table-title").contains("btc_trades").dblclick();
    cy.getByDataHook("schema-folder-title").contains("Columns").dblclick();
    cy.getByDataHook("schema-column-title").contains("symbol").dblclick();

    cy.getByDataHook("schema-row").should(($el) => {
      expect($el.text()).to.include("Indexed:");
      expect($el.text()).to.include("No");
    });

    cy.getByDataHook("schema-row").should(($el) => {
      expect($el.text()).to.include("Symbol capacity:");
      expect($el.text()).to.include("256");
    });

    cy.getByDataHook("schema-row").should(($el) => {
      expect($el.text()).to.include("Cached:");
      expect($el.text()).to.include("Yes");
    });
  });

  it("should show the storage details", () => {
    cy.getByDataHook("schema-table-title").contains("btc_trades").dblclick();
    cy.getByDataHook("schema-row").contains("Storage details").dblclick();

    cy.getByDataHook("schema-row").should(($el) => {
      expect($el.text()).to.include("WAL:");
      expect($el.text()).to.include("Enabled");
    });

    cy.getByDataHook("schema-row").should(($el) => {
      expect($el.text()).to.include("Partitioning:");
      expect($el.text()).to.include("By day");
    });
  });

  it("should show the table icon description in the tooltip", () => {
    cy.getByDataHook("schema-table-title")
      .contains("btc_trades")
      .getByDataHook("table-icon")
      .realHover();

    cy.wait(1200);

    cy.getByDataHook("tooltip").should(
      "contain",
      `WAL-based table, partitioned by "day", ordered on "timestamp" column.`
    );
    cy.getByDataHook("tooltip").should(
      "contain",
      "WAL-based tables are the current and most up-to-date table format. This format supports advanced data recovery, replication and high-throughput ingestion. This is the recommended format if your table contains time-series data that has a designated timestamp."
    );
  })

  it("should filter the table with input field", () => {
    // Table name search
    cy.get('input[name="table_filter"]').type("btc_trades");
    cy.expandTables();
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
  });

  after(() => {
    cy.loadConsoleWithAuth();
    tables.forEach((table) => {
      cy.dropTable(table);
    });
  });
});

describe("keyboard navigation", () => {
  before(() => {
    cy.loadConsoleWithAuth();
    tables.forEach((table) => {
      cy.createTable(table);
    });
    materializedViews.forEach((mv) => {
      cy.createMaterializedView(mv);
    });
    cy.refreshSchema();
  });

  beforeEach(() => {
    cy.clearEditor();
    cy.collapseTables();
    cy.collapseMatViews();
    cy.expandTables();
  });

  it("should expand and collapse folders using keyboard", () => {
    cy.getByDataHook("schema-table-title").contains("btc_trades").dblclick();
    cy.getByDataHook("schema-folder-title").should("contain", "Columns");
    // go to the columns folder
    cy.realPress("ArrowDown");

    // expand the columns folder
    cy.realPress("ArrowRight");
    cy.getByDataHook("schema-row").should("contain", "symbol");

    // go to the symbol column
    cy.realPress("ArrowRight");

    // expand the symbol column
    cy.realPress("ArrowRight");
    cy.getByDataHook("schema-row").should("contain", "Indexed:");

    // collapse the symbol column
    cy.realPress("ArrowLeft");
    cy.contains("Indexed:").should("not.exist");

    // go to columns folder
    cy.realPress("ArrowLeft");
    cy.focused().should("contain", "Columns");

    // collapse the columns folder
    cy.focused().should("contain", "Columns");
    cy.realPress("ArrowLeft");
    cy.contains("symbol").should("not.exist");

    // go to the btc_trades table
    cy.realPress("ArrowLeft");
    cy.focused().should("contain", "btc_trades");

    // collapse the table
    cy.focused().should("contain", "btc_trades");
    cy.realPress("ArrowLeft");
    cy.contains("Columns").should("not.exist");

    // go to the tables folder
    cy.realPress("ArrowLeft");
    cy.focused().should("contain", `Tables (${tables.length})`);

    // collapse the tables folder
    cy.focused().should("contain", "Tables");
    cy.realPress("ArrowLeft");
    cy.contains("btc_trades").should("not.exist");

    // go to the materialized views folder
    cy.realPress("ArrowDown");

    // expand the materialized views folder
    cy.realPress("ArrowRight");
    cy.getByDataHook("schema-row").should("contain", "btc_trades_mv");

    // go to the materialized view
    cy.realPress("ArrowRight");

    // expand the materialized view
    cy.realPress("ArrowRight");
    cy.getByDataHook("schema-row").should("contain", "Base tables");

    cy.getByDataHook("schema-row").contains("Base tables").dblclick();
    cy.getByDataHook("schema-detail-title").should("contain", "btc_trades");

    // collapse base tables
    cy.realPress("ArrowLeft");
    cy.contains('[data-hook="schema-detail-title"]', "btc_trades").should(
      "not.exist"
    );

    // collapse the materialized view
    cy.getByDataHook("schema-row").contains("btc_trades_mv").dblclick();
    cy.contains("Base tables").should("not.exist");

    // go to materialized views folder
    cy.realPress("ArrowUp");

    // collapse the materialized views folder
    cy.realPress("ArrowLeft");
    cy.contains("btc_trades_mv").should("not.exist");
  });

  it("should switch the focus between grid and schema", () => {
    cy.getEditorContent().should("be.visible");
    cy.typeQuery("SELECT 123123;");
    cy.runLine();
    cy.focused().should("contain", "123123");

    cy.expandMatViews();
    cy.focused().should(
      "contain",
      `Materialized views (${materializedViews.length})`
    );
    cy.contains(".qg-c-active", "123123").should("not.exist");

    cy.contains(".qg-c", "123123").click();
    cy.focused().should("contain", "123123");
    cy.getByDataHook("collapse-materialized-views").should(
      "not.have.class",
      "focused"
    );
  });

  it("should go to the last item with End, and first item with Home", () => {
    cy.expandMatViews();
    cy.realPress("Home");
    cy.focused().should("contain", `Tables (${tables.length})`);
    cy.realPress("End");
    const lastMatView = materializedViews[materializedViews.length - 1];
    cy.focused().should("contain", lastMatView);
  });
});

describe("questdb schema with suspended tables with Linux OS error codes", () => {
  before(() => {
    cy.loadConsoleWithAuth();

    tables.forEach((table) => {
      cy.createTable(table);
    });
    cy.refreshSchema();
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
    cy.loadConsoleWithAuth();
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

  it("should show the suspension dialog on context menu click with details for btc_trades", () => {
    cy.getByDataHook("schema-table-title").contains("btc_trades").rightclick();
    cy.getByDataHook("table-context-menu-resume-wal")
      .filter(":visible")
      .click();
    cy.getByDataHook("schema-suspension-dialog").should(
      "have.attr",
      "data-table-name",
      "btc_trades"
    );
    cy.getByDataHook("schema-suspension-dialog-error-message").should(
      "contain",
      "Too many open files, please, increase the maximum number of open file handlers OS limit"
    );
    cy.getByDataHook("schema-suspension-dialog-error-link").should(
      "have.attr",
      "href",
      "https://questdb.io/docs/deployment/capacity-planning/#maximum-open-files"
    );
  });

  it("should resume WAL for btc_trades from the suspension popover", () => {
    cy.getByDataHook("schema-table-title").contains("btc_trades").rightclick();
    cy.getByDataHook("table-context-menu-resume-wal")
      .filter(":visible")
      .click();
    cy.getByDataHook("schema-suspension-dialog-restart-transaction").click();
    cy.getByDataHook("schema-suspension-dialog-dismiss").click();
    cy.getByDataHook("schema-suspension-dialog").should("not.exist");
    cy.getByDataHook("schema-suspension-dialog-trigger").should("not.exist");
  });

  after(() => {
    cy.loadConsoleWithAuth();
    tables.forEach((table) => {
      cy.dropTable(table);
    });
  });
});

describe("table select UI", () => {
  before(() => {
    cy.loadConsoleWithAuth();

    tables.forEach((table) => {
      cy.createTable(table);
    });
    cy.refreshSchema();
  });
  beforeEach(() => {
    cy.loadConsoleWithAuth();
  });

  it("should show select ui on click", () => {
    cy.getByDataHook("schema-select-button").click();
    cy.getByDataHook("schema-copy-to-clipboard-button").should("be.visible");
    cy.getByDataHook("schema-copy-to-clipboard-button").should("be.disabled");
    cy.getByDataHook("schema-select-all-button").should("be.visible");
  });

  it("should select and deselect tables", () => {
    cy.getByDataHook("schema-select-button").click();
    cy.getByDataHook("schema-table-title").contains("btc_trades").click();
    cy.getByDataHook("schema-table-title")
      .contains("chicago_weather_stations")
      .click();
    cy.getByDataHook("schema-copy-to-clipboard-button")
      .should("not.be.disabled")
      .click();
    // Electron only!
    if (Cypress.isBrowser("electron")) {
      ["btc_trades", "chicago_weather_stations"].forEach((table) => {
        cy.window()
          .its("navigator.clipboard")
          .then((clip) => clip.readText())
          .should("contain", `CREATE TABLE '${table}'`);
      });
    }
  });

  after(() => {
    cy.loadConsoleWithAuth();
    tables.forEach((table) => {
      cy.dropTable(table);
    });
  });
});

describe("questdb schema in read-only mode", () => {
  before(() => {
    cy.intercept(
      {
        method: "GET",
        url: `${baseUrl}/assets/console-configuration.json`,
      },
      {
        savedQueries: [],
        readOnly: true,
      }
    ).as("getConsoleConfiguration");

    cy.loadConsoleWithAuth();
  });

  it("should disable Create Table action in read-only mode", () => {
    cy.getByDataHook("create-table-panel-button").trigger("mouseover");
    cy.getByDataHook("tooltip").should(
      "contain",
      "To use this feature, turn off read-only mode in the configuration file"
    );

    cy.getByDataHook("create-table-panel-button").click();
    cy.getByDataHook("create-table-panel").should("not.exist");
  });
});

describe("materialized views", () => {
  before(() => {
    cy.loadConsoleWithAuth();

    tables.forEach((table) => {
      cy.createTable(table);
    });
    materializedViews.forEach((mv) => {
      cy.createMaterializedView(mv);
    });
    cy.refreshSchema();
  });

  afterEach(() => {
    cy.collapseTables();
    cy.collapseMatViews();
  });

  it("should create materialized views", () => {
    cy.getByDataHook("schema-folder-title").should(
      "contain",
      `Tables (${tables.length})`
    );
    cy.getByDataHook("schema-folder-title").should(
      "contain",
      `Materialized views (${materializedViews.length})`
    );

    cy.expandTables();
    cy.getByDataHook("schema-table-title").should("contain", "btc_trades");
    cy.expandMatViews();
    cy.getByDataHook("schema-matview-title").should("contain", "btc_trades_mv");
  });

  it("should show the base table and copy schema for a materialized view", () => {
    cy.expandMatViews();
    cy.getByDataHook("schema-matview-title")
      .contains("btc_trades_mv")
      .dblclick();
    cy.getByDataHook("schema-row").contains("Base tables").dblclick();
    cy.getByDataHook("schema-detail-title")
      .contains("btc_trades")
      .should("exist");
    cy.getByDataHook("schema-matview-title")
      .contains("btc_trades_mv")
      .rightclick();
    cy.getByDataHook("table-context-menu-copy-schema")
      .filter(":visible")
      .click();

    if (Cypress.isBrowser("electron")) {
      cy.window()
        .its("navigator.clipboard")
        .invoke("readText")
        .should(
          "match",
          /^CREATE MATERIALIZED VIEW.*'btc_trades_mv' WITH BASE 'btc_trades'/
        );
    }
  });

  it("should resume WAL for a materialized view", () => {
    cy.getByDataHook("schema-row-error-icon").should("not.exist");
    cy.typeQuery(
      "ALTER MATERIALIZED VIEW btc_trades_mv SUSPEND WAL WITH 24, 'Too many open files';"
    )
      .clickRun()
      .clearEditor();

    cy.refreshSchema();
    cy.expandMatViews();
    cy.getByDataHook("schema-row-error-icon").should("be.visible");
    cy.getByDataHook("schema-filter-suspended-button").should("contain", "1");

    cy.getByDataHook("schema-matview-title")
      .contains("btc_trades_mv")
      .rightclick();
    cy.getByDataHook("table-context-menu-resume-wal")
      .should("not.be.disabled")
      .click();

    cy.getByDataHook("schema-suspension-dialog").should(
      "have.attr",
      "data-table-name",
      "btc_trades_mv"
    );
    cy.getByDataHook("schema-suspension-dialog-restart-transaction").click();
    cy.getByDataHook("schema-suspension-dialog-dismiss").click();
    cy.getByDataHook("schema-suspension-dialog").should("not.exist");
    cy.getByDataHook("schema-filter-suspended-button").should("not.exist");
    cy.getByDataHook("schema-row-error-icon").should("not.exist");
  });

  it("should show a warning icon and tooltip when the view is invalidated", () => {
    cy.intercept({
        method: "GET",
        pathname: "/exec",
        query: {
          query: "materialized_views()",
        },
      },
      (req) => {
        req.continue((res) => {
          if (res.body && res.body.dataset && res.body.dataset.length > 0) {
            const viewStatusIndex = res.body.columns.findIndex(
              (c) => c.name === "view_status"
            );
            const invalidationReasonIndex = res.body.columns.findIndex(
              (c) => c.name === "invalidation_reason"
            );
            res.body.dataset[0][viewStatusIndex] = "invalid";
            res.body.dataset[0][invalidationReasonIndex] =
              "this is an invalidation reason";
          }
          return res;
        });
      }
    );
    cy.refreshSchema();
    cy.expandMatViews();
    cy.getByDataHook("schema-row-error-icon").trigger("mouseover");

    cy.getByDataHook("tooltip").should(
      "contain",
      "Materialized view is invalid: this is an invalidation reason"
    );
  });

  after(() => {
    cy.loadConsoleWithAuth();

    materializedViews.forEach((mv) => {
      cy.dropMaterializedView(mv);
    });

    tables.forEach((table) => {
      cy.dropTableIfExists(table);
    });
  });
});
