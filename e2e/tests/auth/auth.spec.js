/// <reference types="cypress" />

const { seedNotebookOnboarding } = require("../../utils")

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

const queryResult = {
  query: "select 2",
  columns: [{ name: "column", type: "INT" }],
  dataset: [[2]],
  count: 1,
}

const stubConsoleRequests = () => {
  cy.intercept(
    { method: "GET", url: `${baseUrl}/exec*` },
    { statusCode: 200, body: { columns: [], dataset: [], count: 0 } },
  )
  cy.intercept({ method: "GET", url: `${baseUrl}/warnings*` }, [])
  cy.intercept({ method: "GET", url: `${baseUrl}/chk*` }, { status: "Exists" })
}

const visitCallback = (query, flow, credentials = {}) =>
  cy.visit(`${baseUrl}${query}`, {
    onBeforeLoad(win) {
      win.localStorage.clear()
      seedNotebookOnboarding(win)
      Object.entries(credentials).forEach(([key, value]) => {
        win.localStorage.setItem(key, value)
      })
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

    stubConsoleRequests()
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

describe("Auth - OIDC sign-in errors", () => {
  const tokenUrl = "https://oauth.example.com/token"
  // The console's own params, e.g. a shared query, which it saves before the
  // redirect to the provider
  const returnParams = "query=select+1"

  const visitCallbackWithReturnParams = (query) =>
    cy.visit(`${baseUrl}${query}`, {
      onBeforeLoad(win) {
        win.localStorage.clear()
        win.sessionStorage.setItem("oauth.return.params", returnParams)
      },
    })

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
        "acl.oidc.token.endpoint": tokenUrl,
        "acl.oidc.state.required": false,
        "acl.oidc.groups.encoded.in.token": false,
      },
    })
    stubConsoleRequests()
  })

  it("does not resubmit a code that failed to sign in on reload", () => {
    // Given a provider that rejects the authorization code
    cy.intercept(
      { method: "POST", url: tokenUrl },
      {
        statusCode: 400,
        body: { error: "invalid_grant", error_description: "Code not valid" },
      },
    ).as("tokenExchange")
    visitCallbackWithReturnParams("?code=code-from-the-provider")
    cy.wait("@settings")
    cy.contains("Code not valid").should("be.visible")

    // Then the URL gets back the console's own params instead of the code
    cy.location("search").should("eq", `?${returnParams}`)

    // When the page is reloaded
    cy.reload()

    // Then the console shows the login page without exchanging the code again
    cy.getByDataHook("auth-login").should("be.visible")
    cy.contains("Code not valid").should("not.exist")
    cy.get("@tokenExchange.all").should("have.length", 1)
  })

  it("does not show a provider error again on reload", () => {
    // Given a provider that redirects back with an error
    visitCallbackWithReturnParams(
      "?error=access_denied&error_description=Sign-in+cancelled",
    )
    cy.wait("@settings")
    cy.contains("access_denied: Sign-in cancelled").should("be.visible")

    // Then the URL gets back the console's own params instead of the error
    cy.location("search").should("eq", `?${returnParams}`)

    // When the page is reloaded
    cy.reload()

    // Then the console shows the login page without the old error
    cy.getByDataHook("auth-login").should("be.visible")
    cy.contains("access_denied: Sign-in cancelled").should("not.exist")
  })

  for (const { failure, reply, message } of [
    {
      failure: "cannot be reached",
      reply: { forceNetworkError: true },
      message:
        "Could not reach the identity provider to complete the sign-in. Please try again.",
    },
    {
      failure: "returns a response that is not JSON",
      reply: { statusCode: 502, body: "<html>Bad Gateway</html>" },
      message:
        "The identity provider returned an unexpected response (HTTP 502). Please try again.",
    },
  ]) {
    it(`shows an error, not a blank page, when the token endpoint ${failure}`, () => {
      // Given a token endpoint that fails without an OAuth response
      cy.intercept({ method: "POST", url: tokenUrl }, reply)
      visitCallback("?code=code-from-the-provider")
      cy.wait("@settings")

      // Then the console shows the login page with the error
      cy.getByDataHook("auth-login").should("be.visible")
      cy.contains(message)
        .closest("[data-hook='sign-in-error']")
        .should("be.focused")
    })
  }

  it("shows an error, not a blank page, when the token endpoint does not respond", () => {
    // Given a token endpoint that does not respond within the timeout
    let requested = false
    cy.intercept({ method: "POST", url: tokenUrl }, (req) => {
      requested = true
      req.reply({ delay: 30000, body: {} })
    })
    // Fake only the timeouts, so the test does not wait for 10 seconds
    cy.clock(Date.now(), ["setTimeout", "clearTimeout"])
    visitCallback("?code=code-from-the-provider")
    cy.wait("@settings")
    cy.wrap(null).should(() => expect(requested).to.equal(true))

    // When the timeout elapses
    cy.tick(10000)

    // Then the console shows the login page with the error
    cy.getByDataHook("auth-login").should("be.visible")
    cy.contains(
      "The identity provider did not respond within 10 seconds. Please try again.",
    )
      .closest("[data-hook='sign-in-error']")
      .should("be.focused")
  })
})

describe("Auth - OIDC ID token", () => {
  const tokenUrl = "https://oauth.example.com/token"

  // Unsigned: the console only reads the claims, and the stubbed server does
  // not validate the token.
  const idToken = (subject, lifetimeSeconds) => {
    const base64url = (part) =>
      btoa(JSON.stringify(part))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "")
    const iat = Math.floor(Date.now() / 1000)
    return [
      base64url({ alg: "RS256", typ: "JWT" }),
      base64url({ sub: subject, iat, exp: iat + lifetimeSeconds }),
      "signature",
    ].join(".")
  }

  // Signs in with SSO to a server that expects the ID token as the bearer.
  // The provider returns the ID token given for each grant type, while the
  // token response's expires_in describes the access token.
  const signIn = ({
    idTokens,
    accessTokenLifetime = 3600,
    refreshReply,
    credentials,
  }) => {
    const grants = []

    interceptSettings({
      config: {
        "release.type": "EE",
        "release.version": "1.2.3",
        "acl.enabled": true,
        "acl.basic.auth.realm.enabled": false,
        "acl.oidc.enabled": true,
        "acl.oidc.client.id": "test-client",
        "acl.oidc.authorization.endpoint": "https://oauth.example.com/auth",
        "acl.oidc.token.endpoint": tokenUrl,
        "acl.oidc.state.required": false,
        "acl.oidc.groups.encoded.in.token": true,
      },
    })
    cy.intercept({ method: "POST", url: tokenUrl }, (req) => {
      const grant = new URLSearchParams(req.body).get("grant_type")
      grants.push(grant)
      if (grant === "refresh_token" && refreshReply) {
        req.alias = "refreshFailure"
        req.reply(refreshReply)
        return
      }
      req.reply({
        access_token: `${grant}-access-token`,
        refresh_token: "refresh-token",
        id_token: idTokens[grant],
        token_type: "Bearer",
        expires_in: accessTokenLifetime,
      })
    })
    stubConsoleRequests()
    // The first query after sign-in, which waits for a due refresh
    cy.intercept(
      {
        method: "GET",
        url: `${baseUrl}/exec*`,
        query: { query: /^SELECT 1$/ },
      },
      { statusCode: 200, body: queryResult },
    ).as("authCheck")
    cy.intercept(
      { method: "GET", url: `${baseUrl}/exec*`, query: { session: "true" } },
      { statusCode: 200, body: queryResult },
    ).as("sessionStart")

    visitCallback("?code=code-from-the-provider", undefined, credentials)
    cy.wait("@settings")
    return grants
  }

  const expectMissingIdTokenError = (detail) => {
    cy.getByDataHook("auth-login").should("be.visible")
    cy.contains("Missing ID token")
      .closest("[data-hook='sign-in-error']")
      .should("be.focused")
    cy.contains("ask your administrator to check the SSO configuration").should(
      "be.visible",
    )
    cy.contains("Your identity provider did not send the information")
      .should("be.visible")
      .and("contain", detail)
    cy.getEditor().should("not.exist")
  }

  for (const { failure, reply } of [
    { failure: "network error", reply: { forceNetworkError: true } },
    {
      failure: "non-JSON 502",
      reply: { statusCode: 502, body: "<html>Bad Gateway</html>" },
    },
  ]) {
    it(`loads the editor after a refresh ${failure} and explains a later 401`, () => {
      const initial = idToken("initial", 20)
      signIn({ idTokens: { authorization_code: initial }, refreshReply: reply })
      cy.wait("@refreshFailure")
      cy.wait("@authCheck")
        .its("request.headers.authorization")
        .should("eq", `Bearer ${initial}`)
      cy.getEditor().should("be.visible")
      cy.contains(
        "Could not refresh your SSO session. We'll retry, but you may be signed out when your current session expires.",
      ).should("be.visible")
      // A persistent warning has no running auto-close animation.
      cy.get("#sso-refresh-failed .Toastify__progress-bar").should(
        "not.have.class",
        "Toastify__progress-bar--animated",
      )
      cy.intercept(
        {
          method: "GET",
          url: `${baseUrl}/exec*`,
          query: { query: "select current_user()" },
        },
        { statusCode: 401, body: "Unauthorized" },
      )
      cy.clearEditor()
      cy.typeQuery("select current_user()")
      cy.runLine()
      cy.getByDataHook("auth-login").should("be.visible")
      cy.getByDataHook("sign-in-error")
        .should("be.focused")
        .and("contain.text", "Your SSO session has expired")
      cy.contains(
        "Could not refresh your SSO session. Please sign in again.",
      ).should("be.visible")
      cy.get("#sso-refresh-failed").should("not.exist")
      cy.window()
        .its("localStorage")
        .invoke("getItem", "sso.session.active")
        .should("eq", "true")
    })
  }

  it("clears retained password credentials only when signing in with SSO", () => {
    const initial = idToken("initial", 3600)
    signIn({
      idTokens: { authorization_code: initial },
      credentials: {
        "rest.token": "expired-rest-token",
        "basic.auth.header": "Basic expired",
      },
    })
    cy.wait("@authCheck")
      .its("request.headers.authorization")
      .should("eq", `Bearer ${initial}`)
    cy.getEditor().should("be.visible")
    cy.window().then(({ localStorage }) => {
      expect(localStorage.getItem("rest.token")).to.be.null
      expect(localStorage.getItem("basic.auth.header")).to.be.null
    })
  })

  it("refreshes an ID token that expires before the access token", () => {
    // Given an ID token within the 30s refresh window, and an access token
    // that is valid for an hour
    const refreshed = idToken("refreshed", 3600)
    const grants = signIn({
      idTokens: {
        authorization_code: idToken("initial", 20),
        refresh_token: refreshed,
      },
      accessTokenLifetime: 3600,
    })

    // Then the console refreshes before its first query, and sends the new
    // ID token
    cy.wait("@authCheck")
      .its("request.headers.authorization")
      .should("eq", `Bearer ${refreshed}`)
    cy.wrap(grants).should("deep.equal", [
      "authorization_code",
      "refresh_token",
    ])
  })

  it("does not refresh an ID token that outlives the access token", () => {
    // Given an ID token that is valid for an hour, and an access token within
    // the 30s refresh window
    const initial = idToken("initial", 3600)
    const grants = signIn({
      idTokens: {
        authorization_code: initial,
        refresh_token: idToken("refreshed", 3600),
      },
      accessTokenLifetime: 20,
    })

    // Then the console keeps sending the initial ID token
    cy.wait("@authCheck")
      .its("request.headers.authorization")
      .should("eq", `Bearer ${initial}`)
    cy.wrap(grants).should("deep.equal", ["authorization_code"])
  })

  it("explains a sign-in without the ID token the server expects", () => {
    // Given a provider that returns no ID token, as without the openid scope
    signIn({ idTokens: {} })

    // Then the console explains the problem instead of starting a session,
    // and drops the used code from the URL
    expectMissingIdTokenError("needed to sign you in.")
    cy.get("@sessionStart.all").should("have.length", 0)
    cy.location("search").should("eq", "")
  })

  it("explains a refresh without the ID token the server expects", () => {
    // Given a provider that omits the ID token on refresh, which OIDC allows
    const initial = idToken("initial", 20)
    signIn({ idTokens: { authorization_code: initial } })

    // Then the console ends the session and cancels the waiting SQL request.
    expectMissingIdTokenError("needed to keep you signed in.")
    cy.get("@authCheck.all").should("have.length", 0)
  })
})
