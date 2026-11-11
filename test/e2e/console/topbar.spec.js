/// <reference types="cypress" />

const baseUrl = Cypress.config("baseUrl")
const headers = { Authorization: `Basic ${btoa("admin:quest")}` }
let originalPreferences

const writePreferences = (preferences) => {
  cy.request({ url: `${baseUrl}/settings`, headers }).then(({ body }) => {
    cy.request({
      method: "PUT",
      url: `${baseUrl}/settings`,
      headers,
      qs: { version: body["preferences.version"] },
      body: preferences,
    })
  })
}

describe("Instance identity persistence", () => {
  beforeEach(() => {
    cy.request({ url: `${baseUrl}/settings`, headers }).then(({ body }) => {
      originalPreferences = body.preferences
      writePreferences({
        ...body.preferences,
        instance_name: "",
        instance_description: "",
        instance_type: "",
        instance_rgb: "",
      })
    })
    cy.loadConsoleWithAuth()
  })

  afterEach(() => {
    if (originalPreferences) writePreferences(originalPreferences)
  })

  it("should change the instance name, description, and type", () => {
    cy.getByDataHook("topbar-instance-name").should(
      "have.text",
      "Instance name is not set",
    )
    cy.getByDataHook("topbar-instance-badge").should(
      "have.css",
      "background-color",
      "rgba(0, 0, 0, 0)",
    )
    cy.intercept("PUT", "**/settings?*").as("savePreferences")
    cy.getByDataHook("topbar-instance-badge").realHover()
    cy.getByDataHook("topbar-instance-edit-icon").should("be.visible")
    cy.getByDataHook("topbar-instance-edit-icon").click()
    cy.getByDataHook("topbar-instance-name-input").clear().type("test-instance")
    cy.getByDataHook("topbar-instance-type-select").click()
    cy.getByDataHook("topbar-instance-type-option-testing").click()
    cy.getByDataHook("topbar-instance-description-input")
      .clear()
      .type("test description of the test instance")
    cy.getByDataHook("topbar-instance-color-option-g").click()
    cy.getByDataHook("topbar-instance-save-button").click()
    cy.wait("@savePreferences").its("response.statusCode").should("equal", 200)
    cy.getByDataHook("topbar-instance-save-button").should("not.exist")
    cy.getByDataHook("topbar-instance-name").should("contain", "Testing")
    cy.getByDataHook("topbar-instance-name").should("contain", "test-instance")
    cy.getByDataHook("topbar-instance-icon").realHover()
    cy.getByDataHook("topbar-instance-tooltip").should("be.visible")
    cy.getByDataHook("topbar-instance-tooltip")
      .should("contain", "test description of the test instance")
      .and("contain", "testing")
    cy.getByDataHook("topbar-instance-badge").should(
      "have.css",
      "background-color",
      "rgb(0, 170, 59)",
    )
    cy.reload()
    cy.getByDataHook("topbar-instance-name")
      .should("contain", "test-instance")
      .and("contain", "Testing")
    cy.getByDataHook("topbar-instance-badge").should(
      "have.css",
      "background-color",
      "rgb(0, 170, 59)",
    )
    cy.getByDataHook("topbar-instance-icon").realHover()
    cy.getByDataHook("topbar-instance-tooltip").should(
      "contain",
      "test description of the test instance",
    )
  })
})
