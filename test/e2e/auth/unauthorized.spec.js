/// <reference types="cypress" />

const { seedNotebookOnboarding } = require("../utils")

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl =
  Cypress.config("baseUrl") || `http://localhost:9999${contextPath}`

describe("401 recovery with a stored REST token and OIDC enabled", () => {
  it("shows Login after SQL rejection even when the saved credential was removed", () => {
    // Given
    cy.intercept(`${baseUrl}/settings`, {
      config: {
        "release.type": "EE",
        "release.version": "1.2.3",
        "acl.enabled": true,
        "acl.basic.auth.realm.enabled": false,
        "acl.oidc.enabled": true,
        "acl.oidc.client.id": "test-client",
        "acl.oidc.authorization.endpoint": "https://oauth.example.com/auth",
        "acl.oidc.token.endpoint": "https://oauth.example.com/token",
      },
    })
    cy.intercept(`${baseUrl}/exec*`, { columns: [], dataset: [], count: 0 })
    cy.intercept(`${baseUrl}/warnings*`, [])
    cy.intercept(`${baseUrl}/chk*`, { status: "Exists" })
    cy.visit(baseUrl, {
      onBeforeLoad(win) {
        win.localStorage.clear()
        win.sessionStorage.clear()
        win.indexedDB.deleteDatabase("web-console")
        seedNotebookOnboarding(win)
        win.localStorage.setItem("rest.token", "rest-token")
      },
    })
    cy.getEditor().should("be.visible")
    cy.window().its("localStorage").invoke("removeItem", "rest.token")
    let rejectQuery
    cy.intercept(
      {
        method: "GET",
        url: `${baseUrl}/exec*`,
        query: { query: "select current_user()" },
      },
      (req) => {
        expect(req.headers.authorization).to.eq("Bearer rest-token")
        return new Promise((resolve) => {
          rejectQuery = () => {
            req.reply({ statusCode: 401, body: "Unauthorized" })
            resolve()
          }
        })
      },
    ).as("unauthorized")

    // When
    cy.typeQueryDirectly("select current_user()")
    cy.runLine()
    cy.wrap(null).should(() => expect(rejectQuery).to.be.a("function"))

    // Then
    cy.getEditor().should("be.visible")
    cy.window()
      .its("localStorage")
      .invoke("getItem", "rest.token")
      .should("be.null")

    // When
    cy.then(() => rejectQuery())

    // Then
    cy.wait("@unauthorized")
    cy.getByDataHook("auth-login").should("be.visible")
    cy.getEditor().should("not.exist")
    cy.get("@unauthorized.all").should("have.length", 1)
  })
})
