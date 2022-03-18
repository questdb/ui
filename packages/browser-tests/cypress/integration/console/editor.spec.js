/// <reference types="cypress" />

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

describe("Editor", () => {
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

    it.only("should correctly append and select query after multiple inserts", () => {
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

  describe("autocomplete", () => {});
});
