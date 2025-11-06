/// <reference types="cypress" />

describe("Sidebar tests", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
  })

  it("should have the correct Help links", () => {
    cy.getByDataHook("help-panel-button").click()
    cy.getByDataHook("help-link-slack")
      .should("have.attr", "href", "https://slack.questdb.io/")
      .should("have.text", "Slack community")
    cy.getByDataHook("help-link-community")
      .should("have.attr", "href", "https://community.questdb.io/")
      .should("have.text", "Public forum")
    cy.getByDataHook("help-link-stackoverflow")
      .should("have.attr", "href", "https://stackoverflow.com/tags/questdb")
      .should("have.text", "Stack Overflow")
    cy.getByDataHook("help-link-web-console-docs")
      .should(
        "have.attr",
        "href",
        "https://questdb.io/docs/develop/web-console/",
      )
      .should("have.text", "Web Console Docs")
  })

  it("should open up the feedback form", () => {
    cy.getByDataHook("help-panel-button").click()
    cy.getByDataHook("help-link-contact-us").click()
    cy.get('form[name="feedback-dialog"]').should("be.visible")
    cy.get('form[name="feedback-dialog"]').within(() => {
      cy.get('input[name="email"]').type("email@address.com")
      cy.get('textarea[name="message"]').type("This is a test message")
      cy.getByDataHook("form-submit-button").should("not.be.disabled")
    })
  })
})
