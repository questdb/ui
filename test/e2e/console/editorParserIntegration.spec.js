/// <reference types="cypress" />

const { ctrlOrCmd, escapeRegExp } = require("../utils")
const table = `zz_console_parser_${Date.now()}`
const spacedTable = `${table} spaced table`
const editorExecution = { url: "**/exec*", query: { explain: "true" } }

const setEditor = (input) =>
  cy.window().then((win) => {
    const editor = win.monaco.editor.getEditors()[0]
    const cursor = input.indexOf("|")
    const sql = input.replace("|", "")
    editor.setValue(sql)
    editor.setPosition(
      editor.getModel().getPositionAt(cursor < 0 ? sql.length : cursor),
    )
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

const accept = (label) => {
  suggest()
  cy.getAutocomplete()
    .should("be.visible")
    .contains(
      ".monaco-highlighted-label",
      new RegExp(`^${escapeRegExp(label)}$`),
    )
    .click()
}

describe("released SQL parser integration", () => {
  before(() => {
    cy.execAdminQuery(`CREATE TABLE ${table} (price DOUBLE, ts LONG)`)
    cy.execAdminQuery(`INSERT INTO ${table} VALUES (2, 3)`)
    cy.execAdminQuery(`CREATE TABLE "${spacedTable}" (price DOUBLE, ts LONG)`)
  })

  after(() => {
    cy.execAdminQuery(`DROP TABLE IF EXISTS "${spacedTable}"`)
    cy.execAdminQuery(`DROP TABLE IF EXISTS ${table}`)
  })

  beforeEach(() => {
    cy.loadConsoleWithAuth(false, {}, { buffers: [{ value: "SELECT 1" }] })
  })

  it("preserves table, alias, CTE, and double-quoted name completion", () => {
    // Given common completion contexts that already worked on main
    const cases = [
      [
        `SELECT * FROM ${table}|`,
        spacedTable,
        `SELECT * FROM "${spacedTable}" `,
      ],
      [
        `SELECT t.pr| FROM ${table} t`,
        "price",
        `SELECT t.price  FROM ${table} t`,
      ],
      [
        `SELECT t.| FROM ${table} t`,
        "price",
        `SELECT t.price  FROM ${table} t`,
      ],
      [
        `WITH c AS (SELECT price FROM ${table}) SELECT pr| FROM c`,
        "price",
        `WITH c AS (SELECT price FROM ${table}) SELECT price  FROM c`,
      ],
      [
        `SELECT * FROM "${table}|"`,
        spacedTable,
        `SELECT * FROM "${spacedTable}" `,
      ],
    ]
    for (const [input, label, expected] of cases) {
      // When accepting a suggestion in Monaco
      setEditor(input)
      accept(label)

      // Then the accepted SQL retains its qualifier and surrounding text
      expectValue(expected)
    }
  })

  it("accepts newly offered namespace functions as valid SQL", () => {
    for (const [namespace, name] of [
      ["pg_catalog", "pg_class"],
      ["information_schema", "tables"],
    ]) {
      for (const suffix of ["", name.slice(0, 3)]) {
        // Given a function namespace, with or without a member prefix
        setEditor(`SELECT * FROM ${namespace}.${suffix}|`)

        // When its newly offered function is accepted
        accept(`${namespace}.${name}`)

        // Then there is one namespace and the query executes
        expectValue(`SELECT * FROM ${namespace}.${name}()`)
        cy.intercept(editorExecution).as("functionQuery")
        cy.getEditorContent().type(`${ctrlOrCmd}{enter}`)
        cy.wait("@functionQuery").then(({ response }) => {
          expect(response.statusCode).to.equal(200)
          expect(response.body.dataset).to.be.an("array")
        })
      }
    }
  })

  it("completes spaced names with either identifier quote", () => {
    for (const quote of ['"', "`"]) {
      for (const closing of [quote, ""]) {
        // Given a name containing spaces, with or without its closing quote
        setEditor(`SELECT * FROM ${quote}${table} spaced ta|${closing}`)

        // When accepting the matching table
        accept(spacedTable)

        // Then the original quote type is retained and the query is valid
        const expected = `SELECT * FROM ${quote}${spacedTable}${quote} `
        expectValue(expected)
        cy.execAdminQuery(expected).its("body.dataset").should("deep.equal", [])
      }
    }
  })

  it("never opens completion inside a single-quoted value", () => {
    // Given a working suggestion widget before entering a string
    setEditor(`SELECT * FROM ${table.slice(0, -2)}|`)
    suggest()
    cy.getAutocomplete().should("be.visible").and("contain", table)

    for (const input of [
      "SELECT 'pr|'",
      "SELECT 'pr|",
      "SELECT 'it''s pr|",
      "SELECT 'it''|",
      "SELECT E'pr|",
      "SELECT 'pr; -- text /* |",
    ]) {
      // When requesting completion inside a closed or unfinished value
      setEditor(input)
      suggest()

      // Then neither the text nor a visible completion popup appears
      expectValue(input.replace("|", ""))
      cy.get("body").should((body) => {
        expect(
          body.find('[widgetid="editor.widget.suggestWidget"]:visible'),
        ).to.have.length(0)
      })
    }
  })

  it("preserves main's completion after unusual closed block comments", () => {
    for (const prefix of [
      "/* '/*' */",
      "/* 'a\n/* b' */",
      "/* disabled:\nSELECT 1 -- see /* below\n*/",
    ]) {
      // Given comment syntax that main and the real server already accept
      setEditor(`${prefix}\nSELECT * FROM ${table.slice(0, -2)}|`)

      // When accepting a table after the comment
      accept(table)

      // Then completion preserves the original text and the SQL still executes
      const expected = `${prefix}\nSELECT * FROM ${table} `
      expectValue(expected)
      cy.execAdminQuery(expected)
        .its("body.dataset")
        .should("deep.equal", [[2, 3]])
      cy.execAdminQuery(`${prefix}\nDECLARE @x := 42 SELECT @x`)
        .its("body.dataset")
        .should("deep.equal", [[42]])
    }
  })

  it("keeps NOT first after CREATE IF, including a leading comment", () => {
    for (const prefix of ["", "-- a note\n", "/* a note */\n"]) {
      // Given an incomplete CREATE statement
      setEditor(`${prefix}CREATE TABLE IF |`)

      // When accepting the focused suggestion with Enter
      suggest()
      cy.getAutocomplete()
        .find(".monaco-list-row.focused")
        .should("have.text", "NOT")
      cy.getEditorContent().type("{enter}")

      // Then the old keyboard-driven flow still offers EXISTS next
      expectValue(`${prefix}CREATE TABLE IF NOT `)
      cy.getAutocomplete().should("contain", "EXISTS")
    }
  })

  it("offers new grammar completions without additional editor state", () => {
    for (const [input, label, expected] of [
      [
        `SELECT price FROM ${table} GROUP BY |`,
        "ROLLUP",
        `SELECT price FROM ${table} GROUP BY ROLLUP `,
      ],
      [
        `SELECT price FROM ${table} SAMPLE BY 1h FILL( |`,
        "PREV",
        `SELECT price FROM ${table} SAMPLE BY 1h FILL( PREV `,
      ],
      [
        "CREATE TABLE t (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY WAL DEDUP |",
        "SKIP",
        "CREATE TABLE t (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY WAL DEDUP SKIP ",
      ],
    ]) {
      // Given syntax added by the released parser
      setEditor(input)

      // When accepting an ordinary keyword suggestion
      accept(label)

      // Then the new syntax is inserted through the existing provider
      expectValue(expected)
    }
  })

  it("formats new array syntax while preserving quoted values", () => {
    // Given a query containing slice syntax and SQL markers inside a value
    const sql = `select 'it''s; -- /* text */' as "Case Name", ARRAY[1.0,2.0][1: 2] as a`
    setEditor(sql)
    cy.execAdminQuery(sql).then(({ body: before }) => {
      expect(before.error).to.equal(undefined)

      // When using the existing Monaco formatter
      cy.window().then((win) => {
        win.monaco.editor
          .getEditors()[0]
          .trigger("test", "editor.action.formatDocument")
      })

      // Then formatted SQL executes with identical values and column names
      cy.window()
        .should((win) => {
          expect(win.monaco.editor.getEditors()[0].getValue()).to.include("\n")
        })
        .then((win) => {
          const formatted = win.monaco.editor.getEditors()[0].getValue()
          expect(formatted).to.include("'it''s; -- /* text */'")
          cy.execAdminQuery(formatted).then(({ body: after }) => {
            expect(after.columns).to.deep.equal(before.columns)
            expect(after.dataset).to.deep.equal(before.dataset)
          })
        })
    })
  })

  it("colors basic grammar tokens using the existing Monaco tokenizer", () => {
    // Given the console's registered language
    cy.window().then((win) => {
      const id = win.monaco.editor.getEditors()[0].getModel().getLanguageId()
      const sql =
        "SELECT grouping_id(x), .5, 1.5f, $1, `order` FROM t GROUP BY GROUPING SETS ((x), ())"

      // When tokenizing representative released grammar
      const [line] = win.monaco.editor.tokenize(sql, id)
      const tokens = line.map((token, index) => ({
        text: sql.slice(token.offset, line[index + 1]?.offset ?? sql.length),
        type: token.type,
      }))

      // Then the basic literals, keyword, function and identifier are colored
      for (const [text, type] of [
        [".5", "number.sql"],
        ["1.5f", "number.sql"],
        ["$1", "variable.sql"],
        ["order", "identifier.sql"],
        ["grouping_id", "predefined.sql"],
        ["GROUPING", "keyword.sql"],
      ])
        expect(tokens).to.deep.include({ text, type })
    })
  })

  it("preserves main's execution boundary for an unfinished quote", () => {
    // Given an unfinished quoted statement with an apparent second query
    const sql = "SELECT 'unfinished;\nSELECT 42;"
    setEditor("SELECT 'unfinished;\nSELE|CT 42;")
    cy.getCursorQueryGlyph().should("have.length", 1)
    cy.intercept(editorExecution).as("unfinishedQuery")

    // When running from the cursor
    cy.getEditorContent().type(`${ctrlOrCmd}{enter}`)

    // Then the original whole statement reaches the server and errors
    cy.wait("@unfinishedQuery").then(({ request, response }) => {
      expect(request.query.query).to.equal(sql.slice(0, -1))
      expect(response.body.error).to.exist
    })
  })
})
