/// <reference types="cypress" />

const { seedNotebookOnboarding } = require("../../utils")

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl = `http://localhost:9999${contextPath}`

for (const oidcEnabled of [false, true]) {
  for (const { key, value, authorization } of [
    {
      key: "rest.token",
      value: "rest-token",
      authorization: "Bearer rest-token",
    },
    {
      key: "basic.auth.header",
      value: "Basic dXNlcjpwYXNz",
      authorization: "Basic dXNlcjpwYXNz",
    },
  ]) {
    describe(`401 recovery: ${key}, OIDC ${oidcEnabled ? "on" : "off"}`, () => {
      it("logs out the current tab even if another tab removed the saved credential", () => {
        cy.intercept(`${baseUrl}/settings`, {
          config: {
            "release.type": "EE",
            "release.version": "1.2.3",
            "acl.enabled": true,
            "acl.basic.auth.realm.enabled": false,
            "acl.oidc.enabled": oidcEnabled,
            "acl.oidc.client.id": "test-client",
            "acl.oidc.authorization.endpoint": "https://oauth.example.com/auth",
            "acl.oidc.token.endpoint": "https://oauth.example.com/token",
          },
        })
        cy.intercept(`${baseUrl}/exec*`, {
          columns: [],
          dataset: [],
          count: 0,
        })
        cy.intercept(`${baseUrl}/warnings*`, [])
        cy.intercept(`${baseUrl}/chk*`, { status: "Exists" })
        cy.visit(baseUrl, {
          onBeforeLoad(win) {
            win.localStorage.clear()
            seedNotebookOnboarding(win)
            win.localStorage.setItem(key, value)
          },
        })
        cy.getEditor().should("be.visible")
        // localStorage changes in another tab do not change this tab's headers.
        cy.window().its("localStorage").invoke("removeItem", key)
        cy.intercept(
          {
            method: "GET",
            url: `${baseUrl}/exec*`,
            query: { query: "select current_user()" },
          },
          (req) => {
            expect(req.headers.authorization).to.eq(authorization)
            req.reply({ statusCode: 401, body: "Unauthorized" })
          },
        ).as("unauthorized")
        cy.clearEditor()
        cy.typeQuery("select current_user()")
        cy.runLine()
        cy.wait("@unauthorized")
        cy.getByDataHook("auth-login").should("be.visible")
        cy.getEditor().should("not.exist")
      })
    })
  }
}
