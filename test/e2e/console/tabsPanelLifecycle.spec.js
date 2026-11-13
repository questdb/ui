/// <reference types="cypress" />

const row = (label) =>
  cy
    .get('[data-hook="tabs-panel-row"]')
    .contains('[data-hook="tabs-panel-row-button"]', label)

const openPanel = () => {
  cy.getByDataHook("tabs-panel-button").then(($button) => {
    if ($button.attr("data-selected") !== "true") cy.wrap($button).click()
  })
  cy.getByDataHook("tabs-panel").should("be.visible")
}

const buffers = [
  { label: "Script A", value: "select 1 as first;\nselect 2 as second;" },
  { label: "Editor B", value: "select 99 as unrelated;" },
  {
    label: "Closed SQL",
    value: "select 3;",
    archived: true,
    archivedAt: 1,
    position: -1,
  },
]

describe("Tabs panel lifecycle", () => {
  it("keeps a script running when a delayed example finishes loading", () => {
    // Given an example starts loading while a SQL script tab is active
    let releaseExample
    let releaseQuery
    let examplePending = false
    let queryPending = false
    const queries = []
    cy.intercept("GET", "**/assets/console-configuration.json", {
      ctaBanner: false,
      readOnly: false,
      exampleDashboards: [
        {
          id: "delayed",
          title: "Delayed example",
          path: "assets/delayed-example.json",
        },
      ],
    })
    cy.intercept("GET", "**/assets/delayed-example.json", (request) => {
      examplePending = true
      return new Promise((resolve) => {
        releaseExample = () => {
          request.reply({ fixture: "example-dashboard.json" })
          resolve()
        }
      })
    })
    cy.loadConsoleWithAuth(
      false,
      { "tabs.panel.exampleAutoOpened": "true" },
      { buffers, activeBufferId: 1 },
    )
    openPanel()
    row("Delayed example").click()
    cy.wrap(null).should(() => expect(examplePending).to.equal(true))

    // When the example arrives while the script's first statement is pending
    cy.intercept("GET", "**/exec*", (request) => {
      const query = new URL(request.url).searchParams.get("query")
      if (!/^select [12] as (first|second)$/i.test(query || "")) return
      queries.push(query)
      const first = /first/i.test(query)
      const reply = () =>
        request.reply({
          query,
          columns: [{ name: first ? "first" : "second", type: "INT" }],
          dataset: [[first ? 1 : 2]],
          count: 1,
        })
      if (!first) {
        reply()
        return
      }
      queryPending = true
      return new Promise((resolve) => {
        releaseQuery = () => {
          reply()
          resolve()
        }
      })
    })
    cy.clickRunScript()
    cy.wrap(null).should(() => expect(queryPending).to.equal(true))
    cy.getByDataHook("editor-tabs-disabled").should("exist")
    cy.then(() => releaseExample())

    // Then the example loads in the background and both script statements finish
    cy.getEditorTabByTitle("Delayed example").should("exist")
    cy.getEditorTabByTitle("Script A").should("have.attr", "active")
    cy.then(() => releaseQuery())
    cy.getByDataHook("editor-tabs").should("exist")
    cy.getByDataHook("notifications-collapsed")
      .should("contain", "Running completed")
      .and("contain", "2 successful")
    cy.then(() => {
      expect(queries).to.deep.equal(["select 1 as first", "select 2 as second"])
    })

    // And the loaded example can be opened after the script finishes
    row("Delayed example").click()
    cy.getEditorTabByTitle("Delayed example").should("have.attr", "active")
  })

  it("keeps panel activation and row actions locked until a script finishes", () => {
    // Given open and closed tabs, an example, and a pending script request
    let release
    let requestPending = false
    const activeTabs = []
    const disabledActions = []
    cy.intercept("GET", "**/assets/console-configuration.json", {
      ctaBanner: false,
      readOnly: false,
      exampleDashboards: [
        { id: "example", title: "Example", path: "assets/unused-example.json" },
      ],
    })
    cy.loadConsoleWithAuth(false, {}, { buffers, activeBufferId: 1 })
    openPanel()
    cy.getByDataHook("tabs-panel-include-closed").check({ force: true })
    cy.getByDataHook("tabs-panel-group-sql")
      .find('[aria-expanded="false"]')
      .click()
    cy.intercept("GET", "**/exec*", (request) => {
      const query = new URL(request.url).searchParams.get("query")
      if (query?.toLowerCase() !== "select 1 as first") return
      requestPending = true
      return new Promise((resolve) => {
        release = () => {
          request.reply({
            query,
            columns: [{ name: "first", type: "INT" }],
            dataset: [[1]],
            count: 1,
          })
          resolve()
        }
      })
    })
    cy.clickRunScript()
    cy.wrap(null).should(() => expect(requestPending).to.equal(true))
    cy.getByDataHook("editor-tabs-disabled").should("exist")

    // When the user tries Groups, Examples and List rows during the script
    for (const label of ["Editor B", "Closed SQL", "Example"]) {
      row(label).click()
      cy.getEditorTabs().then(($tabs) => {
        activeTabs.push($tabs.filter("[active]").attr("data-tab-title"))
      })
    }
    for (const action of ["close", "delete", "reopen"]) {
      cy.getByDataHook(`tabs-panel-${action}`).then(($buttons) => {
        disabledActions.push(
          ...Array.from($buttons, (button) => button.disabled),
        )
      })
    }
    cy.getByDataHook("tabs-panel-view-list").click()
    row("Editor B").click()
    row("Editor B").trigger("keydown", { key: "Enter" })

    // Then the script stays in A and owns its completion log
    cy.getEditorTabs().then(($tabs) => {
      activeTabs.push($tabs.filter("[active]").attr("data-tab-title"))
    })
    cy.then(() => release())
    cy.getByDataHook("editor-tabs").should("exist")
    cy.then(() => {
      expect(activeTabs).to.deep.equal(Array(4).fill("Script A"))
      expect(disabledActions).not.to.be.empty
      expect(disabledActions.every(Boolean)).to.equal(true)
    })
    cy.getByDataHook("notifications-collapsed").should(
      "contain",
      "Running completed",
    )

    // And panel activation works again once the script finishes
    row("Editor B").click()
    cy.getEditorTabByTitle("Editor B").should("have.attr", "active")
    cy.clickRunQuery()
    row("Script A").click()
    cy.getByDataHook("expand-notifications").click()
    cy.getByDataHook("notifications-expanded")
      .should("contain", "Running completed")
      .and("contain", "2 successful")
  })

  for (const { preview, fromNotebook } of [
    { preview: false, fromNotebook: false },
    { preview: true, fromNotebook: false },
    { preview: false, fromNotebook: true },
  ]) {
    it(`keeps panel focus after reopening ${preview ? "a previewed" : "a closed"} SQL tab from ${fromNotebook ? "a notebook" : "an editor"}`, () => {
      // Given a closed SQL tab and a neighbouring panel row
      cy.intercept("GET", "**/assets/console-configuration.json", {
        ctaBanner: false,
        readOnly: false,
      })
      const seededBuffers = buffers.map((buffer, index) =>
        fromNotebook && index === 0
          ? {
              ...buffer,
              notebookViewState: {
                cells: [{ id: "n1", position: 0, value: "select 1;" }],
              },
            }
          : buffer,
      )
      cy.loadConsoleWithAuth(
        false,
        {},
        {
          buffers: seededBuffers,
          activeBufferId: 1,
        },
      )
      openPanel()
      cy.getByDataHook("tabs-panel-include-closed").check({ force: true })
      if (preview) {
        row("Closed SQL").click()
        cy.getByDataHook("tab-preview-bar").should("be.visible")
      }

      // When the keyboard user reopens the SQL tab from the panel
      row("Closed SQL")
        .closest('[data-hook="tabs-panel-row"]')
        .find('[data-hook="tabs-panel-reopen"]')
        .focus()
      cy.realPress("Enter")

      // Then the restored tab is editable and focus stays in the panel
      cy.getEditorTabByTitle("Closed SQL").should("have.attr", "active")
      cy.getByDataHook("tab-preview-bar").should("not.exist")
      cy.focused()
        .should("have.attr", "data-hook", "tabs-panel-row-button")
        .closest('[data-hook="tabs-panel"]')
        .should("exist")
      cy.waitForActiveBufferValue("select 3;")
    })
  }
})
