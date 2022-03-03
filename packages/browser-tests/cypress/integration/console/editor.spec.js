/// <reference types="cypress" />

const queries = [
  "select * from telemetry",
  "select * from telemetry_config",
  "--start\nselect * from telemetry_config\n--end",
];

describe("questdb editor", () => {
  beforeEach(() => {
    cy.visit("http://localhost:9999");
  });

  it("query 1", () => {
    cy.selectQuery(0);
    const expected = `select * from telemetry\n`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("query 2", () => {
    cy.selectQuery(1);
    const expected = `select * from telemetry_config\n`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("query 3", () => {
    cy.selectQuery(2);
    const expected = `--start\nselect * from telemetry_config\n--end\n`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("query 4", () => {
    cy.selectQuery(1);
    cy.selectQuery(2);
    cy.typeQuery(`{ctrl}g2{enter}`); // go to line 2
    cy.selectQuery(1);
    const expected = `${queries[1]}\n\n${queries[1]}\n\n--start\n${queries[1]}\n--end\n`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("query 5", () => {
    cy.typeQuery(`{enter}--b{upArrow}`);
    cy.selectQuery(0);
    cy.selectQuery(1);
    const expected = `${queries[0]}\n\n${queries[1]}\n\n--b`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("query 6", () => {
    cy.typeQuery(`--a{enter}{enter}--b{upArrow}`);
    cy.selectQuery(0);
    const expected = `--a\n\n${queries[0]}\n\n--b`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("query 7", () => {
    cy.typeQuery(`--a{enter}--b`);
    cy.selectQuery(0);
    const expected = `--a\n--b\n\n${queries[0]}\n`;
    cy.getEditor().should("have.value", expected).snapshot();
  });

  it("query 8", () => {
    cy.typeQuery(`--a{enter}`);
    cy.selectQuery(0);
    const expected = `--a\n\n${queries[0]}\n`;
    cy.getEditor().should("have.value", expected).snapshot();
  });
});
