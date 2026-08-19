/// <reference types="cypress" />

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl = `http://localhost:9999${contextPath}`

const interceptSettings = (payload) => {
  cy.intercept({ method: "GET", url: `${baseUrl}/settings` }, payload).as(
    "settings",
  )
}

const STORE_KEY = {
  oauthState: "oauth.state",
  pkceCodeVerifier: "pkce.code.verifier",
}

const startedFlow = {
  state: "state-we-generated",
  codeVerifier: "verifier-we-generated",
}

const visitCallback = (query, flow) =>
  cy.visit(`${baseUrl}${query}`, {
    onBeforeLoad(win) {
      win.localStorage.clear()
      if (flow) {
        win.localStorage.setItem(STORE_KEY.oauthState, flow.state)
        win.localStorage.setItem(STORE_KEY.pkceCodeVerifier, flow.codeVerifier)
      }
    },
  })

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

      visitCallback(
        `?code=test-auth-code&state=${startedFlow.state}`,
        startedFlow,
      )
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

describe("Auth - OIDC callback validation", () => {
  const interceptOidcSettings = (guards) => {
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
        "acl.oidc.groups.encoded.in.token": false,
        ...guards,
      },
    })
  }

  const interceptTokenExchange = () => {
    cy.intercept(
      { method: "POST", url: "https://oauth.example.com/token" },
      {
        statusCode: 200,
        body: {
          access_token: "mock-access-token",
          token_type: "Bearer",
          expires_in: 3600,
        },
      },
    ).as("tokenExchange")

    cy.intercept(
      { method: "GET", url: `${baseUrl}/exec*` },
      {
        statusCode: 200,
        body: {
          query: "select 2",
          columns: [{ name: "column", type: "INT" }],
          dataset: [[2]],
          count: 1,
        },
      },
    )
    cy.intercept({ method: "GET", url: `${baseUrl}/warnings*` }, [])
    cy.intercept(
      { method: "GET", url: `${baseUrl}/chk*` },
      { status: "Exists" },
    )
  }

  const expectNoTokenExchange = () => {
    cy.getByDataHook("auth-login").should("be.visible")
    cy.get("@tokenExchange.all").should("have.length", 0)
  }

  describe("when the server requires state", () => {
    beforeEach(() => {
      interceptOidcSettings({ "acl.oidc.state.required": true })
      interceptTokenExchange()
    })

    it("does not exchange a code when this browser never started a login", () => {
      // Given a browser that holds no state, because it never began a login
      // When an attacker sends it a callback URL carrying their own code
      visitCallback(
        "?code=code-from-the-attacker&state=state-from-the-attacker",
      )
      cy.wait("@settings")

      // Then the console asks for a login instead of exchanging the code
      expectNoTokenExchange()
    })

    it("does not exchange a code when the state does not match", () => {
      // Given a login flow this browser started
      // When the callback carries a state from another flow
      visitCallback(
        "?code=code-from-the-attacker&state=state-from-the-attacker",
        startedFlow,
      )
      cy.wait("@settings")

      // Then the console rejects the callback
      expectNoTokenExchange()
    })

    it("exchanges a code that matches the flow this browser started", () => {
      // Given a login flow this browser started
      // When the provider returns the matching state
      visitCallback(
        `?code=code-from-the-provider&state=${startedFlow.state}`,
        startedFlow,
      )
      cy.wait("@settings")

      // Then the console completes the exchange with its own verifier
      cy.wait("@tokenExchange").then((interception) => {
        expect(interception.request.body).to.include(
          `code_verifier=${startedFlow.codeVerifier}`,
        )
      })
    })

    it("clears the stored state after a rejected callback", () => {
      // Given a login flow this browser started
      // When the callback carries a state from another flow
      visitCallback(
        "?code=code-from-the-attacker&state=state-from-the-attacker",
        startedFlow,
      )
      cy.wait("@settings")
      cy.getByDataHook("auth-login").should("be.visible")

      // Then the state does not survive for a later callback to reuse
      cy.window().then((win) => {
        expect(win.localStorage.getItem(STORE_KEY.oauthState)).to.be.null
      })
    })
  })

  describe("when the server does not require state", () => {
    beforeEach(() => {
      interceptOidcSettings({ "acl.oidc.state.required": false })
      interceptTokenExchange()
    })

    it("still exchanges a bare code, so those deployments keep working", () => {
      // Given a deployment that never generates state
      // When a callback arrives with only an authorization code
      visitCallback("?code=code-from-the-provider")
      cy.wait("@settings")

      // Then the console follows the server configuration
      cy.wait("@tokenExchange")
    })
  })
})
