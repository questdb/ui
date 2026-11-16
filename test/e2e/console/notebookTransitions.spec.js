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
  it("keeps an unavailable chart action disabled and creates a new notebook in one click when ready", () => {
    load(
      SQL,
      [
        {
          label: "Saved work",
          notebookViewState: {
            cells: [{ id: "existing", position: 0, value: "select 42" }],
          },
        },
      ],
      2000,
    )
    run()
    cy.getByDataHook("chart-panel-button").click()
    cy.getByDataHook("result-add-notebook")
      .should("be.disabled")
      .trigger("keydown", { key: "Enter", force: true })
    cy.getEditorTabByTitle("Analysis – notebook").should("not.exist")
    cy.wait("@probeQuery")
    cy.getByDataHook("result-add-notebook").should("be.enabled").realHover()
    cy.getByDataHook("result-add-notebook").should(
      "have.css",
      "cursor",
      "pointer",
    )
    cy.getByDataHook("result-add-notebook").click()
    cy.getEditorTabByTitle("Analysis – notebook").should("have.attr", "active")
    cy.get('[role="menu"]').should("not.exist")
    readBuffers().then((buffers) => {
      expect(buffers.filter((b) => b.notebookViewState)).to.have.length(2)
      expect(
        buffers.find((b) => b.id === 2).notebookViewState.cells,
      ).to.have.length(1)
    })
  })

  it("shows the monitoring action only for the query that has been repeated", () => {
    load()
    run()
    cy.getByDataHook("result-auto-refresh-notebook").should("not.exist")
    repeatQuery()
    repeatQuery()
    repeatQuery()
    cy.window().then((win) =>
      win.monaco.editor.getEditors()[0].setValue(SQL_TWO),
    )
    cy.clickRunIconInLine(2)
    cy.wait("@probeQuery")
    cy.getByDataHook("result-auto-refresh-notebook").should("not.exist")
    cy.getByDataHook("result-add-notebook").should("be.visible")
  })

  for (const theme of ["dark", "light"])
    it(`uses matching grid toolbar hover feedback in ${theme} mode`, () => {
      load(SQL, [], 0, theme)
      run()
      // Native hover uses fixed coordinates; wait for the responsive label and
      // fonts to settle so the toolbar cannot move away from the pointer.
      cy.getByDataHook("result-add-notebook").should(
        "have.text",
        "Add query to notebook",
      )
      cy.document().then((doc) => doc.fonts.ready)
      let hoverBackground
      cy.window().then((win) => {
        const sample = win.document.createElement("span")
        sample.style.display = "none"
        sample.style.backgroundColor = "var(--qdb-color-interactionHover)"
        win.document.body.appendChild(sample)
        hoverBackground = win.getComputedStyle(sample).backgroundColor
        sample.remove()
      })
      for (const name of ["markdown", "freeze", "reset", "refresh"]) {
        const hook = `grid-toolbar-${name}`
        cy.getByDataHook(hook).realHover({ scrollBehavior: false })
        cy.getByDataHook(hook).should(($button) => {
          const el = $button[0],
            style = el.ownerDocument.defaultView.getComputedStyle(el)
          expect(style.cursor).to.eq("pointer")
          expect(style.backgroundColor).not.to.eq("rgba(0, 0, 0, 0)")
          expect(el.getBoundingClientRect().width).to.eq(
            el.getBoundingClientRect().height,
          )
          expect(style.backgroundColor).to.eq(hoverBackground)
        })
      }
      cy.getByDataHook("grid-toolbar-move-front").should("be.disabled")
      cy.screenshot(`notebook-toolbar-${theme}`)
    })
  it("adds the displayed query and rows even after the editor changes, without re-running", () => {
    const executions = load()
    run()
    cy.window().then((win) =>
      win.monaco.editor.getEditors()[0].setValue(SQL_TWO),
    )
    cy.getByDataHook("result-add-notebook").click()
    cy.get("[data-notebook-cell]").should("have.length", 1)
    cy.get("[data-notebook-cell]").should("contain.text", "probe_one")
    readBuffers().then((buffers) => {
      const notebook = buffers.find((b) => b.notebookViewState)
      expect(notebook.notebookViewState.cells[0].value).to.contain("probe_one")
      expect(notebook.notebookViewState.cells[0].autoRefresh).to.eq(false)
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

  it("opens results in a new notebook without changing an existing notebook", () => {
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
    cy.getByDataHook("result-add-notebook").click()
    cy.getEditorTabByTitle("Analysis – notebook").should("have.attr", "active")
    cy.get("[data-notebook-cell]").should("have.length", 1)
    cy.get('[role="menu"]').should("not.exist")
    readBuffers().then((buffers) => {
      const view = buffers.find((b) => b.id === 2).notebookViewState
      expect(view.cells).to.have.length(1)
      expect(view.settings.layout[0]).to.deep.eq(layout[0])
      expect(view.settings.autoRefreshDefault).to.eq(true)
      const created = buffers.find((b) => b.id !== 2 && b.notebookViewState)
      expect(created.notebookViewState.cells[0].value).to.contain("probe_one")
      expect(created.notebookViewState.cells[0].autoRefresh).to.eq(false)
      expect(executions).to.have.length(1)
    })
  })

  it("saves the applied chart configuration and its frame without another query", () => {
    const executions = load()
    run()
    cy.getByDataHook("chart-panel-button").click()
    cy.wait("@probeQuery")
    cy.getByDataHook("result-auto-refresh-notebook").should("not.exist")
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

  it("opens auto-refresh choices with polling off until the interval is selected", () => {
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

  it("creates separate cells from an editor while preserving comments and never executing", () => {
    const source = `\n\n${SQL}\n\n\n${SQL_TWO}\n-- trailing explanation\n\n`
    const executions = load(source)
    cy.getByDataHook("new-tab-button").click()
    cy.getByDataHook("notebook-from-editor").click()
    cy.get("[data-notebook-cell]").should("have.length", 2)
    readBuffers().then((buffers) => {
      const cells = buffers.find((b) => b.notebookViewState).notebookViewState
        .cells
      expect(cells.map((c) => c.value)).to.deep.eq([
        SQL,
        `${SQL_TWO}\n-- trailing explanation`,
      ])
      expect(cells.every((c) => !c.mode && !c.result)).to.eq(true)
      expect(executions).to.have.length(0)
    })
  })

  it("copies only the first 200 queries as unexecuted cells and leaves the editor intact", () => {
    const source = Array.from({ length: 201 }, (_, i) => `select ${i};`).join(
      "\n",
    )
    const executions = load(source)
    cy.getByDataHook("editor-tabs-menu-button").click()
    cy.getByDataHook("notebook-from-editor")
      .should("contain.text", "First 200 of 201 queries")
      .click()
    cy.get("[data-notebook-cell]").should("exist")
    readBuffers().then((buffers) => {
      const cells = buffers.find((b) => b.notebookViewState).notebookViewState
        .cells
      expect(cells).to.have.length(200)
      expect(cells[0].value.trim()).to.eq("select 0;")
      expect(cells[199].value.trim()).to.eq("select 199;")
      expect(cells.every((cell) => !cell.result)).to.eq(true)
      expect(buffers.find((b) => b.id === 1).value).to.eq(source)
      expect(executions).to.have.length(0)
    })
  })

  it("creates a new monitor notebook even with existing notebooks and leaves polling off when cancelled", () => {
    const executions = load(SQL, [
      {
        label: "Monitoring",
        notebookViewState: {
          cells: [
            { id: "existing", position: 0, value: "select 42", topHeight: 180 },
          ],
          settings: { autoRefreshDefault: true },
        },
      },
    ])
    run()
    repeatQuery()
    cy.getByDataHook("result-auto-refresh-notebook").click()
    cy.contains('[role="menuitemradio"]', /^Off$/).should(
      "have.attr",
      "aria-checked",
      "true",
    )
    cy.get("body").type("{esc}")
    cy.get('[role="menuitemradio"]').should("not.exist")
    cy.getEditorTabByTitle("Analysis – notebook").should("have.attr", "active")
    cy.get("[data-notebook-cell]").should("have.length", 1)
    readBuffers().then((buffers) => {
      const existing = buffers.find((b) => b.id === 2).notebookViewState
      expect(existing.cells).to.have.length(1)
      expect(existing.settings.autoRefreshDefault).to.eq(true)
      const view = buffers.find(
        (b) => b.id !== 2 && b.notebookViewState,
      ).notebookViewState
      expect(view.focusedCellId).to.eq(view.cells[0].id)
      expect(view.cells[0].autoRefresh).to.eq(false)
      expect(executions).to.have.length(2)
    })
  })

  it("transfers a mixed batch's read results with aligned cells and no replay", () => {
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
    cy.get("[data-notebook-cell]").should(($cells) => {
      const bounds = [...$cells].map((cell) => cell.getBoundingClientRect())
      expect(bounds[0].top).to.be.closeTo(bounds[1].top, 1)
      expect(bounds[0].bottom).to.be.closeTo(bounds[1].bottom, 1)
      expect(bounds[0].height).to.be.lessThan(320)
      const editorBottom = [...$cells].map(
        (cell) =>
          cell.querySelector(".monaco-editor").getBoundingClientRect().bottom,
      )
      expect(editorBottom[0]).to.be.closeTo(editorBottom[1], 1)
    })
    readBuffers().then((buffers) => {
      const cells = buffers.find((b) => b.notebookViewState).notebookViewState
        .cells
      expect(cells.every((c) => !c.value.includes("CREATE TABLE"))).to.eq(true)
      expect(cells.map((c) => c.bottomHeight)).to.deep.eq([154, 154])
      expect(cells.every((c) => !c.bottomResized)).to.eq(true)
      expect(executions).to.have.length(3)
    })
    cy.screenshot("notebook-transfer-comparison", { scale: true })
    cy.viewport(850, 900)
    cy.get("[data-notebook-cell]").should(($cells) => {
      const bounds = [...$cells].map((cell) => cell.getBoundingClientRect())
      expect(bounds[0].left).to.be.closeTo(bounds[1].left, 1)
      expect(bounds[1].top).to.be.greaterThan(bounds[0].bottom)
    })
    cy.viewport(1600, 900)
    cy.get("[data-notebook-cell]").should(($cells) => {
      const bounds = [...$cells].map((cell) => cell.getBoundingClientRect())
      expect(bounds[0].top).to.be.closeTo(bounds[1].top, 1)
      expect(bounds[0].bottom).to.be.closeTo(bounds[1].bottom, 1)
    })
  })

  it("keeps both actions one-click in a narrow toolbar and shows only the relevant one", () => {
    cy.viewport(850, 900)
    load()
    cy.clickRunIconInLine(1)
    cy.wait("@probeQuery")
    cy.getByDataHook("result-auto-refresh-notebook").should("not.exist")
    cy.getByDataHook("result-add-notebook").should("be.visible").click()
    cy.get("[data-notebook-cell]").should("have.length", 1)
    cy.getEditorTabByTitle("Analysis").find(".chrome-tab-drag-handle").click()
    repeatQuery()
    cy.screenshot("notebook-transfer-narrow")
    cy.getByDataHook("result-auto-refresh-notebook").click()
    cy.contains('[role="menuitemradio"]', /^Off$/).should(
      "have.attr",
      "aria-checked",
      "true",
    )
    cy.contains('[role="menuitemradio"]', /^1s$/).click()
    cy.wait("@probeQuery")
    cy.getEditorTabByTitle("Analysis").find(".chrome-tab-drag-handle").click()
    readBuffers().then((buffers) => {
      const notebooks = buffers.filter((b) => b.notebookViewState)
      expect(notebooks).to.have.length(2)
      expect(notebooks[1].notebookViewState.cells[0].autoRefresh).to.eq("1s")
    })
  })
})
