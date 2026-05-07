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
        "Materialized View",
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
        "Materialized View",
      )
      cy.getByDataHook("table-details-name").should("have.value", TEST_MATVIEW)
      cy.getByDataHook("sidebar-back-button").should("be.disabled")
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
        "Materialized View",
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
        "Materialized View",
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
      cy.getByDataHook("table-details-error-ask-ai").realHover()
      cy.wait(200)
      cy.getByDataHook("tooltip").should(
        "contain",
        "AI Assistant is not configured",
      )
      cy.getByDataHook("table-details-tab-monitoring").realHover()
      cy.wait(200)

      cy.getByDataHook("table-details-warning-ask-ai").should("be.disabled")
      cy.getByDataHook("table-details-warning-ask-ai").realHover()
      cy.wait(200)
      cy.getByDataHook("tooltip").should(
        "contain",
        "AI Assistant is not configured",
      )

      cy.getByDataHook("table-details-tab-details").click()
      cy.getByDataHook("table-details-explain-ai").should("be.disabled")
      cy.getByDataHook("table-details-explain-ai").realHover()
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
      cy.getByDataHook("table-details-error-ask-ai").realHover()
      cy.wait(200)
      cy.getByDataHook("tooltip").should(
        "contain",
        "Schema access is not granted to this model",
      )
      cy.getByDataHook("table-details-tab-monitoring").realHover()
      cy.wait(200)

      cy.getByDataHook("table-details-warning-ask-ai").should("be.disabled")
      cy.getByDataHook("table-details-warning-ask-ai").realHover()
      cy.wait(200)
      cy.getByDataHook("tooltip").should(
        "contain",
        "Schema access is not granted to this model",
      )
      cy.getByDataHook("table-details-tab-details").click()
      cy.getByDataHook("table-details-explain-ai").should("be.disabled")
      cy.getByDataHook("table-details-explain-ai").realHover()
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
})
