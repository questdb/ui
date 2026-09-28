/// <reference types="cypress" />

// Cell controls that only a real browser exercises: the keyboard pane resize
// and the Stop control of a first run or first chart fetch.

const HELD_QUERY = /\/exec\?.*long_sequence/
const CHART_SQL =
  "select timestamp_sequence(0, 1000000) ts, x from long_sequence(50)"

const setCellSql = (sql) => {
  cy.focusNotebookCell()
  cy.withFocusedEditor((editor) => editor.setValue(sql))
}

const runFocusedCell = () =>
  cy.withFocusedEditor((editor) => editor.getAction("notebook-run").run())

const editorSeparator = () =>
  cy.get('[role="separator"][aria-label="Resize editor pane"]')

const valueNow = ($separator) => Number($separator.attr("aria-valuenow"))

const readStoredEditorHeight = (win) =>
  new Cypress.Promise((resolve, reject) => {
    const openRequest = win.indexedDB.open("web-console")
    openRequest.onerror = () => reject(openRequest.error)
    openRequest.onsuccess = () => {
      const database = openRequest.result
      const fail = (error) => {
        database.close()
        reject(error)
      }
      const transaction = database.transaction(
        ["editor_settings", "buffers"],
        "readonly",
      )
      const activeBufferRequest = transaction
        .objectStore("editor_settings")
        .index("key")
        .get("activeBufferId")
      activeBufferRequest.onerror = () => fail(activeBufferRequest.error)
      activeBufferRequest.onsuccess = () => {
        const bufferRequest = transaction
          .objectStore("buffers")
          .get(activeBufferRequest.result?.value)
        bufferRequest.onerror = () => fail(bufferRequest.error)
        bufferRequest.onsuccess = () => {
          database.close()
          resolve(bufferRequest.result?.notebookViewState?.cells[0]?.topHeight)
        }
      }
    }
  })

// The notebook writes a resize to IndexedDB after a debounce; polling the
// stored value is the only signal that the write landed.
const waitForStoredEditorHeight = (height) =>
  cy.window().then((win) => {
    const deadline = Date.now() + 8000
    const poll = () =>
      readStoredEditorHeight(win).then((stored) => {
        if (stored === height) return
        if (Date.now() > deadline) {
          throw new Error(`stored editor height is ${stored}, not ${height}`)
        }
        return Cypress.Promise.delay(100).then(poll)
      })
    return poll()
  })

// Holds the first matching request open until the test releases it, so the
// cell stays in its first run while the test drives the Stop control. The
// release must follow within Cypress's command timeout, or the held handler
// itself fails the test.
const holdFirstExec = () => {
  const held = {}
  cy.intercept(
    { url: HELD_QUERY, times: 1 },
    () =>
      new Cypress.Promise((resolve) => {
        held.release = resolve
      }),
  )
  return held
}

const awaitHeld = (held) =>
  cy.wrap(null).should(() => {
    expect(held.release, "the exec request is held").to.be.a("function")
  })

const clickStop = (label) => {
  cy.getByDataHook("cell-stop-button")
    .should("have.attr", "aria-label", label)
    .click()
}

describe("notebook cell controls", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
    cy.createNotebook()
  })

  context("keyboard resize", () => {
    it("stores the height on key release and keeps it across a reload", () => {
      // Given a cell whose result splits it into an editor and a result pane
      setCellSql("select 1")
      runFocusedCell()
      editorSeparator().should("have.attr", "aria-valuenow")
      let before
      editorSeparator().then(($separator) => {
        before = valueNow($separator)
      })

      // When the editor pane is grown by three keyboard steps
      editorSeparator().focus()
      cy.realPress("ArrowDown")
      cy.realPress("ArrowDown")
      cy.realPress("ArrowDown")

      // Then the pane follows the keys and the release stores the height
      editorSeparator().should(($grown) => {
        expect(valueNow($grown)).to.eq(before + 30)
      })
      cy.then(() => waitForStoredEditorHeight(before + 30))

      // And the stored height survives a reload
      cy.reload()
      editorSeparator().should(($restored) => {
        expect(valueNow($restored)).to.eq(before + 30)
      })
    })
  })

  context("Stop", () => {
    it("cancels a first run and reports it in the result", () => {
      // Given a cell whose first run the server has not answered yet
      const held = holdFirstExec()
      setCellSql("select x from long_sequence(100)")
      runFocusedCell()
      awaitHeld(held)

      // When the run is stopped
      clickStop("Stop run")
      cy.then(() => held.release())

      // Then the result reports the cancelled run and Stop is gone
      cy.get("[data-notebook-cell]")
        .contains("Cancelled by user")
        .should("be.visible")
      cy.getByDataHook("cell-stop-button").should("not.exist")
    })

    it("cancels a first chart fetch and retries it", () => {
      // Given a draw cell whose first fetch the server has not answered yet
      const held = holdFirstExec()
      setCellSql(CHART_SQL)
      cy.get("[data-notebook-cell] button[aria-label='Draw']").click()
      awaitHeld(held)

      // When the fetch is stopped
      clickStop("Stop chart loading")
      cy.then(() => held.release())

      // Then the canvas offers a retry instead of a spinner
      cy.getByDataHook("draw-canvas-cancelled").should("be.visible")
      cy.getByDataHook("cell-stop-button").should("not.exist")

      // When the fetch is retried, the chart loads from an unheld request
      cy.getByDataHook("draw-canvas-retry").click()
      cy.getByDataHook("draw-canvas-cancelled").should("not.exist")
      cy.getByDataHook("draw-canvas").find("canvas").should("be.visible")
    })
  })
})
