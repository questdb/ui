/// <reference types="cypress" />

// Opens the generated monitoring dashboards and runs every statement against
// the real QuestDB, including the history panels. The console builds those only when
// telemetry is enabled, so the spec reports it as enabled. WAL telemetry is
// recorded regardless of that setting; materialized view telemetry is not.
// Without it (CI runs with telemetry disabled) the spec creates a table with
// the server's materialized view telemetry schema under the same name, so the
// server still compiles those statements; with it, the spec checks that the
// real table still has that schema.

const TABLE = "btc_trades"
const MATVIEW = "btc_trades_mv"
const MATVIEW_TELEMETRY = "sys.telemetry_mat_view"
const MATVIEW_TELEMETRY_COLUMNS = [
  ["created", "TIMESTAMP"],
  ["event", "SHORT"],
  ["view_table_id", "INT"],
  ["base_table_txn", "LONG"],
  ["invalidation_reason", "VARCHAR"],
  ["latency", "FLOAT"],
]

const readBuffers = () =>
  cy.window().then(
    (win) =>
      new Cypress.Promise((resolve, reject) => {
        const open = win.indexedDB.open("web-console")
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const req = db
            .transaction("buffers", "readonly")
            .objectStore("buffers")
            .getAll()
          req.onerror = () => {
            db.close()
            reject(req.error)
          }
          req.onsuccess = () => {
            db.close()
            resolve(req.result)
          }
        }
      }),
  )

// The SQL a notebook sends for a cell: its variables as a DECLARE prefix, one
// request per statement.
const statementsOf = (view) => {
  const variables = view.settings?.variables ?? []
  const declare = variables.length
    ? `DECLARE\n${variables.map((v) => `  @${v.name} := ${v.value}`).join(",\n")}\n`
    : ""
  return view.cells
    .filter((cell) => cell.type !== "markdown")
    .flatMap((cell) =>
      cell.value
        .split(/;\s*\n/)
        .map((sql) => ({ cell: cell.name, sql: declare + sql.trim() })),
    )
}

const exec = (sql, limit = "0,5") =>
  cy.request({
    method: "GET",
    url: `${Cypress.config("baseUrl")}/exec`,
    qs: { query: sql, limit },
    headers: { Authorization: `Basic ${btoa("admin:quest")}` },
    failOnStatusCode: false,
  })

describe("monitoring dashboards on a real server", () => {
  let standInTelemetry = false

  before(() => {
    cy.createTable(TABLE)
    cy.execAdminQuery(
      `INSERT INTO ${TABLE} VALUES ('BTC-USD', 'buy', 100.5, 0.25, now()), ('BTC-USD', 'sell', 101.0, 0.5, now())`,
    )
    cy.createMaterializedView(MATVIEW)
    exec(`SELECT 1 FROM '${MATVIEW_TELEMETRY}' LIMIT 1`).then(({ body }) => {
      if (body.error === undefined) {
        exec(
          `SELECT "column", type FROM table_columns('${MATVIEW_TELEMETRY}')`,
          "0,100",
        ).then(({ body: columns }) =>
          expect(columns.dataset, `${MATVIEW_TELEMETRY} schema`).to.deep.eq(
            MATVIEW_TELEMETRY_COLUMNS,
          ),
        )
        return
      }
      standInTelemetry = true
      const columns = MATVIEW_TELEMETRY_COLUMNS.map(
        ([name, type]) => `${name} ${type}`,
      ).join(", ")
      cy.execAdminQuery(
        `CREATE TABLE '${MATVIEW_TELEMETRY}' (${columns}) TIMESTAMP(created) PARTITION BY DAY`,
      )
    })
  })

  after(() => {
    cy.execAdminQuery(`DROP MATERIALIZED VIEW IF EXISTS ${MATVIEW};`)
    cy.dropTableIfExists(TABLE)
    if (standInTelemetry)
      cy.execAdminQuery(`DROP TABLE IF EXISTS '${MATVIEW_TELEMETRY}';`)
  })

  beforeEach(() => {
    cy.intercept(
      {
        method: "GET",
        pathname: "/exec",
        query: { query: /^telemetry_config/ },
      },
      (req) =>
        req.continue((res) => {
          const enabled = res.body.columns?.findIndex(
            ({ name }) => name === "enabled",
          )
          res.body.dataset?.forEach((row) => {
            row[enabled] = true
          })
        }),
    )
    cy.loadConsoleWithAuth()
    cy.refreshSchema()
  })

  // The new tab is in the tab bar while the dashboard's first queries run.
  // Opening it then must still fill the panels.
  it("fills a panel whose first run was in flight when the tab was opened", () => {
    let delayed = false
    cy.intercept(
      { method: "GET", pathname: "/exec", query: { query: /Suspend reason/ } },
      (req) => {
        if (delayed) return
        delayed = true
        req.on("response", (res) => res.setDelay(4000))
      },
    )
    cy.expandTables()
    cy.openDetailsDrawer(TABLE, "table")
    cy.getByDataHook("table-details-monitoring-dashboard").click()
    cy.getByDataHook("table-details-monitoring-dashboard-progress").should(
      "exist",
    )
    cy.getEditorTabByTitle(`${TABLE} · monitoring`)
      .find(".chrome-tab-drag-handle")
      .click()
    cy.contains("[data-notebook-cell]", "Live table health", {
      timeout: 20000,
    }).within(() => {
      cy.getByDataHook("success-notification", { timeout: 20000 }).should(
        "be.visible",
      )
      cy.contains(TABLE).should("be.visible")
    })
  })

  for (const [name, kind] of [
    [TABLE, "table"],
    [MATVIEW, "matview"],
  ])
    it(`opens the ${kind} dashboard and runs every panel without an error`, () => {
      if (kind === "table") cy.expandTables()
      else cy.expandMatViews()
      cy.openDetailsDrawer(name, kind)
      cy.getByDataHook("table-details-monitoring-dashboard")
        .should("be.enabled")
        .click()
      cy.getEditorTabByTitle(`${name} · monitoring`).should(
        "have.attr",
        "active",
      )
      // What the user sees first: the live health panel runs and shows the row.
      cy.contains("[data-notebook-cell]", /Live (table|view) health/, {
        timeout: 20000,
      }).within(() => {
        cy.getByDataHook("success-notification", { timeout: 20000 }).should(
          "be.visible",
        )
        cy.getByDataHook("error-notification").should("not.exist")
        cy.contains(name).should("be.visible")
      })

      // Every other panel's SQL, including those not scrolled into view.

      readBuffers().then((buffers) => {
        const dashboard = buffers.find(
          (buffer) =>
            buffer.templateId?.startsWith("monitoring:") &&
            buffer.monitoring?.target.name === name,
        )
        expect(dashboard, "dashboard notebook").to.exist
        const statements = statementsOf(dashboard.notebookViewState)
        expect(
          statements.some(({ sql }) => sql.includes("sys.telemetry_wal")),
          "history panels",
        ).to.be.true

        for (const { cell, sql } of statements) {
          exec(sql).then(({ body }) => {
            expect(body.error, `${cell}: ${body.error}`).to.be.undefined
            if (/^Live (table|view) health$/.test(cell))
              expect(body.count, `${cell} rows`).to.eq(1)
          })
        }
      })
    })
})
