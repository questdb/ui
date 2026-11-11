/// <reference types="cypress" />

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl =
  Cypress.config("baseUrl") || `http://localhost:9999${contextPath}`
const editorExecution = { url: "**/exec*", query: { explain: "true" } }

const { ctrlOrCmd } = require("../utils")
const { createNotebookBuffer } = require("../utils/editorBuffers")

const loadEditorWithQuery = (value) =>
  cy.loadConsoleWithAuth(false, {}, { buffers: [{ value }] })

const focusEditor = () => {
  cy.window().then((win) => win.monaco.editor.getEditors()[0].focus())
  return cy.getEditorContent().should("have.focus")
}

const holdNextExecution = () => {
  let release
  cy.intercept(
    { ...editorExecution, times: 1 },
    () =>
      new Cypress.Promise((resolve) => {
        release = resolve
      }),
  )
  return () => {
    cy.wrap(null).should(() => expect(release).to.be.a("function"))
    cy.then(() => release())
  }
}

const getTabDragHandleByTitle = (title) =>
  `.chrome-tab[data-tab-title="${title}"] .chrome-tab-drag-handle`

describe("run query", () => {
  it("should run the correct query when there are multiple queries in the same line", () => {
    // Given
    const first =
      "with longseq as (\nselect * from long_sequence(100)\n-- comment\n) select count(*) from longseq"
    loadEditorWithQuery(first + ";select 1;")
    cy.intercept(editorExecution).as("cursorQuery")
    const firstEnd = ") select count(*) from longseq".length + 1
    for (const [column, sql, value] of [
      [firstEnd + 10, "select 1", "1"],
      [firstEnd + 4, "select 1", "1"],
      [firstEnd, first, "100"],
      [firstEnd - 2, first, "100"],
    ]) {
      // When
      cy.window().then((win) => {
        const editor = win.monaco.editor.getEditors()[0]
        editor.setPosition({ lineNumber: 4, column })
        editor.focus()
      })
      cy.focused().type(ctrlOrCmd + "{enter}")
      // Then
      cy.wait("@cursorQuery").its("request.query.query").should("eq", sql)
      cy.getByDataHook("button-cancel-query").should("not.exist")
      cy.getGridRow(0).should("contain", value)
      cy.window().should((win) => {
        const position = win.monaco.editor.getEditors()[0].getPosition()
        expect(position.lineNumber).to.eq(4)
        expect(position.column).to.eq(column)
      })
    }
  })
})

describe("run query with selection", () => {
  it("should correctly identify and run selected queries", () => {
    // Given
    cy.loadConsoleWithAuth()
    cy.intercept(editorExecution).as("selectionQuery")
    cy.getByDataHook("button-run-query").should("be.disabled")

    // When
    cy.typeQueryDirectly("select 11;select 22;select 33;")
    cy.clickRunIconInLine(1)
    cy.getByDataHook("dropdown-item-run-query-1").click()
    cy.wait("@selectionQuery")
      .its("request.query.query")
      .should("eq", "select 22")
    cy.getGridRow(0).should("contain", "22")
    cy.selectRange({ lineNumber: 1, column: 31 }, { lineNumber: 1, column: 31 })
    // Then
    cy.getByDataHook("button-run-query").should("contain", "Run query")

    // When
    cy.clickRunQuery()
    cy.wait("@selectionQuery")
      .its("request.query.query")
      .should("eq", "select 33")
    cy.getGridRow(0).should("contain", "33")
    // Then
    cy.getByDataHook("success-notification").should("contain", "select 33")

    // When
    cy.selectRange({ lineNumber: 1, column: 1 }, { lineNumber: 1, column: 9 })
    // Then
    cy.getByDataHook("button-run-query").should("contain", "Run selected query")

    // When
    cy.clickRunQuery()
    cy.wait("@selectionQuery")
      .its("request.query.query")
      .should("eq", "select 1")
    cy.getGridRow(0).should("contain", "1")
    // Then
    cy.getByDataHook("success-notification").should("contain", "select 1")

    // When
    cy.selectRange({ lineNumber: 1, column: 1 }, { lineNumber: 1, column: 10 })
    // Then
    cy.getByDataHook("button-run-query").should("contain", "Run selected query")

    // When
    cy.clickRunQuery()
    cy.wait("@selectionQuery")
      .its("request.query.query")
      .should("eq", "select 11")
    cy.getGridRow(0).should("contain", "11")
    // Then
    cy.getByDataHook("success-notification").should("contain", "select 11")

    // When
    cy.selectRange({ lineNumber: 1, column: 1 }, { lineNumber: 1, column: 19 })
    // Then
    cy.getByDataHook("button-run-query").should(
      "contain",
      "Run selected queries",
    )

    // When
    cy.clickRunQuery()
    cy.wait("@selectionQuery")
      .its("request.query.query")
      .should("eq", "select 11")
    cy.wait("@selectionQuery")
      .its("request.query.query")
      .should("eq", "select 2")
    cy.getGridRow(0).should("contain", "2")
    // Then
    cy.getByDataHook("success-notification")
      .invoke("text")
      .should(
        "match",
        /Running completed in \d+ms with\s+2 successful\s+queries/,
      )

    // When
    cy.expandNotifications()
    // Then
    cy.getExpandedNotifications().should("contain", "select 11")
    cy.getExpandedNotifications().should("contain", "select 2")
  })

  it("runs and explains selected SQL from its statement's glyph", () => {
    // Given
    const query = "select md5(concat('1', x)) as md from long_sequence(100)"
    loadEditorWithQuery(`select 1;\ncreate table unused as (\n${query}\n);`)
    cy.intercept(editorExecution).as("selectedGlyphQuery")
    cy.selectRange(
      { lineNumber: 3, column: 1 },
      { lineNumber: 3, column: query.length + 1 },
    )
    cy.getByDataHook("button-run-query").should("contain", "Run selected query")
    // When
    cy.openRunDropdownInLine(2)
    cy.getByDataHook("dropdown-item-run-query")
      .should("contain", "select md5")
      .click()
    // Then
    cy.wait("@selectedGlyphQuery")
      .its("request.query.query")
      .should("eq", query)
    cy.getByDataHook("button-cancel-query").should("not.exist")
    cy.getColumnName(0).should("contain", "md")
    cy.getGridRow(0).should("contain", "6512bd43d9caa6e02c990b0a82652dca")
    // When
    cy.openRunDropdownInLine(2)
    cy.getByDataHook("dropdown-item-get-query-plan")
      .should("contain", "select md5")
      .click()
    // Then
    cy.wait("@selectedGlyphQuery")
      .its("request.query.query")
      .should("eq", "EXPLAIN " + query)
    cy.getColumnName(0).should("contain", "QUERY PLAN")
    cy.getGridRow(0).should("not.be.empty")
  })

  it("should cancel the running query without opening the run-all modal when all queries are selected", () => {
    // Given a single query is running
    loadEditorWithQuery("select 1;\nselect 2;\nselect 3;")
    const requests = []
    cy.intercept({ ...editorExecution, middleware: true }, (req) => {
      requests.push(req.query.query)
    })
    const release = holdNextExecution()
    cy.clickLine(1)
    cy.getByDataHook("button-run-query").should("contain", "Run query").click()
    cy.getByDataHook("button-cancel-query").should("be.visible")

    // When the user selects all queries while busy, then clicks Cancel
    cy.selectQueries({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 3,
      endColumn: 10,
    })
    cy.getByDataHook("button-cancel-query").should("be.visible").click()

    // Then the query is cancelled, with no run-all modal
    cy.getByRoleAttribute("dialog").should("not.exist")
    cy.getByDataHook("run-all-queries-confirm").should("not.exist")
    cy.getByDataHook("button-run-query").should("be.visible")
    cy.expandNotifications()
    cy.getExpandedNotifications().should("contain", "Cancelled by user")

    release()
    cy.wrap(requests).should("deep.eq", ["select 1"])
    cy.getByDataHook("button-cancel-query").should("not.exist")
    cy.getByDataHook("success-notification").should("not.exist")
  })

  it("should run only the selected queries (not all) when starting a run while a query is busy", () => {
    // Given a single query is running
    loadEditorWithQuery("select 1;\nselect 2;\nselect 3;")
    const requests = []
    cy.intercept({ ...editorExecution, middleware: true }, (req) => {
      requests.push(req.query.query)
    })
    const release = holdNextExecution()
    cy.clickLine(1)
    cy.getByDataHook("button-run-query").should("contain", "Run query").click()
    cy.getByDataHook("button-cancel-query").should("be.visible")

    // When the user selects a strict subset (queries 1-2, not 3) while busy,
    // then triggers a run
    cy.selectQueries({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 2,
      endColumn: 10,
    })
    cy.getByDataHook("button-cancel-query").should("be.visible")
    cy.focused().type(`${ctrlOrCmd}{enter}`)

    // Then the modal is for the selection (2 queries), not "run all"
    cy.getByRoleAttribute("dialog").should("be.visible")
    cy.getByRoleAttribute("dialog").should("contain", "Run selected queries")
    cy.getByRoleAttribute("dialog").should("contain", "2 selected queries")
    cy.getByDataHook("run-all-queries-warning").should(
      "contain",
      "Current query execution will be aborted",
    )
    // And the stop-after-failure option is not offered for selection runs
    cy.getByDataHook("stop-after-failure-checkbox").should("not.exist")

    // When the user confirms
    cy.getByDataHook("run-all-queries-confirm").click()
    release()

    // Then the running query is cancelled and exactly the 2 selected queries run
    cy.expandNotifications()
    cy.getExpandedNotifications().should("contain", "Cancelled by user")
    cy.contains('[data-hook="success-notification"]', "Running completed", {
      timeout: 20000,
    })
      .invoke("text")
      .should("match", /Running completed in .+ with\s+2 successful\s+queries/)

    cy.wrap(requests).should("deep.eq", ["select 1", "select 1", "select 2"])
    cy.getByDataHook("button-cancel-query").should("not.exist")
    cy.getGridRow(0).should("contain", "2")
  })

  it("should queue selected queries when starting a run while a script is busy", () => {
    // Given a script is running
    loadEditorWithQuery("select 1;\nselect 2;\nselect 3;")
    const requests = []
    cy.intercept({ ...editorExecution, middleware: true }, (req) => {
      requests.push(req.query.query)
    })
    const release = holdNextExecution()
    cy.clickRunScript()
    cy.getByDataHook("loading-notification").should(
      "contain",
      'Running query "select 1"',
    )

    // When a strict subset is selected and run with the primary shortcut
    cy.selectQueries({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 2,
      endColumn: 10,
    })
    cy.focused().type(`${ctrlOrCmd}{enter}`)

    // Then the selected run is queued for confirmation instead of discarded
    cy.getByRoleAttribute("dialog").should("be.visible")
    cy.getByRoleAttribute("dialog").should("contain", "Run selected queries")
    cy.getByRoleAttribute("dialog").should("contain", "2 selected queries")

    // When confirmed, the active script is cancelled and the selection runs
    cy.getByDataHook("run-all-queries-confirm").click()
    release()
    cy.contains('[data-hook="success-notification"]', "Running completed", {
      timeout: 20000,
    })
      .invoke("text")
      .should("match", /Running completed in .+ with\s+2 successful\s+queries/)

    cy.wrap(requests).should("deep.eq", ["select 1", "select 1", "select 2"])
    cy.getByDataHook("button-cancel-query").should("not.exist")
    cy.getGridRow(0).should("contain", "2")
  })
})

describe("run all queries in tab", () => {
  it("should run all queries in tab", () => {
    // Given
    cy.execAdminQuery("DROP TABLE IF EXISTS e2e_editor_run_all")
    const statements = [
      "select 1",
      "select 2",
      "select 3",
      "create table e2e_editor_run_all as (select x from long_sequence(1))",
      "drop table e2e_editor_run_all",
      "drop table e2e_editor_run_all",
      "select 4",
    ]
    loadEditorWithQuery(statements.join(";\n") + ";\n; ;;")
    const requests = []
    cy.intercept({ ...editorExecution, middleware: true }, (req) => {
      requests.push(req.query.query)
    })
    cy.clickLine(1)
    // When
    cy.clickRunScript()
    // Then
    cy.getByDataHook("error-notification")
      .should("contain", "Stopped after running")
      .and("contain", "5 successful")
      .and("contain", "1 failed")
    cy.wrap(requests).should("deep.eq", statements.slice(0, 6))
    cy.window().should((win) => {
      const position = win.monaco.editor.getEditors()[0].getPosition()
      expect(position.lineNumber).to.eq(6)
      expect(position.column).to.eq(1)
    })
    cy.getErrorIcons().should("have.length", 1)
    cy.getCursorQueryGlyph().should("have.length", 7)
    // When
    cy.then(() => {
      requests.length = 0
    })
    cy.clickRunScript(true)
    // Then
    cy.getByDataHook("success-notification")
      .should("contain", "Running completed")
      .and("contain", "6 successful")
      .and("contain", "1 failed")
    cy.wrap(requests).should("deep.eq", statements)
    cy.getSuccessIcons().should("have.length", 6)
    cy.getErrorIcons().should("have.length", 1)
    cy.clickLine(6)
    cy.getByDataHook("error-notification")
      .should("contain", "table does not exist")
      .and("contain", "drop table e2e_editor_run_all")
    cy.expandNotifications()
    cy.getExpandedNotifications().should("contain", "select 4")
  })

  it("should scroll to the running query and show the loading notification", () => {
    // Given
    const sql =
      "select 1;\n\n\n\n\n\n\n\n\nselect 2;\n\n\n\n\n\n\n\n\nselect 3;"
    loadEditorWithQuery(sql)
    cy.clickLine(1)
    let initialPosition
    cy.window().then((win) => {
      initialPosition = win.monaco.editor.getEditors()[0].getPosition()
    })
    const releases = {}
    cy.intercept(
      editorExecution,
      (req) =>
        new Cypress.Promise((resolve) => {
          releases[req.query.query] = resolve
        }),
    )
    // When
    cy.clickRunScript()
    for (const [query, line] of [
      ["select 1", 1],
      ["select 2", 10],
      ["select 3", 19],
    ]) {
      // Then
      cy.getByDataHook("loading-notification").should(
        "contain",
        'Running query "' + query + '"',
      )
      cy.getRunIconInLine(line).should("be.visible")
      if (line === 1) {
        cy.window().then((win) => win.monaco.editor.getEditors()[0].focus())
        cy.focused().type("should not be inserted")
        cy.window().should((win) =>
          expect(win.monaco.editor.getEditors()[0].getValue()).to.eq(sql),
        )
      }
      cy.wrap(null).should(() => expect(releases[query]).to.be.a("function"))
      cy.then(() => releases[query]())
    }
    cy.getByDataHook("success-notification").should("contain", "3 successful")
    cy.window().should((win) => {
      const position = win.monaco.editor.getEditors()[0].getPosition()
      expect(position.lineNumber).to.eq(initialPosition.lineNumber)
      expect(position.column).to.eq(initialPosition.column)
    })
    // When
    cy.typeQuery("-- editing restored")
    // Then
    cy.window().should((win) =>
      expect(win.monaco.editor.getEditors()[0].getValue()).to.contain(
        "-- editing restored",
      ),
    )
  })
})

describe("&query URL param", () => {
  it("should open single line query in a new tab and select it", () => {
    const query = encodeURIComponent("select x+1 from long_sequence(1)")
    cy.loadConsoleWithAuth(
      false,
      {},
      {
        buffers: [{ value: "select x from long_sequence(1)" }],
        url: `${baseUrl}/?query=${query}&executeQuery=true`,
      },
    )
    cy.getEditor().should("be.visible")
    cy.getEditorTabByTitle("Shared Query")
      .should("be.visible")
      .should("have.attr", "active")
    cy.getEditorContent().should(
      "have.value",
      "select x+1 from long_sequence(1)",
    )
    cy.getGridRow(0).should("contain", "2")
    cy.getSelectedLines().should("have.length", 1)

    cy.waitForActiveBufferValue("select x+1 from long_sequence(1)")
    let tabId
    cy.getEditorTabByTitle("Shared Query")
      .invoke("attr", "data-tab-id")
      .then((id) => {
        tabId = id
      })
    cy.visit(baseUrl + "/?query=" + query + "&executeQuery=true")
    cy.getEditorTabs().should("have.length", 2)
    cy.getEditorTabByTitle("Shared Query").should((tab) =>
      expect(tab.attr("data-tab-id")).to.eq(tabId),
    )
    cy.window().should((win) => {
      const editor = win.monaco.editor.getEditors()[0]
      expect(editor.getModel().getValueInRange(editor.getSelection())).to.eq(
        "select x+1 from long_sequence(1)",
      )
    })
    cy.getGridRow(0).should("contain", "2")
  })

  it("should open a new editor tab when the last active buffer is a metrics buffer", () => {
    // Given
    const query = encodeURIComponent("select x from long_sequence(1)")

    // When
    cy.loadConsoleWithAuth(
      false,
      {},
      {
        buffers: [{}, { label: "Metrics 1", metricsViewState: {} }],
        url: `${baseUrl}?query=${query}`,
      },
    )

    // Then
    cy.getEditor().should("be.visible")
    cy.getEditorTabs().should("have.length", 3)
    cy.getEditorTabByTitle("Metrics 1").should("be.visible")
    cy.getEditorTabByTitle("Shared Query")
      .should("be.visible")
      .should("have.attr", "active")

    cy.getEditorContent().should("have.value", "select x from long_sequence(1)")
    cy.clickRunQuery()
    cy.getGridRow(0).should("contain", "1")
  })

  it("should lock editor and show confirmation dialog for DML mixed with SELECT, then run on confirm", () => {
    // Given
    const tableName = "share_link_a1"
    cy.execAdminQuery(`DROP TABLE IF EXISTS ${tableName}`)
    cy.execAdminQuery(`CREATE TABLE ${tableName} (val INT)`)
    cy.execAdminQuery(`INSERT INTO ${tableName} VALUES (1)`)
    const validationReleases = []
    cy.intercept(
      "/api/v1/sql/validate*",
      (req) =>
        new Cypress.Promise((resolve) => {
          validationReleases.push(() => {
            req.reply({
              body: req.query.query.startsWith("UPDATE")
                ? { queryType: "UPDATE" }
                : { columns: [], timestamp: -1 },
            })
            resolve()
          })
        }),
    )
    const requests = []
    cy.intercept({ ...editorExecution, middleware: true }, (req) => {
      if (req.query.query.includes(tableName)) requests.push(req.query.query)
    })
    const query = `UPDATE ${tableName} SET val=999; SELECT val FROM ${tableName}`

    // When
    cy.loadConsoleWithAuth(
      false,
      {},
      {
        url: `${baseUrl}?query=${encodeURIComponent(query)}&executeQuery=true`,
      },
    )

    // Then
    cy.getByDataHook("editor-tabs-disabled").should("be.visible")
    cy.window().then((win) => {
      expect(win.monaco.editor.getEditors()[0].getRawOptions().readOnly).to.eq(
        true,
      )
    })
    cy.getByDataHook("success-notification").should("not.exist")

    // When
    cy.wrap(null).should(() =>
      expect(validationReleases.length).to.be.greaterThan(0),
    )
    cy.then(() => validationReleases.forEach((release) => release()))
    cy.getByDataHook("share-link-confirmation-dialog").should("be.visible")
    cy.wrap(requests).should("have.length", 0)

    // Then
    cy.getByDataHook("editor-tabs").should("be.visible")
    cy.window().then((win) => {
      expect(win.monaco.editor.getEditors()[0].getRawOptions().readOnly).to.eq(
        false,
      )
    })

    // When
    cy.getByDataHook("share-link-confirmation-confirm").click()

    // Then
    cy.getByDataHook("success-notification")
      .invoke("text")
      .should(
        "match",
        /Running completed in \d+ms with\s+2 successful\s+queries/,
      )
    cy.execAdminQuery(`SELECT val FROM ${tableName}`)
      .its("body.dataset")
      .should("deep.eq", [[999]])
    cy.wrap(requests).should("deep.eq", [
      `UPDATE ${tableName} SET val=999`,
      `SELECT val FROM ${tableName}`,
    ])
    cy.execAdminQuery(`DROP TABLE ${tableName}`)
  })

  it("should lock editor and show confirmation dialog for DDL mixed with SELECT, then NOT run on cancel", () => {
    // Given
    const tableName = "share_link_a2"
    cy.execAdminQuery(`DROP TABLE IF EXISTS ${tableName}`)
    cy.execAdminQuery(`CREATE TABLE ${tableName} (val INT)`)
    const validationReleases = []
    cy.intercept(
      "/api/v1/sql/validate*",
      (req) =>
        new Cypress.Promise((resolve) => {
          validationReleases.push(() => {
            req.reply({
              body: req.query.query.startsWith("DROP")
                ? { queryType: "DROP" }
                : { columns: [], timestamp: -1 },
            })
            resolve()
          })
        }),
    )
    const requests = []
    cy.intercept({ ...editorExecution, middleware: true }, (req) => {
      if (req.query.query.includes(tableName)) requests.push(req.query.query)
    })
    const query = `DROP TABLE ${tableName}; SELECT 1`

    // When
    cy.loadConsoleWithAuth(
      false,
      {},
      {
        url: `${baseUrl}?query=${encodeURIComponent(query)}&executeQuery=true`,
      },
    )

    // Then
    cy.getByDataHook("editor-tabs-disabled").should("be.visible")
    cy.window().then((win) => {
      expect(win.monaco.editor.getEditors()[0].getRawOptions().readOnly).to.eq(
        true,
      )
    })

    // When
    cy.wrap(null).should(() =>
      expect(validationReleases.length).to.be.greaterThan(0),
    )
    cy.then(() => validationReleases.forEach((release) => release()))
    cy.getByDataHook("share-link-confirmation-dialog").should("be.visible")
    cy.wrap(requests).should("have.length", 0)

    // Then
    cy.getByDataHook("editor-tabs").should("be.visible")
    cy.window().then((win) => {
      expect(win.monaco.editor.getEditors()[0].getRawOptions().readOnly).to.eq(
        false,
      )
    })

    // When
    cy.getByDataHook("share-link-confirmation-cancel").click()

    // Then
    cy.getByDataHook("share-link-confirmation-dialog").should("not.exist")
    cy.getByDataHook("success-notification").should("not.exist")
    cy.execAdminQuery(`SELECT * FROM ${tableName}`)
    cy.wrap(requests).should("have.length", 0)
    cy.execAdminQuery(`DROP TABLE ${tableName}`)
  })

  it("should auto-run multiple SELECT statements without confirmation", () => {
    // Given
    const query = "SELECT 1; SELECT 2"

    // When
    const requests = []
    cy.intercept({ ...editorExecution, middleware: true }, (req) => {
      if (/^select [12]$/i.test(req.query.query)) requests.push(req.query.query)
    })
    cy.loadConsoleWithAuth(
      false,
      {},
      {
        url: `${baseUrl}?query=${encodeURIComponent(query)}&executeQuery=true`,
      },
    )

    // Then
    cy.getByDataHook("share-link-confirmation-dialog").should("not.exist")

    cy.wrap(requests).should("deep.eq", ["SELECT 1", "SELECT 2"])
    cy.getGridRow(0).should("contain", "2")
    cy.expandNotifications()
    cy.getExpandedNotifications()
      .should("contain", "SELECT 1")
      .and("contain", "SELECT 2")
  })

  it("should drop standalone executeQuery param and not auto-run buffer contents", () => {
    // Given
    const tableName = "share_link_c11"
    cy.execAdminQuery(`DROP TABLE IF EXISTS ${tableName}`)
    cy.execAdminQuery(`CREATE TABLE ${tableName} (val INT)`)

    const requests = []
    cy.intercept({ ...editorExecution, middleware: true }, (req) => {
      if (req.query.query === `DROP TABLE ${tableName}`)
        requests.push(req.query.query)
    })
    // When
    cy.loadConsoleWithAuth(
      false,
      {},
      {
        buffers: [{ value: `DROP TABLE ${tableName}` }],
        url: `${baseUrl}?executeQuery=true`,
      },
    )

    // Then
    cy.getEditor().should("be.visible")
    cy.location("search").should("not.contain", "executeQuery")
    cy.getByDataHook("share-link-confirmation-dialog").should("not.exist")
    cy.getByDataHook("success-notification").should("not.exist")
    cy.wrap(requests).should("have.length", 0)
    cy.execAdminQuery(`SELECT * FROM ${tableName}`)
    cy.execAdminQuery(`DROP TABLE ${tableName}`)
  })

  it("copies a full query from its glyph and runs the shared link", () => {
    // Given
    loadEditorWithQuery("SELECT 1;\nSELECT 2;\nSELECT 3;")
    cy.window().then((win) =>
      cy
        .stub(win.navigator.clipboard, "writeText")
        .as("clipboardWrite")
        .resolves(),
    )
    cy.selectRange({ lineNumber: 2, column: 1 }, { lineNumber: 2, column: 7 })
    // When
    cy.openRunDropdownInLine(2)
    cy.getByDataHook("dropdown-item-copy-query-link").click()
    // Then
    cy.get("@clipboardWrite")
      .should("have.been.calledOnce")
      .then((writeText) => {
        const link = writeText.lastCall.args[0]
        expect(new URL(link).searchParams.get("query")).to.eq("SELECT 2;")
        const requests = []
        cy.intercept({ ...editorExecution, middleware: true }, (req) => {
          if (/^SELECT [123]$/.test(req.query.query))
            requests.push(req.query.query)
        })
        // When
        cy.visit(link)
        // Then
        cy.getGridRow(0).should("contain", "2")
        cy.wrap(requests).should("deep.eq", ["SELECT 2"])
      })
  })
})

describe("autocomplete", () => {
  before(() => {
    const tables = {
      my_publics: "public STRING",
      my_secrets: "secret STRING",
      my_secrets2: "secret STRING",
    }
    Object.entries(tables).forEach(([table, columns]) => {
      cy.execAdminQuery(`DROP TABLE IF EXISTS ${table}`)
      cy.execAdminQuery(`CREATE TABLE ${table} (${columns})`)
    })
    cy.loadConsoleWithAuth()
  })

  beforeEach(() => {
    cy.getEditorContent().should("be.visible")
    cy.clearEditor()
  })

  it("should suggest the existing tables on 'from' clause", () => {
    // Given
    cy.execAdminQuery("INSERT INTO my_secrets VALUES ('visible')")
    // When
    cy.typeQuery("select * from ")
    // Then
    cy.getAutocomplete()
      .should("not.contain", "telemetry")
      .and("contain", "my_secrets")
      .and("contain", "my_publics")
    // When
    cy.typeQuery("my_se")
    cy.getMonacoListRow()
      .contains(/^my_secrets$/)
      .click()
    // Then
    cy.window().should((win) =>
      expect(win.monaco.editor.getEditors()[0].getValue()).to.eq(
        "select * from my_secrets ",
      ),
    )
    // When
    cy.typeQuery("where secre")
    cy.getAutocomplete().should("contain", "secret")
    cy.typeQuery("{enter}= 'visible'")
    cy.clickRunQuery()
    // Then
    cy.getGridRow(0).should("contain", "visible")
  })

  after(() => {
    ;["my_publics", "my_secrets", "my_secrets2"].forEach((table) => {
      cy.execAdminQuery(`DROP TABLE IF EXISTS ${table}`)
    })
  })
})

describe("errors", () => {
  before(() => {
    cy.loadConsoleWithAuth()
  })

  beforeEach(() => {
    cy.getEditorContent().should("be.visible")
    cy.clearEditor()
  })

  it("should mark date position as error", () => {
    const query = `select * from long_sequence(1) where cast(x as timestamp) = '2012-04-12T12:00:00A'`
    cy.typeQueryDirectly(query)
    cy.clickLine(1)
    cy.intercept(editorExecution).as("dateError")
    focusEditor().type(`${ctrlOrCmd}{enter}`)
    // Whole date string is shown as error
    cy.wait("@dateError")
      .its("response.body.position")
      .should("eq", query.indexOf("'2012"))
    cy.window().should((win) => {
      const model = win.monaco.editor.getEditors()[0].getModel()
      const markers = win.monaco.editor.getModelMarkers({
        resource: model.uri,
      })
      expect(markers).to.have.length(1)
      expect(model.getValueInRange(markers[0])).to.eq("'2012-04-12T12:00:00A'")
    })
    cy.getErrorMarker().should("be.visible")

    cy.getCollapsedNotifications().should("contain", "Invalid date")
  })

  const operators = ["+"]

  operators.forEach((char) => {
    it(`should mark operator '${char}' as error`, () => {
      const query = `select x FROM long_sequence(100 ${char} "string");`
      cy.typeQueryDirectly(query)
      cy.clickLine(1)
      cy.intercept(editorExecution).as("operatorError")
      focusEditor().type(`${ctrlOrCmd}{enter}`)
      cy.wait("@operatorError")
      cy.window().should((win) => {
        const model = win.monaco.editor.getEditors()[0].getModel()
        const markers = win.monaco.editor.getModelMarkers({
          resource: model.uri,
        })
        expect(
          markers.map((marker) => model.getValueInRange(marker)),
        ).to.deep.eq([char])
      })
      cy.getErrorMarker().should("be.visible")
      cy.clearEditor()
    })
  })
})

describe("running query with F9", () => {
  before(() => {
    cy.loadConsoleWithAuth()
  })

  beforeEach(() => {
    cy.getEditorContent().should("be.visible")
    cy.clearEditor()
  })

  it("should execute correct query, when text cursor is on query which has no semicolon", () => {
    cy.intercept(editorExecution).as("f9Query")

    cy.typeQueryDirectly("select * from long_sequence(1)")
    cy.clickLine(1)
    focusEditor()
    cy.realPress("F9")
    cy.wait("@f9Query")
      .its("request.query.query")
      .should("eq", "select * from long_sequence(1)")
    cy.getByDataHook("button-cancel-query").should("not.exist")
    cy.getGridRow(0).should("contain", "1")
    cy.typeQueryDirectly("select * from long_sequence(2);")
    cy.clickLine(1)
    focusEditor().type("{leftArrow}")
    cy.realPress("F9")
    cy.wait("@f9Query")
      .its("request.query.query")
      .should("eq", "select * from long_sequence(2)")
    cy.getByDataHook("button-cancel-query").should("not.exist")
    cy.getGridRow(1).should("contain", "2")

    cy.typeQueryDirectly(
      "long_sequence(10) where x = 3;\n\nlong_sequence(5) limit 2;",
    )
    cy.clickLine(1)
    focusEditor().type("{leftArrow}")
    cy.realPress("F9")
    cy.wait("@f9Query")
      .its("request.query.query")
      .should("eq", "long_sequence(10) where x = 3")
    cy.getByDataHook("button-cancel-query").should("not.exist")
    cy.getGridRow(0).should("contain", "3")
    cy.typeQueryDirectly(
      "long_sequence(10) where x = 3;\n\nlong_sequence(5) limit 2",
    )
    cy.clickLine(1)
    focusEditor().type("{leftArrow}")
    cy.realPress("F9")
    cy.wait("@f9Query")
      .its("request.query.query")
      .should("eq", "long_sequence(10) where x = 3")
    cy.getByDataHook("button-cancel-query").should("not.exist")
    cy.getGridRow(0).should("contain", "3")
  })
})

describe("editor tabs", () => {
  const loadTabs = (buffers) => {
    cy.loadConsoleWithAuth(false, {}, { buffers })
    cy.getEditorContent().should("be.visible")
    cy.getEditorTabs().should("be.visible")
  }

  it("should open the second empty tab on plus icon click", () => {
    loadTabs()
    cy.getEditorContent().should("have.value", "")
    cy.getEditorTabs().should("have.length", 1)
    cy.getEditorTabByTitle("SQL")
      .find(".chrome-tab-close")
      .should("not.be.visible")
    cy.addEditorTab()
    cy.get(".chrome-tab-was-just-added").should("not.exist")
    cy.getEditorTabs().should("have.length", 2)
    ;["SQL", "SQL 1"].forEach((title) => {
      cy.getEditorTabByTitle(title).should("be.visible")
      cy.getEditorTabByTitle(title).within(() => {
        cy.get(".chrome-tab-close").should("be.visible")
      })
    })

    cy.getEditorTabByTitle("SQL 1").should("have.attr", "active")
    cy.typeQueryDirectly("select 42")
    cy.waitForActiveBufferValue("select 42")
    cy.getEditorTabByTitle("SQL 1").find(".chrome-tab-drag-handle").dblclick()
    cy.get(".chrome-tab-rename:visible").type("Saved query{enter}")
    waitForSavedTabOrder(["SQL", "Saved query"])
    cy.reload()
    cy.getEditorTabs().should("have.length", 2)
    cy.getEditorTabByTitle("SQL").should("be.visible")
    cy.getEditorTabByTitle("Saved query").should("have.attr", "active")
    cy.getEditorContent().should("have.value", "select 42")
  })

  it("creates a notebook from the plus menu and runs its first cell", () => {
    // Computed in SQL, so the value appears only in the result grid
    const sql = "select concat('new_', 'notebook_ok') as probe"

    // Given a console with a single editor tab
    loadTabs()

    // When a notebook is created from the plus menu
    cy.createNotebook()

    // Then it opens in a new active tab and survives a reload
    waitForSavedTabOrder(["SQL", "Notebook 1"])
    cy.reload()
    cy.getEditorTabs().should("have.length", 2)
    cy.getEditorTabByTitle("Notebook 1").should("have.attr", "active")

    // And it holds a single empty cell that runs a query
    cy.get("[data-notebook-cell]").should("have.length", 1)
    cy.focusNotebookCell()
    cy.withFocusedEditor((editor) => {
      expect(editor.getValue()).to.eq("")
      editor.setValue(sql)
      editor.getAction("notebook-run").run()
    })
    cy.get("[data-notebook-cell]")
      .contains("new_notebook_ok")
      .should("be.visible")
  })
})

// TODO: This test is flaky because of the IndexedDB calls. Investigate the slow response time in test environment.
describe.skip("editor tabs history", () => {
  before(() => {
    cy.loadConsoleWithAuth(
      false,
      {},
      {
        buffers: [
          { label: "SQL", value: "--1" },
          { label: "SQL 1", value: "-- 1" },
          { label: "SQL 2", value: "-- 2" },
        ],
      },
    )
    cy.getEditorContent().should("be.visible")
    cy.getEditorTabs().should("be.visible")
  })

  it("should close and archive tabs", () => {
    ;["SQL 1", "SQL 2"].forEach((title) => {
      const dragHandle = getTabDragHandleByTitle(title)
      cy.get(dragHandle).click()
      cy.getEditorContent().should("be.visible")
      cy.getEditorTabByTitle(title).within(() => {
        cy.get(".chrome-tab-close").click()
      })
      cy.getEditorTabByTitle(title).should("not.exist")
      cy.wait(2000)
    })

    cy.get(".chrome-tab").should("have.length", 1)

    cy.getByDataHook("editor-tabs-history-button").click()
    cy.getByDataHook("editor-tabs-history").should("be.visible")
    cy.getByDataHook("editor-tabs-history-item").should("contain", "SQL 2")
    // Restore closed tabs. "SQL 2" should be first, as it was closed last
    cy.getByDataHook("editor-tabs-history-item").first().click()
    cy.getEditorTabByTitle("SQL 2").should("be.visible")
    cy.getByDataHook("editor-tabs-history-button").click()
    cy.getByDataHook("editor-tabs-history-item").should("have.length", 1)
    cy.getByDataHook("editor-tabs-history-item").should("not.contain", "SQL 2")
    // Clear history
    cy.getByDataHook("editor-tabs-history-clear").click()
    cy.getByDataHook("clear-history-dialog").should("be.visible")
    cy.getByDataHook("clear-history-confirm").click()
    cy.getByDataHook("clear-history-dialog").should("not.exist")
    cy.getByDataHook("editor-tabs-history-button").click()
    cy.getByDataHook("editor-tabs-history-item").should("not.exist")
  })
})

describe("handling comments", () => {
  it("should handle comprehensive edge cases: multiline comments, single line comments, quotes, and semicolons", () => {
    loadEditorWithQuery(
      "/* Comment with semicolon; and single quote ' */\n-- Line comment with quote ' and semicolon;\nSELECT 'another;test' AS col2;\n/* Multi\nline;\ncomment;\nwith ' quote */\nSELECT 1 AS col3;\nSELECT 'text'/* inline; ' */ AS col5;",
    )

    cy.intercept(editorExecution).as("commentQuery")
    cy.getCursorQueryGlyph().should("have.length", 3)
    cy.getCursorQueryDecoration().should("have.length", 0)

    cy.clickLine(2)
    cy.getCursorQueryDecoration().should("have.length", 0)

    cy.clickLine(3)
    cy.getCursorQueryDecoration().should("have.length", 1)
    cy.clickRunIconInLine(3)
    cy.wait("@commentQuery")
      .its("request.query.query")
      .should("eq", "SELECT 'another;test' AS col2")
    cy.getGridRow(0).should("contain", "another;test")
    cy.getByDataHook("success-notification").should(
      "contain",
      "SELECT 'another;test' AS col2",
    )

    cy.clickLine(4)
    cy.getCursorQueryDecoration().should("have.length", 0)

    cy.clickLine(7)
    cy.getCursorQueryDecoration().should("have.length", 0)

    cy.clickLine(8)
    cy.getCursorQueryDecoration().should("have.length", 1)
    cy.clickRunIconInLine(8)
    cy.wait("@commentQuery")
      .its("request.query.query")
      .should("eq", "SELECT 1 AS col3")
    cy.getGridRow(0).should("contain", "1")
    cy.getByDataHook("success-notification").should(
      "contain",
      "SELECT 1 AS col3",
    )

    cy.clickLine(9)
    cy.getCursorQueryDecoration().should("have.length", 1)
    cy.clickRunIconInLine(9)
    cy.wait("@commentQuery")
      .its("request.query.query")
      .should("eq", "SELECT 'text'/* inline; ' */ AS col5")
    cy.getGridRow(0).should("contain", "text")
    cy.getByDataHook("success-notification").should(
      "contain",
      "SELECT 'text'/* inline; ' */ AS col5",
    )
  })
})

describe("multiple run buttons with dynamic query log", () => {
  it("should click run icon in specific line and open dropdown", () => {
    // Given
    loadEditorWithQuery("select 1;\n\nselect 2;\n\nselect 3;")
    cy.intercept(editorExecution).as("glyphQuery")
    // When
    cy.clickRunIconInLine(1)
    // Then
    cy.wait("@glyphQuery").its("request.query.query").should("eq", "select 1")
    cy.getGridRow(0).should("contain", "1")
    // When
    cy.clickRunIconInLine(3)
    // Then
    cy.wait("@glyphQuery").its("request.query.query").should("eq", "select 2")
    cy.getGridRow(0).should("contain", "2")
    // When
    cy.openRunDropdownInLine(5)
    cy.getByDataHook("dropdown-item-get-query-plan")
      .should("contain", 'Get query plan for "select 3"')
      .click()
    // Then
    cy.wait("@glyphQuery")
      .its("request.query.query")
      .should("eq", "EXPLAIN select 3")
    cy.getColumnName(0).should("contain", "QUERY PLAN")
    cy.getGridRow(0).should("not.be.empty")
    cy.getByDataHook("success-notification").should(
      "contain",
      "EXPLAIN select 3",
    )
  })

  it("should indicate error in glyph and notification", () => {
    loadEditorWithQuery(
      "select * from non_existent_table;\n\nselect 1;\n\nselect 2;",
    )

    cy.clickRunIconInLine(3)

    cy.getByDataHook("success-notification").should("contain", "select 1")

    cy.clickRunIconInLine(5)

    cy.getByDataHook("success-notification").should("contain", "select 2")

    cy.clickRunIconInLine(1)
    cy.getByDataHook("error-notification")
      .should("contain", "table does not exist")
      .should("contain", "select * from non_existent_table")

    cy.get(".glyph-widget-1 .glyph-run-icon.error").should("be.visible")
    cy.get(".glyph-widget-3 .glyph-run-icon.success").should("be.visible")
    cy.get(".glyph-widget-5 .glyph-run-icon.success").should("be.visible")
    cy.openRunDropdownInLine(3).clickDropdownGetQueryPlan()
    cy.getByDataHook("success-notification").should(
      "contain",
      "EXPLAIN select 1",
    )

    cy.expandNotifications()
    // +1 for clear query log button
    cy.getExpandedNotifications().children().should("have.length", 5)
    ;[
      "select 1",
      "select 2",
      "select * from non_existent_table",
      "EXPLAIN select 1",
    ].forEach((notification) => {
      cy.getExpandedNotifications().should("contain", notification)
    })

    cy.collapseNotifications()

    cy.clickLine(1)
    cy.getByDataHook("error-notification").should(
      "contain",
      "table does not exist",
    )

    cy.clickLine(3)
    cy.getByDataHook("success-notification").should(
      "contain",
      "EXPLAIN select 1",
    )

    cy.clickLine(5)
    cy.getByDataHook("success-notification").should("contain", "select 2")
  })

  it("should keep execution info per tab", () => {
    // When
    loadEditorWithQuery("select 1;\nselect a;\nselect 3;")
    cy.clickRunScript(true)

    // Then
    cy.getByDataHook("success-notification")
      .invoke("text")
      .should(
        "match",
        /Running completed in \d+ms with\s+2 successful\s+and\s+1 failed\s+queries/,
      )
    cy.getSuccessIcons().should("have.length", 2)
    cy.getErrorIcons().should("have.length", 1)
    cy.getCursorQueryGlyph().should("have.length", 3)

    // When
    cy.addEditorTab()
    // Then
    cy.getEditorTabByTitle("SQL 1")
      .should("be.visible")
      .should("have.attr", "active")

    // When
    cy.typeQueryDirectly("select 1;\nselect a;\nselect 3;")
    // Then
    cy.getSuccessIcons().should("have.length", 0)
    cy.getErrorIcons().should("have.length", 0)
    cy.getCursorQueryGlyph().should("have.length", 3)

    // When
    cy.clickRunIconInLine(3)
    cy.getGridRow(0).should("contain", "3")
    cy.getByDataHook("success-notification").should("contain", "select 3")
    // Then
    cy.getSuccessIcons().should("have.length", 1)
    cy.getErrorIcons().should("have.length", 0)
    cy.getCursorQueryGlyph().should("have.length", 3)

    // When
    cy.getEditorTabByTitle("SQL").within(() => {
      cy.get(".chrome-tab-drag-handle").click()
    })
    // Then
    cy.getEditorTabByTitle("SQL").should("have.attr", "active")
    cy.getSuccessIcons().should("have.length", 2)
    cy.getErrorIcons().should("have.length", 1)
    cy.getCursorQueryGlyph().should("have.length", 3)

    cy.clickLine(2)
    cy.getByDataHook("error-notification").should("contain", "select a")
    cy.getEditorTabByTitle("SQL 1").find(".chrome-tab-drag-handle").click()
    cy.clickLine(3)
    cy.getByDataHook("success-notification").should("contain", "select 3")
    cy.getErrorIcons().should("have.length", 0)
  })
})

describe("abortion on new query execution", () => {
  beforeEach(() => {
    loadEditorWithQuery("select 1;\nselect 2;")
  })

  it("should show abort confirmation dialog when triggering new query while another is running", () => {
    // Given
    cy.typeQueryDirectly("select 1 a;\nselect 2 b;")
    let releaseOriginal
    let originalSignal
    cy.window().then((win) => cy.spy(win, "fetch").as("queryFetch"))
    cy.intercept(
      { ...editorExecution, times: 1 },
      () =>
        new Cypress.Promise((resolve) => {
          releaseOriginal = resolve
        }),
    )
    // When
    cy.clickRunIconInLine(1)
    cy.getCancelIconInLine(1).should("be.visible")
    cy.get("@queryFetch").then((fetch) => {
      const original = fetch
        .getCalls()
        .find(
          ({ args }) =>
            new URL(String(args[0]), baseUrl).searchParams.get("query") ===
            "select 1 a",
        )
      expect(original, "original SQL request").to.exist
      originalSignal = original.args[1].signal
      expect(originalSignal.aborted).to.equal(false)
    })
    cy.clickRunIconInLine(2)
    cy.getByDataHook("abort-confirmation-dialog-confirm").click()
    // Then
    cy.getByDataHook("success-notification").should("contain", "select 2 b")
    cy.getColumnName(0).should("contain", "b")
    cy.getGridRow(0).should("contain", "2")
    cy.then(() =>
      expect(originalSignal.aborted, "superseded SQL request aborted").to.equal(
        true,
      ),
    )
    cy.wrap(null).should(() => expect(releaseOriginal).to.be.a("function"))
    // When
    cy.then(() => releaseOriginal())
    // Then
    cy.getByDataHook("button-cancel-query").should("not.exist")
    cy.expandNotifications()
    cy.getExpandedNotifications()
      .should("contain", "Cancelled by user")
      .and("contain", "select 1 a")
    cy.getExpandedNotifications()
      .find('[data-hook="success-notification"]')
      .should("not.contain", "select 1 a")
    cy.getColumnName(0).should("contain", "b")
  })

  it("should run new query after original completes while abort dialog is open", () => {
    const release = holdNextExecution()

    // When
    cy.clickRunIconInLine(1)

    // Then
    cy.getCancelIconInLine(1).should("be.visible")

    // When
    cy.clickRunIconInLine(2)

    // Then
    cy.getByDataHook("abort-confirmation-dialog").should("be.visible")

    // When
    release()
    cy.getByDataHook("success-notification").should("contain", "select 1")
    cy.getGridRow(0).should("contain", "1")

    // Then
    cy.getByDataHook("success-notification").should("contain", "select 1")

    // When
    cy.getByDataHook("abort-confirmation-dialog-confirm").click()

    // Then
    cy.getByDataHook("success-notification").should("contain", "select 2")
    cy.clickLine(1)
    cy.getByDataHook("success-notification").should("contain", "select 1")
    cy.clickLine(2)
    cy.getByDataHook("success-notification").should("contain", "select 2")

    cy.getGridRow(0).should("contain", "2")
    cy.getByDataHook("button-cancel-query").should("not.exist")
    cy.expandNotifications()
    cy.getExpandedNotifications().should("not.contain", "Cancelled by user")
  })
})

describe("import/export tabs", () => {
  const loadTabsForImport = (buffers) => {
    cy.loadConsoleWithAuth(false, {}, { buffers })
    cy.getEditorTabs().should("be.visible")
  }

  it("should import tabs successfully with active and archived tabs", () => {
    loadTabsForImport()
    cy.getByDataHook("editor-tabs-menu-button").click()
    cy.getByDataHook("editor-tabs-menu").should("be.visible")

    cy.getByDataHook("editor-tabs-menu-import").click()
    cy.getByDataHook("editor-tabs-import-input").selectFile(
      "test/e2e/fixtures/valid-tabs-export.json",
      { force: true },
    )

    cy.get(".toast-success-container")
      .should("be.visible")
      .should("contain", "Imported 2 tabs successfully")
      .click()

    cy.getEditorTabByTitle("Imported Tab 1").should("be.visible")
    cy.getEditorTabByTitle("Imported Tab 2").should("be.visible")

    cy.getByDataHook("editor-tabs-history-button").click()
    cy.getByDataHook("editor-tabs-history").should("be.visible")
    cy.getByDataHook("editor-tabs-history-item").should(
      "contain",
      "Archived Import",
    )

    cy.getByDataHook("editor-tabs-history-item")
      .contains("Archived Import")
      .click()
    cy.getEditorContent().should("have.value", "SELECT 'archived';")
    cy.getEditorTabByTitle("Imported Tab 1")
      .find(".chrome-tab-drag-handle")
      .click()
    cy.getEditorContent().should("have.value", "SELECT 1;")
    cy.getByDataHook("editor-tabs-menu-button").click()
    cy.getByDataHook("editor-tabs-menu-import").click()
    cy.getByDataHook("editor-tabs-import-input").selectFile(
      "test/e2e/fixtures/valid-tabs-export.json",
      { force: true },
    )
    cy.getByDataHook("import-summary-skipped-item")
      .should("have.length", 3)
      .each((item) => expect(item.text()).to.contain("Duplicate"))
    cy.getEditorTabs().should("have.length", 4)
    cy.getByDataHook("import-summary-close").click()
    cy.getEditorContent().should("have.value", "SELECT 1;")
  })
})

describe("editor settings", () => {
  const runWithSelectionTable = "e2e_run_with_selection"

  const prepareSelectionTable = () => {
    cy.execAdminQuery(`DROP TABLE IF EXISTS ${runWithSelectionTable}`)
    cy.execAdminQuery(
      `CREATE TABLE ${runWithSelectionTable} AS (SELECT x a, x b, x c FROM long_sequence(1))`,
    )
  }

  after(() => {
    cy.execAdminQuery(`DROP TABLE IF EXISTS ${runWithSelectionTable}`)
  })

  const openEditorSettings = () => {
    cy.getByDataHook("editor-tabs-menu-button").click()
    cy.getByDataHook("editor-tabs-menu-settings").click()
    cy.getByDataHook("editor-settings-modal").should("be.visible")
  }

  it("toggles 'Capitalize keywords on format' and formats with it", () => {
    // Given the setting defaults to off
    loadEditorWithQuery(`select a from ${runWithSelectionTable}`)
    openEditorSettings()
    cy.getByDataHook("editor-settings-capitalize-keywords").should(
      "have.attr",
      "data-state",
      "unchecked",
    )

    // When it is switched on and saved
    cy.getByDataHook("editor-settings-capitalize-keywords").click()
    cy.getByDataHook("editor-settings-save").click()
    cy.getByDataHook("editor-settings-modal").should("not.exist")

    // Then the choice is persisted to local storage
    cy.window()
      .its("localStorage")
      .invoke("getItem", "editor.capitalizeKeywordsOnFormat")
      .should("eq", "true")

    // And formatting the document uppercases keywords but not identifiers
    cy.window().then((win) => {
      const editor = win.monaco.editor.getEditors()[0]
      editor.focus()
      editor.trigger("test", "editor.action.formatDocument")
    })
    cy.getEditorContent().should(
      "have.value",
      `SELECT a\nFROM ${runWithSelectionTable}`,
    )

    // And reopening the modal shows it still on
    openEditorSettings()
    cy.getByDataHook("editor-settings-capitalize-keywords").should(
      "have.attr",
      "data-state",
      "checked",
    )
    cy.getByDataHook("editor-settings-cancel").click()
    cy.getByDataHook("editor-settings-modal").should("not.exist")
  })

  // Only the legacy "false" is asserted here: "true" migrates to the same
  // "partial" the default already produces, so seeding it could not fail.

  it("resolves the selection per mode: partial fragment, complete query, ignored when off", () => {
    prepareSelectionTable()
    const table = runWithSelectionTable
    const query = `select a from ${table}`
    const startColumn = query.indexOf(table) + 1
    const endColumn = startColumn + table.length
    const selectTableName = () =>
      cy.selectRange(
        { lineNumber: 1, column: startColumn },
        { lineNumber: 1, column: endColumn },
      )
    const setMode = (mode) => {
      openEditorSettings()
      cy.getByDataHook("editor-settings-run-with-selection").click()
      cy.getByDataHook(`run-with-selection-${mode}`).click()
      cy.getByDataHook("editor-settings-save").click()
    }

    // Given a query selecting one column, with the table name highlighted
    loadEditorWithQuery(query)
    selectTableName()

    // When the mode is partial (default), the selection runs as-is
    cy.getByDataHook("button-run-query").should("contain", "Run selected query")
    cy.clickRunQuery()
    // Then the bare table name returns every column
    cy.get("[data-hook='grid-header-name']").should("have.length", 3)

    // When the mode is set to complete
    setMode("complete")

    // Then the run button reflects the new setting without any further
    // editor interaction
    cy.getByDataHook("button-run-query").should("contain", "Run query")

    // And the same fragment expands to the whole query, returning one column
    selectTableName()
    cy.getByDataHook("button-run-query").should("contain", "Run query")
    cy.clickRunQuery()
    cy.get("[data-hook='grid-header-name']").should("have.length", 1)

    cy.typeQueryDirectly("select 1; select 2;")
    cy.selectRange({ lineNumber: 1, column: 8 }, { lineNumber: 1, column: 14 })
    const selectedRequests = []
    cy.intercept({ ...editorExecution, middleware: true }, (req) => {
      selectedRequests.push(req.query.query)
    })
    cy.getByDataHook("button-run-query").should(
      "contain",
      "Run selected queries",
    )
    cy.clickRunQuery()
    cy.getGridRow(0).should("contain", "2")
    cy.wrap(selectedRequests).should("deep.eq", ["select 1", "select 2"])
    cy.typeQueryDirectly(query)
    // When the mode is set to off
    setMode("off")
    cy.window()
      .its("localStorage")
      .invoke("getItem", "editor.runWithSelection")
      .should("eq", "off")
    openEditorSettings()
    cy.getByDataHook("editor-settings-run-with-selection").should(
      "contain",
      "Off",
    )
    cy.getByDataHook("editor-settings-cancel").click()

    // And the same fragment is selected and run again
    selectTableName()
    cy.getByDataHook("button-run-query").should("contain", "Run query")
    cy.clickRunQuery()
    // Then the whole cursor query runs, returning only the single column
    cy.get("[data-hook='grid-header-name']").should("have.length", 1)
  })

  it("runs the glyph's own query in complete mode while a selection spans both statements", () => {
    // Given the mode is set to complete
    loadEditorWithQuery("select 1;\nselect 2;")
    openEditorSettings()
    cy.getByDataHook("editor-settings-run-with-selection").click()
    cy.getByDataHook("run-with-selection-complete").click()
    cy.getByDataHook("editor-settings-save").click()

    const execQueries = []
    const statements = new Set(["select 1", "select 2"])
    cy.intercept({ url: "**/exec*" }, (request) => {
      const query = new URL(request.url).searchParams.get("query")
      if (statements.has(query)) execQueries.push(query)
      request.continue()
    })

    // And two statements with a selection whose caret ends inside the second
    cy.selectRange({ lineNumber: 1, column: 8 }, { lineNumber: 2, column: 9 })
    cy.getByDataHook("button-run-query").should(
      "contain",
      "Run selected queries",
    )

    // When the second statement's run glyph is clicked
    cy.getRunIconInLine(2).click({ force: true })

    // Then that statement runs, never the first one the selection reaches back into
    cy.wrap(null).should(() => {
      expect(execQueries).to.deep.eq(["select 2"])
    })
    cy.getGridRow(0).should("contain", "2")
  })

  it("resolves the notebook cell selection per mode: partial, complete, off", () => {
    prepareSelectionTable()
    const table = runWithSelectionTable
    const sql = `select a from ${table}; select 33`
    const tableStart = sql.indexOf(table) + 1
    const tableEnd = tableStart + table.length
    // Reaches into the second statement's "sele", cutting both statements.
    const crossEnd = sql.indexOf("; select") + 8

    const setMode = (mode) => {
      openEditorSettings()
      cy.getByDataHook("editor-settings-run-with-selection").click()
      cy.getByDataHook(`run-with-selection-${mode}`).click()
      cy.getByDataHook("editor-settings-save").click()
      cy.getByDataHook("editor-settings-modal").should("not.exist")
    }
    const selectCellRange = (startColumn, endColumn) =>
      cy.withFocusedEditor((editor) =>
        editor.setSelection({
          startLineNumber: 1,
          startColumn,
          endLineNumber: 1,
          endColumn,
        }),
      )
    const runCellAtCursor = () =>
      cy.withFocusedEditor((editor) => editor.getAction("notebook-run").run())
    const cellResultTabs = () => cy.get("[role='tablist'] [role='tab']")

    // And a resolved notebook whose focused cell holds two statements
    cy.loadConsoleWithAuth(false, {}, { buffers: [createNotebookBuffer(sql)] })
    cy.focusNotebookCell()
    cy.withFocusedEditor((editor) => {
      expect(editor.getValue()).to.eq(sql)
    })

    // Given the first cell exec request is held until the loader is observed
    let releaseFirstExec
    cy.intercept(
      { url: "**/exec*", query: { query: table }, times: 1 },
      () =>
        new Cypress.Promise((resolve) => {
          releaseFirstExec = resolve
        }),
    ).as("heldExec")

    // When the mode is partial (default) and the table name is selected
    selectCellRange(tableStart, tableEnd)
    runCellAtCursor()

    // Then the table toggle spins while the fragment runs
    cy.get("[aria-label='View table'][aria-busy='true']").should("exist")
    cy.wrap(null).should(() => {
      expect(releaseFirstExec).to.be.a("function")
    })
    cy.then(() => releaseFirstExec())
    cy.wait("@heldExec")
    cy.get("[aria-label='View table'][aria-busy='true']").should("not.exist")

    // And only the bare fragment ran: a single result with every column
    cy.get("[data-hook='grid-header-name']:visible").should("have.length", 3)
    cellResultTabs().should("not.exist")
    cy.get(".selectionSuccessHighlight").should("exist")

    // When the mode is complete and the selection cuts into both statements
    setMode("complete")
    cy.focusNotebookCell()
    selectCellRange(tableStart, crossEnd)
    runCellAtCursor()

    // Then both whole statements run to completion, first statement active
    cy.get("[role='tablist'] [data-hook='result-tab-success']").should(
      "have.length",
      2,
    )
    cy.getByDataHook("result-tab-loading").should("not.exist")
    cellResultTabs()
      .eq(0)
      .should("have.attr", "title", `select a from ${table}`)
      .and("have.attr", "aria-selected", "true")
    cellResultTabs().eq(1).should("have.attr", "title", "select 33")
    cy.get(".selectionSuccessHighlight, .selectionErrorHighlight").should(
      "not.exist",
    )

    // When the mode is off and the same selection is made
    setMode("off")
    cy.focusNotebookCell()
    selectCellRange(tableStart, crossEnd)
    runCellAtCursor()

    // Then only the statement at the cursor runs, ignoring the selection
    cy.get("[role='tablist'] [data-hook='result-tab-success']").should(
      "have.length",
      1,
    )
    cy.get("[role='tablist'] [data-hook='result-tab-not-run']").should(
      "have.length",
      1,
    )
    cy.get("[role='tablist'] [role='tab'][aria-selected='true']").should(
      "have.attr",
      "title",
      "select 33",
    )
    cy.get("[data-hook='grid-header-name']:visible")
      .should("have.length", 1)
      .and("contain", "33")
  })

  it("runs the whole notebook cell from Run cell and Run All regardless of selection", () => {
    // Given a cell with two statements and a comment-only selection
    cy.loadConsoleWithAuth(
      false,
      {},
      {
        buffers: [createNotebookBuffer("select 1;\n-- note\nselect 2;")],
      },
    )
    cy.focusNotebookCell()
    cy.withFocusedEditor((editor) =>
      editor.setSelection({
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 2,
        endColumn: 8,
      }),
    )

    const execQueries = []
    const cellQueries = new Set(["select 1", "select 2"])
    cy.intercept({ url: "**/exec*" }, (request) => {
      const query = new URL(request.url).searchParams.get("query")
      if (cellQueries.has(query)) execQueries.push(query)
      request.continue()
    })

    // When Run cell is clicked, the selection does not narrow its scope
    cy.get("[data-notebook-cell] button[aria-label='Run cell']")
      .should("contain", "Run")
      .and("have.attr", "aria-disabled", "false")
      .click()

    // Then every statement runs
    cy.get("[role='tablist'] [data-hook='result-tab-success']").should(
      "have.length",
      2,
    )
    cy.wrap(null).should(() => {
      expect([...execQueries].sort()).to.deep.eq(["select 1", "select 2"])
    })

    // And Cmd+Shift+Enter runs the whole cell even from the result area
    cy.get("[role='tablist'] [role='tab']").eq(1).click()
    cy.get("[role='tablist'] [role='tab']").eq(1).should("have.focus")
    cy.then(() => {
      execQueries.length = 0
    })
    cy.window().then((win) => {
      win.dispatchEvent(
        new win.KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          metaKey: Cypress.platform === "darwin",
          ctrlKey: Cypress.platform !== "darwin",
          bubbles: true,
        }),
      )
    })
    cy.wrap(null).should(() => {
      expect([...execQueries].sort()).to.deep.eq(["select 1", "select 2"])
    })

    cy.get("[role='tablist'] [data-hook='result-tab-success']").should(
      "have.length",
      2,
    )
    cy.get("[aria-label='View table'][aria-busy='true']").should("not.exist")
  })

  it("never widens notebook Cmd+Enter beyond its focused query", () => {
    // Given a fresh cell whose cursor is in the gap between two statements
    cy.loadConsoleWithAuth(
      false,
      {},
      {
        buffers: [createNotebookBuffer("select 1;\n-- note\nselect 2;")],
      },
    )
    cy.focusNotebookCell()
    cy.withFocusedEditor((editor) =>
      editor.setPosition({ lineNumber: 2, column: 4 }),
    )

    const execQueries = []
    const cellQueries = new Set(["select 1", "select 2"])
    cy.intercept({ url: "**/exec*" }, (request) => {
      const query = new URL(request.url).searchParams.get("query")
      if (cellQueries.has(query)) execQueries.push(query)
      request.continue()
    })
    const expectNothingToRun = () => {
      cy.contains(".Toastify__toast--error", "Nothing to run")
        .should("be.visible")
        .within(() => {
          cy.get("button[aria-label='close']").click()
        })
      cy.then(() => expect(execQueries).to.deep.eq([]))
    }

    // When Cmd+Enter is pressed in Monaco with no query at the cursor
    cy.withFocusedEditor((editor) => editor.focus())
    cy.realPress(
      Cypress.platform === "darwin" ? ["Meta", "Enter"] : ["Control", "Enter"],
    )

    // Then it is a no-op, never an implicit Run All
    expectNothingToRun()
    cy.get("[data-hook='result-grid-tanstack']:visible").should("not.exist")

    // When only the second statement is run
    cy.focusNotebookCell()
    cy.withFocusedEditor((editor) =>
      editor.setPosition({ lineNumber: 3, column: 4 }),
    )
    cy.withFocusedEditor((editor) => editor.focus())
    cy.realPress(
      Cypress.platform === "darwin" ? ["Meta", "Enter"] : ["Control", "Enter"],
    )

    // Then both statement tabs fit alongside a fully visible result row
    cy.wrap(null).should(() => {
      expect(execQueries).to.deep.eq(["select 2"])
    })
    cy.get("[role='tablist'] [data-hook='result-tab-not-run']").should(
      "have.length",
      1,
    )
    cy.get("[role='tablist'] [data-hook='result-tab-success']").should(
      "have.length",
      1,
    )
    cy.getGridRow(0).should("be.visible").and("contain", "2")
    cy.then(() => {
      execQueries.length = 0
    })

    // Given an explicit Run All has created a result tab for each statement
    cy.withFocusedEditor((editor) => editor.getAction("notebook-run-all").run())
    cy.get("[role='tablist'] [data-hook='result-tab-success']").should(
      "have.length",
      2,
    )
    cy.then(() => {
      execQueries.length = 0
    })

    // When the second result tab has focus and Cmd+Enter is pressed
    cy.get("[role='tablist'] [role='tab']").eq(1).click()
    cy.get("[role='tablist'] [role='tab']")
      .eq(1)
      .should("have.focus")
      .and("have.attr", "title", "select 2")
    cy.window().then((win) => {
      win.dispatchEvent(
        new win.KeyboardEvent("keydown", {
          key: "Enter",
          metaKey: Cypress.platform === "darwin",
          ctrlKey: Cypress.platform !== "darwin",
          bubbles: true,
        }),
      )
    })

    // Then only that tab's statement runs
    cy.wrap(null).should(() => {
      expect(execQueries).to.deep.eq(["select 2"])
    })

    // And the same active tab never becomes a fallback for Monaco
    cy.focusNotebookCell()
    cy.withFocusedEditor((editor) =>
      editor.setPosition({ lineNumber: 2, column: 4 }),
    )
    cy.then(() => {
      execQueries.length = 0
    })
    cy.withFocusedEditor((editor) => editor.focus())
    cy.realPress(
      Cypress.platform === "darwin" ? ["Meta", "Enter"] : ["Control", "Enter"],
    )
    expectNothingToRun()
  })

  it("isolates a shared fragment that only matches part of a query", () => {
    // Given the setting is turned off
    loadEditorWithQuery("select 1 union all select 2;")
    openEditorSettings()
    cy.getByDataHook("editor-settings-run-with-selection").click()
    cy.getByDataHook("run-with-selection-off").click()
    cy.getByDataHook("editor-settings-save").click()

    // And a persisted buffer whose statement contains the shared fragment
    cy.waitForActiveBufferValue("select 1 union all select 2;")
    cy.reload()
    cy.getEditorContent().should("have.value", "select 1 union all select 2;")

    // When a share link for the fragment auto-runs
    const requests = []
    cy.intercept({ ...editorExecution, middleware: true }, (req) => {
      if (req.query.query.includes("select")) requests.push(req.query.query)
    })
    cy.visit(
      `${baseUrl}?query=${encodeURIComponent("select 2")}&executeQuery=true`,
    )
    cy.getEditorContent().should("be.visible")

    // Then the fragment opens in its own buffer and only that SQL runs
    cy.getEditorTabByTitle("Shared Query")
      .should("be.visible")
      .should("have.attr", "active")
    cy.getEditorContent().should("have.value", "select 2")
    cy.getGridRows().should("have.length", 1)
    cy.getGridRow(0).should("contain", "2")

    cy.wrap(requests).should("not.include", "select 1 union select 2")
  })

  it("caps column width at the configured maximum and returns to auto", () => {
    const cell = () =>
      cy.get("[data-hook='result-grid-tanstack']:visible #cell-0-0")

    // Given a result with a very wide column under automatic sizing
    loadEditorWithQuery(
      "select string_agg(x::string, ',') s from long_sequence(500)",
    )
    cy.clickRunQuery()
    cell().should("be.visible")
    const extraRequests = []
    cy.intercept(editorExecution, (req) => extraRequests.push(req.query.query))

    // When a width below the minimum is saved
    openEditorSettings()
    cy.getByDataHook("editor-settings-max-column-width").clear().type("10")
    cy.getByDataHook("editor-settings-save").click()

    // Then the modal stays open and shows a validation error
    cy.getByDataHook("editor-settings-modal").should("be.visible")
    cy.getByDataHook("editor-settings-max-column-width-error").should(
      "contain",
      "between 60 and 4000",
    )

    // When a valid maximum column width is saved
    cy.getByDataHook("editor-settings-max-column-width").clear().type("250")
    cy.getByDataHook("editor-settings-max-column-width-error").should(
      "not.exist",
    )
    cy.getByDataHook("editor-settings-save").click()
    cy.getByDataHook("editor-settings-modal").should("not.exist")

    // Then the open result reflows and the column settles at the cap
    cell().should(($cell) => {
      expect($cell[0].getBoundingClientRect().width).to.be.closeTo(250, 3)
    })

    // And reopening the modal shows the stored value
    openEditorSettings()
    cy.getByDataHook("editor-settings-max-column-width").should(
      "have.value",
      "250",
    )

    // When the field is cleared back to auto and saved
    cy.getByDataHook("editor-settings-max-column-width").clear()
    cy.getByDataHook("editor-settings-save").click()

    // Then the column fills the grid again
    let gridWidth
    cy.get("[data-hook='result-grid-tanstack']:visible").then(($grid) => {
      gridWidth = $grid[0].getBoundingClientRect().width
    })
    cell().should(($cell) => {
      expect($cell[0].getBoundingClientRect().width).to.be.closeTo(
        gridWidth,
        20,
      )
    })

    cy.wrap(extraRequests).should("have.length", 0)
  })
})

describe("editing while a query is running", () => {
  it("keeps the editor editable in flight and still lands the result", () => {
    // Given a running query
    loadEditorWithQuery("select 1")
    const release = holdNextExecution()
    cy.clickRunIconInLine(1)
    cy.getCancelIconInLine(1).should("be.visible")

    // Then the editor is not read-only and can be shifted mid-flight
    cy.window().then((win) => {
      const editor = win.monaco.editor.getEditors()[0]
      expect(editor.getOption(win.monaco.editor.EditorOption.readOnly)).to.eq(
        false,
      )

      const before = editor.getValue()
      editor.setPosition({ lineNumber: 1, column: 1 })
      editor.trigger("test", "type", { text: "-- shifted while running\n" })
      expect(editor.getValue()).to.not.eq(before)
      expect(editor.getValue()).to.contain("-- shifted while running")
    })

    // And the running glyph follows the query to its new line
    cy.getCancelIconInLine(2).should("be.visible")

    // When
    release()
    // Then
    cy.getByDataHook("success-notification").should("contain", "select 1")
    cy.expandNotifications()
    cy.getExpandedNotifications().should("contain", "select 1")

    // And the success glyph sits on the query's shifted line
    cy.get(".glyph-widget-2 .glyph-run-icon.success").should("be.visible")

    cy.getGridRow(0).should("contain", "1")
  })
})

const loadInteractionTabs = (buffers) =>
  cy.loadConsoleWithAuth(false, {}, { buffers })
const assertNoSuggestions = () =>
  cy
    .get("body")
    .should((body) =>
      expect(
        body.find('[widgetid="editor.widget.suggestWidget"]:visible'),
      ).to.have.length(0),
    )
const importedBuffers = [
  { label: "Imported Tab 1", value: "SELECT 1;" },
  { label: "Imported Tab 2", value: "SELECT 2;" },
]

describe("editor browser interactions", () => {
  before(() => {
    cy.execAdminQuery("CREATE TABLE IF NOT EXISTS my_secrets (secret STRING)")
    cy.execAdminQuery("CREATE TABLE IF NOT EXISTS my_secrets2 (secret STRING)")
    cy.execAdminQuery("CREATE TABLE IF NOT EXISTS my_publics (public STRING)")
  })
  after(() => {
    cy.execAdminQuery("DROP TABLE IF EXISTS my_secrets")
    cy.execAdminQuery("DROP TABLE IF EXISTS my_secrets2")
    cy.execAdminQuery("DROP TABLE IF EXISTS my_publics")
  })
  it("requests consent before replacing a busy query with run-all", () => {
    // Given a single query is running
    loadEditorWithQuery("select 1;\nselect 2;\nselect 3;")
    const executions = []
    cy.intercept({ ...editorExecution, middleware: true }, (req) => {
      executions.push(req.query.query)
    })
    const release = holdNextExecution()
    cy.clickLine(1)
    cy.getByDataHook("button-run-query").should("contain", "Run query").click()
    cy.getByDataHook("button-cancel-query").should("be.visible")

    // When the user triggers "run all" (Ctrl/Cmd+Shift+Enter) while busy
    cy.window().then((win) => {
      win.monaco.editor.getEditors()[0].focus()
    })
    cy.focused().type(`${ctrlOrCmd}{shift}{enter}`)

    // Then the modal is for running all queries
    cy.getByRoleAttribute("dialog").should("be.visible")
    cy.getByRoleAttribute("dialog").should("contain", "Run all queries")
    cy.getByDataHook("run-all-queries-warning").should(
      "contain",
      "Current query execution will be aborted",
    )

    cy.wrap(executions).should("deep.eq", ["select 1"])

    // When the user confirms
    cy.getByDataHook("run-all-queries-confirm").click()
    release()

    // Then the running query is aborted and all 3 queries run.
    // (Run-all clears this buffer's notifications, so "Cancelled by user" is
    // intentionally not asserted here -- unlike the selection run above.)
    cy.contains('[data-hook="success-notification"]', "Running completed", {
      timeout: 20000,
    })
      .invoke("text")
      .should("match", /Running completed in .+ with\s+3 successful\s+queries/)
    cy.wrap(executions).should("deep.eq", [
      "select 1",
      "select 1",
      "select 2",
      "select 3",
    ])
  })
  it("blocks both new-tab controls until a running script completes", () => {
    // Given
    loadEditorWithQuery("select 1;\nselect 2;\nselect 3;")
    const release = holdNextExecution()

    cy.getEditorTabs().then(($tabs) => {
      const initialTabCount = $tabs.length

      // When the script is actually running (first query in flight)
      cy.clickRunScript()
      cy.getByDataHook("loading-notification").should("contain", "select 1")

      // Then the new tab button is not interactive
      cy.get(".new-tab-button-wrapper").should(
        "have.css",
        "pointer-events",
        "none",
      )

      // When forcing a click past the disabled styling
      cy.getByDataHook("new-tab-button").click({ force: true })

      // Then no new tab is added. addBuffer inserts asynchronously (IndexedDB ->
      // useLiveQuery), so settle before the negative assertion to give a
      // regression time to surface instead of asserting on the instantaneous
      // (still-equal) count.
      cy.getEditorTabs().should("have.length", initialTabCount)
      cy.window().then((win) => {
        const editor = win.monaco.editor.getEditors()[0]
        editor.focus()
        editor.trigger("test", "add_new_tab")
      })
      cy.getEditorTabs().should("have.length", initialTabCount)
    })

    release()
    cy.getByDataHook("success-notification").should("contain", "3 successful")
    cy.getEditorTabs().should("have.length", 1)
  })
  it("completes columns, joins, aliases, and the next SQL statement", () => {
    cy.loadConsoleWithAuth()

    {
      cy.clearEditor()

      cy.typeQuery("select ")
      cy.getAutocomplete()
        // Columns
        .should("contain", "secret")
        .should("contain", "public")
        .clearEditor()
    }

    {
      cy.clearEditor()

      cy.typeQuery("select secre")
      cy.getAutocomplete().should("be.visible")
      cy.typeQuery("{enter}")
      cy.typeQuery(", publi")
      cy.getAutocomplete().should("be.visible")
      cy.typeQuery("{enter}")
      cy.getAutocomplete().should("contain", "FROM")
      cy.clearEditor()
    }

    {
      cy.clearEditor()

      cy.typeQuery("select * from my_secrets join my_publics on ")
      cy.getAutocomplete()
        .should("contain", "public")
        .should("contain", "secret")
        .clearEditor()
    }

    {
      cy.clearEditor()

      cy.typeQuery("select * from my_secrets s where s.")
      cy.getAutocomplete().should("contain", "secret").clearEditor()
    }

    {
      cy.clearEditor()

      cy.typeQuery("select * from my_secrets;{enter}select * from ")
      cy.getAutocomplete()
        .should("contain", "my_secrets")
        .should("contain", "my_publics")
        .clearEditor()
    }
  })
  it("accepts SQL keywords and follows the current statement context", () => {
    cy.loadConsoleWithAuth()

    {
      cy.clearEditor()

      const assertFrom = () =>
        cy.getAutocomplete().within(() => {
          cy.getMonacoListRow()
            .should("have.length", 1)
            .eq(0)
            .should("contain", "FROM")
        })
      cy.typeQuery("select * fro")
      assertFrom()
      cy.clearEditor()
      cy.typeQuery("SELECT * FRO")
      assertFrom()
    }

    {
      cy.clearEditor()

      cy.typeQuery("CR")
      cy.getAutocomplete().should("contain", "CREATE")
      cy.typeQuery("{enter}")
      cy.typeQuery("T")
      cy.getAutocomplete().should("contain", "TABLE")
      cy.typeQuery("{enter}")
      cy.getAutocomplete().should("contain", "IF")
      cy.typeQuery("{enter}")
      cy.getAutocomplete().should("contain", "NOT")
      cy.typeQuery("{enter}")
      cy.getAutocomplete().should("contain", "EXISTS")
      cy.typeQuery("{enter}")
      cy.clearEditor()
    }

    {
      cy.clearEditor()

      cy.typeQuery("SELECT * FROM")
      assertNoSuggestions()

      cy.typeQuery(`${ctrlOrCmd}i`)
      cy.getAutocomplete()
        .should("be.visible")
        .should("contain", "No suggestions")
      cy.clearEditor()
    }

    {
      cy.clearEditor()

      cy.typeQuery("select * from my_secrets whe")
      cy.getAutocomplete().should("contain", "WHERE")
      // Should not contain lowercase variant
      cy.getAutocomplete().within(() => {
        cy.getMonacoListRow().first().should("contain", "WHERE")
      })
      cy.clearEditor()
    }

    {
      cy.clearEditor()

      cy.typeQuery("with cte as (select 1) select * from ")
      cy.getAutocomplete().should("contain", "cte").clearEditor()
    }
  })
  it("opens completion only in executable SQL contexts", () => {
    cy.loadConsoleWithAuth()

    {
      cy.clearEditor()

      cy.typeQuery("select * from teletubies")
      cy.get("body").should(($body) => {
        const widget = $body.find('[widgetid="editor.widget.suggestWidget"]')
        if (widget.length) expect(widget).not.to.be.visible
      })
      cy.clearEditor()
    }

    {
      cy.clearEditor()

      cy.typeQuery("select count(")
      assertNoSuggestions()
      cy.clearEditor()
    }

    {
      cy.clearEditor()

      cy.typeQuery("select count( ")
      cy.getAutocomplete().should("be.visible").clearEditor()
    }

    {
      cy.clearEditor()

      cy.typeQuery("-- select * from ")
      assertNoSuggestions()
      cy.clearEditor()
    }

    {
      cy.clearEditor()

      cy.typeQuery("select 1;")
      cy.typeQuery("{enter}{enter}")
      assertNoSuggestions()
      cy.clearEditor()
    }

    {
      cy.clearEditor()

      cy.typeQuery("/* select * from ")
      assertNoSuggestions()
      cy.clearEditor()
    }
  })
  it("should show error in notifications when response is not valid JSON", () => {
    cy.loadConsoleWithAuth()

    const response = {
      statusCode: 200,
      body: "This is not valid JSON {invalid json content",
    }

    cy.typeQueryDirectly("long_sequence(100);")
    cy.runLineWithResponse(response)

    cy.getCollapsedNotifications().should(
      "contain",
      "Invalid JSON response from the server",
    )
  })
  it("JIT-validates queries after content-change (1000ms) and cursor-change (500ms) debounces", () => {
    // Given
    cy.loadConsoleWithAuth()
    let lastMove = 0
    const expectSelecMarker = () =>
      cy.window().should((win) => {
        const model = win.monaco.editor.getEditors()[0].getModel()
        const markers = win.monaco.editor.getModelMarkers({
          resource: model.uri,
        })
        expect(markers).to.have.length(1)
        expect(model.getValueInRange(markers[0])).to.eq("selec")
        expect(markers[0]).to.include({
          startLineNumber: 3,
          startColumn: 4,
          endLineNumber: 3,
          endColumn: 9,
        })
      })
    cy.intercept("**/api/v1/sql/validate*", (req) => {
      req.reply({
        body: String(req.query.query).startsWith("selec ")
          ? { query: req.query.query, error: "unexpected token", position: 0 }
          : { query: req.query.query, columns: [], timestamp: -1 },
      })
    }).as("validation")
    cy.clock(Date.now(), ["setTimeout", "clearTimeout"])
    // When
    cy.typeQuery("selec 1;\n\n   selec 2")
    cy.tick(999)
    // Then
    cy.get("@validation.all").should("have.length", 0)
    cy.getErrorMarker().should("not.exist")
    // When
    cy.typeQuery("34")
    cy.tick(999)
    // Then
    cy.get("@validation.all").should("have.length", 0)
    cy.getErrorMarker().should("not.exist")
    // When
    cy.tick(1)
    cy.clock().invoke("restore")
    // Then
    cy.wait("@validation").its("request.query.query").should("eq", "selec 234")
    cy.getErrorMarker().should("be.visible")
    expectSelecMarker()
    // When
    cy.typeQuery(";\n\nselect * from tables()")
    cy.wait("@validation")
    // Then
    cy.getErrorMarker().should("not.exist")
    // When
    cy.window().then((win) => {
      lastMove = performance.now()
      win.monaco.editor
        .getEditors()[0]
        .setPosition({ lineNumber: 3, column: 5 })
    })
    // Then
    cy.wait("@validation").its("request.query.query").should("eq", "selec 234")
    cy.then(() => expect(performance.now() - lastMove).to.be.at.least(450))
    cy.getErrorMarker().should("be.visible")
    expectSelecMarker()
    // Given the real server validates from here on
    cy.intercept("**/api/v1/sql/validate*", (req) => req.continue()).as(
      "realValidation",
    )
    // When
    cy.window().then((win) => {
      const editor = win.monaco.editor.getEditors()[0]
      const lastLine = editor.getModel().getLineCount()
      editor.setPosition({
        lineNumber: lastLine,
        column: editor.getModel().getLineMaxColumn(lastLine),
      })
    })
    // Then
    cy.wait("@realValidation").then(({ request, response }) => {
      expect(request.query.query).to.eq("select * from tables()")
      expect(response.statusCode).to.eq(200)
    })
    cy.getErrorMarker().should("not.exist")
    // When
    cy.window().then((win) =>
      win.monaco.editor
        .getEditors()[0]
        .setPosition({ lineNumber: 3, column: 5 }),
    )
    // Then
    cy.wait("@realValidation").then(({ request, response }) => {
      expect(request.query.query).to.eq("selec 234")
      expect(response.statusCode).to.eq(400)
    })
    cy.getErrorMarker().should("be.visible")
    expectSelecMarker()
  })
  it("should execute a correct query when line comment is present", () => {
    cy.intercept(editorExecution).as("targetQuery")

    cy.loadConsoleWithAuth()

    cy.typeQueryDirectly(
      "select * from long_sequence(1); -- comment\nselect * from long_sequence(2);",
    )
    cy.getEditor().realClick()
    cy.clickLine(2)
    cy.window().then((win) => win.monaco.editor.getEditors()[0].focus())
    cy.focused().type("{upArrow}{rightArrow}{rightArrow}")
    cy.F9()
    cy.wait("@targetQuery")
      .its("request.query.query")
      .should("eq", "select * from long_sequence(1)")
    cy.getGridRows().should("have.length", 1)
    cy.getCursorQueryDecoration().should("have.length", 1)
  })
  it("drops the glyphs but still lands the result when the running query is edited", () => {
    // Given a running query
    loadEditorWithQuery("select 1")
    const release = holdNextExecution()
    cy.clickRunIconInLine(1)
    cy.getCancelIconInLine(1).should("be.visible")

    // When text is typed inside the running query, dislodging it
    cy.window().then((win) => {
      const editor = win.monaco.editor.getEditors()[0]
      editor.setPosition({ lineNumber: 1, column: 8 })
      editor.trigger("test", "type", { text: "x" })
      expect(editor.getValue()).to.contain("select x1")
    })

    // Then no line claims the running glyph anymore
    cy.get(".glyph-run-icon.cancel").should("not.exist")

    release()
    // When the query completes, its result still lands in the query log
    cy.getByDataHook("success-notification").should("contain", "select 1")

    // And no success glyph is drawn for the edited query
    cy.get(".glyph-run-icon.success").should("not.exist")
  })
  it("keeps the cursor where the user types when the query fails after an edit", () => {
    // Given a running query that will fail
    loadEditorWithQuery("select * from non_existent_table")
    const release = holdNextExecution()
    cy.clickRunIconInLine(1)
    cy.getCancelIconInLine(1).should("be.visible")

    // When a comment line is typed above it while it runs
    cy.window().then((win) => {
      const editor = win.monaco.editor.getEditors()[0]
      editor.setPosition({ lineNumber: 1, column: 1 })
      editor.trigger("test", "type", { text: "-- typing during the run\n" })
      editor.setPosition({ lineNumber: 1, column: 10 })
    })

    release()
    // Then the error lands in the query log
    cy.getByDataHook("error-notification").should(
      "contain",
      "table does not exist",
    )

    // And the error glyph sits on the query's shifted line
    cy.get(".glyph-widget-2 .glyph-run-icon.error").should("be.visible")

    // And the cursor stays where the user was typing instead of jumping
    // into the failed query
    cy.window().then((win) => {
      const position = win.monaco.editor.getEditors()[0].getPosition()
      expect(position.lineNumber).to.eq(1)
      expect(position.column).to.eq(10)
    })
  })
  it("should keep original query running when dismiss is clicked in abort dialog", () => {
    // Given
    loadEditorWithQuery("select 1;\nselect 2;")
    let release
    const requests = []
    cy.intercept(editorExecution, (req) => {
      requests.push(req.query.query)
      return new Cypress.Promise((resolve) => {
        release = () => {
          req.reply({
            body: {
              query: req.query.query,
              columns: [{ name: "x", type: "LONG" }],
              dataset: [[1]],
              count: 1,
            },
          })
          resolve()
        }
      })
    })
    // When
    cy.clickRunIconInLine(1)
    cy.getCancelIconInLine(1).should("be.visible")
    cy.clickRunIconInLine(2)
    cy.getByDataHook("abort-confirmation-dialog-dismiss").click()
    // Then
    cy.getByDataHook("abort-confirmation-dialog").should("not.exist")
    cy.getCancelIconInLine(1).should("be.visible")
    cy.then(() => release())
    cy.getByDataHook("success-notification").should("contain", "select 1")
    cy.wrap(requests).should("deep.eq", ["select 1"])
    cy.getGridRow(0).should("contain", "1")
  })
  it("copies cursor, selection, and complete buffer through their keyboard bindings", () => {
    // Given
    loadEditorWithQuery("SELECT 1;\nSELECT 2;\nSELECT 3;")
    cy.getCursorQueryGlyph().should("be.visible")
    const expectedUrl = (sql) => {
      const params = new URLSearchParams()
      params.set("query", sql)
      params.set("executeQuery", "true")
      return `${baseUrl}/?${params.toString()}`
    }
    const expectClipboardWrite = (callCount, sql) => {
      cy.get("@clipboardWrite").should((writeText) => {
        expect(writeText).to.have.callCount(callCount)
        expect(writeText.lastCall.args).to.deep.eq([expectedUrl(sql)])
      })
    }
    cy.window().then((win) => {
      cy.stub(win.navigator.clipboard, "writeText")
        .as("clipboardWrite")
        .resolves()
    })

    // When — glyph dropdown copies single full query
    cy.openRunDropdownInLine(1)
    cy.getByDataHook("dropdown-item-copy-query-link").click()

    // Then
    expectClipboardWrite(1, "SELECT 1;")

    // When — glyph dropdown copies the complete query even with a
    // fragment selected inside it
    cy.selectRange({ lineNumber: 2, column: 1 }, { lineNumber: 2, column: 7 })
    cy.getByDataHook("button-run-query").should("contain", "Run selected query")
    cy.openRunDropdownInLine(2)
    cy.getByDataHook("dropdown-item-copy-query-link")
      .should("contain", 'Copy link to "SELECT 2"')
      .click()

    // Then
    expectClipboardWrite(2, "SELECT 2;")

    // When — Alt+L copies single query at cursor
    cy.clickLine(3)
    focusEditor()
    cy.realPress(["Alt", "L"])

    // Then
    expectClipboardWrite(3, "SELECT 3;")

    // When — Alt+L copies selection spanning multiple queries
    cy.selectRange({ lineNumber: 1, column: 1 }, { lineNumber: 2, column: 9 })
    cy.getByDataHook("button-run-query").should(
      "contain",
      "Run selected queries",
    )
    focusEditor()
    cy.realPress(["Alt", "L"])

    // Then
    expectClipboardWrite(4, "SELECT 1;\n\nSELECT 2;")

    // When — Alt+Shift+L copies all queries in tab
    cy.realPress(["Alt", "Shift", "L"])

    // Then
    expectClipboardWrite(5, "SELECT 1;\n\nSELECT 2;\n\nSELECT 3;")
  })
  it("does not execute comment-only or separator-only selections", () => {
    cy.loadConsoleWithAuth()

    {
      // Given a commented-out statement between two live statements
      cy.clearEditor()
      cy.typeQueryDirectly("select 1;\n-- old: delete from t\nselect 2;")

      // When a word inside the comment is selected
      cy.selectRange(
        { lineNumber: 2, column: 9 },
        { lineNumber: 2, column: 15 },
      )

      // Then the run button disables instead of targeting a neighbouring
      // statement
      cy.getByDataHook("button-run-query").should("be.disabled")

      // And the keyboard shortcut is also a no-op
      cy.focused().type(`${ctrlOrCmd}{enter}`)
      cy.getByDataHook("success-notification").should("not.exist")

      // And moving the cursor back into a statement enables it again
      cy.clickLine(1)
      cy.getByDataHook("button-run-query").should("not.be.disabled")
    }

    {
      // Given two statements, the second of which drops a table
      cy.clearEditor()
      cy.typeQueryDirectly("select 1;\ndrop table if exists t;")

      // When only the first statement's terminating semicolon and the newline
      // are selected, leaving the caret inside the second statement
      cy.selectRange({ lineNumber: 1, column: 9 }, { lineNumber: 2, column: 1 })

      // Then the run button disables rather than targeting the statement the
      // caret happens to sit in
      cy.getByDataHook("button-run-query").should("be.disabled")

      // And the keyboard shortcut runs nothing either
      cy.focused().type(`${ctrlOrCmd}{enter}`)
      cy.getByDataHook("success-notification").should("not.exist")
    }
  })
  it("rejects invalid tabs and invalid archive formats with useful reasons", () => {
    loadInteractionTabs()
    cy.getByDataHook("editor-tabs-menu-button").click()
    cy.getByDataHook("editor-tabs-menu").should("be.visible")

    cy.getByDataHook("editor-tabs-menu-import").click()
    cy.getByDataHook("editor-tabs-import-input").selectFile(
      "test/e2e/fixtures/invalid-tabs-export.json",
      { force: true },
    )

    // An invalid tab is skipped rather than aborting the whole import; its
    // validation reason is surfaced in the summary dialog.
    cy.getByDataHook("import-summary-dialog").should("be.visible")
    cy.getByDataHook("import-summary-dialog").should("contain", "0 tab")
    cy.getByDataHook("import-summary-dialog").should("contain", "1 tab skipped")
    cy.getByDataHook("import-summary-skipped-item").should("have.length", 1)
    cy.getByDataHook("import-summary-skipped-item").should(
      "contain",
      "label must be a string",
    )

    cy.getByDataHook("import-summary-close").click()
    cy.getByDataHook("import-summary-dialog").should("not.exist")

    cy.getByDataHook("editor-tabs-menu-button").click()
    cy.getByDataHook("editor-tabs-menu").should("be.visible")

    cy.getByDataHook("editor-tabs-menu-import").click()
    cy.getByDataHook("editor-tabs-import-input").selectFile(
      "test/e2e/fixtures/not-dexie-format.json",
      { force: true },
    )

    cy.get(".toast-error-container")
      .should("be.visible")
      .should("contain", "Invalid file format")
  })
  it("imports new tabs while reporting existing open and closed duplicates", () => {
    loadInteractionTabs([{}, ...importedBuffers])

    // When one duplicate and one new tab are imported
    cy.getByDataHook("editor-tabs-menu-button").click()
    cy.getByDataHook("editor-tabs-menu").should("be.visible")
    cy.getByDataHook("editor-tabs-menu-import").click()
    cy.getByDataHook("editor-tabs-import-input").selectFile(
      "test/e2e/fixtures/mixed-tabs-export.json",
      { force: true },
    )

    // Should show the import summary dialog with mixed results
    cy.getByDataHook("import-summary-dialog").should("be.visible")
    cy.getByDataHook("import-summary-dialog").should(
      "contain",
      "1 tab imported",
    )
    cy.getByDataHook("import-summary-dialog").should("contain", "1 tab skipped")
    cy.getByDataHook("import-summary-skipped-item").should("have.length", 1)
    cy.getByDataHook("import-summary-skipped-item").should(
      "contain",
      "Imported Tab 1",
    )

    // Close and verify new tab was added
    cy.getByDataHook("import-summary-close").click()
    cy.getEditorTabByTitle("Brand New Tab").should("be.visible")

    cy.getEditorTabByTitle("Imported Tab 1").find(".chrome-tab-close").click()

    // When the same tabs are imported again
    cy.getByDataHook("editor-tabs-menu-button").click()
    cy.getByDataHook("editor-tabs-menu").should("be.visible")
    cy.getByDataHook("editor-tabs-menu-import").click()
    cy.getByDataHook("editor-tabs-import-input").selectFile(
      "test/e2e/fixtures/valid-tabs-export.json",
      { force: true },
    )

    cy.getByDataHook("import-summary-dialog").should("be.visible")
    // "Imported Tab 1" is now archived — its skipped entry should have "closed" badge
    cy.getByDataHook("import-summary-skipped-item")
      .contains("Imported Tab 1")
      .parent()
      .should("contain", "closed")
    // "Imported Tab 2" is still active — no "closed" badge
    cy.getByDataHook("import-summary-skipped-item")
      .contains("Imported Tab 2")
      .parent()
      .should("not.contain", "closed")

    cy.getByDataHook("import-summary-close").click()
  })
  it("renames a saved tab through its available controls and keeps the final name", () => {
    loadInteractionTabs()
    cy.getEditorTabByTitle("SQL").within(() => {
      cy.get(".chrome-tab-drag-handle").dblclick()
      cy.get(".chrome-tab-rename").should("be.visible").type("New name{enter}")
    })
    cy.getEditorTabByTitle("New name")
      .should("be.visible")
      .within(() => {
        cy.get(".chrome-tab-drag-handle").dblclick()
        cy.get(".chrome-tab-rename").type("Cancelled new name{esc}")
        cy.get(".chrome-tab-rename").should("not.be.visible")
      })
    cy.getEditorTabByTitle("Cancelled new name").should("not.exist")
    cy.getEditorTabByTitle("New name").within(() => {
      cy.get(".chrome-tab-drag-handle").dblclick()
      cy.get(".chrome-tab-rename").type("{selectall}{backspace}{enter}")
      // empty tab name is not allowed, should not proceed
      cy.get(".chrome-tab-rename").should("be.visible")
    })
    // Changing the name and clicking away from the input should save the state
    cy.getEditorHitbox().click()
    cy.getEditorTabByTitle("New name").within(() => {
      cy.get(".chrome-tab-drag-handle").dblclick()
      cy.get(".chrome-tab-rename").type("New updated name")
    })
    cy.getEditorHitbox().click()
    cy.getEditorTabByTitle("New updated name").should("be.visible")

    cy.getEditorTabByTitle("New updated name").realHover()
    cy.getEditorTabByTitle("New updated name").within(() => {
      cy.get(".chrome-tab-edit").should("be.visible").click()
      cy.get(".chrome-tab-rename")
        .should("be.visible")
        .clear()
        .type("Renamed via button{enter}")
    })
    cy.getEditorTabByTitle("Renamed via button").should("be.visible")

    waitForSavedTabOrder(["Renamed via button"])
    cy.reload()
    cy.getEditorTabByTitle("Renamed via button").should("be.visible")
  })
})

const dragTabOnto = (source, target) => {
  cy.get(".chrome-tabs-ready").should("be.visible")
  cy.get(getTabDragHandleByTitle(source)).click(10, 10)
  cy.getEditorTabByTitle(source).should("have.attr", "active")
  cy.get(getTabDragHandleByTitle(target)).then(($target) => {
    const { x, y, width, height } = $target[0].getBoundingClientRect()
    const destination = { x: x + width / 2, y: y + height / 2 }

    cy.get(getTabDragHandleByTitle(source)).realMouseDown({
      position: "center",
      scrollBehavior: false,
    })
    cy.get(getTabDragHandleByTitle(source)).realMouseMove(10, 0, {
      position: "center",
      keepMouseDownButton: "left",
      scrollBehavior: false,
    })
    cy.get(".chrome-tab-is-dragging").should("exist")
    cy.get("body").realMouseMove(destination.x, destination.y, {
      position: "topLeft",
      keepMouseDownButton: "left",
      scrollBehavior: false,
    })
    cy.get("body").realMouseUp({
      ...destination,
      scrollBehavior: false,
    })
  })
  cy.get(".chrome-tabs-is-sorting").should("not.exist")
}
const waitForSavedTabOrder = (expected) =>
  cy.window().then((win) => {
    const deadline = Date.now() + 8000
    const readOrder = () =>
      new Cypress.Promise((resolve, reject) => {
        const request = win.indexedDB.open("web-console")
        request.onerror = () => reject(request.error)
        request.onblocked = () => reject(new Error("Tab storage is blocked"))
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction("buffers", "readonly")
          const rows = transaction.objectStore("buffers").getAll()
          transaction.onerror = () => {
            database.close()
            reject(transaction.error)
          }
          transaction.oncomplete = () => {
            database.close()
            resolve(
              rows.result
                .filter((buffer) => !buffer.archived)
                .sort((left, right) => left.position - right.position)
                .map((buffer) => buffer.label),
            )
          }
        }
      })
    const poll = () =>
      readOrder().then((actual) => {
        if (JSON.stringify(actual) === JSON.stringify(expected)) return
        if (Date.now() >= deadline)
          throw new Error(
            `Tab order did not persist: ${JSON.stringify(actual)}`,
          )
        return new Cypress.Promise((resolve) =>
          win.requestAnimationFrame(resolve),
        ).then(poll)
      })
    return poll()
  })
const loadSharedEditor = ({ buffers, settings, query }) =>
  cy.loadConsoleWithAuth(false, settings, {
    buffers,
    url: baseUrl + "/" + query,
  })

describe("saved editor navigation", () => {
  it("multiline query in a new tab", () => {
    const query = encodeURIComponent("select x+1\nfrom\nlong_sequence(1);")
    loadSharedEditor({
      buffers: [
        {
          value: `select x\nfrom long_sequence(1);\n\n-- a\n-- b\n-- c\n${"{upArrow}".repeat(5)}`,
        },
      ],
      settings: {},
      query: `?query=${query}&executeQuery=true`,
    })
    cy.getEditor().should("be.visible")
    cy.getEditorTabByTitle("Shared Query")
      .should("be.visible")
      .should("have.attr", "active")
    cy.getGridRow(0).should("contain", "2")
    cy.getSelectedLines().should("have.length", 4)
  })
  it("query in a new tab and reveal", () => {
    const sharedQuery = "-- hello world"
    loadSharedEditor({
      buffers: [
        {
          value: `select x from long_sequence(1);${"\n".repeat(20)}`,
          editorViewState: {
            cursorState: [
              {
                inSelectionMode: false,
                selectionStart: { lineNumber: 21, column: 1 },
                position: { lineNumber: 21, column: 1 },
              },
            ],
            viewState: {
              scrollLeft: 0,
              firstPosition: { lineNumber: 21, column: 1 },
              firstPositionDeltaTop: 0,
            },
            contributionsState: {},
          },
        },
      ],
      settings: {},
      query: `?query=${encodeURIComponent(sharedQuery)}`,
    })
    cy.getEditor().should("be.visible")
    cy.getEditorTabByTitle("Shared Query")
      .should("be.visible")
      .should("have.attr", "active")
    cy.getEditorContent().should("have.value", sharedQuery)
    cy.getVisibleLines()
      .invoke("text")
      .should("match", /hello.world$/) // not matching on sharedQuery, because query should be selected for which Monaco adds special chars between words
  })
  it("keeps native tab order after dragging in both directions", () => {
    // Given
    loadInteractionTabs([{ label: "SQL" }, { label: "SQL 1" }])
    // When / Then
    for (const expected of [
      ["SQL 1", "SQL"],
      ["SQL", "SQL 1"],
    ]) {
      dragTabOnto("SQL", "SQL 1")
      cy.getEditorTabs().should((tabs) =>
        expect(
          [...tabs].map((tab) => tab.getAttribute("data-tab-title")),
        ).to.deep.eq(expected),
      )
      waitForSavedTabOrder(expected)
      cy.reload()
      cy.getEditorContent().should("be.visible")
      cy.getEditorTabs().should((tabs) =>
        expect(
          [...tabs].map((tab) => tab.getAttribute("data-tab-title")),
        ).to.deep.eq(expected),
      )
    }
  })
})
