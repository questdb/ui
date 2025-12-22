/// <reference types="cypress" />

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl = `http://localhost:9999${contextPath}`

const { ctrlOrCmd } = require("../../utils")

const getTabDragHandleByTitle = (title) =>
  `.chrome-tab[data-tab-title="${title}"] .chrome-tab-drag-handle`

describe("run query", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
    cy.getEditorContent().should("be.visible")
    cy.clearEditor()
  })

  it("should correctly run query in the first line", () => {
    cy.typeQuery("select 1;\n\nselect 2;")
    cy.clickRunIconInLine(1)
    cy.getGridRow(0).should("contain", "1")
  })

  it("should run the correct query when there are multiple queries in the same line", () => {
    cy.typeQuery(
      "with longseq as (\nselect * from long_sequence(100)\n-- comment",
    )
    cy.typeQuery(" select count(*) from longseq;select 1;")

    // go to the end of second query
    cy.clickLine(4).type(`${ctrlOrCmd}{enter}`)
    cy.getGridCol(0).should("contain", "1")
    cy.getGridRow(0).should("contain", "1")

    // go inside the second query
    cy.clickLine(4)
    cy.realPress("ArrowLeft")
    cy.realPress("ArrowLeft")
    cy.focused().type(`${ctrlOrCmd}{enter}`)
    cy.getColumnName(0).should("contain", "1")
    cy.getGridRow(0).should("contain", "1")

    // go to the end of first query
    cy.clickLine(4)
    for (let i = 0; i < 10; i++) {
      cy.realPress("ArrowLeft")
    }
    cy.focused().type(`${ctrlOrCmd}{enter}`)
    cy.getColumnName(0).should("contain", "count()")
    cy.getGridRow(0).should("contain", "100")

    // go inside the first query
    cy.clickLine(4)
    for (let i = 0; i < 11; i++) {
      cy.realPress("ArrowLeft")
    }
    cy.focused().type(`${ctrlOrCmd}{enter}`)
    cy.getColumnName(0).should("contain", "count()")
    cy.getGridRow(0).should("contain", "100")
  })

  it("should provide query selection dropdown when multiple queries start from the same line", () => {
    cy.typeQuery("select 1;select 2;select 3;")
    cy.clickRunIconInLine(1)
    cy.getByDataHook("dropdown-item-run-query-0").should(
      "contain",
      `Run "select 1"`,
    )
    cy.getByDataHook("dropdown-item-run-query-1").should(
      "contain",
      `Run "select 2"`,
    )
    cy.getByDataHook("dropdown-item-run-query-2").should(
      "contain",
      `Run "select 3"`,
    )
    cy.getByDataHook("dropdown-item-run-query-1")
      .contains(`Run "select 2"`)
      .click()
    cy.getByDataHook("success-notification").should("contain", "select 2")
  })
})

describe("run query with selection", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
    cy.getEditorContent().should("be.visible")
    cy.clearEditor()
  })

  it("should correctly identify and run selected queries", () => {
    // Given
    cy.getByDataHook("button-run-query").should("be.disabled")

    // When
    cy.typeQuery("select 11;select 22;select 33;")
    // Then
    cy.getByDataHook("button-run-query").should("contain", "Run query")

    // When
    cy.clickRunQuery()
    // Then
    cy.getByDataHook("success-notification").should("contain", "select 33")

    // When
    cy.selectRange({ lineNumber: 1, column: 1 }, { lineNumber: 1, column: 9 })
    // Then
    cy.getByDataHook("button-run-query").should("contain", "Run selected query")

    // When
    cy.clickRunQuery()
    // Then
    cy.getByDataHook("success-notification").should("contain", "select 1")

    // When
    cy.selectRange({ lineNumber: 1, column: 1 }, { lineNumber: 1, column: 10 })
    // Then
    cy.getByDataHook("button-run-query").should("contain", "Run selected query")

    // When
    cy.clickRunQuery()
    // Then
    cy.getByDataHook("success-notification").should("contain", "select 11")

    // When
    cy.selectRange({ lineNumber: 1, column: 1 }, { lineNumber: 1, column: 19 })
    // Then
    cy.getByDataHook("button-run-query").should(
      "contain",
      "Run 2 selected queries",
    )

    // When
    cy.clickRunQuery()
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

  it("should run and explain a specific query from the line glyph", () => {
    const subQuery = "select md5(concat('1', x)) as md from long_sequence(100)"
    const subQueryTruncated = "select md5(concat('1', x)) as ..."

    // When
    cy.typeQueryDirectly(
      `create table long_seq as (\n  ${subQuery}\n  --comment\n);`,
    )
    cy.openRunDropdownInLine(1)
    // Then
    cy.getByDataHook("dropdown-item-run-query").should(
      "contain",
      `Run "create table long_seq as (`,
    )
    cy.getByDataHook("dropdown-item-get-query-plan").should(
      "contain",
      `Get query plan for "create table long_seq as (`,
    )

    // When
    cy.getByDataHook("dropdown-item-get-query-plan").click()
    // Then
    cy.getByDataHook("success-notification").should(
      "contain",
      "EXPLAIN create table long_seq as",
    )

    // When
    cy.selectRange(
      { lineNumber: 2, column: 3 },
      { lineNumber: 2, column: 3 + subQuery.length },
    )
    // Then
    cy.getByDataHook("button-run-query").should("contain", "Run selected query")

    // When
    cy.openRunDropdownInLine(1)
    // Then
    cy.getByDataHook("dropdown-item-run-query").should(
      "contain",
      `Run "${subQueryTruncated}"`,
    )
    cy.getByDataHook("dropdown-item-get-query-plan").should(
      "contain",
      `Get query plan for "${subQueryTruncated}"`,
    )

    // When
    cy.getByDataHook("dropdown-item-run-query").click()
    // Then
    cy.getByDataHook("success-notification").should("contain", subQuery)

    // When
    cy.openRunDropdownInLine(1)
    cy.getByDataHook("dropdown-item-get-query-plan").click()
    // Then
    cy.getByDataHook("success-notification").should(
      "contain",
      `EXPLAIN ${subQuery}`,
    )
  })
})

describe("run all queries in tab", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
    cy.getEditorContent().should("be.visible")
    cy.clearEditor()
  })

  it("should run all queries in tab", () => {
    // Given
    cy.typeQueryDirectly(
      "select 1;select 2;select 3;\n\ncreate table long_seq as (\nselect md5(concat('1', x)) as md from long_sequence(100)\n--comment\n);\ndrop table long_seq;\n\ndrop table long_seq;\n;\n;\n ;\n  ;\n; ;;\n",
    )

    // When
    cy.typeQuery(`${ctrlOrCmd}a`)
    // Then
    cy.getByDataHook("button-run-query").should(
      "contain",
      "Run 6 selected queries",
    )

    // When
    cy.clickLine(1)
    // Then
    cy.getByDataHook("button-run-script").should("not.exist")

    // When
    cy.getByDataHook("button-run-query-dropdown").click()
    // Then
    cy.getByDataHook("button-run-script").should("be.visible")

    // When
    cy.getByDataHook("button-run-script").click()
    // Then
    cy.getByRole("dialog").should("be.visible")
    cy.getByDataHook("stop-after-failure-checkbox").should("be.checked")

    // When
    cy.getByDataHook("run-all-queries-confirm").click()
    // Then
    cy.getByDataHook("success-notification")
      .invoke("text")
      .should(
        "match",
        /Running completed in \d+ms with\s+5 successful\s+and\s+1 failed\s+queries/,
      )

    // When
    cy.scrollToLine(1)

    // Then
    cy.get(".success-glyph").should("have.length", 3)
    cy.get(".error-glyph").should("have.length", 1)

    // When
    cy.clickLine(9)
    // Then
    cy.getByDataHook("error-notification").should(
      "contain",
      "table does not exist",
    )
    cy.getByDataHook("error-notification").should(
      "contain",
      "drop table long_seq",
    )

    // When
    cy.expandNotifications()
    // Then
    cy.getExpandedNotifications().children().should("have.length", 8)
  })

  it("should not run all queries if stop after failure is checked", () => {
    // Given
    cy.typeQuery("select 1;\nselect a;\nselect 3;")

    // When
    cy.clickRunScript()

    // Then
    cy.getByDataHook("error-notification")
      .invoke("text")
      .should(
        "match",
        /Stopped after running\s+1 successful\s+and\s+1 failed\s+queries/,
      )
    cy.get(".success-glyph").should("have.length", 1)
    cy.get(".error-glyph").should("have.length", 1)
    cy.get(".cursorQueryGlyph").should("have.length", 3)
  })

  it("should run all queries if stop after failure is unchecked", () => {
    // Given
    cy.typeQuery("select 1;\nselect a;\nselect 3;")

    // When
    cy.clickRunScript(true)

    // Then
    cy.getByDataHook("success-notification")
      .invoke("text")
      .should(
        "match",
        /Running completed in \d+ms with\s+2 successful\s+and\s+1 failed\s+queries/,
      )
    cy.get(".success-glyph").should("have.length", 2)
    cy.get(".error-glyph").should("have.length", 1)
    cy.get(".cursorQueryGlyph").should("have.length", 3)
  })

  it("should scroll to the running query and show the loading notification", () => {
    // Given
    cy.intercept("/exec*", (req) => {
      req.on("response", (res) => {
        res.setDelay(1000)
      })
    })
    cy.typeQuery(
      "select 1;\n\n\n\n\n\n\n\n\nselect 2;\n\n\n\n\n\n\n\n\n\nselect 3;",
    )

    // When
    cy.clickRunScript()

    // Then
    cy.getByDataHook("loading-notification").should(
      "contain",
      `Running query "select 1"`,
    )
    cy.getRunIconInLine(1).should("be.visible")
    // Then
    cy.getByDataHook("loading-notification").should(
      "contain",
      `Running query "select 2"`,
    )
    cy.getRunIconInLine(10).should("be.visible")
    // Then
    cy.getByDataHook("loading-notification").should(
      "contain",
      `Running query "select 3"`,
    )
    cy.getRunIconInLine(20).should("be.visible")
  })

  it("should disable editing when running script", () => {
    // Given
    cy.intercept("/exec*", (req) => {
      req.on("response", (res) => {
        res.setDelay(1000)
      })
    })
    cy.typeQuery("select 1;\nselect 2;\nselect 3;")

    // When
    cy.clickRunScript()

    // Then
    cy.typeQuery("should not be visible")
    cy.getEditorContent().should("not.contain", "should not be visible")
  })

  it("should move cursor to the failed query after running script", () => {
    // Given
    cy.typeQuery("select 1;\nselect a;\nselect 2;")
    cy.clickLine(1)

    // When
    cy.clickRunScript()

    // Then
    cy.get(".active-line-number").should("contain", "2")
  })

  it("should keep the cursor position if all queries are successful", () => {
    // Given
    cy.typeQuery("select 1;\nselect 2;\nselect 3;")
    cy.clickLine(1)

    // When
    cy.clickRunScript()

    // Then
    cy.get(".active-line-number").should("contain", "1")
  })
})

describe("appendQuery", () => {
  const consoleConfiguration = {
    savedQueries: [
      { name: "query 1", value: "first query;" },
      { name: "query 2", value: "second query;" },
      {
        name: "query 3",
        value: "multi\nline\nquery;",
      },
    ],
  }

  const queries = consoleConfiguration.savedQueries.map((query) => query.value)

  before(() => {
    cy.intercept(
      {
        method: "GET",
        url: `${baseUrl}/assets/console-configuration.json`,
      },
      consoleConfiguration,
    ).as("getConsoleConfiguration")

    cy.loadConsoleWithAuth()
  })

  beforeEach(() => {
    cy.getEditorContent().should("be.visible")
    cy.clearEditor()
  })

  it("should append and select first query", () => {
    cy.selectQuery(0)
    const expected = `\n${queries[0]}`
    cy.getEditorContent().should("have.value", expected)
    cy.getSelectedLines().should("have.length", 1)
  })

  it("should append and select second query", () => {
    cy.selectQuery(1)
    const expected = `\n${queries[1]}`
    cy.getEditorContent().should("have.value", expected)
    cy.getSelectedLines().should("have.length", 1)
  })

  it("should append and select multiline query", () => {
    cy.selectQuery(2)
    const expected = `\n${queries[2]}`
    cy.getEditorContent().should("have.value", expected)
    // monaco editor visually selects all 3 lines, but creates 4 elements to visualise selection
    cy.getSelectedLines().should("have.length", 4)
  })

  it("should correctly append and select query after multiple inserts", () => {
    cy.selectQuery(1)
    cy.selectQuery(1)
    cy.typeQuery(`{ctrl}g2{enter}`) // go to line 2
    cy.selectQuery(2)
    const expected = `\n${queries[1]}\n\n${queries[1]}\n\n${queries[2]}`
    cy.getEditorContent().should("have.value", expected)
    cy.getSelectedLines().should("have.length", 4)
  })

  it("should correctly append and select query when position is first line which is empty", () => {
    cy.typeQuery(`{enter}--b{upArrow}`)
    cy.selectQuery(0)
    cy.selectQuery(1)
    const expected = `\n--b\n${queries[0]}\n\n${queries[1]}`
    cy.getEditorContent().should("have.value", expected)
    cy.getSelectedLines().should("have.length", 1)
  })

  it("should correctly append and select query when position is first line which is not empty", () => {
    cy.typeQuery(`--a`)
    cy.selectQuery(0)
    const expected = `--a\n${queries[0]}`
    cy.getEditorContent().should("have.value", expected)
    cy.getSelectedLines().should("have.length", 1)
  })

  it("should correctly append and select query when position is first line which is not empty and there's more content after", () => {
    cy.typeQuery(`--a{enter}{enter}--b{upArrow}{upArrow}`)
    cy.selectQuery(0)
    const expected = `--a\n\n--b\n${queries[0]}`
    cy.getEditorContent().should("have.value", expected)
    cy.getSelectedLines().should("have.length", 1)
  })

  it("should correctly append and add surrounding new lines when position is middle line which is empty", () => {
    cy.typeQuery(`--a{enter}{enter}--b{upArrow}`)
    cy.selectQuery(0)
    const expected = `--a\n\n--b\n\n${queries[0]}`
    cy.getEditorContent().should("have.value", expected)
    cy.getSelectedLines().should("have.length", 1)
  })

  it("should correctly append and add surrounding new lines when position is last line which is empty", () => {
    cy.typeQuery(`--a{enter}--b`)
    cy.selectQuery(0)
    const expected = `--a\n--b\n\n${queries[0]}`
    cy.getEditorContent().should("have.value", expected)
    cy.getSelectedLines().should("have.length", 1)
  })

  it("should correctly append and add surrounding new lines when there are two lines and position is last line which is empty", () => {
    cy.typeQuery(`--a{enter}`)
    cy.selectQuery(0)
    const expected = `--a\n\n\n${queries[0]}`
    cy.getEditorContent().should("have.value", expected)
    cy.getSelectedLines().should("have.length", 1)
  })

  it("should correctly append and add surrounding new lines when position is middle of non empty line and next line is empty", () => {
    cy.typeQuery(`--a{enter}--b{enter}{enter}--c`)
    cy.typeQuery(`{ctrl}g2{enter}{rightArrow}`) // go to line 2
    cy.selectQuery(0)
    const expected = `--a\n--b\n\n--c\n\n${queries[0]}`
    cy.getEditorContent().should("have.value", expected)
    cy.getSelectedLines().should("have.length", 1)
  })
})

describe("&query URL param", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
  })

  it("should append and select single line query", () => {
    cy.typeQueryDirectly("select x from long_sequence(1)") // running query caches it, it's available after refresh
    cy.getCursorQueryGlyph().should("be.visible")
    const query = encodeURIComponent("select x+1 from long_sequence(1)")
    cy.visit(`${baseUrl}/?query=${query}&executeQuery=true`)
    cy.getEditorContent().should("be.visible")
    cy.getGridRow(0).should("contain", "2")
    cy.getSelectedLines().should("have.length", 1)
  })

  it("should append and select multiline query", () => {
    cy.typeQueryDirectly(
      `select x\nfrom long_sequence(1);\n\n-- a\n-- b\n-- c\n${"{upArrow}".repeat(
        5,
      )}`,
    )
    cy.getCursorQueryGlyph().should("be.visible")
    const query = encodeURIComponent("select x+1\nfrom\nlong_sequence(1);")
    cy.visit(`${baseUrl}?query=${query}&executeQuery=true`)
    cy.getEditorContent().should("be.visible")
    cy.getGridRow(0).should("contain", "2")
    cy.getSelectedLines().should("have.length", 4)
  })

  it("should not append query if it already exists in editor", () => {
    const query = "select x\nfrom long_sequence(1);\n\n-- a\n-- b\n-- c"
    cy.typeQueryDirectly(query)
    cy.clickRunIconInLine(1)
    cy.visit(`${baseUrl}?query=${encodeURIComponent(query)}&executeQuery=true`)
    cy.getEditorContent().should("be.visible")
    cy.getEditorContent().should("have.value", query)
  })

  it("should append query and scroll to it", () => {
    cy.typeQueryDirectly("select x from long_sequence(1);")
    cy.getCursorQueryGlyph().should("be.visible")
    cy.typeQuery("\n".repeat(20))

    const appendedQuery = "-- hello world"
    cy.visit(`${baseUrl}?query=${encodeURIComponent(appendedQuery)}`)
    cy.getEditorContent().should("be.visible")
    cy.getVisibleLines()
      .invoke("text")
      .should("match", /hello.world$/) // not matching on appendedQuery, because query should be selected for which Monaco adds special chars between words
  })

  it("should open a new editor tab when the last active buffer is a metrics buffer", () => {
    // when
    cy.getByDataHook("schema-add-metrics-button").click()
    // then
    cy.getByDataHook("metrics-root").should("be.visible")

    // when
    cy.visit(
      `${baseUrl}?query=${encodeURIComponent("select x from long_sequence(1)")}`,
    )

    // then
    cy.getEditor().should("be.visible")
    cy.getEditorTabs().should("have.length", 3)
    cy.getEditorTabByTitle("Metrics 1").should("be.visible")
    cy.getEditorTabByTitle("Query")
      .should("be.visible")
      .should("have.attr", "active")
  })
})

describe("autocomplete", () => {
  before(() => {
    cy.loadConsoleWithAuth()
    // We're creating two tables (my_secrets and my_secrets2) with the same column name.
    // The autocomplete should merge the column completions into one
    // and respond with something like `secret (my_secrets, my_secrets2)
    ;["my_publics", "my_secrets", "my_secrets2"].forEach((table) => {
      cy.createTable(table)
    })
    cy.refreshSchema()
  })

  beforeEach(() => {
    cy.getEditorContent().should("be.visible")
  })

  it("should work when provided table name doesn't exist", () => {
    cy.typeQuery("select * from teletubies")
    cy.getAutocomplete().should("not.be.visible").clearEditor()
  })

  it("should be case insensitive", () => {
    const assertFrom = () =>
      cy.getAutocomplete().within(() => {
        cy.getMonacoListRow()
          .should("have.length", 4)
          .eq(0)
          .should("contain", "FROM")
      })
    cy.typeQuery("select * from")
    assertFrom()
    cy.clearEditor()
    cy.typeQuery("SELECT * FROM")
    assertFrom()
  })

  it("should suggest the existing tables on 'from' clause", () => {
    cy.typeQuery("select * from ")
    cy.getAutocomplete()
      // tables
      .should("not.contain", "telemetry")
      .should("contain", "my_secrets")
      .should("contain", "my_publics")
      .clearEditor()
  })

  it("should suggest columns and tables on 'select' clause", () => {
    cy.typeQuery("select ")
    cy.getAutocomplete()
      // Columns
      .should("contain", "secret")
      .should("contain", "public")
      // Tables list for the `secret` column
      // list the tables containing `secret` column
      .should("contain", "my_secrets, my_secrets2")
      .clearEditor()
  })

  it("should suggest columns on SELECT only when applicable", () => {
    cy.typeQuery("select secret")
    cy.getAutocomplete().should("contain", "secret").eq(0).click()
    cy.typeQuery(", public")
    cy.getAutocomplete().should("contain", "public").eq(0).click()
    cy.typeQuery(" ")
    cy.getAutocomplete().should("not.be.visible")
  })

  it("should suggest correct columns on 'where' filter", () => {
    cy.typeQuery("select * from my_secrets where ")
    cy.getAutocomplete()
      .should("contain", "secret")
      .should("not.contain", "public")
      .clearEditor()
  })

  it("should suggest correct columns on 'on' clause", () => {
    cy.typeQuery("select * from my_secrets join my_publics on ")
    cy.getAutocomplete()
      .should("contain", "my_publics.public")
      .should("contain", "my_secrets.secret")
      .clearEditor()
  })

  after(() => {
    cy.loadConsoleWithAuth()
    ;["my_publics", "my_secrets", "my_secrets2"].forEach((table) => {
      cy.dropTable(table)
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

  it("should mark '(200000)' as error", () => {
    const query = `create table test (\ncol symbol index CAPACITY (200000)`
    cy.typeQuery(query)
    cy.runLine()
    cy.matchErrorMarkerPosition({ left: 237, width: 67 })
    cy.getCollapsedNotifications().should("contain", "bad integer")
  })

  it("should mark date position as error", () => {
    const query = `select * from long_sequence(1) where cast(x as timestamp) = '2012-04-12T12:00:00A'`
    cy.typeQuery(query)
    cy.runLine()
    cy.matchErrorMarkerPosition({ left: 506, width: 42 })

    cy.getCollapsedNotifications().should("contain", "Invalid date")
  })

  const operators = [
    "+",
    "-",
    "*",
    "/",
    "%",
    ">",
    "<",
    "=",
    "!",
    "&",
    "|",
    "^",
    "~",
  ]

  operators.forEach((char) => {
    it(`should mark operator '${char}' as error`, () => {
      const query = `select x FROM long_sequence(100 ${char} "string");`
      cy.typeQuery(query)
      cy.runLine()
      cy.matchErrorMarkerPosition({ left: 270, width: 8 })
      cy.clearEditor()
    })
  })

  it("should show error in notifications when response is not valid JSON", () => {
    const response = {
      statusCode: 200,
      body: "This is not valid JSON {invalid json content",
    }

    cy.typeQuery("long_sequence(100);")
    cy.runLineWithResponse(response)

    cy.getCollapsedNotifications().should(
      "contain",
      "Invalid JSON response from the server",
    )
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
    cy.typeQuery("select * from long_sequence(1)")
    cy.F9()
    cy.getGridRow(0).should("contain", "1")
    cy.clearEditor()
    cy.typeQuery(`select * from long_sequence(2);{leftArrow}`)
    cy.F9()
    cy.getGridRow(1).should("contain", "2")
  })

  it("should execute correct query, when multiple queries exist", () => {
    cy.typeQuery(
      "long_sequence(10) where x = 3;\n\nlong_sequence(5) limit 2;{upArrow}{upArrow}{end}{leftArrow}",
    )
    cy.F9()
    cy.getGridRow(0).should("contain", "3")
    cy.clearEditor()
    cy.typeQuery(
      "long_sequence(10) where x = 3;\n\nlong_sequence(5) limit 2{upArrow}{upArrow}{end}{leftArrow}",
    )
    cy.F9()
    cy.getGridRow(0).should("contain", "3")
  })

  it("should execute a correct query when line comment is present", () => {
    cy.clearEditor()
    cy.typeQuery(
      "select * from long_sequence(1); -- comment\nselect * from long_sequence(2);{upArrow}{rightArrow}{rightArrow}",
    )
    cy.F9()
    cy.getGridRows().should("have.length", 1)
    cy.getCursorQueryDecoration().should("have.length", 1)
  })
})

describe("editor tabs", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
    cy.clearEditor()
    cy.getEditorContent().should("be.visible")
    cy.getEditorTabs().should("be.visible")
  })

  it("should open the new single tab with empty editor", () => {
    cy.getEditorContent().should("have.value", "")
    cy.getEditorTabs().should("have.length", 1)
    cy.getEditorTabByTitle("SQL").should("be.visible")
    cy.getEditorTabByTitle("SQL").should("not.contain", ".chrome-tab-close")
  })

  it("should open the second empty tab on plus icon click", () => {
    cy.get(".new-tab-button").click()
    cy.get(".chrome-tab-was-just-added").should("not.exist")
    cy.getEditorTabs().should("have.length", 2)
    ;["SQL", "SQL 1"].forEach((title) => {
      cy.getEditorTabByTitle(title).should("be.visible")
      cy.getEditorTabByTitle(title).within(() => {
        cy.get(".chrome-tab-close").should("be.visible")
      })
    })
  })

  it("should rename a tab", () => {
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
      cy.get(".chrome-tab-rename").type("{selectall}{esc}{enter}")
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
  })

  it("should drag tabs", () => {
    cy.get(".new-tab-button").click()
    cy.get(".chrome-tab-was-just-added").should("not.exist")
    cy.getEditorTabByTitle("SQL").should("be.visible")
    cy.getEditorTabByTitle("SQL 1").should("be.visible")

    cy.get(getTabDragHandleByTitle("SQL 1"))
      .should("be.visible")
      .drag(getTabDragHandleByTitle("SQL"))

    cy.wait(1000)

    cy.getEditorTabs().should(($tabs) => {
      expect($tabs.first()).to.contain("SQL 1")
      expect($tabs.last()).to.contain("SQL")
    })

    cy.get(getTabDragHandleByTitle("SQL 1"))
      .should("be.visible")
      .drag(getTabDragHandleByTitle("SQL"))

    cy.wait(1000)

    cy.getEditorTabs().should(($tabs) => {
      expect($tabs.first()).to.contain("SQL")
      expect($tabs.last()).to.contain("SQL 1")
    })
  })
})

// TODO: This test is flaky because of the IndexedDB calls. Investigate the slow response time in test environment.
describe.skip("editor tabs history", () => {
  before(() => {
    cy.loadConsoleWithAuth()
    cy.getEditorContent().should("be.visible")
    cy.getEditorTabs().should("be.visible")
  })

  it("should close and archive tabs", () => {
    cy.typeQuery("--1")
    ;["SQL 1", "SQL 2"].forEach((title) => {
      cy.get(".new-tab-button").click()
      const dragHandle = getTabDragHandleByTitle(title)
      cy.get(dragHandle).should("be.visible")
    })
    ;["SQL 1", "SQL 2"].forEach((title, index) => {
      const dragHandle = getTabDragHandleByTitle(title)
      cy.get(dragHandle).click()
      cy.getEditorContent().should("be.visible")
      cy.typeQuery(`-- ${index + 1}`)
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
    cy.getByDataHook("editor-tabs-history-button").click()
    cy.getByDataHook("editor-tabs-history-item").should("not.exist")
  })
})

describe("handling comments", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth(false, {
      "splitter.results.basis": Number.MAX_SAFE_INTEGER.toString(),
    })
  })

  beforeEach(() => {
    cy.getEditorContent().should("be.visible")
    cy.getEditorTabs().should("be.visible")
  })

  it("should highlight and execute sql with line comments in front", () => {
    cy.typeQuery("-- comment\n-- comment\nselect x from long_sequence(1);")
    cy.getCursorQueryDecoration().should("have.length", 1)
    cy.getCursorQueryGlyph().should("have.length", 1)
    cy.runLine()
    cy.getGridRow(0).should("contain", "1")
  })

  it("should highlight and execute sql with empty line comment in front", () => {
    cy.typeQuery("--\nselect x from long_sequence(1);")
    cy.getCursorQueryDecoration().should("have.length", 1)
    cy.getCursorQueryGlyph().should("have.length", 1)
    cy.runLine()
    cy.getGridRow(0).should("contain", "1")
  })

  it("should highlight and execute sql with block comments", () => {
    cy.typeQuery("/* comment */\nselect x from long_sequence(1);")
    cy.getCursorQueryDecoration().should("have.length", 1)
    cy.getCursorQueryGlyph().should("have.length", 1)
    cy.runLine()
    cy.getGridRow(0).should("contain", "1")

    cy.clearEditor()
    cy.typeQuery("/*\ncomment\n*/\nselect x from long_sequence(1);")
    cy.getCursorQueryDecoration().should("have.length", 1)
    cy.getCursorQueryGlyph().should("have.length", 1)
    cy.runLine()
    cy.getGridRow(0).should("contain", "1")
    cy.getByDataHook("success-notification").should(
      "contain",
      "select x from long_sequence(1)",
    )
  })

  it("should highlight and execute sql with line comments inside", () => {
    cy.typeQueryDirectly("select\nx\n-- y\n-- z\n from long_sequence(1);")
    cy.getCursorQueryDecoration().should("have.length", 5)
    cy.getCursorQueryGlyph().should("have.length", 1)
    cy.runLine()
    cy.getGridRow(0).should("contain", "1")
  })

  it("should highlight and execute sql with line comment at the end", () => {
    cy.typeQuery("select x from long_sequence(1); -- comment")
    cy.getCursorQueryDecoration().should("have.length", 1)
    cy.getCursorQueryGlyph().should("have.length", 1)
    cy.runLine()
    cy.getGridRow(0).should("contain", "1")
    cy.getByDataHook("success-notification").should(
      "contain",
      "select x from long_sequence(1)",
    )
  })

  it("should extract only two queries when comments have semicolons", () => {
    cy.typeQueryDirectly(
      "-- not a query;\n/* not a query 2;\n not a query 3; */select /* not; a; query;*/ 1; --not a query /* ; 4;\nselect\n\n --line;\n 2;",
    )
    cy.clickLine(4)
    cy.getCursorQueryDecoration().should("have.length", 4)
    cy.getCursorQueryGlyph().should("have.length", 2)
    cy.clickRunIconInLine(3)
    cy.getByDataHook("success-notification").should(
      "contain",
      "select /* not; a; query;*/ 1",
    )

    cy.clickRunIconInLine(4)
    cy.getByDataHook("success-notification").should(
      "contain",
      `select\n\n --line;\n 2`,
    )
  })

  it("should correctly handle single quotes in multiline comments", () => {
    cy.typeQueryDirectly(
      "/* Today's aggregations for the BTC-USDT symbol downsampled in 15-minute intervals.\n We use the SQL extension SAMPLE BY to aggregate data at regular intervals. QuestDB\n ingests live market data.; */\nSELECT *\nFROM long_sequence(100);",
    )
    cy.getCursorQueryGlyph().should("have.length", 1)
    cy.clickLine(1)
    cy.getCursorQueryDecoration().should("have.length", 0)
    cy.clickLine(4)
    cy.getCursorQueryDecoration().should("have.length", 2)
    cy.clickRunIconInLine(4)
    cy.getByDataHook("success-notification").should(
      "contain",
      "SELECT *\nFROM long_sequence(100)",
    )
  })

  it("should handle comprehensive edge cases: multiline comments, single line comments, quotes, and semicolons", () => {
    cy.typeQueryDirectly(
      "/* Comment with semicolon; and single quote ' */\n-- Line comment with quote ' and semicolon;\nSELECT 'another;test' AS col2;\n/* Multi\nline;\ncomment;\nwith ' quote */\nSELECT 1 AS col3;\nSELECT 'text'/* inline; ' */ AS col5;",
    )

    cy.getCursorQueryGlyph().should("have.length", 3)
    cy.getCursorQueryDecoration().should("have.length", 0)

    cy.clickLine(2)
    cy.getCursorQueryDecoration().should("have.length", 0)

    cy.clickLine(3)
    cy.getCursorQueryDecoration().should("have.length", 1)
    cy.clickRunIconInLine(3)
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
    cy.getByDataHook("success-notification").should(
      "contain",
      "SELECT 1 AS col3",
    )

    cy.clickLine(9)
    cy.getCursorQueryDecoration().should("have.length", 1)
    cy.clickRunIconInLine(9)
    cy.getByDataHook("success-notification").should(
      "contain",
      "SELECT 'text'/* inline; ' */ AS col5",
    )
  })
})

describe("multiple run buttons with dynamic query log", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
    cy.getEditorContent().should("be.visible")
    cy.clearEditor()
  })

  it("should click run icon in specific line and open dropdown", () => {
    cy.typeQuery("select 1;\n\nselect 2;\n\nselect 3;")
    cy.openRunDropdownInLine(3)

    cy.getByDataHook("dropdown-item-run-query").should(
      "contain",
      `Run "select 2"`,
    )
    cy.getByDataHook("dropdown-item-get-query-plan").should(
      "contain",
      `Get query plan for "select 2"`,
    )
    cy.getByDataHook("dropdown-item-run-query").click()
    cy.getByDataHook("success-notification").should("contain", "select 2")

    cy.openRunDropdownInLine(1)
    cy.getByDataHook("dropdown-item-run-query").should(
      "contain",
      `Run "select 1"`,
    )
    cy.getByDataHook("dropdown-item-get-query-plan").should(
      "contain",
      `Get query plan for "select 1"`,
    )
    cy.getByDataHook("dropdown-item-get-query-plan").click()
    cy.getByDataHook("success-notification").should(
      "contain",
      "EXPLAIN select 1",
    )

    cy.openRunDropdownInLine(5)
    cy.getByDataHook("dropdown-item-run-query").should(
      "contain",
      `Run "select 3"`,
    )
    cy.getByDataHook("dropdown-item-get-query-plan").should(
      "contain",
      `Get query plan for "select 3"`,
    )
  })

  it("should run query from specific line using dropdown", () => {
    cy.typeQuery("select 1;\n\nselect 2;\n\nselect 3;")
    cy.clickRunIconInLine(3)

    cy.getByDataHook("success-notification").should("contain", "select 2")
  })

  it("should get query plan from specific line using dropdown", () => {
    cy.typeQuery("select 1;\n\nselect 2;\n\nselect 3;")

    cy.openRunDropdownInLine(5).clickDropdownGetQueryPlan()

    cy.getColumnName(0).should("contain", "QUERY PLAN")
  })

  it("should indicate error in glyph and notification", () => {
    cy.typeQuery("select * from non_existent_table;\n\nselect 1;\n\nselect 2;")

    cy.clickRunIconInLine(3)

    cy.getByDataHook("success-notification").should("contain", "select 1")

    cy.clickRunIconInLine(5)

    cy.getByDataHook("success-notification").should("contain", "select 2")

    cy.clickRunIconInLine(1)
    cy.getByDataHook("error-notification")
      .should("contain", "table does not exist")
      .should("contain", "select * from non_existent_table")

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
    cy.typeQuery("select 1;\nselect a;\nselect 3;")
    cy.clickRunScript(true)

    // Then
    cy.getByDataHook("success-notification")
      .invoke("text")
      .should(
        "match",
        /Running completed in \d+ms with\s+2 successful\s+and\s+1 failed\s+queries/,
      )
    cy.get(".success-glyph").should("have.length", 2)
    cy.get(".error-glyph").should("have.length", 1)
    cy.get(".cursorQueryGlyph").should("have.length", 3)

    // When
    cy.get(".new-tab-button").click()
    // Then
    cy.getEditorTabByTitle("SQL 1")
      .should("be.visible")
      .should("have.attr", "active")

    // When
    cy.typeQuery("select 1;\nselect a;\nselect 3;")
    // Then
    cy.get(".success-glyph").should("have.length", 0)
    cy.get(".error-glyph").should("have.length", 0)
    cy.get(".cursorQueryGlyph").should("have.length", 3)

    // When
    cy.clickRunIconInLine(3)
    // Then
    cy.get(".success-glyph").should("have.length", 1)
    cy.get(".error-glyph").should("have.length", 0)
    cy.get(".cursorQueryGlyph").should("have.length", 3)

    // When
    cy.getEditorTabByTitle("SQL").within(() => {
      cy.get(".chrome-tab-drag-handle").click()
    })
    // Then
    cy.getEditorTabByTitle("SQL").should("have.attr", "active")
    cy.get(".success-glyph").should("have.length", 2)
    cy.get(".error-glyph").should("have.length", 1)
    cy.get(".cursorQueryGlyph").should("have.length", 3)
  })
})

describe("abortion on new query execution", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
    cy.getEditorContent().should("be.visible")
    cy.clearEditor()
    cy.intercept("/exec*", (req) => {
      req.on("response", (res) => {
        res.setDelay(1200)
      })
    })
  })

  it("should show abort confirmation dialog when triggering new query while another is running", () => {
    // When
    cy.typeQuery("select 1;\nselect 2;")
    cy.clickRunIconInLine(1)

    // Then
    cy.getCancelIconInLine(1).should("be.visible")

    // When
    cy.clickRunIconInLine(2)

    // Then
    cy.getByDataHook("abort-confirmation-dialog").should("be.visible")

    // When
    cy.getByDataHook("abort-confirmation-dialog-confirm").click()

    // Then
    cy.getByDataHook("success-notification").should("contain", "select 2")

    // When
    cy.clickLine(1)

    // Then
    cy.getByDataHook("error-notification").should(
      "contain",
      "Cancelled by user",
    )

    // When
    cy.clickLine(2)

    // Then
    cy.getByDataHook("success-notification").should("contain", "select 2")
  })

  it("should keep original query running when dismiss is clicked in abort dialog", () => {
    // When
    cy.typeQuery("select 1;\nselect 2;")
    cy.clickRunIconInLine(1)

    // Then
    cy.getCancelIconInLine(1).should("be.visible")

    // When
    cy.clickRunIconInLine(2)

    // Then
    cy.getByDataHook("abort-confirmation-dialog").should("be.visible")

    // When
    cy.getByDataHook("abort-confirmation-dialog-dismiss").click()

    // Then
    cy.getByDataHook("abort-confirmation-dialog").should("not.exist")
    cy.getByDataHook("success-notification").should("contain", "select 1")
  })

  it("should run new query after original completes while abort dialog is open", () => {
    // When
    cy.typeQuery("select 1;\nselect 2;")
    cy.clickRunIconInLine(1)

    // Then
    cy.getCancelIconInLine(1).should("be.visible")

    // When
    cy.clickRunIconInLine(2)

    // Then
    cy.getByDataHook("abort-confirmation-dialog").should("be.visible")

    // When (wait for original to complete naturally)
    cy.getByDataHook("success-notification").should("contain", "select 1")
    cy.wait(100)

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
  })

  it("should show abort warning in script confirmation dialog when query is running", () => {
    // When
    cy.typeQuery("select 1;\nselect 2;\nselect 3;")
    cy.clickRunIconInLine(1)

    // Then
    cy.getCancelIconInLine(1).should("be.visible")

    // When
    cy.realPress(["Meta", "Shift", "Enter"])

    // Then
    cy.getByRole("dialog").should("be.visible")
    cy.getByDataHook("run-all-queries-warning").should(
      "contain",
      "Current query execution will be aborted",
    )

    // When
    cy.getByDataHook("run-all-queries-confirm").click()

    // Then
    cy.getByDataHook("success-notification")
      .invoke("text")
      .should("match", /3 successful/)
  })
})
