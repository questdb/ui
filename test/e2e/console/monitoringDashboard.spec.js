/// <reference types="cypress" />

// Opens the generated monitoring dashboards and runs every statement against
// the real QuestDB, including the history panels. The console builds those only when
// telemetry is enabled, so the spec reports it as enabled. WAL telemetry is
// recorded regardless of that setting; materialized view telemetry is not, so
// without it those statements must fail only for its missing table.

const TABLE = "btc_trades"
const MATVIEW = "btc_trades_mv"
const MATVIEW_TELEMETRY = "sys.telemetry_mat_view"

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

const exec = (sql) =>
  cy.request({
    method: "GET",
    url: `${Cypress.config("baseUrl")}/exec`,
    qs: { query: sql, limit: "0,5" },
    headers: { Authorization: `Basic ${btoa("admin:quest")}` },
    failOnStatusCode: false,
  })

describe("monitoring dashboards on a real server", () => {
  let matViewTelemetry = false

  before(() => {
    cy.createTable(TABLE)
    cy.execAdminQuery(
      `INSERT INTO ${TABLE} VALUES ('BTC-USD', 'buy', 100.5, 0.25, now()), ('BTC-USD', 'sell', 101.0, 0.5, now())`,
    )
    cy.createMaterializedView(MATVIEW)
    exec(`SELECT 1 FROM '${MATVIEW_TELEMETRY}' LIMIT 1`).then(({ body }) => {
      matViewTelemetry = body.error === undefined
    })
  })

  after(() => {
    cy.execAdminQuery(`DROP MATERIALIZED VIEW IF EXISTS ${MATVIEW};`)
    cy.dropTableIfExists(TABLE)
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
          (buffer) => buffer.monitoring?.target.name === name,
        )
        expect(dashboard, "dashboard notebook").to.exist
        const statements = statementsOf(dashboard.notebookViewState)
        expect(
          statements.some(({ sql }) => sql.includes("sys.telemetry_wal")),
          "history panels",
        ).to.be.true

        for (const { cell, sql } of statements) {
          exec(sql).then(({ body }) => {
            if (!matViewTelemetry && sql.includes(MATVIEW_TELEMETRY)) {
              expect(body.error, cell).to.eq(
                `table does not exist [table=${MATVIEW_TELEMETRY}]`,
              )
              return
            }
            expect(body.error, `${cell}: ${body.error}`).to.be.undefined
            if (/^Live (table|view) health$/.test(cell))
              expect(body.count, `${cell} rows`).to.eq(1)
          })
        }
      })
    })
})
