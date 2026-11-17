/// <reference types="cypress" />

const { seedConsoleStorage } = require("../utils/consoleStorage")

const SQL =
  "SELECT timestamp_sequence(0, 1000000) ts, x probe_one FROM long_sequence(4);"
const SQL_TWO =
  "-- a second result\nSELECT timestamp_sequence(0, 1000000) ts, x probe_two FROM long_sequence(4);"

const rows = (query, count = 4) => ({
  query,
  columns: [
    { name: "ts", type: "TIMESTAMP" },
    {
      name: query.includes("probe_two") ? "probe_two" : "probe_one",
      type: "LONG",
    },
  ],
  dataset: Array.from({ length: count }, (_, i) => [
    new Date(i * 1000).toISOString(),
    i + 1,
  ]),
  count,
  timings: { compiler: 10, authentication: 0, count: 0, execute: 20, fetch: 0 },
})

const load = (
  sql = SQL,
  notebooks = [],
  chartDelayMs = 0,
  theme = "dark",
  rowCount = 4,
) => {
  const executions = []
  cy.intercept("GET", "**/settings", {
    config: {
      "release.type": "OSS",
      "release.version": "9.3.1",
      "acl.enabled": false,
      "telemetry.enabled": false,
    },
  })
  cy.intercept("GET", "**/warnings*", [])
  cy.intercept("GET", "**/chk*", { status: "Exists" })
  cy.intercept("GET", "**/api/v1/sql/validate*", (req) => {
    const query = String(req.query.query)
    req.reply(
      /^CREATE/i.test(query.trim())
        ? { queryType: "CREATE TABLE" }
        : { query, columns: rows(query).columns, timestamp: 0 },
    )
  })
  // Every database call is stubbed, including the mixed script's write. These
  // browser tests neither require nor modify a running QuestDB instance.
  cy.intercept({ method: "GET", pathname: "/exec" }, (req) => {
    const query = String(req.query.query)
    if (
      query.includes("probe_") ||
      /^CREATE TABLE transfer_test/i.test(query)
    ) {
      executions.push(query)
      req.alias = "probeQuery"
      req.reply({
        delay: req.query.src === "vis" ? chartDelayMs : 0,
        body: /^CREATE/i.test(query) ? { ddl: "OK" } : rows(query, rowCount),
      })
    } else req.reply({ query, columns: [], dataset: [], count: 0 })
  })
  let seeded
  cy.handleStorageAndVisit("/", true, {}, (win) => {
    win.sessionStorage.clear()
    win.localStorage.setItem("appearance.themePreference", theme)
    seeded = seedConsoleStorage(win, {
      buffers: [{ label: "Analysis", value: sql }, ...notebooks],
      activeBufferId: 1,
    })
  })
  cy.then(() => seeded)
  cy.getEditor().should("be.visible")
  return executions
}

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

const run = () => {
  cy.clickRunIconInLine(1)
  cy.wait("@probeQuery")
  cy.getByDataHook("result-add-notebook").should("be.enabled")
}

const repeatQuery = () => {
  cy.getByDataHook("grid-toolbar-refresh").should("be.enabled").click()
  cy.wait("@probeQuery")
  cy.getByDataHook("result-auto-refresh-notebook").should("be.visible")
  cy.getByDataHook("result-add-notebook").should("not.exist")
}

describe("SQL work → notebook", () => {
  beforeEach(() => cy.viewport(1280, 720))

  it("adds the displayed query and rows to a new notebook without re-running or touching other notebooks", () => {
    const layout = [{ i: "existing", x: 6, y: 0, w: 6, h: 8 }]
    const executions = load(SQL, [
      {
        label: "Monitoring",
        notebookViewState: {
          cells: [
            { id: "existing", position: 0, value: "select 42", topHeight: 180 },
          ],
          settings: { layoutMode: "grid", layout, autoRefreshDefault: true },
        },
      },
    ])
    run()
    cy.window().then((win) =>
      win.monaco.editor.getEditors()[0].setValue(SQL_TWO),
    )
    cy.getByDataHook("result-add-notebook").click()
    cy.getEditorTabByTitle("Analysis – notebook").should("have.attr", "active")
    cy.get("[data-notebook-cell]").should("have.length", 1)
    cy.get("[data-notebook-cell]").should("contain.text", "probe_one")
    readBuffers().then((buffers) => {
      const existing = buffers.find((b) => b.id === 2).notebookViewState
      expect(existing.cells).to.have.length(1)
      expect(existing.settings.layout[0]).to.deep.eq(layout[0])
      expect(existing.settings.autoRefreshDefault).to.eq(true)
      const created = buffers.find(
        (b) => b.id !== 2 && b.notebookViewState,
      ).notebookViewState
      expect(created.cells[0].value).to.contain("probe_one")
      expect(created.cells[0].autoRefresh).to.eq(false)
      expect(buffers.find((b) => b.id === 1).archived).not.to.eq(true)
      expect(executions).to.have.length(1)
    })
    cy.screenshot("notebook-transfer-grid")
    cy.getEditorTabByTitle("Analysis").find(".chrome-tab-drag-handle").click()
    cy.getByDataHook("result-add-notebook").should("be.visible")
    cy.window().then((win) => {
      expect(win.monaco.editor.getEditors()[0].getValue()).to.eq(SQL_TWO)
      expect(executions).to.have.length(1)
    })
  })

  it("saves the applied chart configuration and its frame without another query", () => {
    const executions = load()
    run()
    cy.getByDataHook("chart-panel-button").click()
    cy.wait("@probeQuery")
    cy.getByDataHook("chart-settings-panel")
      .find('button[aria-label^="Chart type"]')
      .click()
    cy.contains('[role="menuitemradio"]', "Bar").click()
    cy.getByDataHook("chart-settings-panel").contains("button", "Apply").click()
    cy.getByDataHook("result-add-notebook")
      .should("contain.text", "Save chart")
      .click()
    cy.getByDataHook("draw-canvas").find("canvas").should("be.visible")
    readBuffers().then((buffers) => {
      const cell = buffers.find((b) => b.notebookViewState).notebookViewState
        .cells[0]
      expect(cell.mode).to.eq("draw")
      expect(cell.chartConfig.queries[0].type).to.eq("bar")
      expect(cell.autoRefresh).to.eq(false)
      expect(executions).to.have.length(2)
    })
    cy.screenshot("notebook-transfer-chart")
    cy.getEditorTabByTitle("Analysis").find(".chrome-tab-drag-handle").click()
    cy.getByDataHook("chart-settings-panel")
      .find('button[aria-label^="Chart type"]')
      .should("contain.text", "Bar")
    cy.then(() => expect(executions).to.have.length(2))
  })

  it("re-runs the displayed query, not the editor's last executed one", () => {
    const executions = load(SQL, [
      {
        label: "Notes",
        notebookViewState: {
          cells: [{ id: "note", position: 0, value: "select 42" }],
        },
      },
    ])
    run()
    // A notebook tab unmounts the SQL editor, which forgets its last executed
    // query; the grid still shows the probe_one result on return.
    cy.getEditorTabByTitle("Notes").find(".chrome-tab-drag-handle").click()
    cy.get("[data-notebook-cell]").should("be.visible")
    cy.getEditorTabByTitle("Analysis").find(".chrome-tab-drag-handle").click()
    cy.getEditor().should("be.visible")
    cy.getByDataHook("grid-toolbar-refresh").should("be.enabled").click()
    cy.wait("@probeQuery")
    cy.then(() => {
      expect(executions).to.have.length(2)
      expect(executions[1]).to.contain("probe_one")
    })
  })

  it("monitors a repeated query in a notebook with polling off until an interval is chosen", () => {
    const executions = load()
    run()
    cy.getByDataHook("result-auto-refresh-notebook").should("not.exist")
    repeatQuery()
    cy.getByDataHook("result-auto-refresh-notebook").click()
    cy.contains('[role="menuitemradio"]', /^Off$/).should(
      "have.attr",
      "aria-checked",
      "true",
    )
    cy.then(() => expect(executions).to.have.length(2))
    cy.contains('[role="menuitemradio"]', /^1s$/).click()
    cy.wait("@probeQuery")
    // Leaving the notebook flushes its debounced settings write.
    cy.getEditorTabByTitle("Analysis").find(".chrome-tab-drag-handle").click()
    readBuffers().then((buffers) => {
      const view = buffers.find((b) => b.notebookViewState).notebookViewState
      expect(view.cells[0].autoRefresh).to.eq("1s")
      expect(view.settings?.autoRefreshDefault).to.eq(undefined)
    })
  })

  it("converts an editor script into one cell per query without executing it", () => {
    const source = `${SQL}\n${SQL_TWO}`
    const executions = load(source)
    cy.getByDataHook("new-tab-button").click()
    cy.getByDataHook("notebook-from-editor").click()
    cy.get("[data-notebook-cell]").should("have.length", 2)
    readBuffers().then((buffers) => {
      const cells = buffers.find((b) => b.notebookViewState).notebookViewState
        .cells
      expect(cells.every((c) => !c.mode && !c.result)).to.eq(true)
      expect(buffers.find((b) => b.id === 1).value).to.eq(source)
      expect(executions).to.have.length(0)
    })
  })

  it("opens a mixed script's read results side by side without replaying them", () => {
    cy.viewport(1600, 900)
    const executions = load(
      `${SQL}\n${SQL_TWO}\nCREATE TABLE transfer_test(x int);`,
      [],
      0,
      "dark",
      1,
    )
    cy.getByDataHook("button-run-query-dropdown").click()
    cy.getByDataHook("button-run-script").click()
    cy.getByDataHook("run-all-queries-confirm").click()
    cy.getByDataHook("batch-notebook-action").should(
      "contain.text",
      "Write statements aren’t included",
    )
    cy.getByDataHook("batch-open-notebook").click()
    cy.get("[data-notebook-cell]").should("have.length", 2)
    // The captured rows render without another query.
    cy.get("[data-notebook-cell]").eq(0).should("contain.text", "probe_one")
    cy.get("[data-notebook-cell]").eq(1).should("contain.text", "probe_two")
    cy.get("[data-notebook-cell]").should(($cells) => {
      const bounds = [...$cells].map((cell) => cell.getBoundingClientRect())
      expect(bounds[0].top).to.be.closeTo(bounds[1].top, 1)
      expect(bounds[1].left).to.be.greaterThan(bounds[0].right)
    })
    readBuffers().then((buffers) => {
      const cells = buffers.find((b) => b.notebookViewState).notebookViewState
        .cells
      expect(cells.every((c) => !c.value.includes("CREATE TABLE"))).to.eq(true)
      expect(executions).to.have.length(3)
    })
    cy.screenshot("notebook-transfer-comparison", { scale: true })
  })
})
