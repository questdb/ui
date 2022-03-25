/// <reference types="cypress" />

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

  beforeEach(() => {
    cy.intercept(
      {
        method: "GET",
        url: "http://localhost:9999/assets/console-configuration.json",
      },
      consoleConfiguration
    ).as("getConsoleConfiguration");

    cy.visit("http://localhost:9999");
  });

  it("should append and select query", () => {
    cy.selectQuery(0);
    const expected = `${queries[0]}\n`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("should append and select query", () => {
    cy.selectQuery(1);
    const expected = `${queries[1]}\n`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("should append and select multiline query", () => {
    cy.selectQuery(2);
    const expected = `${queries[2]}\n`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("should correctly append and select query after multiple inserts", () => {
    cy.selectQuery(1);
    cy.selectQuery(2);
    cy.typeQuery(`{ctrl}g2{enter}`); // go to line 2
    cy.selectQuery(1);
    const expected = `${queries[1]}\n\n${queries[1]}\n\n${queries[2]}\n`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("should correctly append and select query when position is first line which is empty", () => {
    cy.typeQuery(`{enter}--b{upArrow}`);
    cy.selectQuery(0);
    cy.selectQuery(1);
    const expected = `${queries[0]}\n\n${queries[1]}\n\n--b`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("should correctly append and add surrounding new lines when position is middle line which is empty", () => {
    cy.typeQuery(`--a{enter}{enter}--b{upArrow}`);
    cy.selectQuery(0);
    const expected = `--a\n\n${queries[0]}\n\n--b`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("should correctly append and add surrounding new lines when position is last line which is empty", () => {
    cy.typeQuery(`--a{enter}--b`);
    cy.selectQuery(0);
    const expected = `--a\n--b\n\n${queries[0]}\n`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("should correctly append and add surrounding new lines when there are two lines and position is last line which is empty", () => {
    cy.typeQuery(`--a{enter}`);
    cy.selectQuery(0);
    const expected = `--a\n\n${queries[0]}\n`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("should correctly append and add surrounding new lines when position is middle of non empty line and next line is empty", () => {
    cy.typeQuery(`--a{enter}--b{enter}{enter}--c`);
    cy.typeQuery(`{ctrl}g2{enter}{rightArrow}`); // go to line 2
    cy.selectQuery(0);
    const expected = `--a\n--b\n\n${queries[0]}\n\n--c`;
    cy.getEditor().should("have.value", expected).snapshot();
  });
});

describe("autocomplete", () => {
  beforeEach(() => {
    Cypress.on("uncaught:exception", (err) => {
      // this error can be safely ignored
      if (err.message.includes("ResizeObserver loop limit exceeded")) {
        return false;
      }
    });
  });

  it("should work when tables list is empty", () => {
    cy.visit("http://localhost:9999");
    cy.typeQuery("select * from tel");
    cy.getAutocomplete().should("not.contain", "telemetry");
    cy.getAutocomplete().should("contain", "TABLE");
    cy.clearEditor();
    cy.runQuery('create table "my_secrets" ("secret" string)');
    cy.typeQuery("select * from my_");
    cy.getAutocomplete().should("contain", "my_secrets");
    cy.clearEditor();
    cy.runQuery('drop table "my_secrets"');
  });

  it("should work when tables list is not empty", () => {
    cy.visit("http://localhost:9999");
    cy.runQuery('create table "my_secrets" ("secret" string)');
    cy.runQuery('create table "my_publics" ("public" string)');
    cy.reload();
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
  it.only("should work when tables list is empty", () => {
    cy.visit("http://localhost:9999");
    const query = `
create table test (
ts timestamp,
col symbol index CAPACITY (200000),
) timestamp (ts) partition by hour;{downArrow}{backspace}`.trim();
    cy.runQuery(query);
  });
});
