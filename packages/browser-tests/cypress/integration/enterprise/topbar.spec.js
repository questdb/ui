/// <reference types="cypress" />

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || "";
const baseUrl = `http://localhost:9999${contextPath}`;

describe("instance information in enterprise", () => {
  before(() => {
    // setup DB user with '.' in their name
    cy.loadConsoleAsAdminAndCreateDBUser("john.doe");
  });

  it("should be able to edit instance info as admin", () => {
    cy.visit(baseUrl);
    cy.loginWithUserAndPassword();

    cy.getByDataHook("topbar-instance-name").should(
      "have.text",
      "Instance name is not set"
    );
    cy.getByDataHook("topbar-instance-badge").should(
      "have.css",
      "background-color",
      "rgb(40, 42, 54)"
    );
    cy.getEditor().should("be.visible");

    cy.executeSQL("select current_user()");
    cy.getGridRow(0).should("contain", "admin");
    cy.getByDataHook("topbar-instance-edit-icon").should("be.visible");

    cy.logout()
  });

  it("should not be able to edit instance info without SETTINGS permission", () => {
    cy.visit(baseUrl);
    cy.loginWithUserAndPassword("john.doe", "pwd");

    cy.executeSQL("select current_user()");
    cy.getGridRow(0).should("contain", "john.doe");
    cy.getByDataHook("topbar-instance-edit-icon").should("not.exist");

    cy.logout()
  });

  it("should be able to edit instance info with SETTINGS permission", () => {
    cy.visit(baseUrl);
    cy.loginWithUserAndPassword();

    cy.executeSQL(`grant SETTINGS to 'john.doe'`);
    cy.getByDataHook("notification-success").should("be.visible");

    cy.logout();

    cy.loginWithUserAndPassword("john.doe", "pwd");

    cy.executeSQL("select current_user()");
    cy.getGridRow(0).should("contain", "john.doe");
    cy.getByDataHook("topbar-instance-edit-icon").should("be.visible");

    cy.logout()
  });
});
