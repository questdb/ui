/// <reference types="cypress" />

// Escape typed in a real Monaco editor: the editor prevents the default of
// every Escape, so these cover what unit tests can only fake.

const { createNotebookBuffer } = require("../utils/editorBuffers")
const { getOpenAIConfiguredSettings } = require("../utils/aiAssistant")

const queryActivity = () => cy.getByDataHook("query-activity-drawer")

const focusSqlEditor = (value) => {
  cy.window().then((win) => {
    const editor = win.monaco.editor.getEditors()[0]
    editor.setValue(value)
    editor.setPosition({ lineNumber: 1, column: value.length + 1 })
    editor.focus()
  })
}

describe("Escape in a Monaco editor", () => {
  it("closes a side panel from the SQL editor once no editor widget uses it", () => {
    // Given Query Activity is open and the editor's suggestions are showing
    cy.loadConsoleWithAuth()
    cy.getByDataHook("query-activity-toggle-button").click()
    queryActivity().should("be.visible")
    focusSqlEditor("sel")
    cy.realPress(["Control", " "])
    cy.get(".monaco-editor .suggest-widget.visible").should("exist")

    // When Escape is pressed
    cy.realPress("Escape")

    // Then the suggestions close and the panel stays
    cy.get(".monaco-editor .suggest-widget.visible").should("not.exist")
    queryActivity().should("be.visible")

    // When it is pressed again
    cy.realPress("Escape")

    // Then the panel closes
    queryActivity().should("not.exist")
  })

  it("clears a notebook cell's focus from its editor", () => {
    // Given a notebook cell whose editor has the focus
    cy.loadConsoleWithAuth(
      false,
      {},
      { buffers: [createNotebookBuffer("select 1")] },
    )
    cy.focusNotebookCell()

    // When Escape is pressed
    cy.realPress("Escape")

    // Then the cell lets go of the focus
    cy.document().should((doc) => {
      expect(doc.activeElement?.closest("[data-notebook-cell]")).to.equal(null)
    })
  })

  it("rejects a pending AI suggestion from the diff editor", () => {
    // Given the current suggestion opened as a diff in the editor
    cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings(), {
      conversations: [
        {
          conversationName: "Suggestions",
          currentSQL: "SELECT 2;",
          messages: [
            { role: "user", content: "First query" },
            {
              role: "assistant",
              content: "First simple query.",
              sql: "SELECT 1;",
              previousSQL: "",
            },
            { role: "user", content: "Second query" },
            {
              role: "assistant",
              content: "Second simple query.",
              sql: "SELECT 2;",
              previousSQL: "",
            },
          ],
        },
      ],
    })
    cy.getByDataHook("ai-chat-button").click()
    cy.getByDataHook("chat-window-title").should("contain", "Suggestions")
    cy.getByDataHook("inline-diff-container")
      .eq(1)
      .find('[data-hook="ai-open-in-editor-button"]')
      // Revealed on hover.
      .click({ force: true })
    cy.getByDataHook("diff-reject-button").should("be.visible")

    // When Escape is pressed with the focus in the diff editor
    cy.getByDataHook("diff-editor-container").then(($container) =>
      cy.window().then((win) =>
        win.monaco.editor
          .getDiffEditors()
          .find((editor) =>
            $container[0].contains(editor.getContainerDomNode()),
          )
          .getModifiedEditor()
          .focus(),
      ),
    )
    cy.focused().should("have.class", "inputarea")
    cy.realPress("Escape")

    // Then the suggestion is rejected and the chat stays open
    cy.getByDataHook("diff-reject-button").should("not.exist")
    cy.getByDataHook("ai-chat-window").should("be.visible")
  })
})

describe("result toolbar notebook action", () => {
  it("shortens its label as the toolbar narrows", () => {
    // Given a result in a wide window
    cy.viewport(1600, 900)
    cy.loadConsoleWithAuth()
    cy.typeQueryDirectly("select x from long_sequence(3)")
    cy.clickRunQuery()
    cy.getByDataHook("result-add-notebook").should(
      "have.text",
      "Add query to notebook",
    )

    // When the window narrows
    cy.viewport(700, 900)

    // Then a shorter label, or only the icon, is left, named by the full label
    cy.getByDataHook("result-add-notebook")
      .should("not.contain.text", "Add query to notebook")
      .and("have.attr", "aria-label", "Add query to notebook")
  })
})
