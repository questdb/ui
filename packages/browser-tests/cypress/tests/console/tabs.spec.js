/// <reference types="cypress" />

const baseUrl = "http://localhost:9999";

describe("tabs", () => {
  beforeEach(() => {
    indexedDB.deleteDatabase("web-console");
    cy.visit(baseUrl);
    cy.getEditor().should("be.visible");
  });

  it("should add and remove tabs through UI buttons", () => {
    const addTabButton = cy.getAddTabButton();

    // start with one tab
    cy.getTabs().should("have.length", 1);
    // check it's title
    cy.getTab(1).should("have.text", "SQL");

    // add new tab
    addTabButton.click();
    cy.getTab(2)
      // check title
      .should("have.text", "SQL 1")
      // check active
      .should("have.attr", "data-active", "true");
    cy.getTabs().should("have.length", 2);

    // add new tab
    addTabButton.click();
    // previous tab should not be active
    cy.getTab(2).should("have.attr", "data-active", "false");

    // new tab should be active
    cy.getTab(3)
      .should("have.text", "SQL 2")
      .should("have.attr", "data-active", "true");
    cy.getTabs().should("have.length", 3);

    // close second tab
    cy.getCloseTabButton(2).click();
    cy.getTab(3)
      .should("have.text", "SQL 2")
      // check active is last tab
      .should("have.attr", "data-active", "true");
    cy.getTabs().should("have.length", 2);
  });

  it("should remain content when switching tabs", () => {
    const tab1 = "-- tab 1 content";
    const tab2 = "-- tab 2 content";
    cy.typeQuery(tab1);
    cy.getEditor().should("have.value", tab1);

    cy.getAddTabButton().click();
    cy.getEditor().should("have.value", "");
    cy.typeQuery(tab2);
    cy.getEditor().should("have.value", tab2);

    cy.getTab(1).click();
    cy.getEditor().should("have.value", tab1);

    cy.getTab(2).click();
    cy.getEditor().should("have.value", tab2);
  });

  it.only("should add and remove tabs with keyboard shortcuts", () => {
    const query = "-- tab 1";
    cy.typeQuery(query);
    cy.getTabs().should("have.length", 1);
    cy.getTab(1).should("have.text", "SQL");

    const query2 = "-- tab 2";
    cy.typeQuery("{alt}t");
    cy.typeQuery(query2);
    cy.getEditor().should("have.value", query2);
    cy.getTab(2)
      .should("have.text", "SQL 1")
      .should("have.attr", "data-active", "true");
    cy.getTabs().should("have.length", 2);

    const query3 = "-- tab 3";
    cy.typeQuery("{alt}t");
    cy.typeQuery(query3);
    cy.getEditor().should("have.value", query3);
    cy.getTab(3)
      .should("have.text", "SQL 2")
      .should("have.attr", "data-active", "true");
    cy.getTabs().should("have.length", 3);

    cy.typeQuery("{alt}w");
    cy.getTab(2)
      .should("have.text", "SQL 1")
      .should("have.attr", "data-active", "true");
    cy.getEditor().should("have.value", query2);
  });
});
