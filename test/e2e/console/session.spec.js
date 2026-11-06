/// <reference types="cypress" />

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl =
  Cypress.config("baseUrl") || `http://localhost:9999${contextPath}`

const assertCookieAccess = (status) => {
  cy.window().then(async (win) => {
    const response = await win.fetch(`${baseUrl}/exec?query=select%207`, {
      credentials: "same-origin",
    })
    expect(response.status).to.equal(status)
    if (status === 200)
      expect((await response.json()).dataset).to.deep.equal([[7]])
  })
}

describe("HTTP Session Management", () => {
  it("keeps a cookie session across reload and ends access on logout", () => {
    // Given
    cy.intercept("GET", `${baseUrl}/exec?query=*&session=true`).as(
      "sessionStart",
    )

    // When
    cy.handleStorageAndVisit(baseUrl)
    cy.loginWithUserAndPassword()

    // Then
    cy.wait("@sessionStart").then((interception) => {
      expect(interception.request.url).to.include("session=true")
      expect(interception.request.headers).to.have.property("authorization")
      expect(interception.response.headers["set-cookie"]).to.exist
    })
    cy.getEditor().should("be.visible")

    // Given
    cy.intercept("GET", /\/exec\?.*query=SELECT%201/).as("queryExec")

    // When
    cy.clearEditor()
    cy.typeQueryDirectly("SELECT 1")
    cy.clickRunIconInLine(1)

    // Then
    cy.wait("@queryExec").then((interception) => {
      expect(interception.request.url).to.not.include("session=true")
      expect(interception.request.url).to.not.include("session=false")
      expect(interception.response.statusCode).to.equal(200)
    })
    cy.getGrid().should("be.visible")
    cy.getGridRow(0).should("contain", "1")
    assertCookieAccess(200)

    // When
    cy.handleStorageAndVisit(baseUrl, false)

    // Then
    cy.getEditor().should("be.visible")
    cy.clearEditor()
    cy.typeQueryDirectly("SELECT 2")
    cy.clickRunIconInLine(1)
    cy.getGrid().should("be.visible")
    cy.getGridRow(0).should("contain", "2")
    assertCookieAccess(200)
    cy.window().then((win) => {
      const basicAuthHeader = win.localStorage.getItem("basic.auth.header")
      expect(basicAuthHeader).to.not.be.null
    })
    cy.intercept("GET", `${baseUrl}/exec?query=*&session=false`).as(
      "sessionDestroy",
    )

    // When
    cy.getByDataHook("button-logout").click()

    // Then
    cy.wait("@sessionDestroy").then((interception) => {
      expect(interception.request.url).to.include("session=false")
      expect(interception.request.url).to.include("select%202")
    })
    cy.getByDataHook("auth-login").should("be.visible")
    cy.window().then((win) => {
      const basicAuthHeader = win.localStorage.getItem("basic.auth.header")
      const restToken = win.localStorage.getItem("rest.token")
      expect(basicAuthHeader).to.be.null
      expect(restToken).to.be.null
    })

    // When
    cy.reload()

    // Then
    cy.getByDataHook("auth-login").should("be.visible")
    cy.getEditor().should("not.exist")
    assertCookieAccess(401)
  })
})
