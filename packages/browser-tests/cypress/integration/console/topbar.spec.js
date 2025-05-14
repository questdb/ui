/// <reference types="cypress" />

describe("TopBar", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth();
  });

  it("should show the instance warning and no description", () => {
    cy.getByDataHook("topbar-instance-name").should(
      "have.text",
      "Instance name is not set"
    );
    cy.getByDataHook("topbar-instance-badge").should(
      "have.css",
      "background-color",
      "rgb(40, 42, 54)"
    );
  });

  it("should preview the color, show error when instance name is empty, and don't save changes on cancel", () => {
    cy.getByDataHook("topbar-instance-name").realHover();
    cy.getByDataHook("topbar-instance-edit-icon").should("be.visible");
    cy.getByDataHook("topbar-instance-edit-icon").click();
    cy.getByDataHook("topbar-instance-color-option-r").click();
    cy.getByDataHook("topbar-instance-badge").should(
      "have.css",
      "background-color",
      "rgb(199, 7, 45)"
    );
    cy.getByDataHook("topbar-instance-save-button").click();
    cy.contains("Instance name is required").should("be.visible");
    cy.getByDataHook("topbar-instance-cancel-button").click();
    cy.getByDataHook("topbar-instance-name").should(
      "have.text",
      "Instance name is not set"
    );
    cy.getByDataHook("topbar-instance-badge").should(
      "have.css",
      "background-color",
      "rgb(40, 42, 54)"
    );
  });

  it("should change the instance name, description, and type", () => {
    cy.getByDataHook("topbar-instance-badge").realHover();
    cy.getByDataHook("topbar-instance-edit-icon").should("be.visible");
    cy.getByDataHook("topbar-instance-edit-icon").click();
    cy.getByDataHook("topbar-instance-name-input").type("test-instance");
    cy.getByDataHook("topbar-instance-type-select").select("production");
    cy.getByDataHook("topbar-instance-description-input").type(
      "test description of the test instance"
    );
    cy.getByDataHook("topbar-instance-color-option-g").click();
    cy.getByDataHook("topbar-instance-save-button").click();
    cy.getByDataHook("topbar-instance-save-button").should("not.exist");
    cy.getByDataHook("topbar-instance-name").should(
      "have.text",
      "test-instance"
    );
    cy.getByDataHook("topbar-instance-icon").realHover();
    cy.contains("test description of the test instance").should("be.visible");
    cy.contains(
      "You are connected to a QuestDB instance for production"
    ).should("be.visible");
  });
});
