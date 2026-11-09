/// <reference types="cypress" />

const ROW = '[data-hook="tabs-panel-row"]'

const openTabsPanel = () => {
  cy.getByDataHook("tabs-panel-button").then(($btn) => {
    if ($btn.attr("data-selected") !== "true") {
      cy.wrap($btn).click()
    }
  })
  cy.getByDataHook("tabs-panel").should("be.visible")
}

const openRow = (label) =>
  cy.getByDataHook("tabs-panel-open-list").contains(ROW, label)

const closedRow = (label) =>
  cy.getByDataHook("tabs-panel-closed-list").contains(ROW, label)

// A tab with persisted content, so closing it archives instead of deleting.
const createTab = (label, sql) => {
  cy.createTabWithContent(sql, label)
  cy.waitForActiveBufferValue(sql)
  cy.getEditorTabByTitle(label).should("have.attr", "active")
}

const closeFromPanel = (label) => {
  openRow(label).find('[data-hook="tabs-panel-close"]').click()
  cy.getEditorTabByTitle(label).should("not.exist")
  closedRow(label).should("be.visible")
}

describe("tabs panel", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
    cy.getEditorContent().should("be.visible")
    openTabsPanel()
  })

  it("lists open tabs and activates a tab from its row", () => {
    // Given a second tab next to the default one
    createTab("Alpha", "select 1;")
    cy.getByDataHook("tabs-panel-open").should("contain", "2 tabs")
    cy.getByDataHook("tabs-panel-closed").should("contain", "No closed tabs")
    cy.getByDataHook("tabs-panel-clear-history").should("not.exist")

    // When the user clicks the default tab's row
    openRow("SQL").click()

    // Then the editor switches to it
    cy.getEditorTabByTitle("SQL").should("have.attr", "active")
    cy.getEditorTabByTitle("Alpha").should("not.have.attr", "active")
  })

  it("closes a tab from its row and keeps the last open tab", () => {
    // Given a second tab with content
    createTab("Alpha", "select 1;")

    // When the user closes it from the panel
    closeFromPanel("Alpha")

    // Then it moves to Closed and the remaining tab cannot be closed
    cy.getByDataHook("tabs-panel-open").should("contain", "1 tab")
    cy.getByDataHook("tabs-panel-closed").should("contain", "1 tab")
    closedRow("Alpha").should("contain", "ago")
    cy.getEditorTabByTitle("SQL").should("have.attr", "active")
    openRow("SQL").find('[data-hook="tabs-panel-close"]').should("be.disabled")
    openRow("SQL").find('[data-hook="tabs-panel-delete"]').should("be.disabled")
  })

  it("previews a closed tab read-only and closes the preview", () => {
    // Given a closed tab
    createTab("Alpha", "alpha_query;")
    closeFromPanel("Alpha")

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

  it("keeps a previewed tab open from the preview bar", () => {
    // Given a previewed closed tab
    createTab("Alpha", "alpha_query;")
    closeFromPanel("Alpha")
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
    cy.getByDataHook("tabs-panel-closed").should("contain", "No closed tabs")
  })

  it("reopens a closed tab as the last open tab", () => {
    // Given two extra tabs, the first one closed
    createTab("Alpha", "select 1;")
    createTab("Beta", "select 2;")
    closeFromPanel("Alpha")

    // When the user reopens it from its row
    closedRow("Alpha").find('[data-hook="tabs-panel-reopen"]').click()

    // Then it is active and placed after the other open tabs
    cy.getEditorTabByTitle("Alpha")
      .should("not.have.class", "temporary-tab")
      .should("have.attr", "active")
    cy.getEditorTabs().last().should("have.attr", "data-tab-title", "Alpha")
    cy.getByDataHook("tabs-panel-open-list")
      .find(ROW)
      .last()
      .should("contain", "Alpha")
    cy.getByDataHook("tabs-panel-closed").should("contain", "No closed tabs")
  })

  it("deletes open and closed tabs from their rows", () => {
    // Given one closed tab and one extra open tab
    createTab("Alpha", "select 1;")
    closeFromPanel("Alpha")
    createTab("Beta", "select 2;")

    // When the user deletes the closed tab
    closedRow("Alpha").find('[data-hook="tabs-panel-delete"]').click()

    // Then it is gone for good
    cy.getByDataHook("tabs-panel-closed").should("contain", "No closed tabs")

    // When the user deletes the open tab
    openRow("Beta").find('[data-hook="tabs-panel-delete"]').click()

    // Then it is gone from the tab bar and is not listed as closed
    cy.getEditorTabByTitle("Beta").should("not.exist")
    cy.getByDataHook("tabs-panel-open").should("contain", "1 tab")
    cy.getByDataHook("tabs-panel-closed").should("contain", "No closed tabs")
  })

  it("filters open and closed tabs by label", () => {
    // Given an open "Alpha", an open "Beta" and a closed "Gamma"
    createTab("Alpha", "select 1;")
    createTab("Beta", "select 2;")
    createTab("Gamma", "select 3;")
    closeFromPanel("Gamma")

    // When the user filters by part of a label, in another case
    cy.getByDataHook("tabs-panel-filter").type("alp")

    // Then only matching rows are listed
    cy.getByDataHook("tabs-panel-open-list").find(ROW).should("have.length", 1)
    openRow("Alpha").should("be.visible")
    cy.getByDataHook("tabs-panel-closed").should(
      "contain",
      "No closed tabs match",
    )

    // When nothing matches
    cy.getByDataHook("tabs-panel-filter").clear().type("zzz")

    // Then both sections say so, and "Delete all" still reflects all closed tabs
    cy.getByDataHook("tabs-panel-open").should("contain", "No open tabs match")
    cy.getByDataHook("tabs-panel-clear-history").should("be.visible")

    // When the user clears the filter
    cy.getByDataHook("tabs-panel-filter-clear").click()

    // Then every tab is listed again
    cy.getByDataHook("tabs-panel-filter").should("have.value", "")
    cy.getByDataHook("tabs-panel-open-list").find(ROW).should("have.length", 3)
    closedRow("Gamma").should("be.visible")
  })

  it("collapses and expands a section from its header", () => {
    // Given a closed tab
    createTab("Alpha", "select 1;")
    closeFromPanel("Alpha")

    // When the user clicks the Closed header
    cy.getByDataHook("tabs-panel-closed")
      .find('[role="button"][aria-expanded]')
      .first()
      .click()

    // Then the list is hidden, and shown again on a second click
    cy.getByDataHook("tabs-panel-closed-list").should("not.exist")
    cy.getByDataHook("tabs-panel-closed")
      .find('[role="button"][aria-expanded="false"]')
      .click()
    closedRow("Alpha").should("be.visible")
  })

  it("deletes all closed tabs only after confirmation", () => {
    // Given two closed tabs
    createTab("Alpha", "select 1;")
    createTab("Beta", "select 2;")
    closeFromPanel("Alpha")
    closeFromPanel("Beta")

    // When the user asks to delete all and then keeps them
    cy.getByDataHook("tabs-panel-clear-history").click()
    cy.getByDataHook("clear-history-dialog")
      .should("be.visible")
      .should("contain", "This deletes 2 closed tabs")
    cy.getByDataHook("clear-history-dismiss").click()

    // Then nothing is deleted
    cy.getByDataHook("clear-history-dialog").should("not.exist")
    cy.getByDataHook("tabs-panel-closed-list")
      .find(ROW)
      .should("have.length", 2)

    // When the user confirms
    cy.getByDataHook("tabs-panel-clear-history").click()
    cy.getByDataHook("clear-history-confirm").click()

    // Then the closed tabs are gone and the open tab is untouched
    cy.getByDataHook("clear-history-dialog").should("not.exist")
    cy.getByDataHook("tabs-panel-closed").should("contain", "No closed tabs")
    cy.getByDataHook("tabs-panel-clear-history").should("not.exist")
    cy.getEditorTabByTitle("SQL").should("have.attr", "active")
  })

  it("keeps closed tabs after a reload", () => {
    // Given a closed tab
    createTab("Alpha", "select 1;")
    closeFromPanel("Alpha")

    // When the page reloads
    cy.reload()
    cy.getEditorContent().should("be.visible")
    openTabsPanel()

    // Then the tab is still listed as closed and not open
    closedRow("Alpha").should("be.visible")
    cy.getByDataHook("tabs-panel-open-list").should("not.contain", "Alpha")
    cy.getEditorTabByTitle("Alpha").should("not.exist")
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
})
