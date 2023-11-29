/// <reference types="cypress" />

const baseUrl = "http://localhost:9999";

describe("appendQuery", () => {
  const consoleConfiguration = {
    savedQueries: [
      { name: "query 1", value: "first query" },
      { name: "query 1", value: "second query" },
      {
        name: "query 1",
        value: "multi\nline\nquery",
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

    cy.visit(baseUrl);
    cy.getEditor().should("be.visible");
  });

  afterEach(() => {
    cy.clearEditor();
  });

  it("should append and select first query", () => {
    cy.selectQuery(0);
    const expected = `${queries[0]}\n`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
    cy.matchImageSnapshot(); // screenshot diff
  });

  it("should append and select second query", () => {
    cy.selectQuery(1);
    const expected = `${queries[1]}\n`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should append and select multiline query", () => {
    cy.selectQuery(2);
    const expected = `${queries[2]}\n`;
    cy.getEditorContent().should("have.value", expected);
    // monaco editor visually selects all 3 lines, but creates 4 elements to visualise selection
    cy.getSelectedLines().should("have.length", 4);
  });

  it("should correctly append and select query after multiple inserts", () => {
    cy.selectQuery(1);
    cy.selectQuery(2);
    cy.typeQuery(`{ctrl}g2{enter}`); // go to line 2
    cy.selectQuery(1);
    const expected = `${queries[1]}\n\n${queries[1]}\n\n${queries[2]}\n`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should correctly append and select query when position is first line which is empty", () => {
    cy.typeQuery(`{enter}--b{upArrow}`);
    cy.selectQuery(0);
    cy.selectQuery(1);
    const expected = `${queries[0]}\n\n${queries[1]}\n\n--b`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should correctly append and select query when position is first line which is not empty", () => {
    cy.typeQuery(`--a`);
    cy.selectQuery(0);
    const expected = `--a\n\n${queries[0]}\n`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should correctly append and select query when position is first line which is not empty and there's more content after", () => {
    cy.typeQuery(`--a{enter}{enter}--b{upArrow}{upArrow}`);
    cy.selectQuery(0);
    const expected = `--a\n\n${queries[0]}\n\n--b`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should correctly append and add surrounding new lines when position is middle line which is empty", () => {
    cy.typeQuery(`--a{enter}{enter}--b{upArrow}`);
    cy.selectQuery(0);
    const expected = `--a\n\n${queries[0]}\n\n--b`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should correctly append and add surrounding new lines when position is last line which is empty", () => {
    cy.typeQuery(`--a{enter}--b`);
    cy.selectQuery(0);
    const expected = `--a\n--b\n\n${queries[0]}\n`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
    cy.matchImageSnapshot();
  });

  it("should correctly append and add surrounding new lines when there are two lines and position is last line which is empty", () => {
    cy.typeQuery(`--a{enter}`);
    cy.selectQuery(0);
    const expected = `--a\n\n${queries[0]}\n`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should correctly append and add surrounding new lines when position is middle of non empty line and next line is empty", () => {
    cy.typeQuery(`--a{enter}--b{enter}{enter}--c`);
    cy.typeQuery(`{ctrl}g2{enter}{rightArrow}`); // go to line 2
    cy.selectQuery(0);
    const expected = `--a\n--b\n\n${queries[0]}\n\n--c`;
    cy.getEditorContent().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });
});

describe("&query URL param", () => {
  afterEach(() => {
    cy.clearEditor();
  });

  it("should append and select single line query", () => {
    cy.visit(baseUrl);
    cy.typeQuery("select x from long_sequence(1)"); // running query caches it, it's available after refresh
    const query = encodeURIComponent("select x+1 from long_sequence(1)");
    cy.visit(`${baseUrl}/?query=${query}&executeQuery=true`);
    cy.getGridRow(0).should("contain", "2");
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should append and select multiline query", () => {
    cy.visit(baseUrl);
    cy.typeQuery(
      `select x\nfrom long_sequence(1);\n\n-- a\n-- b\n-- c\n${"{upArrow}".repeat(
        5
      )}`
    );
    const query = encodeURIComponent("select x+1\nfrom\nlong_sequence(1);");
    cy.visit(`${baseUrl}?query=${query}&executeQuery=true`);
    cy.getGridRow(0).should("contain", "2");
    cy.getSelectedLines().should("have.length", 4);
  });

  it.skip("should not append query if it already exists in editor", () => {
    cy.visit(baseUrl);
    const query = "select x\nfrom long_sequence(1);\n\n-- a\n-- b\n-- c";
    cy.typeQuery(query).clickRun();
    cy.visit(`${baseUrl}?query=${encodeURIComponent(query)}&executeQuery=true`);
    cy.getEditorContent().should("have.value", query);
  });

  it("should append query and scroll to it", () => {
    cy.visit(baseUrl);

    cy.typeQuery("--\n".repeat(20)); // take space so that query is not visible later
    const query = "select x from long_sequence(1);";
    cy.typeQuery(query).clickRun(); // save by running

    const appendedQuery = "-- hello world";
    cy.visit(
      `${baseUrl}?query=${encodeURIComponent(appendedQuery)}&executeQuery=true`
    );
    cy.getVisibleLines()
      .invoke("text")
      .should("match", /hello.world$/); // not matching on appendedQuery, because query should be selected for which Monaco adds special chars between words
  });
});

describe("autocomplete", () => {
  before(() => {
    cy.visit(baseUrl);
  });

  beforeEach(() => {
    cy.getEditor().should("be.visible");
    cy.clearEditor();
  });

  it("should work when tables list is empty", () => {
    cy.typeQuery("select * from teletubies")
      .getAutocomplete()
      .should("not.be.visible")
      .clearEditor();

    cy.matchImageSnapshot();
  });

  it("should work when tables list is not empty", () => {
    cy.typeQuery('create table "my_secrets" ("secret" string);')
      .clickRun()
      .clearEditor();

    // We're creating another table with the same column name.
    // The autocomplete should merge the column completions into one
    // and respond with something like `secret (my_secrets, my_secrets2)`
    cy.typeQuery('create table "my_secrets2" ("secret" string);')
      .clickRun()
      .clearEditor();

    cy.typeQuery('create table "my_publics" ("public" string);')
      .clickRun()
      .clearEditor();

    cy.visit(baseUrl);
    cy.typeQuery("\nselect ");
    cy.getAutocomplete()
      // Tables
      .should("not.contain", "telemetry")
      .should("contain", "my_secrets")
      .should("contain", "my_publics")
      // Columns
      .should("contain", "secret")
      .should("contain", "public")
      // Tables list for the `secret` column
      // list the tables containing `secret` column
      .should("contain", "my_secrets, my_secrets2")
      .clearEditor();

    cy.typeQuery("select * from my_secrets where ");
    cy.getAutocomplete()
      .should("contain", "secret")
      .should("not.contain", "public")
      .clearEditor();

    cy.typeQuery("select * from my_secrets join my_publics on ");
    cy.getAutocomplete()
      .should("contain", "my_publics.public")
      .should("contain", "my_secrets.secret")
      .clearEditor();

    cy.typeQuery('drop table "my_secrets"').runLine().clearEditor();
    cy.typeQuery('drop table "my_secrets2"').runLine().clearEditor();
    cy.typeQuery('drop table "my_publics"').runLine().clearEditor();
  });
});

describe("errors", () => {
  before(() => {
    cy.visit(baseUrl);
  });

  afterEach(() => {
    cy.clearEditor();
  });

  it("should mark '(200000)' as error", () => {
    const query = `create table test (\ncol symbol index CAPACITY (200000)`;
    cy.typeQuery(query).runLine();
    cy.matchErrorMarkerPosition({ left: 237, width: 67 });
    cy.matchImageSnapshot();
  });

  it("should mark date position as error", () => {
    const query = `select * from long_sequence(1) where cast(x as timestamp) = '2012-04-12T12:00:00A'`;
    cy.typeQuery(query).runLine();
    cy.matchErrorMarkerPosition({ left: 506, width: 42 });

    cy.getCollapsedNotifications().should("contain", "Invalid date");
  });
});

describe.skip("running query with F9", () => {
  before(() => {
    cy.visit(baseUrl);
  });

  afterEach(() => {
    cy.clearEditor();
  });

  it("should execute correct query, when text cursor is on query which has no semicolon", () => {
    cy.typeQuery("select * from long_sequence(1)");
    cy.F9();
    cy.getGridRow(0).should("contain", "1");
    cy.clearEditor();
    cy.typeQuery(`select * from long_sequence(2);{leftArrow}`).F9();
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
