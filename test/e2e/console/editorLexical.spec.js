/// <reference types="cypress" />

const { ctrlOrCmd } = require("../utils")
const baseUrl = Cypress.config("baseUrl") || "http://localhost:9999"
const table = `zz_console_lexical_${Date.now()}`
const editorExecution = { url: "**/exec*", query: { explain: "true" } }

const exec = (query) =>
  cy.request({
    url: `${baseUrl}/exec`,
    qs: { query },
    headers: { Authorization: `Basic ${btoa("admin:quest")}` },
    failOnStatusCode: false,
  })

const setEditor = (value, cursorOffset = value.length) =>
  cy.window().then((win) => {
    const editor = win.monaco.editor.getEditors()[0]
    editor.setValue(value)
    editor.setPosition(editor.getModel().getPositionAt(cursorOffset))
    editor.focus()
  })

const suggest = () =>
  cy.window().then((win) => {
    win.monaco.editor
      .getEditors()[0]
      .trigger("test", "editor.action.triggerSuggest", {})
  })

const expectValue = (expected) =>
  cy.window().should((win) => {
    expect(win.monaco.editor.getEditors()[0].getValue()).to.equal(expected)
  })

describe("editor SQL agrees with /exec", () => {
  before(() => {
    exec(`CREATE TABLE ${table} (price DOUBLE, ts LONG)`)
      .its("body.ddl")
      .should("eq", "OK")
    exec(`INSERT INTO ${table} VALUES (2, 3)`)
      .its("body.dml")
      .should("eq", "OK")
  })

  after(() => {
    exec(`DROP TABLE IF EXISTS ${table}`).its("body.ddl").should("eq", "OK")
  })

  it("runs only live SQL after nested comments and preserves the table", () => {
    // Given the server skips the nested block, including its DROP statement
    const sql = `/*\nSELECT * FROM ${table}; /* old */\nDROP TABLE ${table};\n*/\nSELECT 2;`
    exec(sql)
      .its("body.dataset")
      .should("deep.equal", [[2]])
    cy.loadConsoleWithAuth(false, {}, { buffers: [{ value: sql }] })
    cy.intercept(editorExecution).as("run")
    setEditor(sql)

    // When the user runs the whole tab
    cy.getEditorContent().type(`${ctrlOrCmd}{shift}{enter}`)
    cy.getByDataHook("run-all-queries-confirm").click()

    // Then the console sends only the live statement and the table survives
    cy.wait("@run").then(({ request, response }) => {
      expect(request.query.query).to.equal("SELECT 2")
      expect(response.body.dataset).to.deep.equal([[2]])
    })
    exec(`SELECT count() FROM ${table}`)
      .its("body.dataset")
      .should("deep.equal", [[1]])
  })

  for (const quote of ["`", '"']) {
    it(`preserves following SQL when completing an unmatched ${quote}`, () => {
      // Given an incomplete quoted name before another quoted column
      cy.loadConsoleWithAuth()
      const prefix = `SELECT * FROM ${table} WHERE ${quote}pr`
      const suffix = ` > 1 AND ${quote}ts${quote} > 0`
      setEditor(prefix + suffix, prefix.length)
      suggest()
      cy.getAutocomplete().should("be.visible").and("contain", "price")

      // When accepting the column completion
      cy.getEditorContent().type("{enter}")

      // Then surrounding SQL survives, and the server returns the correct row
      const expected = `SELECT * FROM ${table} WHERE ${quote}price${quote}  ${suffix.trimStart()}`
      expectValue(expected)
      exec(expected)
        .its("body.dataset")
        .should("deep.equal", [[2, 3]])
      cy.intercept(editorExecution).as("run")
      cy.getEditorContent().type(`${ctrlOrCmd}{enter}`)
      cy.wait("@run").then(({ request, response }) => {
        expect(request.query.query).to.equal(expected)
        expect(response.body.dataset).to.deep.equal([[2, "3"]])
      })
    })
  }

  for (const kind of ["TABLE", "ATOMIC TABLE", "VIEW", "MATERIALIZED VIEW"]) {
    it(`accepts NOT using Enter after CREATE ${kind} IF`, () => {
      // Given the server rejects IF AS
      exec(`CREATE ${kind} IF AS (SELECT 1)`).then(({ status, body }) => {
        expect(status).to.equal(400)
        expect(body.error).to.equal("'if not exists' expected")
      })
      cy.loadConsoleWithAuth()
      setEditor("")
      cy.getEditorContent().type(`CREATE ${kind} IF `)

      // When the user accepts the focused completion with Enter
      cy.getAutocomplete()
        .find(".monaco-list-row.focused")
        .should("have.text", "NOT")
      cy.getEditorContent().type("{enter}")
      cy.getAutocomplete()
        .find(".monaco-list-row.focused")
        .should("have.text", "EXISTS")
      cy.getEditorContent().type("{enter}")

      // Then the editor contains the server's required clause
      expectValue(`CREATE ${kind} IF NOT EXISTS `)
    })
  }

  it("offers completion and runs code after -- inside a block comment", () => {
    // Given -- hides a nested opener according to the server
    const prefix = "/* disabled:\nSELECT 1 -- see /* below\n*/\n"
    exec(prefix + `SELECT * FROM ${table}`)
      .its("body.dataset")
      .should("deep.equal", [[2, 3]])
    cy.loadConsoleWithAuth()
    const sql = prefix + `SELECT * FROM ${table} WHERE p`
    setEditor(sql)

    // When requesting a column completion on the live query
    suggest()
    cy.getAutocomplete().should("be.visible").and("contain", "price")
    cy.getEditorContent().type("{enter}")

    // Then the live query runs with the same result
    cy.getEditorContent().type("> 1")
    cy.intercept(editorExecution).as("run")
    cy.getEditorContent().type(`${ctrlOrCmd}{enter}`)
    cy.wait("@run").then(({ request, response }) => {
      expect(request.query.query).to.equal(
        `SELECT * FROM ${table} WHERE price > 1`,
      )
      expect(response.body.dataset).to.deep.equal([[2, "3"]])
    })
  })

  for (const quote of ["`", '"', "'"]) {
    it(`suppresses comment completions after an earlier unmatched ${quote}`, () => {
      // Given the server rejects the earlier malformed statement
      const sql = `SELECT ${quote}x;\nSELECT * FROM ${table} /* zz p`
      exec(sql).its("status").should("eq", 400)
      cy.loadConsoleWithAuth()
      setEditor(sql.slice(0, -1))

      // When typing within the later comment
      cy.getEditorContent().type("p")

      // Then no suggestion popup opens
      cy.get("body").should((body) => {
        expect(
          body.find('[widgetid="editor.widget.suggestWidget"]:visible'),
        ).to.have.length(0)
      })
    })
  }
})
