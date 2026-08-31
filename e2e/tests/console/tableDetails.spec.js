/// <reference types="cypress" />

const {
  PROVIDERS,
  getOpenAIConfiguredSettings,
  createFinalResponseData,
  createResponse,
  createChatTitleResponse,
  isTitleRequest,
} = require("../../utils/aiAssistant")

const TEST_TABLE = "btc_trades"
const TEST_TABLE_NO_WAL = "btc_trades_no_wal"
const TEST_MATVIEW = "btc_trades_mv"
const TEST_MATVIEW_ON_MV = "btc_trades_mv_on_mv"
const TEST_VIEW = "btc_trades_view"
const TEST_LIVE_VIEW = "btc_trades_lv"
const TEST_LIVE_VIEW_2 = "btc_trades_lv_2"

const TEST_LIVE_VIEW_2_DDL =
  `CREATE LIVE VIEW IF NOT EXISTS ${TEST_LIVE_VIEW_2} FLUSH EVERY 1s IN MEMORY 5s START FROM BEGINNING AS ` +
  "SELECT timestamp, symbol, avg(price) OVER (PARTITION BY symbol ORDER BY timestamp ROWS 100 PRECEDING) AS moving_avg FROM btc_trades;"

function interceptTablesQuery(modifications) {
  cy.intercept(
    {
      method: "GET",
      pathname: "/exec",
      query: { query: /tables\(\)/ },
    },
    (req) => {
      req.continue((res) => {
        if (res.body?.dataset?.length > 0) {
          for (const [fieldName, value] of Object.entries(modifications)) {
            const fieldIndex = res.body.columns.findIndex(
              (c) => c.name === fieldName,
            )
            if (fieldIndex !== -1) {
              const tableNameIndex = res.body.columns.findIndex(
                (c) => c.name === "table_name",
              )
              for (let i = 0; i < res.body.dataset.length; i++) {
                if (res.body.dataset[i][tableNameIndex] === TEST_TABLE) {
                  res.body.dataset[i][fieldIndex] = value
                }
              }
            }
          }
        }
        return res
      })
    },
  ).as("tablesQuery")
}

function interceptMatViewsQuery(modifications) {
  cy.intercept(
    {
      method: "GET",
      pathname: "/exec",
      query: { query: /materialized_views\(\)/ },
    },
    (req) => {
      req.continue((res) => {
        if (res.body?.dataset?.length > 0) {
          for (const [fieldName, value] of Object.entries(modifications)) {
            const fieldIndex = res.body.columns.findIndex(
              (c) => c.name === fieldName,
            )
            if (fieldIndex !== -1) {
              for (let i = 0; i < res.body.dataset.length; i++) {
                res.body.dataset[i][fieldIndex] = value
              }
            }
          }
        }
        return res
      })
    },
  ).as("matviewsQuery")
}

function interceptLiveViewsQuery(modifications) {
  cy.intercept(
    {
      method: "GET",
      pathname: "/exec",
      query: { query: /live_views\(\)/ },
    },
    (req) => {
      req.continue((res) => {
        if (res.body?.dataset?.length > 0) {
          for (const [fieldName, value] of Object.entries(modifications)) {
            const fieldIndex = res.body.columns.findIndex(
              (c) => c.name === fieldName,
            )
            if (fieldIndex !== -1) {
              for (let i = 0; i < res.body.dataset.length; i++) {
                res.body.dataset[i][fieldIndex] = value
              }
            }
          }
        }
        return res
      })
    },
  ).as("liveViewsQuery")
}

function mutateLiveViewResponse(res, modifications) {
  if (!res.body?.dataset?.length) return

  for (const [fieldName, value] of Object.entries(modifications)) {
    const fieldIndex = res.body.columns.findIndex(
      (column) => column.name === fieldName,
    )
    if (fieldIndex !== -1) {
      res.body.dataset[0][fieldIndex] = value
    }
  }
}

function interceptAIRequest(responseText = "Test AI response", sql = null) {
  const responseData = createFinalResponseData("openai", responseText, sql)

  cy.intercept("POST", PROVIDERS.openai.endpoint, (req) => {
    if (isTitleRequest("openai", req.body)) {
      req.reply(createChatTitleResponse("openai", "Test Chat"))
      return
    }
    req.reply(
      createResponse("openai", responseData, { streaming: true, delay: 100 }),
    )
  }).as("openaiRequest")
}

describe("TableDetailsDrawer", () => {
  beforeEach(() => {
    cy.intercept("POST", PROVIDERS.openai.endpoint, (req) => {
      throw new Error(
        `Unhandled OpenAI request detected! Request body: ${JSON.stringify(req.body).slice(0, 200)}...`,
      )
    }).as("unhandledOpenAI")

    cy.intercept("POST", PROVIDERS.anthropic.endpoint, (req) => {
      throw new Error(
        `Unhandled Anthropic request detected! Request body: ${JSON.stringify(req.body).slice(0, 200)}...`,
      )
    }).as("unhandledAnthropic")
  })

  describe("view state", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.refreshSchema()
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth()
      cy.expandTables()
    })

    it("should show Monitoring tab by default and switch to Details tab when clicked", () => {
      cy.openDetailsDrawer(TEST_TABLE)

      cy.getByDataHook("table-details-tab-monitoring")
        .should("be.visible")
        .should("have.attr", "data-active", "true")

      cy.getByDataHook("table-details-tab-details").click()

      cy.getByDataHook("table-details-tab-details").should(
        "have.attr",
        "data-active",
        "true",
      )
      cy.getByDataHook("table-details-tab-monitoring").should(
        "have.attr",
        "data-active",
        "false",
      )
      cy.getByDataHook("table-details-ddl-section").should("be.visible")
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("healthy table state", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.refreshSchema()
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth()
      cy.expandTables()
    })

    it("should show healthy state", () => {
      cy.openDetailsDrawer(TEST_TABLE)

      cy.getByDataHook("table-details-health-status")
        .should("be.visible")
        .should("have.attr", "data-severity", "healthy")
      cy.getByDataHook("table-details-error-banner").should("not.exist")
      cy.getByDataHook("table-details-performance-alerts").should("not.exist")

      cy.getByDataHook("table-details-row-count-value")
        .should("be.visible")
        .should("have.text", "0")
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("critical health issues - WAL suspended (R1)", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.refreshSchema()
    })

    it("should show critical health status for suspended WAL", () => {
      interceptTablesQuery({ table_suspended: true })
      cy.expandTables()
      cy.openDetailsDrawer(TEST_TABLE)

      cy.getByDataHook("table-details-health-status")
        .should("be.visible")
        .should("have.attr", "data-severity", "critical")

      cy.getByDataHook("table-details-tab-error-badge").should("be.visible")

      cy.getByDataHook("table-details-resume-wal-button").should("be.visible")
      cy.getByDataHook("table-details-error-ask-ai")
        .should("be.visible")
        .should("be.disabled")
      cy.getByDataHook("table-details-error-docs-link")
        .should("be.visible")
        .should("have.attr", "href")
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("critical health issues - memory backoff (R3)", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.refreshSchema()
    })

    it("should show critical health status for memory backoff", () => {
      interceptTablesQuery({ table_memory_pressure_level: 2 })
      cy.expandTables()
      cy.openDetailsDrawer(TEST_TABLE)

      cy.getByDataHook("table-details-health-status")
        .should("be.visible")
        .should("have.attr", "data-severity", "critical")

      cy.getByDataHook("table-details-error-banner").should("be.visible")
      cy.getByDataHook("table-details-error-title").should(
        "contain",
        "Memory backoff",
      )
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("warning health issues - small transactions (Y3)", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.refreshSchema()
    })

    it("should show warning health status", () => {
      interceptTablesQuery({ wal_tx_size_p90: 50 })
      cy.expandTables()
      cy.openDetailsDrawer(TEST_TABLE)

      cy.getByDataHook("table-details-health-status")
        .should("be.visible")
        .should("have.attr", "data-severity", "warning")
      cy.getByDataHook("table-details-tab-warning-badge").should("be.visible")
      cy.getByDataHook("table-details-performance-alerts").should("be.visible")
      cy.getByDataHook("table-details-alert-item")
        .should("be.visible")
        .should("contain", "Small transactions")
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("warning health issues - high write amplification (Y4)", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.refreshSchema()
    })

    it("should show high write amplification warning", () => {
      interceptTablesQuery({ table_write_amp_p50: 3.5 })
      cy.expandTables()
      cy.openDetailsDrawer(TEST_TABLE)

      cy.getByDataHook("table-details-health-status")
        .should("be.visible")
        .should("have.attr", "data-severity", "warning")
      cy.getByDataHook("table-details-performance-alerts").should("be.visible")
      cy.getByDataHook("table-details-alert-item").should(
        "contain",
        "High write amplification",
      )
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("warning health issues - high memory pressure (Y5)", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.refreshSchema()
    })

    it("should show high memory pressure warning for level 1", () => {
      interceptTablesQuery({ table_memory_pressure_level: 1 })
      cy.expandTables()
      cy.openDetailsDrawer(TEST_TABLE)

      cy.getByDataHook("table-details-health-status")
        .should("be.visible")
        .should("have.attr", "data-severity", "warning")
      cy.getByDataHook("table-details-performance-alerts").should("be.visible")
      cy.getByDataHook("table-details-alert-item").should(
        "contain",
        "High memory pressure",
      )
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("ingestion - WAL disabled", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE_NO_WAL)
      cy.refreshSchema()
    })

    it("should show WAL disabled indicator for non-WAL table", () => {
      cy.expandTables()
      cy.openDetailsDrawer(TEST_TABLE_NO_WAL)

      cy.getByDataHook("table-details-wal-disabled").should("be.visible")
      cy.getByDataHook("table-details-ingestion-content").should("not.exist")
      cy.getByDataHook("table-details-ingestion-toggle").should("not.exist")
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable(TEST_TABLE_NO_WAL)
    })
  })

  describe("ingestion - pending rows increasing (Y2)", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.refreshSchema()
    })

    it("should show warning state when pending rows trend is increasing", () => {
      let callCount = 0
      cy.intercept(
        {
          method: "GET",
          pathname: "/exec",
          query: { query: /tables\(\)/ },
        },
        (req) => {
          req.continue((res) => {
            if (res.body?.dataset?.length > 0) {
              const tableNameIndex = res.body.columns.findIndex(
                (c) => c.name === "table_name",
              )
              const pendingRowsIndex = res.body.columns.findIndex(
                (c) => c.name === "wal_pending_row_count",
              )
              for (let i = 0; i < res.body.dataset.length; i++) {
                if (res.body.dataset[i][tableNameIndex] === TEST_TABLE) {
                  res.body.dataset[i][pendingRowsIndex] = 1000 + callCount * 500
                  callCount++
                }
              }
            }
            return res
          })
        },
      ).as("tablesQueryTrend")

      cy.expandTables()
      cy.openDetailsDrawer(TEST_TABLE)

      cy.wait(3000)

      cy.getByDataHook("table-details-health-status")
        .should("be.visible")
        .should("have.attr", "data-severity", "warning")
      cy.getByDataHook("table-details-tab-warning-badge").should("be.visible")
      cy.getByDataHook("table-details-pending-rows-trend")
        .should("be.visible")
        .should("have.attr", "data-trend", "increasing")
      cy.getByDataHook("table-details-performance-alerts").should("be.visible")
      cy.getByDataHook("table-details-alert-item").should(
        "contain",
        "Pending rows",
      )
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("ingestion - transaction lag decreasing", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.refreshSchema()
    })

    it("should show healthy state with decreasing trend when lag is recovering", () => {
      let callCount = 0
      cy.intercept(
        {
          method: "GET",
          pathname: "/exec",
          query: { query: /tables\(\)/ },
        },
        (req) => {
          req.continue((res) => {
            if (res.body?.dataset?.length > 0) {
              const tableNameIndex = res.body.columns.findIndex(
                (c) => c.name === "table_name",
              )
              const walTxnIndex = res.body.columns.findIndex(
                (c) => c.name === "wal_txn",
              )
              const tableTxnIndex = res.body.columns.findIndex(
                (c) => c.name === "table_txn",
              )
              for (let i = 0; i < res.body.dataset.length; i++) {
                if (res.body.dataset[i][tableNameIndex] === TEST_TABLE) {
                  // Simulate decreasing lag: wal_txn stays at 100, table_txn catches up
                  res.body.dataset[i][walTxnIndex] = 100
                  res.body.dataset[i][tableTxnIndex] = Math.min(
                    90 + callCount * 2,
                    99,
                  )
                  callCount++
                }
              }
            }
            return res
          })
        },
      ).as("tablesQueryTrend")

      cy.expandTables()
      cy.openDetailsDrawer(TEST_TABLE)

      cy.wait(3000)

      cy.getByDataHook("table-details-health-status")
        .should("be.visible")
        .should("have.attr", "data-severity", "healthy")
      cy.getByDataHook("table-details-transaction-lag-trend")
        .should("be.visible")
        .should("have.attr", "data-trend", "decreasing")
      cy.getByDataHook("table-details-performance-alerts").should("not.exist")
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("expandable sections", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.refreshSchema()
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth()
      cy.expandTables()
    })

    describe("ingestion section", () => {
      it("should show WAL details when WAL is enabled", () => {
        cy.openDetailsDrawer(TEST_TABLE)

        cy.getByDataHook("table-details-ingestion-content").should("be.visible")
        cy.getByDataHook("table-details-pending-rows-trend").should(
          "be.visible",
        )
        cy.getByDataHook("table-details-transaction-lag-trend").should(
          "be.visible",
        )
        cy.getByDataHook("table-details-wal-disabled").should("not.exist")
      })
    })

    describe("columns section", () => {
      it("should be collapsed by default", () => {
        cy.openDetailsDrawer(TEST_TABLE)
        cy.getByDataHook("table-details-tab-details").click()

        cy.getByDataHook("table-details-columns-content").should("not.exist")
      })

      it("should expand when clicking toggle", () => {
        cy.openDetailsDrawer(TEST_TABLE)
        cy.getByDataHook("table-details-tab-details").click()

        cy.getByDataHook("table-details-columns-toggle").click()
        cy.getByDataHook("table-details-columns-content").should("be.visible")
      })

      it("should show columns when expanded", () => {
        cy.openDetailsDrawer(TEST_TABLE)
        cy.getByDataHook("table-details-tab-details").click()
        cy.getByDataHook("table-details-columns-toggle").click()

        cy.getByDataHook("table-details-column-row").should(
          "have.length.at.least",
          1,
        )
      })

      it("should collapse when clicking toggle again", () => {
        cy.openDetailsDrawer(TEST_TABLE)
        cy.getByDataHook("table-details-tab-details").click()
        cy.getByDataHook("table-details-columns-toggle").click()

        cy.getByDataHook("table-details-columns-toggle").click()
        cy.getByDataHook("table-details-columns-content").should("not.exist")
      })
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("copy functionality", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.refreshSchema()
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth()
      cy.expandTables()
    })

    it("should have copy DDL button in DDL section", () => {
      cy.openDetailsDrawer(TEST_TABLE)
      cy.getByDataHook("table-details-tab-details").click()

      cy.getByDataHook("table-details-copy-ddl").should("be.visible")
      if (Cypress.isBrowser("electron")) {
        cy.getByDataHook("table-details-copy-ddl").click()
        if (Cypress.isBrowser("electron")) {
          cy.window()
            .its("navigator.clipboard")
            .invoke("readText")
            .should("contain", `CREATE TABLE \'${TEST_TABLE}\'`)
        }
      }
    })

    if (Cypress.isBrowser("electron")) {
      it("should copy table name when clicking copy button in header", () => {
        cy.openDetailsDrawer(TEST_TABLE)

        cy.getByDataHook("table-details-copy-name").click()
        cy.window()
          .its("navigator.clipboard")
          .invoke("readText")
          .should("contain", TEST_TABLE)
      })
    }

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("materialized view specific", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.createMaterializedView(TEST_MATVIEW)
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth()
      cy.refreshSchema()
      cy.expandMatViews()
    })

    it("should show matview type badge and view status", () => {
      cy.openDetailsDrawer(TEST_MATVIEW, "matview")

      cy.getByDataHook("table-details-type-badge").should(
        "contain",
        "Materialized view",
      )
      cy.getByDataHook("table-details-view-status").should("be.visible")
      cy.getByDataHook("table-details-base-table-status").should("be.visible")
    })

    it("should navigate to base table and back", () => {
      cy.openDetailsDrawer(TEST_MATVIEW, "matview")
      cy.getByDataHook("table-details-tab-details").click()

      cy.getByDataHook("table-details-base-table-section").should("be.visible")
      cy.getByDataHook("table-details-base-table-link").should("be.visible")

      cy.getByDataHook("table-details-base-table-link").click()

      cy.getByDataHook("table-details-type-badge").should("contain", "Table")
      cy.getByDataHook("table-details-name").should("have.value", TEST_TABLE)
      cy.getByDataHook("sidebar-back-button").should("not.be.disabled")

      cy.getByDataHook("sidebar-back-button").click()

      cy.getByDataHook("table-details-type-badge").should(
        "contain",
        "Materialized view",
      )
      cy.getByDataHook("table-details-name").should("have.value", TEST_MATVIEW)
      cy.getByDataHook("sidebar-back-button").should("be.disabled")
    })

    it("should fall back to table-backed details when matview metadata is missing", () => {
      cy.intercept(
        {
          method: "GET",
          pathname: "/exec",
          query: { query: /materialized_views\(\) WHERE view_name/ },
        },
        (req) => {
          req.continue((res) => {
            res.body.dataset = []
            res.body.count = 0
            return res
          })
        },
      )

      cy.openDetailsDrawer(TEST_MATVIEW, "matview")
      cy.getByDataHook("table-details-tab-details").click()

      cy.getByDataHook("table-details-details-section")
        .should("be.visible")
        .should("contain", "Deduplication")
        .should("contain", "Partitioning")
        .should("not.contain", "Refresh Type")
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropMaterializedView(TEST_MATVIEW)
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("materialized view based on another materialized view", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.createMaterializedView(TEST_MATVIEW)
      cy.createMaterializedView(TEST_MATVIEW_ON_MV)
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth()
      cy.refreshSchema()
      cy.expandMatViews()
    })

    it("should open as matview and navigate to a matview base table preserving the matview kind", () => {
      cy.openDetailsDrawer(TEST_MATVIEW_ON_MV, "matview")

      cy.getByDataHook("table-details-type-badge").should(
        "contain",
        "Materialized view",
      )

      cy.getByDataHook("table-details-tab-details").click()

      cy.getByDataHook("table-details-base-table-section").should("be.visible")
      cy.getByDataHook("table-details-base-table-link").should(
        "contain",
        TEST_MATVIEW,
      )

      cy.getByDataHook("table-details-base-table-link").click()

      cy.getByDataHook("table-details-name").should("have.value", TEST_MATVIEW)
      cy.getByDataHook("table-details-type-badge").should(
        "contain",
        "Materialized view",
      )
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropMaterializedView(TEST_MATVIEW_ON_MV)
      cy.dropMaterializedView(TEST_MATVIEW)
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("materialized view invalid state (R2)", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.createMaterializedView(TEST_MATVIEW)
      cy.refreshSchema()
      cy.getByDataHook("schema-folder-title")
        .contains("Materialized views")
        .should("exist")
    })

    it("should show critical health status for invalid matview", () => {
      interceptMatViewsQuery({
        view_status: "invalid",
        invalidation_reason: "Base table structure changed",
      })
      cy.expandMatViews()
      cy.getByDataHook("schema-matview-title").should("contain", TEST_MATVIEW)
      cy.openDetailsDrawer(TEST_MATVIEW, "matview")

      cy.getByDataHook("table-details-health-status")
        .should("be.visible")
        .should("have.attr", "data-severity", "critical")
      cy.getByDataHook("table-details-error-banner").should("be.visible")
      cy.getByDataHook("table-details-error-title").should("contain", "invalid")
      cy.getByDataHook("table-details-resume-wal-button").should("not.exist")
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropMaterializedView(TEST_MATVIEW)
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("live view specific", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.createLiveView(TEST_LIVE_VIEW)
      cy.execQuery(TEST_LIVE_VIEW_2_DDL)
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth()
      cy.refreshSchema()
      cy.collapseTables()
      cy.expandLiveViews()
    })

    it("should show live view type badge, view status and live view monitoring sections", () => {
      // When
      cy.openDetailsDrawer(TEST_LIVE_VIEW, "liveview")

      // Then
      cy.getByDataHook("table-details-type-badge").should(
        "contain",
        "Live view",
      )
      cy.getByDataHook("table-details-view-status")
        .should("be.visible")
        .should("contain", "Active")
      cy.getByDataHook("table-details-base-table-status").should("be.visible")
      cy.getByDataHook("table-details-live-view-freshness")
        .should("be.visible")
        .should("contain", "Unflushed Transactions")
        .should("contain", "Since Last Flush")
      cy.getByDataHook("table-details-live-view-memory")
        .should("be.visible")
        .should("contain", "Rows in Memory")
        .should("contain", "Memory Footprint")
      cy.getByDataHook("table-details-live-view-freshness").should(
        "contain",
        "Writer Stall",
      )
      cy.getByDataHook("table-details-live-view-memory").should(
        "not.contain",
        "Dropped Below Start From",
      )
    })

    it("should show a retrying error instead of table details when live view metadata fails", () => {
      let failMetadata = true

      cy.intercept(
        {
          method: "GET",
          pathname: "/exec",
          query: { query: /live_views\(\) WHERE view_name/ },
        },
        (req) => {
          if (failMetadata) {
            req.reply({
              statusCode: 400,
              body: {
                error: "live view metadata unavailable",
                position: 0,
                query: String(req.query.query ?? ""),
              },
            })
          } else {
            req.continue()
          }
        },
      )

      cy.openDetailsDrawer(TEST_LIVE_VIEW, "liveview")

      cy.getByDataHook("table-details-health-status").should(
        "have.attr",
        "data-severity",
        "critical",
      )
      cy.getByDataHook("table-details-live-view-metadata-error")
        .should("be.visible")
        .should("contain", "retry automatically")
      cy.getByDataHook("table-details-view-status").should("not.exist")

      cy.getByDataHook("table-details-tab-details").click()
      cy.getByDataHook("table-details-details-section").should("not.exist")

      cy.then(() => {
        failMetadata = false
      })
      cy.getByDataHook("table-details-tab-monitoring").click()
      cy.getByDataHook("table-details-view-status").should("contain", "Active")
      cy.getByDataHook("table-details-live-view-metadata-error").should(
        "not.exist",
      )
    })

    it("should complete metadata polling when responses exceed the poll period", () => {
      cy.intercept(
        {
          method: "GET",
          pathname: "/exec",
          query: { query: /live_views\(\) WHERE view_name/ },
        },
        (req) => {
          req.continue((res) => {
            res.setDelay(1500)
            return res
          })
        },
      )

      cy.openDetailsDrawer(TEST_LIVE_VIEW, "liveview")

      cy.getByDataHook("table-details-view-status")
        .should("be.visible")
        .should("contain", "Active")
      cy.getByDataHook("table-details-live-view-memory").should("be.visible")
    })

    it("should display unsafe LONG counters without rounding", () => {
      interceptLiveViewsQuery({
        lag_seqtxn: "9007199254740993",
        in_mem_rows: "9007199254740993",
      })

      cy.openDetailsDrawer(TEST_LIVE_VIEW, "liveview")

      cy.getByDataHook("table-details-live-view-freshness").should(
        "contain",
        "9,007,199,254,740,993 txns",
      )
      cy.getByDataHook("table-details-live-view-memory").should(
        "contain",
        "9,007,199,254,740,993",
      )
    })

    it("should show the seeding status, writer stall and dropped rows from live view metrics", () => {
      // Given
      interceptLiveViewsQuery({
        view_status: "seeding",
        writer_stall_micros: "6500000",
        below_lower_bound_count: "5",
        o3_rejected_count: "3",
      })

      // When
      cy.openDetailsDrawer(TEST_LIVE_VIEW, "liveview")

      // Then: the server holds last_processed_seqtxn equal to
      // seed_target_seqtxn for the whole seed, so there is no progress to show
      cy.getByDataHook("table-details-view-status").should("contain", "Seeding")
      cy.getByDataHook("table-details-live-view-freshness")
        .should("contain", "Writer Stall")
        .should("contain", "6.5 s")
      cy.getByDataHook("table-details-live-view-memory")
        .should("contain", "Dropped Below Start From")
        .should("contain", "5 in-order · 3 out-of-order")
    })

    it("should show Never and Unknown for lag values the server does not know yet", () => {
      // Given: lag_micros is NULL until the first flush and lag_seqtxn is
      // NULL while the base table token is unresolved
      interceptLiveViewsQuery({
        lag_micros: null,
        lag_seqtxn: null,
      })

      // When
      cy.openDetailsDrawer(TEST_LIVE_VIEW, "liveview")

      // Then
      cy.getByDataHook("table-details-live-view-freshness")
        .should("contain", "Unknown")
        .should("contain", "Never")
    })

    it("should show the live view definition cards in the details tab", () => {
      // Given
      cy.openDetailsDrawer(TEST_LIVE_VIEW, "liveview")

      // When
      cy.getByDataHook("table-details-tab-details").click()

      // Then
      cy.getByDataHook("table-details-ddl-section").should("be.visible")
      cy.getByDataHook("table-details-flush-every-card")
        .should("contain", "Flush Every")
        .should("contain", "1 Second")
      cy.getByDataHook("table-details-in-memory-card")
        .should("contain", "In Memory")
        .should("contain", "5 Seconds")
      cy.getByDataHook("table-details-start-from-card")
        .should("contain", "Start From")
        .should("contain", "Beginning")
      cy.getByDataHook("table-details-details-section").should(
        "contain",
        "Partitioning",
      )
      cy.getByDataHook("table-details-details-section")
        .should("not.contain", "TTL")
        .should("not.contain", "Deduplication")
        .should("not.contain", "Refresh Type")
      cy.getByDataHook("table-details-storage-policy-section").should(
        "not.exist",
      )
    })

    it("should navigate to the base table and back preserving kinds", () => {
      // Given
      cy.openDetailsDrawer(TEST_LIVE_VIEW, "liveview")
      cy.getByDataHook("table-details-tab-details").click()
      cy.getByDataHook("table-details-base-table-section").should("be.visible")

      // When
      cy.getByDataHook("table-details-base-table-link")
        .should("contain", TEST_TABLE)
        .click()

      // Then
      cy.getByDataHook("table-details-type-badge").should("contain", "Table")
      cy.getByDataHook("table-details-name").should("have.value", TEST_TABLE)

      // When
      cy.getByDataHook("sidebar-back-button").click()

      // Then
      cy.getByDataHook("table-details-type-badge").should(
        "contain",
        "Live view",
      )
      cy.getByDataHook("table-details-name").should(
        "have.value",
        TEST_LIVE_VIEW,
      )
    })

    it("should ignore an in-flight response after selecting another live view", () => {
      let delayOldTarget = false
      let oldTargetRequestStarted = false

      cy.intercept(
        {
          method: "GET",
          pathname: "/exec",
          query: { query: /live_views\(\) WHERE view_name/ },
        },
        (req) => {
          const query = String(req.query.query ?? "")
          if (
            delayOldTarget &&
            !oldTargetRequestStarted &&
            query.includes(TEST_LIVE_VIEW)
          ) {
            oldTargetRequestStarted = true
            req.continue((res) => {
              mutateLiveViewResponse(res, {
                view_status: "invalid",
                invalidation_reason: "belongs to old target",
                in_mem_rows: "111",
              })
              res.setDelay(1800)
              return res
            })
          } else if (query.includes(TEST_LIVE_VIEW_2)) {
            req.continue((res) => {
              mutateLiveViewResponse(res, {
                view_status: "seeding",
                in_mem_rows: "222",
              })
              return res
            })
          } else {
            req.continue()
          }
        },
      )

      cy.openDetailsDrawer(TEST_LIVE_VIEW, "liveview")
      cy.getByDataHook("table-details-view-status").should("contain", "Active")

      cy.then(() => {
        delayOldTarget = true
      })
      cy.wrap(null).should(() => {
        expect(oldTargetRequestStarted).to.equal(true)
      })

      cy.getByDataHook("table-details-name").click()
      cy.getByDataHook("table-details-name").clear().type(TEST_LIVE_VIEW_2)
      cy.getByDataHook("table-details-name").type("{enter}")

      cy.getByDataHook("table-details-name").should(
        "have.value",
        TEST_LIVE_VIEW_2,
      )
      cy.getByDataHook("table-details-view-status").should("contain", "Seeding")
      cy.getByDataHook("table-details-live-view-memory").should(
        "contain",
        "222",
      )

      // The drawer aborts the in-flight stale request on target switch, so
      // its delayed response may never arrive and cannot be cy.wait-ed on.
      // Wait out the delay window instead: by now the stale response has
      // either landed and been ignored, or its request died with the abort.
      cy.wait(2000)
      cy.getByDataHook("table-details-name").should(
        "have.value",
        TEST_LIVE_VIEW_2,
      )
      cy.getByDataHook("table-details-view-status").should("contain", "Seeding")
      cy.getByDataHook("table-details-live-view-memory")
        .should("contain", "222")
        .should("not.contain", "111")
    })

    it("should not close a newly opened sidebar for a stale empty response", () => {
      let injectEmpty = false
      let emptyRequestStarted = false

      cy.intercept(
        {
          method: "GET",
          pathname: "/exec",
          query: { query: /live_views\(\) WHERE view_name/ },
        },
        (req) => {
          if (injectEmpty && !emptyRequestStarted) {
            emptyRequestStarted = true
            req.continue((res) => {
              res.body.dataset = []
              res.body.count = 0
              res.setDelay(1800)
              return res
            })
          } else {
            req.continue()
          }
        },
      )

      cy.openDetailsDrawer(TEST_LIVE_VIEW, "liveview")
      cy.getByDataHook("table-details-view-status").should("contain", "Active")

      cy.then(() => {
        injectEmpty = true
      })
      cy.wrap(null).should(() => {
        expect(emptyRequestStarted).to.equal(true)
      })

      cy.getByDataHook("news-panel-button")
        .click()
        .should("have.attr", "data-selected", "true")

      // Same abort caveat as above: wait out the delay window, then assert
      // the stale empty response did not close the newly opened sidebar.
      cy.wait(2000)
      cy.getByDataHook("news-panel-button").should(
        "have.attr",
        "data-selected",
        "true",
      )
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropLiveViewIfExists(TEST_LIVE_VIEW_2)
      cy.dropLiveViewIfExists(TEST_LIVE_VIEW)
      cy.dropTableIfExists(TEST_TABLE)
    })
  })

  describe("live view invalid state (R5)", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.createLiveView(TEST_LIVE_VIEW)
      cy.refreshSchema()
      cy.getByDataHook("schema-folder-title")
        .contains("Live views")
        .should("exist")
    })

    it("should show critical health status and permanence guidance for an invalid live view", () => {
      // Given
      interceptLiveViewsQuery({
        view_status: "invalid",
        invalidation_reason: "rename column operation [column=price]",
      })
      cy.expandLiveViews()
      cy.getByDataHook("schema-liveview-title").should(
        "contain",
        TEST_LIVE_VIEW,
      )

      // When
      cy.openDetailsDrawer(TEST_LIVE_VIEW, "liveview")

      // Then
      cy.getByDataHook("table-details-health-status")
        .should("be.visible")
        .should("have.attr", "data-severity", "critical")
      cy.getByDataHook("table-details-error-banner")
        .should("be.visible")
        .should("contain", "Live view is invalid")
        .should("contain", "Invalidation is permanent")
      cy.getByDataHook("table-details-view-status").should("contain", "Invalid")
      cy.getByDataHook("table-details-resume-wal-button").should("not.exist")
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropLiveViewIfExists(TEST_LIVE_VIEW)
      cy.dropTableIfExists(TEST_TABLE)
    })
  })

  describe("live view load-failure states (R6/R7)", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.createLiveView(TEST_LIVE_VIEW)
      cy.refreshSchema()
      cy.getByDataHook("schema-folder-title")
        .contains("Live views")
        .should("exist")
    })

    it("should show critical health status and hide metric sections for an unreadable live view", () => {
      // Given: load-failure stubs report NULL for every diagnostic column
      interceptLiveViewsQuery({
        view_status: "state_unreadable",
        base_table_name: null,
        view_sql: null,
        flush_every_interval_unit: null,
        in_memory_interval_unit: null,
        lag_seqtxn: null,
        lag_micros: null,
        in_mem_rows: null,
        in_mem_bytes: null,
      })
      cy.expandLiveViews()
      cy.getByDataHook("schema-liveview-title").should(
        "contain",
        TEST_LIVE_VIEW,
      )

      // When
      cy.openDetailsDrawer(TEST_LIVE_VIEW, "liveview")

      // Then
      cy.getByDataHook("table-details-health-status")
        .should("be.visible")
        .should("have.attr", "data-severity", "critical")
      cy.getByDataHook("table-details-error-banner")
        .should("be.visible")
        .should("contain", "Live view state files are unreadable")
        .should("contain", "drop and recreate the view")
      cy.getByDataHook("table-details-view-status").should(
        "contain",
        "State unreadable",
      )
      cy.getByDataHook("table-details-base-table-status")
        .should("contain", "Unknown")
        .and("not.contain", "Valid")
        .and("not.contain", "Suspended")
        .and("not.contain", "Dropped")
      cy.getByDataHook("table-details-live-view-freshness").should("not.exist")
      cy.getByDataHook("table-details-live-view-memory").should("not.exist")

      // When: the definition is unreadable, so the details tab has no cards
      cy.getByDataHook("table-details-tab-details").click()

      // Then
      cy.getByDataHook("table-details-details-section").should("not.exist")
    })

    it("should show the version unsupported status and hide metric sections", () => {
      // Given: load-failure stubs report NULL for every diagnostic column
      cy.loadConsoleWithAuth()
      cy.refreshSchema()
      interceptLiveViewsQuery({
        view_status: "version_unsupported",
        lag_seqtxn: null,
        lag_micros: null,
        in_mem_rows: null,
        in_mem_bytes: null,
      })
      cy.expandLiveViews()
      cy.getByDataHook("schema-liveview-title").should(
        "contain",
        TEST_LIVE_VIEW,
      )

      // When
      cy.openDetailsDrawer(TEST_LIVE_VIEW, "liveview")

      // Then
      cy.getByDataHook("table-details-health-status")
        .should("be.visible")
        .should("have.attr", "data-severity", "critical")
      cy.getByDataHook("table-details-view-status").should(
        "contain",
        "Version unsupported",
      )
      cy.getByDataHook("table-details-live-view-freshness").should("not.exist")
      cy.getByDataHook("table-details-live-view-memory").should("not.exist")
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropLiveViewIfExists(TEST_LIVE_VIEW)
      cy.dropTableIfExists(TEST_TABLE)
    })
  })

  describe("live view dropped while the drawer is open", () => {
    // beforeEach so a retry starts from a re-created live view: the test
    // drops it mid-flow, and a before() would poison the second attempt.
    beforeEach(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.createLiveView(TEST_LIVE_VIEW)
      cy.refreshSchema()
      cy.getByDataHook("schema-folder-title")
        .contains("Live views")
        .should("exist")
    })

    it("should show the empty state after the live view is dropped", () => {
      // Given
      cy.expandLiveViews()
      cy.openDetailsDrawer(TEST_LIVE_VIEW, "liveview")

      // When
      cy.dropLiveViewIfExists(TEST_LIVE_VIEW)

      // Then: the drawer clears its target; the table selector stays
      // rendered and empties so the user can pick another table.
      cy.getByDataHook("table-details-name").should("have.value", "")
      cy.getByDataHook("table-details-toggle-button").should(
        "have.attr",
        "data-selected",
        "true",
      )
      cy.getByDataHook("table-details-empty-state").should("be.visible")

      // When the drawer is closed and reopened
      cy.getByDataHook("table-details-toggle-button").click()
      cy.getByDataHook("table-details-toggle-button").should(
        "have.attr",
        "data-selected",
        "false",
      )
      cy.getByDataHook("table-details-toggle-button").click()

      // Then
      cy.getByDataHook("table-details-toggle-button").should(
        "have.attr",
        "data-selected",
        "true",
      )
      cy.getByDataHook("table-details-empty-state").should("be.visible")
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropLiveViewIfExists(TEST_LIVE_VIEW)
      cy.dropTableIfExists(TEST_TABLE)
    })
  })

  describe("view specific", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.createView(TEST_VIEW)
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth()
      cy.refreshSchema()
      cy.collapseTables()
      cy.collapseMatViews()
      cy.expandViews()
    })

    it("should open view details from schema, show View badge, no tabs, only DDL and columns sections with columns expanded", () => {
      cy.openDetailsDrawer(TEST_VIEW, "view")

      cy.getByDataHook("table-details-type-badge").should("contain", "View")

      cy.getByDataHook("table-details-tab-monitoring").should("not.exist")
      cy.getByDataHook("table-details-tab-details").should("not.exist")

      cy.getByDataHook("table-details-ddl-section").should("be.visible")

      cy.getByDataHook("table-details-columns-content").should("be.visible")

      cy.getByDataHook("table-details-details-section").should("not.exist")

      cy.getByDataHook("table-details-health-status")
        .should("be.visible")
        .should("have.attr", "data-severity", "healthy")
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropViewIfExists(TEST_VIEW)
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("view invalid state (R4)", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.createView(TEST_VIEW)
    })

    it("should show error banner when view becomes invalid after base table is dropped", () => {
      cy.loadConsoleWithAuth()
      cy.refreshSchema()
      cy.collapseTables()
      cy.collapseMatViews()
      cy.expandViews()
      cy.openDetailsDrawer(TEST_VIEW, "view")

      // Verify healthy state first
      cy.getByDataHook("table-details-health-status")
        .should("be.visible")
        .should("have.attr", "data-severity", "healthy")
      cy.getByDataHook("table-details-error-banner").should("not.exist")
      cy.getByDataHook("table-details-columns-content").should("be.visible")

      // Drop base table to invalidate the view
      cy.execQuery(`DROP TABLE ${TEST_TABLE};`)

      // Wait for polling to pick up the invalidation
      cy.get('[data-hook="table-details-error-banner"]', {
        timeout: 5000,
      }).should("be.visible")
      cy.getByDataHook("table-details-error-title").should(
        "contain",
        "View is invalid",
      )
      cy.getByDataHook("table-details-health-status").should(
        "have.attr",
        "data-severity",
        "critical",
      )
      cy.getByDataHook("table-details-error-docs-link").should("be.visible")
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropViewIfExists(TEST_VIEW)
      cy.dropTableIfExists(TEST_TABLE)
    })
  })

  describe("AI interactions disabled", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.refreshSchema()
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth()
      cy.expandTables()
    })

    it("should disable AI interactions when AI is disabled", () => {
      interceptTablesQuery({ table_suspended: true, table_write_amp_p50: 10 })
      cy.openDetailsDrawer(TEST_TABLE)

      cy.getByDataHook("table-details-error-ask-ai").should("be.disabled")
      cy.hoverForTooltip(() => cy.getByDataHook("table-details-error-ask-ai"))
      cy.wait(200)
      cy.getByDataHook("tooltip").should(
        "contain",
        "AI Assistant is not configured",
      )
      cy.getByDataHook("table-details-tab-monitoring").realHover()
      cy.wait(200)

      cy.getByDataHook("table-details-warning-ask-ai").should("be.disabled")
      cy.hoverForTooltip(() => cy.getByDataHook("table-details-warning-ask-ai"))
      cy.wait(200)
      cy.getByDataHook("tooltip").should(
        "contain",
        "AI Assistant is not configured",
      )

      cy.getByDataHook("table-details-tab-details").realHover()
      cy.getByDataHook("tooltip").should("not.exist")
      cy.getByDataHook("table-details-tab-details").click()
      cy.getByDataHook("table-details-explain-ai").should("be.disabled")
      cy.hoverForTooltip(() => cy.getByDataHook("table-details-explain-ai"))
      cy.wait(200)
      cy.getByDataHook("tooltip").should(
        "contain",
        "AI Assistant is not configured",
      )
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("AI interactions disabled - schema access not granted", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.refreshSchema()
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings(false))
      cy.expandTables()
    })

    it("should disable AI interactions when schema access is not granted", () => {
      interceptTablesQuery({ table_suspended: true, table_write_amp_p50: 10 })
      cy.openDetailsDrawer(TEST_TABLE)

      cy.getByDataHook("table-details-error-ask-ai").should("be.disabled")
      cy.hoverForTooltip(() => cy.getByDataHook("table-details-error-ask-ai"))
      cy.wait(200)
      cy.getByDataHook("tooltip").should(
        "contain",
        "Schema access is not granted to this model",
      )
      cy.getByDataHook("table-details-tab-monitoring").realHover()
      cy.wait(200)

      cy.getByDataHook("table-details-warning-ask-ai").should("be.disabled")
      cy.hoverForTooltip(() => cy.getByDataHook("table-details-warning-ask-ai"))
      cy.wait(200)
      cy.getByDataHook("tooltip").should(
        "contain",
        "Schema access is not granted to this model",
      )

      cy.getByDataHook("table-details-tab-details").realHover()
      cy.getByDataHook("tooltip").should("not.exist")
      cy.getByDataHook("table-details-tab-details").click()
      cy.getByDataHook("table-details-explain-ai").should("be.disabled")
      cy.getByDataHook("table-details-copy-ddl").should("be.visible").click()
      cy.hoverForTooltip(() => cy.getByDataHook("table-details-explain-ai"))
      cy.wait(200)
      cy.getByDataHook("tooltip").should(
        "contain",
        "Schema access is not granted to this model",
      )
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("AI interactions", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.refreshSchema()
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
      cy.expandTables()
    })

    it("should trigger AI chat when clicking Ask AI on error banner", () => {
      const aiResponse = "Here is how to resolve your WAL suspension issue..."
      interceptTablesQuery({ table_suspended: true })
      interceptAIRequest(aiResponse)

      cy.openDetailsDrawer(TEST_TABLE)

      cy.getByDataHook("table-details-error-ask-ai").click()
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.waitForAIResponse("@openaiRequest")

      cy.getByDataHook("chat-message-user")
        .should("be.visible")
        .should("contain", "WAL suspended")
      cy.getByDataHook("chat-message-assistant")
        .should("be.visible")
        .should("contain", aiResponse)
      cy.getByDataHook("sidebar-back-button").should("be.visible")
      cy.getByDataHook("sidebar-back-button").click()
      cy.getByDataHook("table-details-name")
        .should("be.visible")
        .should("have.value", TEST_TABLE)
    })

    it("should show Explain with AI button in DDL section", () => {
      interceptAIRequest("This is an explanation of the table schema...")
      cy.openDetailsDrawer(TEST_TABLE)
      cy.getByDataHook("table-details-tab-details").click()

      cy.getByDataHook("table-details-explain-ai").should("be.visible")
      cy.getByDataHook("table-details-explain-ai").click()
      cy.getByDataHook("ai-chat-window").should("be.visible")

      cy.waitForAIResponse("@openaiRequest")

      cy.getByDataHook("chat-message-assistant")
        .should("be.visible")
        .should("contain", "This is an explanation of the table schema...")
      cy.getByDataHook("sidebar-back-button").should("be.visible")
      cy.getByDataHook("sidebar-back-button").click()
      cy.getByDataHook("table-details-name")
        .should("be.visible")
        .should("have.value", TEST_TABLE)
    })

    it("should trigger AI chat when clicking Ask AI on performance alert", () => {
      const aiResponse =
        "Small transactions can be batched for better performance..."
      interceptTablesQuery({ wal_tx_size_p90: 50 })
      interceptAIRequest(aiResponse)

      cy.openDetailsDrawer(TEST_TABLE)

      cy.getByDataHook("table-details-warning-ask-ai").first().click()
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.waitForAIResponse("@openaiRequest")

      cy.getByDataHook("chat-message-user")
        .should("be.visible")
        .should("contain", "Small transactions")
      cy.getByDataHook("chat-message-assistant")
        .should("be.visible")
        .should("contain", aiResponse)
      cy.getByDataHook("sidebar-back-button").should("be.visible")
      cy.getByDataHook("sidebar-back-button").click()
      cy.getByDataHook("table-details-name")
        .should("be.visible")
        .should("have.value", TEST_TABLE)
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("sidebar navigation history", () => {
    const TEST_TABLE_2 = "test_trades"

    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.createTable(TEST_TABLE_2)
      cy.refreshSchema()
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
      cy.expandTables()
    })

    it("fresh page: toggle button visible, click shows promo and table selector, search and select table via keyboard", () => {
      cy.getByDataHook("table-details-toggle-button").should("be.visible")

      cy.getByDataHook("table-details-toggle-button").click()
      cy.getByDataHook("table-details-drawer").should("be.visible")
      cy.getByDataHook("table-details-empty-state").should("be.visible")

      cy.getByDataHook("table-details-name").should("be.focused")
      cy.getByDataHook("table-selector-dropdown").should("be.visible")
      cy.getByDataHook("table-selector-item").should(
        "have.length.greaterThan",
        0,
      )

      cy.getByDataHook("table-details-name").clear().type(TEST_TABLE)
      cy.getByDataHook("table-selector-item").should(
        "have.length.greaterThan",
        0,
      )

      cy.getByDataHook("table-details-name").type("{enter}")

      cy.getByDataHook("table-details-empty-state").should("not.exist")
      cy.getByDataHook("table-details-name").should("have.value", TEST_TABLE)
      cy.getByDataHook("table-details-tab-monitoring").should("be.visible")
    })

    it("switch table via title selector: open details from schema, then switch to another table using the title input", () => {
      cy.openDetailsDrawer(TEST_TABLE)
      cy.getByDataHook("table-details-name").should("have.value", TEST_TABLE)
      cy.getByDataHook("table-details-tab-monitoring").should("be.visible")

      cy.getByDataHook("table-details-name").click()
      cy.getByDataHook("table-selector-dropdown").should("be.visible")

      cy.getByDataHook("table-details-name").clear().type(TEST_TABLE_2)
      cy.getByDataHook("table-selector-item").should(
        "have.length.greaterThan",
        0,
      )

      cy.getByDataHook("table-details-name").type("{enter}")

      cy.getByDataHook("table-details-name").should("have.value", TEST_TABLE_2)
      cy.getByDataHook("table-details-tab-monitoring").should("be.visible")
    })

    it("cross-panel navigation: navigate between table details, AI chat, and news using back/forward buttons", () => {
      // When
      cy.openDetailsDrawer(TEST_TABLE)

      // Then
      cy.getByDataHook("table-details-drawer").should("be.visible")
      cy.getByDataHook("table-details-name").should("have.value", TEST_TABLE)
      cy.getByDataHook("sidebar-back-button").should("not.exist")

      // When
      cy.getByDataHook("ai-chat-button").click()

      // Then
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("sidebar-back-button")
        .should("be.visible")
        .should("not.be.disabled")
      cy.getByDataHook("sidebar-forward-button")
        .should("be.visible")
        .should("be.disabled")

      // When
      cy.getByDataHook("news-panel-button").click()

      // Then
      cy.get('[data-state="open"]').should("exist")
      cy.getByDataHook("sidebar-back-button").should("not.be.disabled")

      // When
      cy.getByDataHook("sidebar-back-button").click()

      // Then
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("sidebar-back-button").should("not.be.disabled")
      cy.getByDataHook("sidebar-forward-button").should("not.be.disabled")

      // When
      cy.getByDataHook("sidebar-back-button").click()

      // Then
      cy.getByDataHook("table-details-drawer").should("be.visible")
      cy.getByDataHook("table-details-name").should("have.value", TEST_TABLE)
      cy.getByDataHook("sidebar-back-button").should("be.disabled")
      cy.getByDataHook("sidebar-forward-button").should("not.be.disabled")

      // When
      cy.getByDataHook("sidebar-forward-button").click()

      // Then
      cy.getByDataHook("ai-chat-window").should("be.visible")

      // When
      cy.getByDataHook("sidebar-forward-button").click()

      // Then
      cy.get('[data-state="open"]').should("exist")
      cy.getByDataHook("sidebar-forward-button").should("be.disabled")
    })

    it("history truncation: navigating to new panel truncates forward history (browser behavior)", () => {
      // When
      cy.openDetailsDrawer(TEST_TABLE)
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("news-panel-button").click()

      // Then
      cy.get('[data-state="open"]').should("exist")

      // When
      cy.getByDataHook("sidebar-back-button").click()
      cy.getByDataHook("sidebar-back-button").click()

      // Then
      cy.getByDataHook("table-details-drawer").should("be.visible")
      cy.getByDataHook("sidebar-forward-button").should("not.be.disabled")

      // When
      cy.getByDataHook("ai-chat-button").click()

      // Then
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("sidebar-forward-button").should("be.disabled")
      cy.getByDataHook("sidebar-back-button").should("not.be.disabled")

      // When
      cy.getByDataHook("sidebar-back-button").click()

      // Then
      cy.getByDataHook("table-details-drawer").should("be.visible")
    })

    it("close preserves history: closing sidebar does not affect history stack", () => {
      // When
      cy.openDetailsDrawer(TEST_TABLE)
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("sidebar-back-button").click()

      // Then
      cy.getByDataHook("table-details-drawer").should("be.visible")
      cy.getByDataHook("sidebar-forward-button").should("not.be.disabled")

      // When
      cy.getByDataHook("sidebar-close-button").click()

      // Then
      cy.getByDataHook("table-details-drawer").should("not.exist")

      // When
      cy.getByDataHook("table-details-toggle-button").click()

      // Then
      cy.getByDataHook("table-details-drawer").should("be.visible")
      cy.getByDataHook("table-details-name").should("have.value", TEST_TABLE)
      cy.getByDataHook("sidebar-forward-button").should("not.be.disabled")

      // When
      cy.getByDataHook("sidebar-forward-button").click()

      // Then
      cy.getByDataHook("ai-chat-window").should("be.visible")
    })

    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable(TEST_TABLE)
      cy.dropTable(TEST_TABLE_2)
    })
  })

  describe("table with STORAGE POLICY", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable(TEST_TABLE)
      cy.refreshSchema()
    })

    beforeEach(() => {
      cy.intercept(
        {
          method: "GET",
          pathname: "/exec",
          query: { query: /SHOW\s+CREATE/i },
        },
        (req) => {
          req.continue((res) => {
            const row = res.body?.dataset?.[0]
            if (row && typeof row[0] === "string") {
              row[0] = row[0].replace(
                /(\bPARTITION\s+BY\s+\w+)/i,
                "$1 STORAGE POLICY(TO PARQUET 3 DAYS, TO REMOTE 10 DAYS, DROP LOCAL 1 YEARS)",
              )
            }
          })
        },
      ).as("showCreate")

      cy.loadConsoleWithAuth()
      cy.expandTables()
    })

    it("hides TTL and renders the storage policy section", () => {
      cy.openDetailsDrawer(TEST_TABLE)
      cy.getByDataHook("table-details-tab-details").click()

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
