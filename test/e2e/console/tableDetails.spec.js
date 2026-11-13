/// <reference types="cypress" />

const {
  PROVIDERS,
  getOpenAIConfiguredSettings,
  createFinalResponseData,
  createResponse,
  createChatTitleResponse,
  isTitleRequest,
} = require("../utils/aiAssistant")
const TEST_TABLE = "btc_trades"
const TEST_MATVIEW = "btc_trades_mv"
const TEST_MATVIEW_ON_MV = "btc_trades_mv_on_mv"
const TEST_VIEW = "btc_trades_view"
const TEST_LIVE_VIEW = "btc_trades_lv"
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

function interceptTablesQuery(modifications, targetTable = TEST_TABLE) {
  cy.intercept(
    {
      method: "GET",
      pathname: "**/exec",
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
                if (res.body.dataset[i][tableNameIndex] === targetTable) {
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

afterEach(() => {
  cy.then(() =>
    Cypress.automation("remote:debugger:protocol", {
      command: "HeapProfiler.collectGarbage",
    }),
  )
})

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

  describe("copy functionality", () => {
    before(() => {
      cy.createTable(TEST_TABLE)
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth()
      cy.expandTables()
    })

    it("inspects a healthy table, expands its columns, and copies its definition and name", () => {
      // Given
      cy.openDetailsDrawer(TEST_TABLE)

      // Then
      cy.getByDataHook("table-details-tab-monitoring").should(
        "have.attr",
        "data-active",
        "true",
      )
      cy.getByDataHook("table-details-health-status").should(
        "have.attr",
        "data-severity",
        "healthy",
      )
      cy.getByDataHook("table-details-error-banner").should("not.exist")
      cy.getByDataHook("table-details-performance-alerts").should("not.exist")
      cy.getByDataHook("table-details-row-count-value").should("have.text", "0")
      cy.getByDataHook("table-details-ingestion-content").should("be.visible")
      cy.getByDataHook("table-details-pending-rows-trend").should("be.visible")
      cy.getByDataHook("table-details-transaction-lag-trend").should(
        "be.visible",
      )
      cy.getByDataHook("table-details-wal-disabled").should("not.exist")

      // When
      cy.getByDataHook("table-details-tab-details").click()

      // Then
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
      cy.getByDataHook("table-details-columns-content").should("not.exist")

      // When
      cy.getByDataHook("table-details-columns-toggle").click()

      // Then
      cy.getByDataHook("table-details-columns-content").should("be.visible")
      cy.getByDataHook("table-details-column-row").should("have.length", 5)
      const columns = [
        ["symbol", "SYMBOL"],
        ["side", "SYMBOL"],
        ["price", "DOUBLE"],
        ["amount", "DOUBLE"],
        ["timestamp", "TIMESTAMP"],
      ]
      columns.forEach(([name, type], index) => {
        cy.getByDataHook("table-details-column-row")
          .eq(index)
          .should("contain", name)
          .and("contain", type)
      })

      // When
      cy.getByDataHook("table-details-columns-toggle").click()

      // Then
      cy.getByDataHook("table-details-columns-content").should("not.exist")
      cy.getByDataHook("table-details-copy-ddl").should("be.visible")
      if (Cypress.isBrowser("electron")) {
        observeClipboardWrites()
        cy.getByDataHook("table-details-copy-ddl").click()
        readCopiedText().should((ddl) => {
          expect(ddl).to.contain(`CREATE TABLE '${TEST_TABLE}'`)
          columns.forEach(([name, type]) => {
            expect(ddl).to.match(new RegExp(`\\b${name}\\s+${type}\\b`, "i"))
          })
        })
        cy.getByDataHook("table-details-copy-name").click()
        readCopiedText(2).should("equal", TEST_TABLE)
      }
    })

    after(() => {
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("materialized view specific", () => {
    before(() => {
      cy.createTable(TEST_TABLE)
      cy.createMaterializedView(TEST_MATVIEW)
      cy.createMaterializedView(TEST_MATVIEW_ON_MV)
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth()
      cy.refreshSchema()
      cy.expandMatViews()
    })

    it("follows nested materialized views to their base table and returns through history", () => {
      // Given
      cy.openDetailsDrawer(TEST_MATVIEW_ON_MV, "matview")
      cy.getByDataHook("table-details-type-badge").should(
        "contain",
        "Materialized view",
      )
      cy.getByDataHook("table-details-view-status").should("be.visible")
      cy.getByDataHook("table-details-base-table-status").should("be.visible")

      // When
      cy.getByDataHook("table-details-tab-details").click()
      cy.getByDataHook("table-details-ddl-section").should(
        "contain",
        "CREATE MATERIALIZED VIEW",
      )
      cy.getByDataHook("table-details-base-table-section").should("be.visible")
      cy.getByDataHook("table-details-base-table-link")
        .should("contain", TEST_MATVIEW)
        .click()

      // Then
      cy.getByDataHook("table-details-name").should("have.value", TEST_MATVIEW)
      cy.getByDataHook("table-details-type-badge").should(
        "contain",
        "Materialized view",
      )

      // When
      cy.getByDataHook("table-details-tab-details").click()
      cy.getByDataHook("table-details-ddl-section").should(
        "contain",
        "CREATE MATERIALIZED VIEW",
      )
      cy.getByDataHook("sidebar-back-button").should("not.be.disabled")
      cy.getByDataHook("table-details-base-table-link")
        .should("contain", TEST_TABLE)
        .click()

      // Then
      cy.getByDataHook("table-details-name").should("have.value", TEST_TABLE)
      cy.getByDataHook("table-details-type-badge").should("contain", "Table")
      cy.getByDataHook("table-details-tab-details").click()
      cy.getByDataHook("table-details-ddl-section").should(
        "contain",
        "CREATE TABLE",
      )

      // When
      cy.getByDataHook("sidebar-back-button").click()

      // Then
      cy.getByDataHook("table-details-name").should("have.value", TEST_MATVIEW)
      cy.getByDataHook("table-details-type-badge").should(
        "contain",
        "Materialized view",
      )

      // When
      cy.getByDataHook("sidebar-back-button").click()

      // Then
      cy.getByDataHook("table-details-name").should(
        "have.value",
        TEST_MATVIEW_ON_MV,
      )
      cy.getByDataHook("table-details-type-badge").should(
        "contain",
        "Materialized view",
      )
      cy.getByDataHook("sidebar-back-button").should("be.disabled")
    })

    after(() => {
      cy.dropMaterializedView(TEST_MATVIEW_ON_MV)
      cy.dropMaterializedView(TEST_MATVIEW)
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("live view specific", () => {
    before(() => {
      cy.createTable(TEST_TABLE)
      cy.createLiveView(TEST_LIVE_VIEW)
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth()
      cy.refreshSchema()
      cy.collapseTables()
      cy.expandLiveViews()
    })

    it("inspects live-view metrics and definition, then visits its base table and returns", () => {
      // Given
      cy.openDetailsDrawer(TEST_LIVE_VIEW, "liveview")
      cy.getByDataHook("table-details-type-badge").should(
        "contain",
        "Live view",
      )
      cy.getByDataHook("table-details-view-status").should("contain", "Active")
      cy.getByDataHook("table-details-base-table-status").should("be.visible")
      cy.getByDataHook("table-details-live-view-freshness")
        .should("be.visible")
        .and("contain", "Unflushed Transactions")
        .and("contain", "Since Last Flush")
      cy.getByDataHook("table-details-live-view-freshness-grid").then(
        ($grid) => {
          const style = getComputedStyle($grid[0])
          expect(style.gridTemplateColumns.split(" ")).to.have.length(2)
          expect(getComputedStyle($grid[0].children[0]).gridColumn).to.equal(
            "1 / -1",
          )
        },
      )
      cy.getByDataHook("table-details-live-view-freshness").should(
        "contain",
        "Writer Stall",
      )
      cy.getByDataHook("table-details-live-view-memory").should(
        "not.contain",
        "Dropped Below Start From",
      )
      cy.getByDataHook("table-details-live-view-memory")
        .should("be.visible")
        .and("contain", "Rows in Memory")
        .and("contain", "Memory Footprint")
      cy.getByDataHook("table-details-tab-details").click()
      cy.getByDataHook("table-details-ddl-section").should("be.visible")
      cy.getByDataHook("table-details-flush-every-card").should(
        "contain",
        "1 Second",
      )
      cy.getByDataHook("table-details-in-memory-card").should(
        "contain",
        "5 Seconds",
      )
      cy.getByDataHook("table-details-start-from-card").should(
        "contain",
        "Beginning",
      )
      cy.getByDataHook("table-details-details-section")
        .should("contain", "Partitioning")
        .and("not.contain", "TTL")
        .and("not.contain", "Deduplication")
        .and("not.contain", "Refresh Type")
      cy.getByDataHook("table-details-storage-policy-section").should(
        "not.exist",
      )
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

    it("keeps News open when a pending table response becomes stale", () => {
      // Given
      let injectEmpty = false
      let releaseResponse
      let delayedSignal
      cy.window().then((win) => {
        const fetch = win.fetch.bind(win)
        cy.stub(win, "fetch").callsFake((input, init) => {
          const url = new URL(
            typeof input === "string" ? input : input.url,
            win.location.href,
          )
          if (
            injectEmpty &&
            !delayedSignal &&
            url.searchParams.get("query") ===
              `tables() where table_name = '${TEST_LIVE_VIEW}';`
          ) {
            delayedSignal = init.signal
          }
          return fetch(input, init)
        })
      })
      cy.intercept(
        {
          method: "GET",
          pathname: "**/exec",
          query: {
            query: new RegExp(
              `tables\\(\\) where table_name = '${TEST_LIVE_VIEW}';`,
            ),
          },
        },
        (req) => {
          if (injectEmpty && !releaseResponse) {
            req.continue(
              (res) =>
                new Promise((resolve) => {
                  releaseResponse = () => {
                    res.body.dataset = []
                    res.body.count = 0
                    resolve()
                  }
                }),
            )
          } else req.continue()
        },
      )
      cy.openDetailsDrawer(TEST_LIVE_VIEW, "liveview")
      cy.getByDataHook("table-details-view-status").should("contain", "Active")
      cy.then(() => {
        injectEmpty = true
      })
      cy.wrap(null).should(() => {
        expect(releaseResponse).to.be.a("function")
      })

      // When
      cy.getByDataHook("news-panel-button").click()

      // Then
      cy.wrap(null).should(() => {
        expect(delayedSignal.aborted).to.equal(true)
      })

      // When
      cy.then(() => {
        releaseResponse()
      })

      // Then
      cy.getByDataHook("news-panel-button").should(
        "have.attr",
        "data-selected",
        "true",
      )
      cy.contains('[role="dialog"]', "QuestDB News").should("be.visible")
      cy.getByDataHook("table-details-drawer").should("not.exist")
    })

    after(() => {
      cy.dropLiveViewIfExists(TEST_LIVE_VIEW)
      cy.dropTableIfExists(TEST_TABLE)
    })
  })

  describe("live view dropped while the drawer is open", () => {
    // beforeEach so a retry starts from a re-created live view: the test
    // drops it mid-flow, and a before() would poison the second attempt.
    beforeEach(() => {
      cy.createTable(TEST_TABLE)
      cy.createLiveView(TEST_LIVE_VIEW)
      cy.loadConsoleWithAuth()
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
      cy.dropLiveViewIfExists(TEST_LIVE_VIEW)
      cy.dropTableIfExists(TEST_TABLE)
    })
  })

  describe("view invalid state (R4)", () => {
    beforeEach(() => {
      cy.dropViewIfExists(TEST_VIEW)
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

      // Then
      cy.getByDataHook("table-details-type-badge").should("contain", "View")
      cy.getByDataHook("table-details-tab-monitoring").should("not.exist")
      cy.getByDataHook("table-details-tab-details").should("not.exist")
      cy.getByDataHook("table-details-ddl-section").should("be.visible")
      cy.getByDataHook("table-details-details-section").should("not.exist")
      cy.getByDataHook("table-details-health-status")
        .should("be.visible")
        .should("have.attr", "data-severity", "healthy")
      cy.getByDataHook("table-details-error-banner").should("not.exist")
      cy.getByDataHook("table-details-columns-content").should("be.visible")

      // When
      cy.execQuery(`DROP TABLE ${TEST_TABLE};`)

      // Then
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
      cy.dropViewIfExists(TEST_VIEW)
      cy.dropTableIfExists(TEST_TABLE)
    })
  })

  describe("AI interactions", () => {
    before(() => {
      cy.createTable(TEST_TABLE)
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
      cy.expandTables()
    })

    it("should trigger AI chat when clicking Ask AI on error banner", () => {
      const aiResponse = "Here is how to resolve your WAL suspension issue..."
      interceptTablesQuery({ table_suspended: true, table_row_count: 42 })
      cy.intercept("GET", "https://questdb.com/docs/**", {
        body: "## Detect suspended tables\nInspect WAL errors before resuming the table.",
      }).as("monitoringDocs")
      interceptAIRequest(aiResponse)

      cy.openDetailsDrawer(TEST_TABLE)

      cy.getByDataHook("table-details-error-ask-ai").click()
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.waitForAIResponse("@openaiRequest")
      cy.wait("@monitoringDocs")
      cy.get("@openaiRequest.all").should((requests) => {
        const request = requests.find(
          ({ request }) => !isTitleRequest("openai", request.body),
        )
        expect(request).to.exist
        const content = JSON.stringify(request.request.body)
        expect(content).to.contain(TEST_TABLE)
        expect(content).to.contain("WAL suspended")
        expect(content).to.contain("42")
      })

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
      cy.getByDataHook("table-details-type-badge").should("contain", "Table")
    })

    it("explains the selected table schema and returns to the same table", () => {
      let ddl
      cy.intercept(
        {
          method: "GET",
          pathname: "**/exec",
          query: { query: /SHOW CREATE TABLE/ },
        },
        (req) => {
          req.continue((res) => {
            ddl = res.body.dataset[0][0]
          })
        },
      )
      interceptAIRequest("This is an explanation of the table schema...")
      cy.openDetailsDrawer(TEST_TABLE)
      cy.getByDataHook("table-details-tab-details").click()

      cy.getByDataHook("table-details-explain-ai").should("be.visible")
      cy.getByDataHook("table-details-explain-ai").click()
      cy.getByDataHook("ai-chat-window").should("be.visible")

      cy.waitForAIResponse("@openaiRequest")
      cy.get("@openaiRequest.all").should((requests) => {
        const request = requests.find(
          ({ request }) => !isTitleRequest("openai", request.body),
        )
        expect(request).to.exist
        expect(ddl).to.be.a("string")
        const content = JSON.stringify(request.request.body)
        expect(content).to.contain(TEST_TABLE)
        expect(content).to.contain("table")
        expect(content).to.contain(JSON.stringify(ddl).slice(1, -1))
      })

      cy.getByDataHook("chat-message-assistant")
        .should("be.visible")
        .should("contain", "This is an explanation of the table schema...")
      cy.getByDataHook("sidebar-back-button").should("be.visible")
      cy.getByDataHook("sidebar-back-button").click()
      cy.getByDataHook("table-details-name")
        .should("be.visible")
        .should("have.value", TEST_TABLE)
    })

    after(() => {
      cy.dropTable(TEST_TABLE)
    })
  })

  describe("sidebar navigation history", () => {
    const TEST_TABLE_2 = "test_trades"

    before(() => {
      cy.createTable(TEST_TABLE)
      cy.createTable(TEST_TABLE_2)
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
      cy.getByDataHook("table-details-tab-details").click()
      cy.getByDataHook("table-details-ddl-section").should(
        "contain",
        `CREATE TABLE '${TEST_TABLE}'`,
      )
      cy.getByDataHook("table-details-columns-toggle").click()
      cy.getByDataHook("table-details-column-row").should("have.length", 5)
      cy.getByDataHook("table-details-column-row")
        .eq(4)
        .should("contain", "timestamp")
        .and("contain", "TIMESTAMP")
      cy.getByDataHook("table-details-columns-toggle").click()

      // When
      cy.getByDataHook("table-details-name").click()
      cy.getByDataHook("table-selector-dropdown").should("be.visible")
      cy.getByDataHook("table-details-name").clear().type(TEST_TABLE_2)
      cy.getByDataHook("table-selector-item").should(
        "have.length.greaterThan",
        0,
      )
      cy.getByDataHook("table-details-name").type("{enter}")

      // Then
      cy.getByDataHook("table-details-name").should("have.value", TEST_TABLE_2)
      cy.getByDataHook("table-details-tab-monitoring").should("be.visible")
      cy.getByDataHook("table-details-tab-details").click()
      cy.getByDataHook("table-details-ddl-section").should(
        "contain",
        `CREATE TABLE '${TEST_TABLE_2}'`,
      )
      cy.getByDataHook("table-details-columns-toggle").click()
      cy.getByDataHook("table-details-column-row").should("have.length", 3)
      cy.getByDataHook("table-details-column-row")
        .eq(2)
        .should("contain", "ts")
        .and("contain", "TIMESTAMP")
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
      cy.contains('[role="dialog"]', "QuestDB News").should("be.visible")
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
      cy.getByDataHook("sidebar-close-button").click()

      // Then
      cy.getByDataHook("table-details-drawer").should("not.exist")

      // When
      cy.getByDataHook("table-details-toggle-button").click()

      // Then
      cy.getByDataHook("table-details-name").should("have.value", TEST_TABLE)
      cy.getByDataHook("sidebar-forward-button").should("not.be.disabled")

      // When
      cy.getByDataHook("sidebar-forward-button").click()

      // Then
      cy.getByDataHook("ai-chat-window").should("be.visible")

      // When
      cy.getByDataHook("sidebar-forward-button").click()

      // Then
      cy.contains('[role="dialog"]', "QuestDB News").should("be.visible")
      cy.getByDataHook("sidebar-forward-button").should("be.disabled")
    })

    after(() => {
      cy.dropTable(TEST_TABLE)
      cy.dropTable(TEST_TABLE_2)
    })
  })
})
