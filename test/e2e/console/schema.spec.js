/// <reference types="cypress" />

function observeClipboardWrites() {
  cy.window().then((win) => {
    cy.spy(win.navigator.clipboard, "writeText").as("clipboardWrite")
  })
}

function readCopiedText(writeCount = 1) {
  return cy
    .get("@clipboardWrite")
    .should("have.callCount", writeCount)
    .then((write) => write.returnValues[writeCount - 1])
    .then(() => cy.window().then((win) => win.navigator.clipboard.readText()))
}

const tables = [
  "btc_trades",
  "chicago_weather_stations",
  "ecommerce_stats",
  "gitlog",
]

const materializedViews = ["btc_trades_mv"]

const views = ["btc_trades_view"]

const liveViews = ["btc_trades_lv"]

describe("questdb schema with working tables", () => {
  before(() => {
    tables.forEach((table) => {
      cy.createTable(table)
    })
    cy.loadConsoleWithAuth()
    cy.refreshSchema()
  })

  afterEach(() => {
    cy.realPress("Home")
    cy.collapseTables()
    cy.refreshSchema()
    cy.expandTables()
  })

  it("inspects a healthy table and its symbol and storage details", () => {
    // Given
    tables.forEach((table) =>
      cy.getByDataHook("schema-table-title").should("contain", table),
    )
    cy.getByDataHook("schema-filter-suspended-button").should("not.exist")
    cy.getByDataHook("schema-row-error-icon").should("not.exist")

    // When
    cy.getByDataHook("schema-table-title").contains("btc_trades").dblclick()
    cy.getByDataHook("schema-folder-title").contains("Columns").dblclick()
    cy.getByDataHook("schema-column-title").contains("symbol").dblclick()

    // Then
    for (const [label, value] of [
      ["Indexed:", "No"],
      ["Symbol capacity:", "256"],
      ["Cached:", "Yes"],
    ]) {
      cy.contains('[data-hook="schema-detail-title"]', label)
        .closest('[data-hook="schema-row"]')
        .should("contain", value)
    }

    // When
    cy.getByDataHook("schema-row").contains("Storage details").dblclick()

    // Then
    for (const [label, value] of [
      ["WAL:", "Enabled"],
      ["Partitioning:", "By day"],
    ]) {
      cy.contains('[data-hook="schema-detail-title"]', label)
        .closest('[data-hook="schema-row"]')
        .should("contain", value)
    }
  })

  after(() => {
    tables.forEach((table) => {
      cy.dropTable(table)
    })
  })
})

describe("keyboard navigation", () => {
  before(() => {
    tables.forEach((table) => {
      cy.createTable(table)
    })
    materializedViews.forEach((mv) => {
      cy.createMaterializedView(mv)
    })
    views.forEach((view) => {
      cy.createView(view)
    })
    cy.loadConsoleWithAuth()
    cy.refreshSchema()
  })

  beforeEach(() => {
    cy.clearEditor()
    cy.collapseTables()
    cy.collapseMatViews()
    cy.expandTables()
  })

  it("transfers focus between the result grid and schema", () => {
    cy.getEditorContent().should("be.visible")
    cy.typeQueryDirectly("SELECT 123123;")
    cy.runLine()
    cy.contains("[data-hook='grid-cell']", "123123").click()
    cy.focused().should("contain", "123123")

    cy.expandMatViews()
    cy.focused().should(
      "contain",
      `Materialized views (${materializedViews.length})`,
    )
    cy.contains(
      "[data-hook='grid-cell'][aria-selected='true']",
      "123123",
    ).should("not.exist")

    cy.contains("[data-hook='grid-cell']", "123123").click()
    cy.focused().should("contain", "123123")
    cy.getByDataHook("collapse-materialized-views").should(
      "have.attr",
      "data-focused",
      "false",
    )
  })

  after(() => {
    views.forEach((view) => cy.dropViewIfExists(view))
    tables.forEach((table) => {
      cy.dropTable(table)
    })
    materializedViews.forEach((mv) => {
      cy.dropMaterializedView(mv)
    })
  })
})

describe("questdb schema with suspended tables with Linux OS error codes", () => {
  before(() => {
    tables.forEach((table) => {
      cy.createTable(table)
    })
  })

  beforeEach(() => {
    cy.execAdminQuery(
      "ALTER TABLE btc_trades SUSPEND WAL WITH 24, 'Too many open files';",
    )
    cy.execAdminQuery(
      "ALTER TABLE ecommerce_stats SUSPEND WAL WITH 12, 'Out of memory';",
    )
    cy.loadConsoleWithAuth()
  })

  it("finds, diagnoses, and resumes a suspended table", () => {
    // Given
    cy.getByDataHook("schema-filter-suspended-button")
      .should("not.be.disabled")
      .and("contain", "2")

    // When
    cy.getByDataHook("schema-filter-suspended-button").click()

    // Then
    cy.getByDataHook("schema-table-title")
      .should("have.length", 2)
      .and("contain", "btc_trades")
      .and("contain", "ecommerce_stats")
      .and("not.contain", "gitlog")
      .and("not.contain", "chicago_weather_stations")

    // When
    cy.getByDataHook("schema-filter-suspended-button").click()

    // Then
    tables.forEach((table) =>
      cy
        .contains('[data-hook="schema-table-title"]', new RegExp(`^${table}$`))
        .should("be.visible"),
    )

    // When
    cy.getByDataHook("schema-filter-suspended-button").click()
    cy.getByDataHook("schema-table-title").contains("btc_trades").rightclick()
    cy.getByDataHook("table-context-menu-resume-wal").filter(":visible").click()

    // Then
    cy.getByDataHook("schema-suspension-dialog").should(
      "have.attr",
      "data-table-name",
      "btc_trades",
    )
    cy.getByDataHook("schema-suspension-dialog-error-message").should(
      "contain",
      "Too many open files, please, increase the maximum number of open file handlers OS limit",
    )
    cy.getByDataHook("schema-suspension-dialog-error-link").should(
      "have.attr",
      "href",
      "https://questdb.io/docs/deployment/capacity-planning/#maximum-open-files",
    )

    // When
    cy.getByDataHook("schema-suspension-dialog-restart-transaction").click()

    // Then
    cy.getByDataHook("schema-suspension-dialog").should(
      "contain",
      "WAL resumed successfully!",
    )

    // When
    cy.getByDataHook("schema-suspension-dialog-dismiss").click()
    cy.refreshSchema()

    // Then
    cy.getByDataHook("schema-filter-suspended-button").should("contain", "1")
    cy.getByDataHook("schema-table-title")
      .should("have.length", 1)
      .and("contain", "ecommerce_stats")
    cy.getByDataHook("schema-filter-suspended-button").click()
    cy.contains('[data-hook="schema-table-title"]', "btc_trades")
      .closest('[data-hook="schema-row"]')
      .find('[data-hook="schema-row-error-icon"]')
      .should("not.exist")
    cy.contains('[data-hook="schema-table-title"]', "ecommerce_stats")
      .closest('[data-hook="schema-row"]')
      .find('[data-hook="schema-row-error-icon"]')
      .should("be.visible")
    cy.execAdminQuery(
      "select suspended from wal_tables() where name = 'btc_trades'",
    )
      .its("body.dataset")
      .should("deep.equal", [[false]])
  })

  after(() => {
    tables.forEach((table) => {
      cy.dropTable(table)
    })
  })
})

describe("table select UI", () => {
  before(() => {
    tables.forEach((table) => {
      cy.createTable(table)
    })
  })
  beforeEach(() => {
    cy.loadConsoleWithAuth()
  })

  it("copies only the selected table schemas", () => {
    observeClipboardWrites()
    // Given
    cy.getByDataHook("schema-select-button").click()
    cy.getByDataHook("schema-copy-to-clipboard-button")
      .should("be.visible")
      .and("be.disabled")
    cy.getByDataHook("schema-select-all-button").should("be.visible")

    // When
    cy.getByDataHook("schema-table-title").contains("btc_trades").click()
    cy.getByDataHook("schema-table-title")
      .contains("chicago_weather_stations")
      .click()
    cy.getByDataHook("schema-copy-to-clipboard-button")
      .should("not.be.disabled")
      .click()

    // Then
    readCopiedText().should((text) => {
      expect(text).to.contain("CREATE TABLE 'btc_trades'")
      expect(text).to.contain("CREATE TABLE 'chicago_weather_stations'")
      expect(text).not.to.contain("CREATE TABLE 'ecommerce_stats'")
      expect(text).not.to.contain("CREATE TABLE 'gitlog'")
    })
  })

  after(() => {
    tables.forEach((table) => {
      cy.dropTable(table)
    })
  })
})

describe("views", () => {
  beforeEach(() => {
    views.forEach((view) => {
      cy.dropViewIfExists(view)
    })
    tables.forEach((table) => {
      cy.createTable(table)
    })
    views.forEach((view) => {
      cy.createView(view)
    })
    cy.loadConsoleWithAuth()
  })

  afterEach(() => {
    cy.collapseTables()
    cy.collapseMatViews()
  })

  it("should show the view as invalid if base table is dropped", () => {
    // Given
    cy.getByDataHook("schema-folder-title").should(
      "contain",
      `Views (${views.length})`,
    )
    cy.getByDataHook("expand-views").click()
    cy.realPress("ArrowRight")
    cy.realPress("ArrowDown")
    cy.focused().should("contain", "btc_trades_view")
    cy.realPress("ArrowRight")
    cy.realPress("ArrowDown")
    cy.focused().should("contain", "Columns")
    cy.realPress("ArrowRight")
    cy.realPress("ArrowDown")
    cy.focused().should("contain", "symbol")

    // When
    cy.dropTable("btc_trades")
    cy.refreshSchema()
    cy.expandViews()
    cy.getByDataHook("schema-view-title").should("contain", "btc_trades_view")
    // Then
    cy.hoverForTooltip(() =>
      cy
        .contains('[data-hook="schema-view-title"]', "btc_trades_view")
        .closest('[data-hook="schema-row"]')
        .find('[data-hook="schema-row-error-icon"]'),
    )
    cy.getByDataHook("tooltip")
      .contains("View is invalid: table does not exist [table=btc_trades]")
      .should("be.visible")
  })

  after(() => {
    tables.forEach((table) => {
      cy.dropTableIfExists(table)
    })
    views.forEach((view) => {
      cy.dropViewIfExists(view)
    })
  })
})

describe("materialized views", () => {
  beforeEach(() => {
    cy.execAdminQuery("DROP MATERIALIZED VIEW IF EXISTS btc_trades_mv")
    tables.forEach((table) => {
      cy.createTable(table)
    })
    materializedViews.forEach((mv) => {
      cy.createMaterializedView(mv)
    })
    cy.loadConsoleWithAuth()
    cy.refreshSchema()
  })

  afterEach(() => {
    cy.collapseTables()
    cy.collapseMatViews()
  })

  it("should show the base table and copy schema for a materialized view", () => {
    observeClipboardWrites()
    // Given
    cy.getByDataHook("schema-folder-title").should(
      "contain",
      `Materialized views (${materializedViews.length})`,
    )
    cy.expandTables()
    tables.forEach((table) =>
      cy
        .contains('[data-hook="schema-table-title"]', new RegExp(`^${table}$`))
        .should("be.visible"),
    )
    cy.expandMatViews()
    cy.getByDataHook("schema-matview-title").should("contain", "btc_trades_mv")

    // When
    cy.getByDataHook("schema-matview-title")
      .contains("btc_trades_mv")
      .dblclick()
    cy.getByDataHook("schema-row").contains("Base tables").dblclick()
    cy.getByDataHook("schema-detail-title")
      .contains("btc_trades")
      .should("exist")
    cy.getByDataHook("schema-matview-title")
      .contains("btc_trades_mv")
      .rightclick()
    cy.getByDataHook("table-context-menu-copy-schema")
      .filter(":visible")
      .click()

    readCopiedText().should(
      "match",
      /^CREATE MATERIALIZED VIEW.*'btc_trades_mv' WITH BASE 'btc_trades'/,
    )
  })

  it("should resume WAL for a materialized view", () => {
    cy.getByDataHook("schema-row-error-icon").should("not.exist")
    cy.typeQueryDirectly(
      "ALTER MATERIALIZED VIEW btc_trades_mv SUSPEND WAL WITH 24, 'Too many open files';",
    )
      .runLine()
      .clearEditor()

    cy.refreshSchema()
    cy.expandMatViews()
    cy.getByDataHook("schema-row-error-icon").should("be.visible")
    cy.getByDataHook("schema-filter-suspended-button").should("contain", "1")

    cy.getByDataHook("schema-matview-title")
      .contains("btc_trades_mv")
      .rightclick()
    cy.getByDataHook("table-context-menu-resume-wal").filter(":visible").click()

    cy.getByDataHook("schema-suspension-dialog").should(
      "have.attr",
      "data-table-name",
      "btc_trades_mv",
    )
    cy.getByDataHook("schema-suspension-dialog-restart-transaction").click()
    cy.getByDataHook("schema-suspension-dialog").should(
      "contain",
      "WAL resumed successfully!",
    )
    cy.getByDataHook("schema-suspension-dialog-dismiss").click()
    cy.getByDataHook("schema-suspension-dialog").should("not.exist")
    cy.refreshSchema()
    cy.getByDataHook("schema-filter-suspended-button").should("not.exist")
    cy.getByDataHook("schema-row-error-icon").should("not.exist")
  })

  after(() => {
    materializedViews.forEach((mv) => {
      cy.dropMaterializedView(mv)
    })

    tables.forEach((table) => {
      cy.dropTableIfExists(table)
    })
  })
})

describe("live views", () => {
  before(() => {
    tables.forEach((table) => {
      cy.createTable(table)
    })
    liveViews.forEach((lv) => {
      cy.createLiveView(lv)
    })
    cy.loadConsoleWithAuth()
    cy.refreshSchema()
  })

  beforeEach(() => {
    cy.collapseTables()
    cy.collapseMatViews()
  })

  afterEach(() => {
    cy.collapseLiveViews()
  })

  it("should show the base table and copy schema for a live view", () => {
    observeClipboardWrites()
    // Given
    cy.getByDataHook("schema-folder-title").should(
      "contain",
      `Live views (${liveViews.length})`,
    )
    cy.expandLiveViews()
    cy.getByDataHook("schema-liveview-title").should("contain", "btc_trades_lv")

    // When
    cy.getByDataHook("schema-liveview-title")
      .contains("btc_trades_lv")
      .dblclick()
    cy.getByDataHook("schema-row").contains("Base tables").dblclick()

    // Then
    cy.getByDataHook("schema-detail-title")
      .contains("btc_trades")
      .should("exist")

    // When
    cy.getByDataHook("schema-liveview-title")
      .contains("btc_trades_lv")
      .rightclick()
    cy.getByDataHook("table-context-menu-copy-schema")
      .filter(":visible")
      .click()

    // Then
    readCopiedText().should("match", /^CREATE LIVE VIEW.*'btc_trades_lv'/)
  })

  after(() => {
    liveViews.forEach((lv) => {
      cy.dropLiveViewIfExists(lv)
    })

    tables.forEach((table) => {
      cy.dropTableIfExists(table)
    })
  })
})

describe("create materialized view from context menu", () => {
  const sourceTable = "btc_trades"
  // btc_trades is PARTITION BY DAY → derived SAMPLE BY 1h → view name btc_trades_1h.
  const generatedMatView = "btc_trades_1h"

  before(() => {
    cy.execAdminQuery(`DROP MATERIALIZED VIEW IF EXISTS ${generatedMatView}`)
    cy.createTable(sourceTable)
    cy.loadConsoleWithAuth()
    cy.refreshSchema()
  })

  after(() => {
    cy.dropMaterializedView(generatedMatView)
    cy.dropTableIfExists(sourceTable)
  })

  it("generates and executes materialized-view DDL from a table", () => {
    // Given
    cy.contains('[data-hook="schema-matview-title"]', generatedMatView).should(
      "not.exist",
    )
    cy.clearEditor()
    cy.contains(
      '[data-hook="schema-table-title"]',
      new RegExp(`^${sourceTable}$`),
    ).rightclick()
    cy.getByDataHook("table-context-menu-create-matview")
      .should("not.be.disabled")
      .click()

    cy.getEditorContent().should("contain.value", "CREATE MATERIALIZED VIEW")
    cy.runLine().clearEditor()

    cy.refreshSchema()
    cy.expandMatViews()
    cy.getByDataHook("schema-matview-title").should("contain", generatedMatView)
  })
})

describe("create materialized view from matview context menu", () => {
  const sourceTable = "btc_trades"
  const sourceMatView = "btc_trades_mv"
  // btc_trades_mv is SAMPLE BY 1m → next rung 5m; name has no period token,
  // so the generator appends `_5m`.
  const generatedMatView = "btc_trades_mv_5m"

  before(() => {
    cy.execAdminQuery(`DROP MATERIALIZED VIEW IF EXISTS ${generatedMatView}`)
    cy.createTable(sourceTable)
    cy.createMaterializedView(sourceMatView)
    cy.loadConsoleWithAuth()
    cy.refreshSchema()
  })

  after(() => {
    cy.dropMaterializedView(generatedMatView)
    cy.dropMaterializedView(sourceMatView)
    cy.dropTableIfExists(sourceTable)
  })

  it("generates a runnable chained matview DDL from a matview source", () => {
    cy.expandMatViews()

    cy.contains('[data-hook="schema-matview-title"]', generatedMatView).should(
      "not.exist",
    )
    cy.clearEditor()
    cy.getByDataHook("schema-matview-title")
      .contains(sourceMatView)
      .rightclick()
    cy.getByDataHook("table-context-menu-create-matview")
      .should("not.be.disabled")
      .click()

    cy.getEditorContent().should("contain.value", "CREATE MATERIALIZED VIEW")
    cy.runLine().clearEditor()

    cy.refreshSchema()
    cy.expandMatViews()
    cy.getByDataHook("schema-matview-title").should("contain", generatedMatView)
  })
})
