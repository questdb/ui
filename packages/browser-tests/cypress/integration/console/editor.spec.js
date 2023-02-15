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
  });

  afterEach(() => {
    cy.clearEditor();
  });

  it("should append and select first query", () => {
    cy.selectQuery(0);
    const expected = `${queries[0]}\n`;
    cy.getEditor().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should append and select second query", () => {
    cy.selectQuery(1);
    const expected = `${queries[1]}\n`;
    cy.getEditor().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should append and select multiline query", () => {
    cy.selectQuery(2);
    const expected = `${queries[2]}\n`;
    cy.getEditor().should("have.value", expected);
    // monaco editor visually selects all 3 lines, but creates 4 elements to visualise selection
    cy.getSelectedLines().should("have.length", 4);
  });

  it("should correctly append and select query after multiple inserts", () => {
    cy.selectQuery(1);
    cy.selectQuery(2);
    cy.typeQuery(`{ctrl}g2{enter}`); // go to line 2
    cy.selectQuery(1);
    const expected = `${queries[1]}\n\n${queries[1]}\n\n${queries[2]}\n`;
    cy.getEditor().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should correctly append and select query when position is first line which is empty", () => {
    cy.typeQuery(`{enter}--b{upArrow}`);
    cy.selectQuery(0);
    cy.selectQuery(1);
    const expected = `${queries[0]}\n\n${queries[1]}\n\n--b`;
    cy.getEditor().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should correctly append and select query when position is first line which is not empty", () => {
    cy.typeQuery(`--a`);
    cy.selectQuery(0);
    const expected = `--a\n\n${queries[0]}\n`;
    cy.getEditor().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should correctly append and select query when position is first line which is not empty and there's more content after", () => {
    cy.typeQuery(`--a{enter}{enter}--b{upArrow}{upArrow}`);
    cy.selectQuery(0);
    const expected = `--a\n\n${queries[0]}\n\n--b`;
    cy.getEditor().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should correctly append and add surrounding new lines when position is middle line which is empty", () => {
    cy.typeQuery(`--a{enter}{enter}--b{upArrow}`);
    cy.selectQuery(0);
    const expected = `--a\n\n${queries[0]}\n\n--b`;
    cy.getEditor().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should correctly append and add surrounding new lines when position is last line which is empty", () => {
    cy.typeQuery(`--a{enter}--b`);
    cy.selectQuery(0);
    const expected = `--a\n--b\n\n${queries[0]}\n`;
    cy.getEditor().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should correctly append and add surrounding new lines when there are two lines and position is last line which is empty", () => {
    cy.typeQuery(`--a{enter}`);
    cy.selectQuery(0);
    const expected = `--a\n\n${queries[0]}\n`;
    cy.getEditor().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should correctly append and add surrounding new lines when position is middle of non empty line and next line is empty", () => {
    cy.typeQuery(`--a{enter}--b{enter}{enter}--c`);
    cy.typeQuery(`{ctrl}g2{enter}{rightArrow}`); // go to line 2
    cy.selectQuery(0);
    const expected = `--a\n--b\n\n${queries[0]}\n\n--c`;
    cy.getEditor().should("have.value", expected);
    cy.getSelectedLines().should("have.length", 1);
  });
});

describe("&query URL param", () => {
  before(() => {
    Cypress.on("uncaught:exception", (err) => {
      // this error can be safely ignored
      if (err.message.includes("ResizeObserver loop limit exceeded")) {
        return false;
      }
    });
  });

  it("should append and select single line query", () => {
    cy.visit(baseUrl);
    cy.runQuery("select x from long_sequence(1)"); // running query caches it, it's available after refresh
    const query = encodeURIComponent("select x+1 from long_sequence(1)");
    cy.visit(`${baseUrl}/?query=${query}&executeQuery=true`);
    cy.getGridRow(0).should("contain", "2");
    cy.getSelectedLines().should("have.length", 1);
  });

  it("should append and select multiline query", () => {
    cy.visit(baseUrl);
    cy.runQuery(
      `select x\nfrom long_sequence(1);\n\n-- a\n-- b\n-- c\n${"{upArrow}".repeat(
        5
      )}`
    );
    const query = encodeURIComponent("select x+1\nfrom\nlong_sequence(1);");
    cy.visit(`${baseUrl}?query=${query}&executeQuery=true`);
    cy.getGridRow(0).should("contain", "2");
    cy.getSelectedLines().should("have.length", 4);
  });

  it("should not append query if it already exists in editor", () => {
    cy.visit(baseUrl);
    const query = "select x\nfrom long_sequence(1);\n\n-- a\n-- b\n-- c";
    cy.runQuery(query);
    cy.visit(`${baseUrl}?query=${encodeURIComponent(query)}&executeQuery=true`);
    cy.getEditor().should("have.value", query);
  });
});

describe("autocomplete", () => {
  before(() => {
    Cypress.on("uncaught:exception", (err) => {
      // this error can be safely ignored
      if (err.message.includes("ResizeObserver loop limit exceeded")) {
        return false;
      }
    });

    cy.visit(baseUrl);
  });

  afterEach(() => {
    cy.clearEditor();
  });

  it("should work when tables list is empty", () => {
    cy.typeQuery("select * from teletubies");
    cy.getAutocomplete().should("not.be.visible");
    cy.clearEditor();
    cy.runQuery('create table "my_secrets" ("secret" string)');
    cy.typeQuery("select * from my_");
    cy.getAutocomplete().should("contain", "my_secrets");
    cy.clearEditor();
    cy.runQuery('drop table "my_secrets"');
  });

  it("should work when tables list is not empty", () => {
    cy.runQuery('create table "my_secrets" ("secret" string)');
    cy.runQuery('create table "my_publics" ("public" string)');
    cy.visit(baseUrl);
    cy.typeQuery("select * from ");
    cy.getAutocomplete().should("not.contain", "telemetry");
    cy.getAutocomplete().should("contain", "my_secrets");
    cy.getAutocomplete().should("contain", "my_publics");
    cy.clearEditor();
    cy.runQuery('drop table "my_secrets"');
    cy.runQuery('drop table "my_publics"');
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
    cy.runQuery(query);
    cy.matchErrorMarkerPosition({ left: 237, width: 67 });
  });

  it("should mark 'telemetry' as error", () => {
    const query = `CREATE TABLE 'telemetry' (id LONG256)`;
    cy.runQuery(query);
    cy.matchErrorMarkerPosition({ left: 111, width: 93 });
  });

  it("should mark date position as error", () => {
    const query = `select * from long_sequence(1) where cast(x as timestamp) = '2012-04-12T12:00:00A'`;
    cy.runQuery(query);
    cy.matchErrorMarkerPosition({ left: 506, width: 42 });
    cy.getNotifications().should("contain", "Invalid date");
  });
});

describe("running query with F9", () => {
  before(() => {
    Cypress.on("uncaught:exception", (err) => {
      // this error can be safely ignored
      if (err.message.includes("ResizeObserver loop limit exceeded")) {
        return false;
      }
    });

    cy.visit(baseUrl);
  });

  afterEach(() => {
    cy.clearEditor();
  });

  it("should execute correct query, when text cursor is on query which has no semicolon", () => {
    cy.typeQuery("select * from long_sequence(1)").F9();
    cy.getGridRow(0).should("contain", "1");
    cy.clearEditor();
    cy.typeQuery(`select * from long_sequence(2);{leftArrow}`).F9();
    cy.wait(50).getGridRow(1).should("contain", "2");
  });

  it("should execute correct query, when multiple queries exist", () => {
    cy.typeQuery(
      "long_sequence(10) where x = 3;\n\nlong_sequence(5) limit 2;{upArrow}{upArrow}{end}{leftArrow}"
    ).F9();
    cy.wait(50).getGridRow(0).should("contain", "3");
    cy.clearEditor();
    cy.typeQuery(
      "long_sequence(10) where x = 3;\n\nlong_sequence(5) limit 2{upArrow}{upArrow}{end}{leftArrow}"
    ).F9();
    cy.wait(50).getGridRow(0).should("contain", "3");
  });
});
