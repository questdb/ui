/// <reference types="cypress" />

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl = `http://localhost:9999${contextPath}`;

const getTabDragHandleByTitle = (title) =>
  `.chrome-tab[data-tab-title="${title}"] .chrome-tab-drag-handle`;

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
  };

  const queries = consoleConfiguration.savedQueries.map((query) => query.value);

  before(() => {
    cy.intercept(
      {
        method: "GET",
        url: `${baseUrl}/assets/console-configuration.json`,
      },
      consoleConfiguration
    ).as("getConsoleConfiguration");

    cy.loadConsoleWithAuth();
  });

  beforeEach(() => {
    cy.getEditorContent().should("be.visible");
    cy.clearEditor();
  });

  it("should append and select first query", () => {
    cy.selectQuery(0);
    const expected = `\n${queries[0]}`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
    cy.matchImageSnapshot(); // screenshot diff
  });

  it("should append and select second query", () => {
    cy.selectQuery(1);
    const expected = `\n${queries[1]}`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should append and select multiline query", () => {
    cy.selectQuery(2);
    const expected = `\n${queries[2]}`;
    cy.getEditorContent().should("have.value", expected);
    // monaco editor visually selects all 3 lines, but creates 4 elements to visualise selection
    cy.getSelectedLines().should("have.length", 4);
  });

  it("should correctly append and select query after multiple inserts", () => {
    cy.selectQuery(1);
    cy.selectQuery(1);
    cy.typeQuery(`{ctrl}g2{enter}`); // go to line 2
    cy.selectQuery(2);
    const expected = `\n${queries[1]}\n\n${queries[1]}\n\n${queries[2]}`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 4);
  });

  it("should correctly append and select query when position is first line which is empty", () => {
    cy.typeQuery(`{enter}--b{upArrow}`);
    cy.selectQuery(0);
    cy.selectQuery(1);
    const expected = `\n--b\n${queries[0]}\n\n${queries[1]}`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should correctly append and select query when position is first line which is not empty", () => {
    cy.typeQuery(`--a`);
    cy.selectQuery(0);
    const expected = `--a\n${queries[0]}`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should correctly append and select query when position is first line which is not empty and there's more content after", () => {
    cy.typeQuery(`--a{enter}{enter}--b{upArrow}{upArrow}`);
    cy.selectQuery(0);
    const expected = `--a\n\n--b\n${queries[0]}`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should correctly append and add surrounding new lines when position is middle line which is empty", () => {
    cy.typeQuery(`--a{enter}{enter}--b{upArrow}`);
    cy.selectQuery(0);
    const expected = `--a\n\n--b\n\n${queries[0]}`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should correctly append and add surrounding new lines when position is last line which is empty", () => {
    cy.typeQuery(`--a{enter}--b`);
    cy.selectQuery(0);
    const expected = `--a\n--b\n\n${queries[0]}`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
    cy.matchImageSnapshot();
  });

  it("should correctly append and add surrounding new lines when there are two lines and position is last line which is empty", () => {
    cy.typeQuery(`--a{enter}`);
    cy.selectQuery(0);
    const expected = `--a\n\n\n${queries[0]}`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should correctly append and add surrounding new lines when position is middle of non empty line and next line is empty", () => {
    cy.typeQuery(`--a{enter}--b{enter}{enter}--c`);
    cy.typeQuery(`{ctrl}g2{enter}{rightArrow}`); // go to line 2
    cy.selectQuery(0);
    const expected = `--a\n--b\n\n--c\n\n${queries[0]}`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });
});

describe("&query URL param", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth();
  });

  it("should append and select single line query", () => {
    cy.typeQuery("select x from long_sequence(1)"); // running query caches it, it's available after refresh
    const query = encodeURIComponent("select x+1 from long_sequence(1)");
    cy.visit(`${baseUrl}/?query=${query}&executeQuery=true`);
    cy.getEditorContent().should("be.visible");
    cy.getGridRow(0).should("contain", "2");
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should append and select multiline query", () => {
    cy.typeQuery(
      `select x\nfrom long_sequence(1);\n\n-- a\n-- b\n-- c\n${"{upArrow}".repeat(
        5
      )}`
    );
    const query = encodeURIComponent("select x+1\nfrom\nlong_sequence(1);");
    cy.visit(`${baseUrl}?query=${query}&executeQuery=true`);
    cy.getEditorContent().should("be.visible");
    cy.getGridRow(0).should("contain", "2");
    cy.getSelectedLines().should("have.length", 4);
  });

  it("should not append query if it already exists in editor", () => {
    const query = "select x\nfrom long_sequence(1);\n\n-- a\n-- b\n-- c";
    cy.typeQuery(query);
    cy.clickRun();
    cy.visit(`${baseUrl}?query=${encodeURIComponent(query)}&executeQuery=true`);
    cy.getEditorContent().should("be.visible");
    cy.getEditorContent().should("have.value", query);
  });

  it("should append query and scroll to it", () => {
    cy.typeQuery("select x from long_sequence(1);");
    cy.typeQuery("\n".repeat(20));
    cy.clickRun(); // take space so that query is not visible later, save by running

    const appendedQuery = "-- hello world";
    cy.visit(`${baseUrl}?query=${encodeURIComponent(appendedQuery)}`);
    cy.getEditorContent().should("be.visible");
    cy.getVisibleLines()
      .invoke("text")
      .should("match", /hello.world$/); // not matching on appendedQuery, because query should be selected for which Monaco adds special chars between words
  });
});

describe("autocomplete", () => {
  before(() => {
    cy.loadConsoleWithAuth();
    // We're creating two tables (my_secrets and my_secrets2) with the same column name.
    // The autocomplete should merge the column completions into one
    // and respond with something like `secret (my_secrets, my_secrets2)
    ["my_publics", "my_secrets", "my_secrets2"].forEach((table) => {
      cy.createTable(table);
    });
    cy.refreshSchema();
  });

  beforeEach(() => {
    cy.loadConsoleWithAuth();
  });

  it("should work when provided table name doesn't exist", () => {
    cy.typeQuery("select * from teletubies");
    cy.getAutocomplete().should("not.be.visible").clearEditor();

    cy.matchImageSnapshot();
  });

  it("should be case insensitive", () => {
    const assertFrom = () =>
      cy.getAutocomplete().within(() => {
        cy.getMonacoListRow()
          .should("have.length", 3)
          .eq(0)
          .should("contain", "FROM");
      });
    cy.typeQuery("select * from");
    assertFrom();
    cy.clearEditor();
    cy.typeQuery("SELECT * FROM");
    assertFrom();
  });

  it("should suggest the existing tables on 'from' clause", () => {
    cy.typeQuery("select * from ");
    cy.getAutocomplete()
      // tables
      .should("not.contain", "telemetry")
      .should("contain", "my_secrets")
      .should("contain", "my_publics")
      .clearEditor();
  });

  it("should suggest columns and tables on 'select' clause", () => {
    cy.typeQuery("select ");
    cy.getAutocomplete()
      // Columns
      .should("contain", "secret")
      .should("contain", "public")
      // Tables list for the `secret` column
      // list the tables containing `secret` column
      .should("contain", "my_secrets, my_secrets2")
      .clearEditor();
  });

  it("should suggest columns on SELECT only when applicable", () => {
    cy.typeQuery("select secret");
    cy.getAutocomplete().should("contain", "secret").eq(0).click();
    cy.typeQuery(", public");
    cy.getAutocomplete().should("contain", "public").eq(0).click();
    cy.typeQuery(" ");
    cy.getAutocomplete().should("not.be.visible");
  });

  it("should suggest correct columns on 'where' filter", () => {
    cy.typeQuery("select * from my_secrets where ");
    cy.getAutocomplete()
      .should("contain", "secret")
      .should("not.contain", "public")
      .clearEditor();
  });

  it("should suggest correct columns on 'on' clause", () => {
    cy.typeQuery("select * from my_secrets join my_publics on ");
    cy.getAutocomplete()
      .should("contain", "my_publics.public")
      .should("contain", "my_secrets.secret")
      .clearEditor();
  });

  after(() => {
    cy.loadConsoleWithAuth();
    ["my_publics", "my_secrets", "my_secrets2"].forEach((table) => {
      cy.dropTable(table);
    });
  });
});

describe("errors", () => {
  before(() => {
    cy.loadConsoleWithAuth();
  });

  beforeEach(() => {
    cy.getEditorContent().should("be.visible");
    cy.clearEditor();
  });

  it("should mark '(200000)' as error", () => {
    const query = `create table test (\ncol symbol index CAPACITY (200000)`;
    cy.typeQuery(query);
    cy.runLine();
    cy.matchErrorMarkerPosition({ left: 237, width: 67 });
    cy.matchImageSnapshot();
  });

  it("should mark date position as error", () => {
    const query = `select * from long_sequence(1) where cast(x as timestamp) = '2012-04-12T12:00:00A'`;
    cy.typeQuery(query);
    cy.runLine();
    cy.matchErrorMarkerPosition({ left: 506, width: 42 });

    cy.getCollapsedNotifications().should("contain", "Invalid date");
  });

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
  ];

  operators.forEach((char) => {
    it(`should mark operator '${char}' as error`, () => {
      const query = `select x FROM long_sequence(100 ${char} "string");`;
      cy.typeQuery(query);
      cy.runLine();
      cy.matchErrorMarkerPosition({ left: 270, width: 8 });
      cy.clearEditor();
    });
  });
});

describe("running query with F9", () => {
  before(() => {
    cy.loadConsoleWithAuth();
  });

  beforeEach(() => {
    cy.getEditorContent().should("be.visible");
    cy.clearEditor();
  });

  it("should execute correct query, when text cursor is on query which has no semicolon", () => {
    cy.typeQuery("select * from long_sequence(1)");
    cy.F9();
    cy.getGridRow(0).should("contain", "1");
    cy.clearEditor();
    cy.typeQuery(`select * from long_sequence(2);{leftArrow}`);
    cy.F9();
    cy.getGridRow(1).should("contain", "2");
  });

  it("should execute correct query, when multiple queries exist", () => {
    cy.typeQuery(
      "long_sequence(10) where x = 3;\n\nlong_sequence(5) limit 2;{upArrow}{upArrow}{end}{leftArrow}"
    );
    cy.F9();
    cy.getGridRow(0).should("contain", "3");
    cy.clearEditor();
    cy.typeQuery(
      "long_sequence(10) where x = 3;\n\nlong_sequence(5) limit 2{upArrow}{upArrow}{end}{leftArrow}"
    );
    cy.F9();
    cy.getGridRow(0).should("contain", "3");
  });

  it("should execute a correct query when line comment is present", () => {
    cy.clearEditor();
    cy.typeQuery(
      "select * from long_sequence(1); -- comment\nselect * from long_sequence(2);{upArrow}{rightArrow}{rightArrow}"
    );
    cy.F9();
    cy.getGridRows().should("have.length", 2);
    cy.getCursorQueryDecoration().should("have.length", 1);
  });
});

describe("editor tabs", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth();
  });

  beforeEach(() => {
    cy.getEditorContent().should("be.visible");
    cy.getEditorTabs().should("be.visible");
  });

  it("should open the new single tab with empty editor", () => {
    cy.getEditorContent().should("have.value", "");
    cy.getEditorTabs().should("have.length", 1);
    cy.getEditorTabByTitle("SQL").should("be.visible");
    cy.getEditorTabByTitle("SQL").should("not.contain", ".chrome-tab-close");
  });

  it("should open the second empty tab on plus icon click", () => {
    cy.get(".new-tab-button").click();
    cy.getEditorTabs().should("have.length", 2);
    ["SQL", "SQL 1"].forEach((title) => {
      cy.getEditorTabByTitle(title).should("be.visible");
      cy.getEditorTabByTitle(title).within(() => {
        cy.get(".chrome-tab-close").should("be.visible");
      });
    });
  });

  it("should rename a tab", () => {
    cy.getEditorTabByTitle("SQL").within(() => {
      cy.get(".chrome-tab-drag-handle").dblclick();
      cy.get(".chrome-tab-rename").should("be.visible").type("New name{enter}");
    });
    cy.getEditorTabByTitle("New name")
      .should("be.visible")
      .within(() => {
        cy.get(".chrome-tab-drag-handle").dblclick();
        cy.get(".chrome-tab-rename").type("Cancelled new name{esc}");
        cy.get(".chrome-tab-rename").should("not.be.visible");
      });
    cy.getEditorTabByTitle("Cancelled new name").should("not.exist");
    cy.getEditorTabByTitle("New name").within(() => {
      cy.get(".chrome-tab-drag-handle").dblclick();
      cy.get(".chrome-tab-rename").type("{selectall}{esc}{enter}");
      // empty tab name is not allowed, should not proceed
      cy.get(".chrome-tab-rename").should("be.visible");
    });
    // Changing the name and clicking away from the input should save the state
    cy.getEditorHitbox().click();
    cy.getEditorTabByTitle("New name").within(() => {
      cy.get(".chrome-tab-drag-handle").dblclick();
      cy.get(".chrome-tab-rename").type("New updated name");
    });
    cy.getEditorHitbox().click();
    cy.getEditorTabByTitle("New updated name").should("be.visible");
  });

  it("should close and archive tabs", () => {
    cy.getEditorContent().should("be.visible");
    cy.typeQuery("--1");
    cy.get(".new-tab-button").click();
    cy.get(".new-tab-button").click();
    ["SQL 1", "SQL 2"].forEach((title, index) => {
      cy.get(getTabDragHandleByTitle(title)).click();
      cy.getEditorContent().should("be.visible");
      cy.typeQuery(`-- ${index + 1}`);
      cy.getEditorTabByTitle(title).within(() => {
        cy.get(".chrome-tab-close").click();
      });
      cy.getEditorTabByTitle(title).should("not.exist");
    });
    cy.getByDataHook("editor-tabs-history-button").click();
    cy.getByDataHook("editor-tabs-history").should("be.visible");
    cy.getByDataHook("editor-tabs-history-item")
      .should("have.length", 2)
      .should("contain", "SQL 1");
    // Restore closed tabs. "SQL 2" should be first, as it was closed last
    cy.getByDataHook("editor-tabs-history-item").first().click();
    cy.getEditorTabByTitle("SQL 2").should("be.visible");
    cy.getByDataHook("editor-tabs-history-button").click();
    cy.getByDataHook("editor-tabs-history-item").should("have.length", 1);
    cy.getByDataHook("editor-tabs-history-item").should("not.contain", "SQL 2");
    // Clear history
    cy.getByDataHook("editor-tabs-history-clear").click();
    cy.getByDataHook("editor-tabs-history-button").click();
    cy.getByDataHook("editor-tabs-history-item").should("not.exist");
  });

  // TODO: fix the flakiness
  it.skip("should drag tabs", () => {
    cy.get(".new-tab-button").click();

    cy.getEditorTabByTitle("SQL").should("be.visible");
    cy.getEditorTabByTitle("SQL 1").should("be.visible");

    cy.get(getTabDragHandleByTitle("SQL 1"))
      .should("be.visible")
      .drag(getTabDragHandleByTitle("SQL"));

    cy.wait(100);

    cy.getEditorTabs().should(($tabs) => {
      expect($tabs.first()).to.contain("SQL 1");
      expect($tabs.last()).to.contain("SQL");
    });

    cy.get(getTabDragHandleByTitle("SQL 1"))
      .should("be.visible")
      .drag(getTabDragHandleByTitle("SQL"));

    cy.wait(100);

    cy.getEditorTabs().should(($tabs) => {
      expect($tabs.first()).to.contain("SQL");
      expect($tabs.last()).to.contain("SQL 1");
    });
  });
});

describe("handling comments", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth();
  });

  beforeEach(() => {
    cy.getEditorContent().should("be.visible");
    cy.getEditorTabs().should("be.visible");
  });

  it("should highlight and execute sql with line comments in front", () => {
    cy.typeQuery("-- comment\n-- comment\nselect x from long_sequence(1);");
    cy.getCursorQueryDecoration().should("have.length", 3);
    cy.getCursorQueryGlyph().should("have.length", 1);
    cy.runLine();
    cy.getGridRow(0).should("contain", "1");
  });

  it("should highlight and execute sql with empty line comment in front", () => {
    cy.typeQuery("--\nselect x from long_sequence(1);");
    cy.getCursorQueryDecoration().should("have.length", 2);
    cy.getCursorQueryGlyph().should("have.length", 1);
    cy.runLine();
    cy.getGridRow(0).should("contain", "1");
  });

  it("should highlight and execute sql with block comments", () => {
    cy.typeQuery("/* comment */\nselect x from long_sequence(1);");
    cy.getCursorQueryDecoration().should("have.length", 2);
    cy.getCursorQueryGlyph().should("have.length", 1);
    cy.runLine();
    cy.getGridRow(0).should("contain", "1");

    cy.clearEditor();
    cy.typeQuery("/*\ncomment\n*/\nselect x from long_sequence(1);");
    cy.getCursorQueryDecoration().should("have.length", 4);
    cy.getCursorQueryGlyph().should("have.length", 1);
    cy.runLine();
    cy.getGridRow(0).should("contain", "1");
  });

  it("should highlight and execute sql with line comments inside", () => {
    cy.typeQuery("select\n\nx\n-- y\n-- z\n from long_sequence(1);");
    cy.getCursorQueryDecoration().should("have.length", 5);
    cy.getCursorQueryGlyph().should("have.length", 1);
    cy.runLine();
    cy.getGridRow(0).should("contain", "1");
  });

  it("should highlight and execute sql with line comment at the end", () => {
    cy.typeQuery("select x from long_sequence(1); -- comment");
    cy.getCursorQueryDecoration().should("have.length", 1);
    cy.getCursorQueryGlyph().should("have.length", 1);
    cy.runLine();
    cy.getGridRow(0).should("contain", "1");
  });
});
