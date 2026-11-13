/// <reference types="cypress" />

const { seedConsoleStorage } = require("../utils/consoleStorage")

const cells = [
  {
    id: "intro",
    name: "Intro",
    type: "markdown",
    value: "# Intro",
    position: 0,
    topHeight: 400,
    topResized: true,
  },
  {
    id: "first",
    name: "Same",
    type: "markdown",
    value: "# First duplicate",
    position: 1,
    topHeight: 400,
    topResized: true,
  },
  {
    id: "second",
    name: "Same",
    type: "markdown",
    value: "# Second duplicate",
    position: 2,
    topHeight: 400,
    topResized: true,
  },
  {
    id: "sql",
    name: "Price & volume / 東京",
    value: "select 1",
    position: 3,
    autoRefresh: false,
  },
  {
    id: "chart",
    name: "Chart",
    value: "select 1 x",
    mode: "draw",
    position: 4,
    autoRefresh: false,
    chartConfig: { xColumn: "x", queries: [{ type: "bar", yColumns: ["x"] }] },
  },
]
const view = { cells, settings: { autoRefreshDefault: false } }
const examples = [
  {
    id: "default",
    title: "Default dashboard",
    path: "assets/link-default.json",
  },
  { id: "linked", title: "Linked dashboard", path: "assets/link-test.json" },
]
const exportFile = (notebookViewState = view) => ({
  formatName: "dexie",
  data: {
    databaseVersion: 9,
    data: [
      {
        tableName: "buffers",
        rows: [
          {
            label: "Linked dashboard",
            value: "",
            position: 0,
            notebookViewState,
          },
        ],
      },
    ],
  },
})

const readBuffers = (win) =>
  new Cypress.Promise((resolve, reject) => {
    const request = win.indexedDB.open("web-console")
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const rows = db.transaction("buffers").objectStore("buffers").getAll()
      rows.onsuccess = () => {
        db.close()
        resolve(rows.result)
      }
      rows.onerror = () => {
        db.close()
        reject(rows.error)
      }
    }
  })

const visit = (
  search,
  {
    buffers = [{ label: "My SQL", value: "select 42" }],
    fresh = false,
    config = examples,
    broken = false,
    notebook = view,
  } = {},
) => {
  cy.intercept("GET", "**/assets/console-configuration.json*", {
    ctaBanner: false,
    readOnly: false,
    exampleDashboards: config,
  })
  cy.intercept("GET", "**/assets/link-default.json", exportFile(notebook)).as(
    "defaultExport",
  )
  cy.intercept(
    "GET",
    "**/assets/link-test.json",
    broken ? { statusCode: 404, body: "missing" } : exportFile(notebook),
  ).as("linkedExport")
  let seeded
  cy.handleStorageAndVisit(
    `${Cypress.config("baseUrl")}/${search}`,
    true,
    fresh ? {} : { "tabs.panel.exampleAutoOpened": "true" },
    (win) => {
      seeded = seedConsoleStorage(win, { buffers, activeBufferId: 1 })
    },
  )
  cy.then(() => seeded)
}

const expectDashboard = (title = "Linked dashboard") =>
  cy.getByDataHook("notebook-toolbar-name").should("have.text", title)

const expectNotFocused = (id) =>
  cy.get(`[data-notebook-cell][data-cell-id="${id}"]`).should(($cell) => {
    expect($cell.css("box-shadow")).not.to.contain("0px 0px 0px 3px")
  })

const withoutTemplate = (search) => {
  const params = new URLSearchParams(search)
  params.delete("templateId")
  return params.size ? `?${params}` : ""
}

const cases = [
  ["template only", "templateId=linked"],
  ["ignores ID", "templateId=linked&cellId=second"],
  ["ignores name", "templateId=linked&cellName=Same"],
  ["ignores ID before name", "templateId=linked&cellId=second&cellName=Same"],
  ["ignores name before ID", "cellName=Same&templateId=linked&cellId=second"],
  ["template last", "cellId=second&cellName=Same&templateId=linked"],
  ["empty cell parameters", "templateId=linked&cellId=&cellName="],
]

describe("example dashboard links", () => {
  cases.forEach(([label, params]) => {
    it(label, () => {
      // Given an existing workspace and a dashboard link
      visit(`?${params}&keep=yes#anchor`)
      // When the requested dashboard mounts
      expectDashboard()
      expectNotFocused("first")
      expectNotFocused("second")
      // Then only templateId is consumed and the SQL tab survives
      cy.location("search").should("eq", withoutTemplate(`${params}&keep=yes`))
      cy.location("hash").should("eq", "#anchor")
      cy.window()
        .then(readBuffers)
        .then((rows) => {
          expect(rows).to.have.length(2)
          expect(rows.find((row) => row.label === "My SQL").value).to.eq(
            "select 42",
          )
          expect(
            rows.filter((row) => row.templateId === "linked"),
          ).to.have.length(1)
        })
    })
  })
  ;[
    "",
    "?cellName=Same",
    "?cellId=second",
    "?cellName=Same&cellId=second",
    "?templateId=",
    "?templateId=missing&cellId=second",
  ].forEach((search) => {
    it(`preserves the active SQL tab for ${search || "no parameters"}`, () => {
      visit(search)
      cy.getEditor().should("be.visible")
      cy.getByDataHook("notebook-toolbar-name").should("not.exist")
      cy.location("search").should("eq", withoutTemplate(search))
      cy.window()
        .then(readBuffers)
        .then((rows) => expect(rows).to.have.length(1))
    })
  })

  it("opens the requested example instead of the default on a fresh workspace", () => {
    visit("?templateId=linked&cellId=second", { fresh: true, buffers: [{}] })
    expectDashboard()
    expectNotFocused("second")
    cy.get("@defaultExport.all").should("have.length", 0)
  })

  it("keeps the normal first-visit behavior without a template", () => {
    visit("?cellName=Same", { fresh: true, buffers: [{}] })
    expectDashboard("Default dashboard")
    cy.get('[data-notebook-cell][data-cell-id="first"]').should(($cell) => {
      expect($cell.css("box-shadow")).not.to.contain("0px 0px 0px 3px")
    })
  })

  it("reuses an open example without overriding its stored focus", () => {
    visit("?templateId=linked&cellName=Same", {
      buffers: [
        { label: "My SQL", value: "select 42" },
        {
          label: "Linked dashboard",
          templateId: "linked",
          notebookViewState: { ...view, focusedCellId: "intro" },
        },
      ],
    })
    expectDashboard()
    expectNotFocused("first")
    cy.window()
      .then(readBuffers)
      .then((rows) => expect(rows).to.have.length(2))
  })

  it("falls back to the stored workspace when the example cannot load", () => {
    visit("?templateId=linked&cellId=first", { broken: true })
    cy.getEditor().should("be.visible")
    cy.contains("Could not").should("be.visible")
    cy.location("search").should("eq", "?cellId=first")
  })

  it("handles a deployment without configured examples", () => {
    visit("?templateId=linked&cellId=first", { config: [] })
    cy.getEditor().should("be.visible")
    cy.contains('Example dashboard "linked" was not found.').should(
      "be.visible",
    )
  })
  ;[false, true].forEach((execute) => {
    it(`gives SQL share links priority (execute=${execute})`, () => {
      visit(
        `?templateId=linked&cellName=Same&query=select+7654321${execute ? "&executeQuery=true" : ""}`,
        { fresh: true, buffers: [{}] },
      )
      cy.getEditor().should("be.visible")
      cy.getByDataHook("notebook-toolbar-name").should("not.exist")
      cy.location("search").should("eq", "?cellName=Same")
      cy.window()
        .then(readBuffers)
        .then((rows) => {
          expect(rows.some((row) => row.value === "select 7654321")).to.eq(true)
          expect(rows.some((row) => row.templateId)).to.eq(false)
        })
      cy.get("@linkedExport.all").should("have.length", 0)
      cy.get("@defaultExport.all").should("have.length", 0)
      if (execute) cy.contains("7654321").should("be.visible")
    })
  })
  it("opens grid layout without focusing a URL-selected cell", () => {
    visit("?templateId=linked&cellId=second", {
      notebook: {
        ...view,
        settings: {
          autoRefreshDefault: false,
          layoutMode: "grid",
          layout: cells.map((cell, index) => ({
            i: cell.id,
            x: (index % 2) * 6,
            y: Math.floor(index / 2),
            w: 6,
            h: 15,
          })),
        },
      },
    })
    expectDashboard()
    expectNotFocused("second")
  })

  it("ignores orphan cell selectors on a stored notebook", () => {
    visit("?cellId=second&cellName=Same", {
      buffers: [
        {
          label: "Personal",
          notebookViewState: { ...view, focusedCellId: "intro" },
        },
      ],
    })
    expectDashboard("Personal")
    cy.get('[data-notebook-cell][data-cell-id="intro"]').should(($cell) => {
      expect($cell.css("box-shadow")).to.contain("0px 0px 0px 3px")
    })
    cy.location("search").should("eq", "?cellId=second&cellName=Same")
  })

  it("does not duplicate the example after refreshing the consumed link", () => {
    visit("?templateId=linked&cellId=second")
    expectDashboard()
    expectNotFocused("second")
    cy.location("search").should("eq", "?cellId=second")
    cy.reload()
    expectDashboard()
    cy.window()
      .then(readBuffers)
      .then((rows) => expect(rows).to.have.length(2))
  })

  it("preserves archived copies and creates a new open example", () => {
    visit("?templateId=linked&cellId=second", {
      buffers: [
        { label: "My SQL", value: "select 42" },
        {
          label: "Archived",
          archived: true,
          archivedAt: Date.now(),
          templateId: "linked",
          notebookViewState: view,
        },
      ],
    })
    expectDashboard()
    expectNotFocused("second")
    cy.window()
      .then(readBuffers)
      .then((rows) => {
        expect(rows).to.have.length(3)
        expect(rows.find((row) => row.label === "Archived").archived).to.eq(
          true,
        )
      })
  })
})
