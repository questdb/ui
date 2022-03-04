/// <reference types="cypress" />

const consoleConfiguration = {
  savedQueries: [
    { name: "query 1", value: "select * from telemetry" },
    { name: "query 1", value: "select * from telemetry_config" },
    {
      name: "query 1",
      value: "--start\nselect * from telemetry_config\n--end",
    },
  ],
};

describe("appendQuery", () => {
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
    const expected = `select * from telemetry\n`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("should append and select query", () => {
    cy.selectQuery(1);
    const expected = `select * from telemetry_config\n`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("should append and select multiline query", () => {
    cy.selectQuery(2);
    const expected = `--start\nselect * from telemetry_config\n--end\n`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("should correctly append and select query after multiple inserts", () => {
    cy.selectQuery(1);
    cy.selectQuery(2);
    cy.typeQuery(`{ctrl}g2{enter}`); // go to line 2
    cy.selectQuery(1);
    const expected = `${consoleConfiguration.savedQueries[1].value}\n\n${consoleConfiguration.savedQueries[1].value}\n\n--start\n${consoleConfiguration.savedQueries[1].value}\n--end\n`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("should correctly append and select query when position is first line which is empty", () => {
    cy.typeQuery(`{enter}--b{upArrow}`);
    cy.selectQuery(0);
    cy.selectQuery(1);
    const expected = `${consoleConfiguration.savedQueries[0].value}\n\n${consoleConfiguration.savedQueries[1].value}\n\n--b`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("should correctly append and add surrounding new lines when position is middle line which is empty", () => {
    cy.typeQuery(`--a{enter}{enter}--b{upArrow}`);
    cy.selectQuery(0);
    const expected = `--a\n\n${consoleConfiguration.savedQueries[0].value}\n\n--b`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("should correctly append and add surrounding new lines when position is last line which is empty", () => {
    cy.typeQuery(`--a{enter}--b`);
    cy.selectQuery(0);
    const expected = `--a\n--b\n\n${consoleConfiguration.savedQueries[0].value}\n`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("should correctly append and add surrounding new lines when there are two lines and position is last line which is empty", () => {
    cy.typeQuery(`--a{enter}`);
    cy.selectQuery(0);
    const expected = `--a\n\n${consoleConfiguration.savedQueries[0].value}\n`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("should correctly append and add surrounding new lines when position is middle of non empty line and next line is empty", () => {
    cy.typeQuery(`--a{enter}--b{enter}{enter}--c`);
    cy.typeQuery(`{ctrl}g2{enter}{rightArrow}`); // go to line 2
    cy.selectQuery(0);
    const expected = `--a\n--b\n\n${consoleConfiguration.savedQueries[0].value}\n\n--c`;
    cy.getEditor().should("have.value", expected).snapshot();
  });
});
