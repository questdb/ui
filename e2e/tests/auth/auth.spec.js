/// <reference types="cypress" />

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl = `http://localhost:9999${contextPath}`

const interceptSettings = (payload) => {
  cy.intercept({ method: "GET", url: `${baseUrl}/settings` }, payload).as(
    "settings",
  )
}

describe("OSS", () => {
  before(() => {
    interceptSettings({
      config: {
        "release.type": "OSS",
        "release.version": "1.2.3",
      },
    })
    cy.visit(baseUrl)
  })

  it("should display the console", () => {
    cy.wait("@settings")
    cy.getEditor().should("be.visible")
  })
})

describe("Auth - UI", () => {
  before(() => {
    interceptSettings({
      config: {
        "release.type": "EE",
        "release.version": "1.2.3",
        "acl.enabled": true,
        "acl.basic.auth.realm.enabled": false,
        "acl.oidc.enabled": false,
        "acl.oidc.client.id": null,
        "acl.oidc.authorization.endpoint": null,
        "acl.oidc.token.endpoint": null,
        "acl.oidc.pkce.required": null,
        "acl.oidc.groups.encoded.in.token": false,
      },
    })
    cy.visit(baseUrl)
  })

  it("should display UI auth", () => {
    cy.wait("@settings")
    cy.getByDataHook("auth-login").should("be.visible")
    cy.getEditor().should("not.exist")
  })
})

describe("Auth - OIDC", () => {
  before(() => {
    interceptSettings({
      config: {
        "release.type": "EE",
        "release.version": "1.2.3",
        "acl.enabled": true,
        "acl.basic.auth.realm.enabled": false,
        "acl.oidc.enabled": true,
        "acl.oidc.client.id": "test",
        "acl.oidc.authorization.endpoint": "https://host:9999/auth",
        "acl.oidc.token.endpoint": "https://host:9999/token",
        "acl.oidc.pkce.required": true,
        "acl.oidc.groups.encoded.in.token": false,
      },
    })
    cy.visit(baseUrl)
  })

  it("should display UI auth with OIDC support", () => {
    cy.wait("@settings")
    cy.getByDataHook("auth-login").should("be.visible")
    cy.getByDataHook("button-sso-login").should("be.visible")
    cy.getEditor().should("not.exist")
  })
})

describe("Auth - Basic", () => {
  before(() => {
    interceptSettings({
      config: {
        "release.type": "EE",
        "release.version": "1.2.3",
        "acl.enabled": true,
        "acl.basic.auth.realm.enabled": true,
        "acl.oidc.enabled": false,
        "acl.oidc.client.id": null,
        "acl.oidc.authorization.endpoint": null,
        "acl.oidc.token.endpoint": null,
        "acl.oidc.pkce.required": null,
        "acl.oidc.groups.encoded.in.token": false,
      },
    })
    cy.visit(baseUrl)
  })

  it("should display the console", () => {
    cy.wait("@settings")
    cy.getEditor().should("be.visible")
  })
})

describe("Auth - Disabled", () => {
  before(() => {
    interceptSettings({
      config: {
        "release.type": "EE",
        "release.version": "1.2.3",
        "acl.enabled": false,
        "acl.basic.auth.realm.enabled": true,
        "acl.oidc.enabled": false,
        "acl.oidc.client.id": null,
        "acl.oidc.authorization.endpoint": null,
        "acl.oidc.token.endpoint": null,
        "acl.oidc.pkce.required": null,
        "acl.oidc.groups.encoded.in.token": false,
      },
    })
    cy.visit(baseUrl)
  })

  it("should display the console", () => {
    cy.wait("@settings")
    cy.getEditor().should("be.visible")
  })
})

describe("Auth - Session Parameter (OAuth)", () => {
  describe("OAuth Login with session=true", () => {
    beforeEach(() => {
      interceptSettings({
        config: {
          "release.type": "EE",
          "release.version": "1.2.3",
          "acl.enabled": true,
          "acl.basic.auth.realm.enabled": false,
          "acl.oidc.enabled": true,
          "acl.oidc.client.id": "test-client",
          "acl.oidc.authorization.endpoint": "https://oauth.example.com/auth",
          "acl.oidc.token.endpoint": "https://oauth.example.com/token",
          "acl.oidc.pkce.required": true,
          "acl.oidc.groups.encoded.in.token": false,
        },
      })
    })

    it("should call exec with session=true after OAuth token exchange", () => {
      cy.intercept(
        {
          method: "GET",
          url: `${baseUrl}/exec?query=select%202&session=true`,
        },
        (req) => {
          expect(req.headers).to.have.property("authorization")
          expect(req.headers.authorization).to.match(/^Bearer /)

          req.reply({
            statusCode: 200,
            headers: {
              "set-cookie": "qdb-session=oauth-session-id; Path=/; HttpOnly",
            },
            body: {
              query: "select 2",
              columns: [{ name: "column", type: "INT" }],
              dataset: [[2]],
              count: 1,
            },
          })
        },
      ).as("oauthSessionStart")

      cy.intercept(
        {
          method: "POST",
          url: "https://oauth.example.com/token",
        },
        {
          statusCode: 200,
          body: {
            access_token: "mock-access-token",
            token_type: "Bearer",
            expires_in: 3600,
          },
        },
      ).as("tokenExchange")

      cy.visit(`${baseUrl}?code=test-auth-code&state=test-state`)
      cy.wait("@settings")

      cy.wait("@tokenExchange")
      cy.wait("@oauthSessionStart").then((interception) => {
        expect(interception.request.url).to.include("session=true")
        expect(interception.request.url).to.include("select%202")
        expect(interception.response.headers).to.have.property("set-cookie")
      })
    })
  })
})
