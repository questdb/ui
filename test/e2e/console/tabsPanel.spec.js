/// <reference types="cypress" />

const ROW = '[data-hook="tabs-panel-row"]'
const baseUrl = Cypress.config("baseUrl")

const openTabsPanel = () => {
  cy.getByDataHook("tabs-panel-button").then(($btn) => {
    if ($btn.attr("data-selected") !== "true") {
      cy.wrap($btn).click()
    }
  })
  cy.getByDataHook("tabs-panel").should("be.visible")
}

const editors = () => cy.getByDataHook("tabs-panel-group-sql")
const notebooks = () => cy.getByDataHook("tabs-panel-group-notebook")

const openRow = (label) =>
  cy.get('[data-hook="tabs-panel-open-row"]').contains(ROW, label)

const closedRow = (label) =>
  cy.get('[data-hook="tabs-panel-closed-row"]').contains(ROW, label)

const setViewMode = (mode) => {
  cy.getByDataHook(`tabs-panel-view-${mode}`).click()
  cy.getByDataHook(`tabs-panel-view-${mode}`).should(
    "have.attr",
    "aria-pressed",
    "true",
  )
}

const includeClosed = () => {
  cy.getByDataHook("tabs-panel-include-closed").then(($box) => {
    if (!$box.prop("checked")) cy.wrap($box).click({ force: true })
  })
  cy.getByDataHook("tabs-panel-include-closed").should("be.checked")
}

// A tab with persisted content, so closing it archives instead of deleting.
const createTab = (label, sql) => {
  cy.createTabWithContent(sql, label)
  cy.waitForActiveBufferValue(sql)
  cy.getEditorTabByTitle(label).should("have.attr", "active")
}

const closeFromPanel = (label) => {
  openRow(label).find('[data-hook="tabs-panel-close"]').click()
  cy.getEditorTabByTitle(label).should("not.exist")
}

describe("tabs panel", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
    cy.getEditorContent().should("be.visible")
    openTabsPanel()
  })

  it("groups tabs by kind, hides empty folders and activates a tab from its row", () => {
    // Given a second editor tab next to the default one
    createTab("Alpha", "select 1;")

    // Then only the Editors folder exists, with both tabs in bar order
    editors()
      .find('[data-hook="tabs-panel-section-count"]')
      .should("have.text", "2")
    editors().find(ROW).should("have.length", 2)
    editors().find(ROW).first().should("contain", "SQL")
    editors().find(ROW).last().should("contain", "Alpha")
    notebooks().should("not.exist")
    cy.getByDataHook("tabs-panel-group-metrics").should("not.exist")
    cy.getByDataHook("tabs-panel-examples").should("not.exist")

    // When the user adds a notebook
    cy.getByDataHook("new-tab-button").click()
    cy.getByDataHook("new-tab-notebook").click()
    cy.get("[data-notebook-root]").should("be.visible")

    // Then the Notebooks folder appears first
    notebooks().should("be.visible")
    cy.getByDataHook("tabs-panel")
      .find("section")
      .first()
      .should("have.attr", "data-hook", "tabs-panel-group-notebook")

    // When the user clicks the default tab's row
    openRow("SQL").click()

    // Then the editor switches to it
    cy.getEditorTabByTitle("SQL").should("have.attr", "active")
    cy.getEditorTabByTitle("Alpha").should("not.have.attr", "active")
  })

  it("hides closed tabs until asked, then lists them after the open ones, newest first", () => {
    // Given Alpha and Beta closed in that order, Gamma open
    createTab("Alpha", "select 1;")
    createTab("Beta", "select 2;")
    createTab("Gamma", "select 3;")
    closeFromPanel("Alpha")
    cy.wait(1100)
    closeFromPanel("Beta")

    // Then closed tabs are not listed by default
    editors().find(ROW).should("have.length", 2)
    editors()
      .find('[data-hook="tabs-panel-section-count"]')
      .should("have.text", "2")
    cy.get('[data-hook="tabs-panel-closed-row"]').should("not.exist")

    // When the user includes closed tabs
    includeClosed()

    // Then they follow the open tabs, most recently closed first, with their age
    editors()
      .find('[data-hook="tabs-panel-section-count"]')
      .should("have.text", "2 open · 2 closed")
    editors()
      .find(ROW)
      .then(($rows) => {
        const labels = [...$rows].map((row) => row.textContent)
        expect(labels[0]).to.contain("SQL")
        expect(labels[1]).to.contain("Gamma")
        expect(labels[2]).to.contain("Beta")
        expect(labels[3]).to.contain("Alpha")
      })
    closedRow("Beta").should("contain", "ago")

    // And the choice survives a reload
    cy.reload()
    cy.getEditorContent().should("be.visible")
    openTabsPanel()
    cy.getByDataHook("tabs-panel-include-closed").should("be.checked")
    closedRow("Alpha").should("be.visible")
    cy.getEditorTabByTitle("Alpha").should("not.exist")
  })

  it("keeps the last open tab", () => {
    // Given a second tab with content
    createTab("Alpha", "select 1;")

    // When the user closes it from the panel
    closeFromPanel("Alpha")

    // Then the remaining tab cannot be closed or deleted
    cy.getEditorTabByTitle("SQL").should("have.attr", "active")
    openRow("SQL").find('[data-hook="tabs-panel-close"]').should("be.disabled")
    openRow("SQL").find('[data-hook="tabs-panel-delete"]').should("be.disabled")
  })

  it("previews a closed tab read-only and closes the preview", () => {
    // Given a closed tab
    createTab("Alpha", "alpha_query;")
    closeFromPanel("Alpha")
    includeClosed()

    // When the user clicks its row
    closedRow("Alpha").click()

    // Then it opens as a read-only preview
    cy.getByDataHook("tab-preview-bar").should("be.visible")
    cy.getEditorTabByTitle("Alpha")
      .should("have.class", "temporary-tab")
      .should("have.attr", "active")
    cy.getEditor().should("contain", "alpha_query")

    // When the user closes the preview
    cy.getByDataHook("tab-preview-close").click()

    // Then the tab is still closed and the open tab is shown again
    cy.getByDataHook("tab-preview-bar").should("not.exist")
    cy.getEditorTabByTitle("Alpha").should("not.exist")
    cy.getEditorTabByTitle("SQL").should("have.attr", "active")
    closedRow("Alpha").should("be.visible")
  })

  it("always lists the previewed tab, even with closed tabs hidden", () => {
    // Given a closed tab previewed from search
    createTab("Alpha", "alpha_query;")
    closeFromPanel("Alpha")
    cy.openSearchPanel()
    cy.searchFor("alpha_query")
    cy.getSearchResults().contains("alpha_query").click()
    cy.getEditorTabByTitle("Alpha").should("have.class", "temporary-tab")

    // Then the panel shows it in its folder
    openTabsPanel()
    cy.getByDataHook("tabs-panel-include-closed").should("not.be.checked")
    closedRow("Alpha").should("be.visible")
  })

  it("keeps a previewed tab open from the preview bar", () => {
    // Given a previewed closed tab
    createTab("Alpha", "alpha_query;")
    closeFromPanel("Alpha")
    includeClosed()
    closedRow("Alpha").click()
    cy.getByDataHook("tab-preview-bar").should("be.visible")

    // When the user keeps it open
    cy.getByDataHook("tab-preview-keep-open").click()

    // Then it is a regular open tab again
    cy.getByDataHook("tab-preview-bar").should("not.exist")
    cy.getEditorTabByTitle("Alpha")
      .should("not.have.class", "temporary-tab")
      .should("have.attr", "active")
    openRow("Alpha").should("be.visible")
    cy.get('[data-hook="tabs-panel-closed-row"]').should("not.exist")
  })

  it("reopens a closed tab as the last open tab", () => {
    // Given two extra tabs, the first one closed
    createTab("Alpha", "select 1;")
    createTab("Beta", "select 2;")
    closeFromPanel("Alpha")
    includeClosed()

    // When the user reopens it from its row
    closedRow("Alpha").find('[data-hook="tabs-panel-reopen"]').click()

    // Then it is active and placed after the other open tabs
    cy.getEditorTabByTitle("Alpha")
      .should("not.have.class", "temporary-tab")
      .should("have.attr", "active")
    cy.getEditorTabs().last().should("have.attr", "data-tab-title", "Alpha")
    cy.get('[data-hook="tabs-panel-open-row"]')
      .last()
      .should("contain", "Alpha")
    cy.get('[data-hook="tabs-panel-closed-row"]').should("not.exist")
  })

  it("deletes open and closed tabs from their rows, and a new tab still lands last", () => {
    // Given one closed tab and two extra open tabs
    createTab("Alpha", "select 1;")
    closeFromPanel("Alpha")
    createTab("Beta", "select 2;")
    createTab("Gamma", "select 3;")
    includeClosed()

    // When the user deletes the closed tab
    closedRow("Alpha").find('[data-hook="tabs-panel-delete"]').click()

    // Then it is gone for good
    cy.get('[data-hook="tabs-panel-closed-row"]').should("not.exist")

    // When the user deletes an open tab in the middle
    cy.wait(600)
    openRow("Beta").find('[data-hook="tabs-panel-delete"]').click()

    // Then it is gone from the tab bar and is not listed as closed
    cy.getEditorTabByTitle("Beta").should("not.exist")
    editors()
      .find('[data-hook="tabs-panel-section-count"]')
      .should("have.text", "2 open · 0 closed")

    // And a new tab is appended, not inserted into the gap
    cy.addEditorTab()
    cy.getEditorTabs().should("have.length", 3)
    cy.getEditorTabs().last().should("have.attr", "data-tab-title", "SQL 1")
  })

  it("ignores the second click of a double-click on Delete", () => {
    // Given two closed tabs
    createTab("Alpha", "select 1;")
    createTab("Beta", "select 2;")
    closeFromPanel("Alpha")
    closeFromPanel("Beta")
    includeClosed()
    cy.get('[data-hook="tabs-panel-closed-row"]').should("have.length", 2)

    // When the user double-clicks Delete on the first closed row
    closedRow("Beta").find('[data-hook="tabs-panel-delete"]').dblclick()

    // Then only that tab is deleted; the row that slid up is untouched
    cy.get('[data-hook="tabs-panel-closed-row"]').should("have.length", 1)
    closedRow("Alpha").should("be.visible")
    cy.wait(700)
    cy.get('[data-hook="tabs-panel-closed-row"]').should("have.length", 1)
  })

  it("filters every folder by label", () => {
    // Given an open "Alpha", an open "Beta" and a closed "Gamma"
    createTab("Alpha", "select 1;")
    createTab("Beta", "select 2;")
    createTab("Gamma", "select 3;")
    closeFromPanel("Gamma")
    includeClosed()

    // When the user filters by part of a label, in another case
    cy.getByDataHook("tabs-panel-filter").type("alp")

    // Then only matching rows are listed
    editors().find(ROW).should("have.length", 1)
    openRow("Alpha").should("be.visible")

    // When nothing matches
    cy.getByDataHook("tabs-panel-filter").clear().type("zzz")

    // Then the folders are gone and the panel says so
    editors().should("not.exist")
    cy.getByDataHook("tabs-panel-empty").should("contain", "No tabs match")

    // When the user clears the filter
    cy.getByDataHook("tabs-panel-filter-clear").click()

    // Then every tab is listed again
    cy.getByDataHook("tabs-panel-filter").should("have.value", "")
    editors().find(ROW).should("have.length", 4)
    closedRow("Gamma").should("be.visible")
  })

  it("collapses and expands a folder from its header", () => {
    // Given a second tab
    createTab("Alpha", "select 1;")

    // When the user clicks the Editors header
    editors().find('[role="button"][aria-expanded]').first().click()

    // Then the list is hidden, and shown again on a second click
    editors().find(ROW).should("not.exist")
    editors().find('[role="button"][aria-expanded="false"]').click()
    openRow("Alpha").should("be.visible")
  })

  it("lists tabs in tab bar order with closed ones apart in List mode, and reorders by drag", () => {
    // Given three open tabs and a closed one
    createTab("Alpha", "select 1;")
    createTab("Beta", "select 2;")
    createTab("Gone", "select 3;")
    closeFromPanel("Gone")

    // When the user switches to List mode
    setViewMode("list")

    // Then the kind folders are replaced by Open and Closed, in bar order,
    // and the closed-tabs checkbox is gone
    cy.getByDataHook("tabs-panel-include-closed").should("not.exist")
    editors().should("not.exist")
    cy.getByDataHook("tabs-panel-open")
      .find(ROW)
      .then(($rows) => {
        expect([...$rows].map((row) => row.textContent)).to.deep.equal([
          "SQL",
          "Alpha",
          "Beta",
        ])
      })
    cy.getByDataHook("tabs-panel-closed").find(ROW).should("have.length", 1)
    closedRow("Gone").should("be.visible")

    // When the user drags Beta above Alpha
    openRow("Alpha").then(($alpha) => {
      const targetY = $alpha[0].getBoundingClientRect().top + 2
      openRow("Beta").then(($beta) => {
        const rect = $beta[0].getBoundingClientRect()
        const startY = rect.top + rect.height / 2
        cy.wrap($beta).trigger("pointerdown", {
          eventConstructor: "PointerEvent",
          button: 0,
          pointerId: 1,
          clientX: rect.left + 20,
          clientY: startY,
        })
        cy.document().then((doc) => {
          const move = (clientY) =>
            doc.dispatchEvent(
              new PointerEvent("pointermove", { pointerId: 1, clientY }),
            )
          move(startY - 10)
          move(targetY)
          doc.dispatchEvent(
            new PointerEvent("pointerup", { pointerId: 1, clientY: targetY }),
          )
        })
      })
    })

    // Then the tab bar and the list agree on the new order
    cy.getEditorTabs().should(($tabs) => {
      const titles = [...$tabs].map((tab) =>
        tab.querySelector(".chrome-tab-title").textContent.trim(),
      )
      expect(titles.indexOf("Beta")).to.be.lessThan(titles.indexOf("Alpha"))
    })
    cy.getByDataHook("tabs-panel-open")
      .find(ROW)
      .should(($rows) => {
        const labels = [...$rows].map((row) => row.textContent)
        expect(labels.indexOf("Beta")).to.be.lessThan(labels.indexOf("Alpha"))
      })

    // And the mode survives a reload; Groups brings the folders back
    cy.reload()
    cy.getEditorContent().should("be.visible")
    openTabsPanel()
    cy.getByDataHook("tabs-panel-view-list").should(
      "have.attr",
      "aria-pressed",
      "true",
    )
    cy.getByDataHook("tabs-panel-open").should("be.visible")
    setViewMode("groups")
    editors().should("be.visible")
    cy.getByDataHook("tabs-panel-open").should("not.exist")
    cy.getByDataHook("tabs-panel-include-closed").should("exist")
  })
})

describe("tabs panel example dashboards", () => {
  const consoleConfiguration = {
    ctaBanner: false,
    readOnly: false,
    exampleDashboards: [
      {
        id: "demo-trades",
        title: "Trades overview",
        path: "assets/examples/trades.json",
      },
      {
        id: "demo-weather",
        title: "Weather",
        path: "assets/examples/weather.json",
      },
    ],
  }

  beforeEach(() => {
    cy.intercept(
      { method: "GET", url: `${baseUrl}/assets/console-configuration.json` },
      consoleConfiguration,
    ).as("getConsoleConfiguration")
    cy.readFile("e2e/fixtures/example-dashboard.json").then((body) => {
      cy.intercept(
        { method: "GET", url: `${baseUrl}/assets/examples/trades.json` },
        body,
      ).as("getTradesExample")
    })
    cy.intercept(
      { method: "GET", url: `${baseUrl}/assets/examples/weather.json` },
      { statusCode: 404, body: "" },
    )
    // Most tests here start from a visitor who has already seen the auto-opened
    // dashboard; the first-visit behaviour has its own test below.
    cy.loadConsoleWithAuth(false, { "tabs.panel.exampleAutoOpened": "true" })
    cy.getEditorContent().should("be.visible")
  })

  it("opens the first example dashboard on the very first visit, before any click", () => {
    // Cypress's bundled Electron fails to load Monaco's editor worker when the
    // first Monaco instance on the page is a notebook cell and the main SQL
    // editor mounts later. Chrome does not; ignore that one error here.
    cy.on("uncaught:exception", (err) =>
      err.message.includes("importScripts") ? false : undefined,
    )

    // Given a browser that has never held a tab and never auto-opened anything
    cy.handleStorageAndVisit(baseUrl, true, {})
    cy.loginWithUserAndPassword()

    // Then the first example is the active tab and already running
    cy.getEditorTabByTitle("Trades overview").should("have.attr", "active")
    cy.get("[data-notebook-root]").should("be.visible")
    cy.get("[data-notebook-root]").should("contain", "42")
    cy.getEditorTabs().should("have.length", 2)
    cy.getByDataHook("tabs-panel-example-list")
      .contains(ROW, "Trades overview")
      .should("have.attr", "data-active", "true")

    // When the visitor closes it and comes back
    cy.getEditorTabByTitle("Trades overview")
      .find(".chrome-tab-close")
      .click({ force: true })
    cy.getEditorTabByTitle("Trades overview").should("not.exist")
    cy.getEditorTabs().should("have.length", 1)
    cy.getEditorTabByTitle("SQL").should("have.attr", "active")
    cy.waitForActiveBufferValue("")
    cy.reload()
    cy.getEditorContent().should("be.visible")

    // Then it does not open again on its own
    cy.wait(1500)
    cy.getEditorTabs().should("have.length", 1)
    cy.getEditorTabByTitle("SQL").should("have.attr", "active")
  })

  it("does not show the notebook onboarding modal when examples are configured", () => {
    // Given a first visit with no onboarding state at all (the shared helper
    // normally seeds it as already seen; here the config alone must hide it)
    cy.handleStorageAndVisit(
      baseUrl,
      true,
      { "tabs.panel.exampleAutoOpened": "true" },
      (win) => {
        win.localStorage.removeItem("notebook.onboarding")
      },
    )
    cy.loginWithUserAndPassword()
    cy.getEditorContent().should("be.visible")

    // Then no onboarding dialog appears, and the console is usable
    cy.wait(1000)
    cy.contains("Introducing Notebooks").should("not.exist")
    cy.getByDataHook("tabs-panel").should("be.visible")
  })

  it("opens the Tabs panel by default on the first visit only", () => {
    // Then the Tabs panel is open without a click, because examples are configured
    cy.getByDataHook("tabs-panel").should("be.visible")
    cy.getByDataHook("tabs-panel-button").should(
      "have.attr",
      "data-selected",
      "true",
    )

    // When the user switches to the schema panel and reloads
    cy.getByDataHook("tables-panel-button").click()
    cy.getByDataHook("tabs-panel").should("not.be.visible")
    cy.reload()
    cy.getEditorContent().should("be.visible")

    // Then their choice is kept
    cy.getByDataHook("tabs-panel").should("not.be.visible")
  })

  it("lists the examples first and opens one as a running notebook, once", () => {
    // Then the Examples folder is first
    cy.getByDataHook("tabs-panel")
      .find("section")
      .first()
      .should("have.attr", "data-hook", "tabs-panel-examples")
    cy.getByDataHook("tabs-panel-examples")
      .find('[data-hook="tabs-panel-section-count"]')
      .should("have.text", "2")
    cy.getByDataHook("tabs-panel-example-list")
      .contains(ROW, "Trades overview")
      .should("not.have.attr", "data-active")

    // When the user clicks an example
    cy.getByDataHook("tabs-panel-example-list")
      .contains(ROW, "Trades overview")
      .click()
    cy.wait("@getTradesExample")

    // Then a notebook tab named after the example opens and runs
    cy.getEditorTabByTitle("Trades overview").should("have.attr", "active")
    cy.get("[data-notebook-root]").should("be.visible")
    cy.get("[data-notebook-root]").should("contain", "example")
    cy.get("[data-notebook-root]").should("contain", "1 row")
    cy.get("[data-notebook-root]").should("contain", "42")

    // And the example row is the active one; no Notebooks folder appears
    cy.getByDataHook("tabs-panel-example-list")
      .contains(ROW, "Trades overview")
      .should("have.attr", "data-active", "true")
    cy.getByDataHook("tabs-panel-group-notebook").should("not.exist")
    cy.getByDataHook("tabs-panel-example-list")
      .find(ROW)
      .should("have.length", 2)

    // When the user switches away and clicks the example again
    cy.getEditorTabByTitle("SQL").find(".chrome-tab-drag-handle").click()
    cy.getEditorTabByTitle("SQL").should("have.attr", "active")
    cy.getByDataHook("tabs-panel-example-list")
      .contains(ROW, "Trades overview")
      .should("not.have.attr", "data-active")
    cy.getByDataHook("tabs-panel-example-list")
      .contains(ROW, "Trades overview")
      .click()

    // Then the existing notebook is activated instead of a second copy
    cy.getEditorTabByTitle("Trades overview").should("have.attr", "active")
    cy.getEditorTabs().should("have.length", 2)

    // When the user closes the example's tab
    cy.getEditorTabByTitle("Trades overview")
      .find(".chrome-tab-close")
      .click({ force: true })

    // Then it is gone for good, not kept in history, and the row is plain again
    cy.getEditorTabByTitle("Trades overview").should("not.exist")
    cy.getByDataHook("tabs-panel-include-closed").click({ force: true })
    cy.get('[data-hook="tabs-panel-closed-row"]').should("not.exist")
    cy.getByDataHook("tabs-panel-example-list")
      .contains(ROW, "Trades overview")
      .should("not.have.attr", "data-active")
  })

  it("in List mode an open example is just a tab; a closed one is not listed", () => {
    // Given one example is open and another is not
    cy.getByDataHook("tabs-panel-example-list")
      .contains(ROW, "Trades overview")
      .click()
    cy.getEditorTabByTitle("Trades overview").should("have.attr", "active")

    // When the user switches to List mode
    setViewMode("list")

    // Then there is no Example dashboards folder, the open example sits in
    // the Open folder in bar order, and the other example is nowhere
    cy.getByDataHook("tabs-panel-examples").should("not.exist")
    cy.getByDataHook("tabs-panel-open")
      .find(ROW)
      .then(($rows) => {
        expect([...$rows].map((row) => row.textContent)).to.deep.equal([
          "SQL",
          "Trades overview",
        ])
      })
    openRow("Trades overview").should("have.attr", "data-active", "true")
    cy.getByDataHook("tabs-panel").should("not.contain", "Weather")

    // When the example tab is closed from its row
    closeFromPanel("Trades overview")

    // Then it is gone from the panel entirely (deleted, not archived)
    cy.getByDataHook("tabs-panel").should("not.contain", "Trades overview")
    cy.getByDataHook("tabs-panel-closed").find(ROW).should("not.exist")

    // And back in Groups mode the example row is plain again
    setViewMode("groups")
    cy.getByDataHook("tabs-panel-example-list")
      .contains(ROW, "Trades overview")
      .should("not.have.attr", "data-active")
  })

  it("renaming an example makes it the user's own notebook", () => {
    // Given an open example
    cy.getByDataHook("tabs-panel-example-list")
      .contains(ROW, "Trades overview")
      .click()
    cy.wait("@getTradesExample")
    cy.getEditorTabByTitle("Trades overview").should("have.attr", "active")

    // When the user renames it
    cy.getByDataHook("notebook-rename").click({ force: true })
    cy.getByDataHook("notebook-rename-input").clear().type("My trades{enter}")
    cy.getEditorTabByTitle("My trades").should("have.attr", "active")

    // Then it is a regular notebook: listed under Notebooks, no longer the example
    cy.getByDataHook("tabs-panel-example-list")
      .contains(ROW, "Trades overview")
      .should("not.have.attr", "data-active")
    cy.getByDataHook("tabs-panel-group-notebook")
      .find('[role="button"][aria-expanded="false"]')
      .click()
    cy.getByDataHook("tabs-panel-group-notebook")
      .find(ROW)
      .should("have.length", 1)
      .should("contain", "My trades")
      .should("have.attr", "data-active", "true")

    // And closing it keeps it in history instead of deleting it
    cy.getEditorTabByTitle("My trades")
      .find(".chrome-tab-close")
      .click({ force: true })
    cy.getEditorTabByTitle("My trades").should("not.exist")
    cy.getByDataHook("tabs-panel-include-closed").click({ force: true })
    // The folder re-mounted empty while closed tabs were hidden, so it is folded
    cy.getByDataHook("tabs-panel-group-notebook")
      .find('[role="button"][aria-expanded="false"]')
      .click()
    cy.get('[data-hook="tabs-panel-closed-row"]').should("contain", "My trades")

    // And the example opens a fresh copy again
    cy.getByDataHook("tabs-panel-example-list")
      .contains(ROW, "Trades overview")
      .click()
    cy.getEditorTabByTitle("Trades overview").should("have.attr", "active")
  })

  it("reports an example that cannot be loaded", () => {
    cy.getByDataHook("tabs-panel-example-list").contains(ROW, "Weather").click()
    cy.get(".Toastify").should(
      "contain",
      "Could not open the example dashboard",
    )
    cy.getEditorTabs().should("have.length", 1)
  })
})

describe("tab history dropdown", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
    cy.getEditorContent().should("be.visible")
  })

  it("clears the history only after confirmation", () => {
    // Given a tab closed from the tab bar
    createTab("Alpha", "select 1;")
    cy.getEditorTabByTitle("Alpha").within(() => {
      cy.get(".chrome-tab-close").click()
    })
    cy.getEditorTabByTitle("Alpha").should("not.exist")
    cy.getByDataHook("editor-tabs-history-button").click()
    cy.getByDataHook("editor-tabs-history-item").should("contain", "Alpha")

    // When the user clears the history and then keeps it
    cy.getByDataHook("editor-tabs-history-clear").click()
    cy.getByDataHook("clear-history-dialog")
      .should("be.visible")
      .should("contain", "This deletes 1 closed tab ")
    cy.getByDataHook("clear-history-dismiss").click()
    cy.getByDataHook("clear-history-dialog").should("not.exist")

    // Then the closed tab is still in the history
    cy.getByDataHook("editor-tabs-history-button").click()
    cy.getByDataHook("editor-tabs-history-item").should("contain", "Alpha")

    // When the user clears the history and confirms
    cy.getByDataHook("editor-tabs-history-clear").click()
    cy.getByDataHook("clear-history-confirm").click()
    cy.getByDataHook("clear-history-dialog").should("not.exist")

    // Then the history is empty
    cy.getByDataHook("editor-tabs-history-button").click()
    cy.getByDataHook("editor-tabs-history").should(
      "contain",
      "History is empty",
    )
    cy.getByDataHook("editor-tabs-history-item").should("not.exist")
  })

  it("ignores the second click of a double-click on a row's Delete", () => {
    // Given two closed tabs
    createTab("Alpha", "select 1;")
    createTab("Beta", "select 2;")
    cy.getEditorTabByTitle("Alpha").find(".chrome-tab-close").click()
    cy.getEditorTabByTitle("Alpha").should("not.exist")
    cy.getEditorTabByTitle("Beta").find(".chrome-tab-close").click()
    cy.getEditorTabByTitle("Beta").should("not.exist")
    cy.getByDataHook("editor-tabs-history-button").click()
    cy.getByDataHook("editor-tabs-history-item-delete").should("have.length", 2)

    // When the user double-clicks the first row's Delete
    cy.getByDataHook("editor-tabs-history-item-delete").first().dblclick()

    // Then one tab is deleted, not two
    cy.getByDataHook("editor-tabs-history-item").should("have.length", 1)
    cy.wait(700)
    cy.getByDataHook("editor-tabs-history-item").should("have.length", 1)
  })
})
