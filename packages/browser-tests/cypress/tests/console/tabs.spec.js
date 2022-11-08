/// <reference types="cypress" />

const baseUrl = "http://localhost:9999";

describe("tabs", () => {
  beforeEach(() => {
    indexedDB.deleteDatabase("web-console");
    cy.visit(baseUrl);
    cy.getEditor().should("be.visible");
  });

  it("should add and remove tabs through UI buttons", () => {
    cy.getTabs().should("have.length", 1).getTab(1).should("have.text", "SQL");

    cy.getAddTabButton()
      .click()
      .getTab(2)
      .should("have.text", "SQL 1")
      .should("have.attr", "data-active", "true")
      .getTabs()
      .should("have.length", 2);

    cy.getAddTabButton()
      .click()
      .getTab(2)
      .should("have.attr", "data-active", "false")
      .getTab(3)
      .should("have.text", "SQL 2")
      .should("have.attr", "data-active", "true")
      .getTabs()
      .should("have.length", 3);

    cy.getCloseTabButton(2)
      .click()
      .getTab(3)
      .should("have.text", "SQL 2")
      .should("have.attr", "data-active", "true")
      .getTabs()
      .should("have.length", 2);
  });

  it("should keep content when switching tabs", () => {
    const tab1 = "-- tab 1 content";
    const tab2 = "-- tab 2 content";
    cy.typeQuery(tab1)
      .getEditor()
      .should("have.value", tab1)

      .getAddTabButton()
      .click()
      .getEditor()
      .should("have.value", "")
      .typeQuery(tab2)
      .getEditor()
      .should("have.value", tab2);

    cy.getTab(1).click().getEditor().should("have.value", tab1);

    cy.getTab(2).click().getEditor().should("have.value", tab2);
  });

  it("should add and remove tabs with keyboard shortcuts", () => {
    // start with one tab
    const query = "-- tab 1";
    cy.typeQuery(query)
      .getTabs()
      .should("have.length", 1)
      .getTab(1)
      .should("have.text", "SQL");

    // open 3 more tabs
    const query2 = "-- tab 2";
    cy.typeQuery("{alt}t")
      .typeQuery(query2)
      .getEditor()
      .should("have.value", query2)
      .getTab(2)
      .should("have.text", "SQL 1")
      .should("have.attr", "data-active", "true")
      .getTabs()
      .should("have.length", 2);

    const query3 = "-- tab 3";
    cy.typeQuery("{alt}t")
      .typeQuery(query3)
      .getEditor()
      .should("have.value", query3)
      .getTab(3)
      .should("have.text", "SQL 2")
      .should("have.attr", "data-active", "true")
      .getTabs()
      .should("have.length", 3);

    const query4 = "-- tab 4";
    cy.typeQuery("{alt}t")
      .typeQuery(query4)
      .getEditor()
      .should("have.value", query4)
      .getTab(4)
      .should("have.text", "SQL 3")
      .should("have.attr", "data-active", "true")
      .getTabs()
      .should("have.length", 4);

    // select 2nd tab and close it with keyboard shortcut
    cy.getTab(2)
      .should("have.text", "SQL 1")
      .click()
      .should("have.attr", "data-active", "true")
      .typeQuery("{alt}w");

    // last tab should be active
    cy.getTab(4)
      .should("have.text", "SQL 3")
      .should("have.attr", "data-active", "true")
      .getEditor()
      .should("have.value", query4);

    cy.getTab(1)
      .click()
      .should("have.attr", "data-active", "true")
      .getEditor()
      .should("have.value", query);

    cy.getCloseTabButton(4)
      .click()
      .getTab(1)
      .should("have.attr", "data-active", "true")
      .getEditor()
      .should("have.value", query);

    cy.typeQuery("{alt}t")
      .getTab(5)
      .should("have.text", "SQL 1")
      .should("have.attr", "data-active", "true")
      .getEditor()
      .should("have.value", "");

    cy.getTab(3).click().getEditor().should("have.value", query3);

    cy.typeQuery("{alt}w").typeQuery("{alt}w");

    cy.getTab(1)
      .should("have.text", "SQL")
      .should("have.attr", "data-active", "true")
      .getEditor()
      .should("have.value", query);
  });

  it("should select active tab when all closed", () => {
    // open and close tabs with UI buttons
    cy.getAddTabButton().click().click().click();

    cy.getCloseTabButton(4)
      .click()
      .getCloseTabButton(3)
      .click()
      .getCloseTabButton(2)
      .click();

    cy.getCloseTabButton(1)
      .should("not.exist")
      .getTab(1)
      .should("have.attr", "data-active", "true");

    // open and close tabs with keyboard shortcuts
    cy.typeQuery("{alt}t")
      .typeQuery("{alt}t")
      .typeQuery("{alt}t")
      .typeQuery("{alt}w")
      .typeQuery("{alt}w")
      .typeQuery("{alt}w");

    cy.getTab(1).should("have.attr", "data-active", "true");
  });
});
