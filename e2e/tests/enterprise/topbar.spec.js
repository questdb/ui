/// <reference types="cypress" />

describe("instance information in enterprise", () => {
  before(() => {
    cy.execAdminQuery("CREATE USER 'john.doe' WITH PASSWORD 'pwd'")
    cy.execAdminQuery("GRANT HTTP TO 'john.doe'")
  })

  it("should be able to edit instance info as admin", () => {
    cy.loadConsoleWithAuth(
      false,
      {},
      { buffers: [{ value: "select current_user()" }] },
    )

    cy.getByDataHook("topbar-instance-name").should(
      "have.text",
      "Instance name is not set",
    )
    cy.getByDataHook("topbar-instance-badge").should(
      "have.css",
      "background-color",
      "rgba(0, 0, 0, 0)",
    )
    cy.getEditor().should("be.visible")

    cy.intercept("/exec*").as("identityQuery")
    cy.clickRunIconInLine(1)
    cy.wait("@identityQuery")
    cy.getGridRow(0).should("contain", "admin")
    cy.getByDataHook("topbar-instance-edit-icon").should("be.visible")
  })

  it("should not be able to edit instance info without SETTINGS permission", () => {
    cy.loadConsoleWithAuth(
      false,
      {},
      {
        username: "john.doe",
        password: "pwd",
        buffers: [{ value: "select current_user()" }],
      },
    )

    cy.intercept("/exec*").as("identityQuery")
    cy.clickRunIconInLine(1)
    cy.wait("@identityQuery")
    cy.getGridRow(0).should("contain", "john.doe")
    cy.getByDataHook("topbar-instance-edit-icon").should("not.exist")
  })

  it("should be able to edit instance info with SETTINGS permission", () => {
    cy.execAdminQuery("GRANT SETTINGS TO 'john.doe'")
    cy.loadConsoleWithAuth(
      false,
      {},
      {
        username: "john.doe",
        password: "pwd",
        buffers: [{ value: "select current_user()" }],
      },
    )

    cy.intercept("/exec*").as("identityQuery")
    cy.clickRunIconInLine(1)
    cy.wait("@identityQuery")
    cy.getGridRow(0).should("contain", "john.doe")
    cy.getByDataHook("topbar-instance-edit-icon").should("be.visible")
  })
})
