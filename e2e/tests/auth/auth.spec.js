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

  it("restores focus to the sign-in heading when the error is dismissed", () => {
    cy.intercept("POST", tokenUrl, {
      statusCode: 400,
      body: { error: "invalid_grant" },
    })
    visitCallback("?code=bad-code")
    cy.getByDataHook("sign-in-error")
      .should("be.focused")
      .should(($error) => {
        const win = $error[0].ownerDocument.defaultView
        const style = win.getComputedStyle($error[0])
        expect(style.outlineStyle).not.to.equal("none")
        expect(parseFloat(style.outlineWidth)).to.be.greaterThan(0)
      })
    cy.get('[aria-label="Dismiss sign-in error"]').focus().click()
    cy.getByDataHook("sign-in-error").should("not.exist")
    cy.contains("h2", "Sign in to QuestDB").should("be.focused")
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
    authCheckReply,
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
      authCheckReply ?? { statusCode: 200, body: queryResult },
    ).as("authCheck")
    cy.intercept(
      { method: "GET", url: `${baseUrl}/exec*`, query: { session: "true" } },
      { statusCode: 200, body: queryResult },
    ).as("sessionStart")

    visitCallback("?code=code-from-the-provider", undefined, credentials)
    cy.wait("@settings")
    return grants
  }

  const passwordRelogin = () => {
    cy.intercept(
      {
        method: "GET",
        url: `${baseUrl}/exec*`,
        query: { query: /alter user .* create token type rest/ },
      },
      { body: { columns: [], count: 1, dataset: [["admin", "rest-token"]] } },
    )
    cy.loginWithUserAndPassword()
    cy.getEditor().should("be.visible")
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
    {
      failure: "JSON 503",
      reply: { statusCode: 503, body: { error: "temporarily_unavailable" } },
    },
    {
      failure: "JSON 429",
      reply: { statusCode: 429, body: { error: "rate_limited" } },
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
        "Could not refresh your SSO session. You may be signed out when your current session expires.",
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

  it("shows and allows keyboard dismissal of a refresh warning while the SQL gate fails", () => {
    signIn({
      idTokens: { authorization_code: idToken("initial", 20) },
      refreshReply: {
        statusCode: 503,
        body: { error: "temporarily_unavailable" },
      },
      authCheckReply: { statusCode: 502 },
    })
    cy.wait("@refreshFailure")
    cy.wait("@authCheck")
    cy.contains("QuestDB is not reachable [502]").should("be.visible")
    cy.getEditor().should("not.exist")
    cy.get("#sso-refresh-failed")
      .should("be.visible")
      .and("contain.text", "Could not refresh your SSO session.")
      .find(".Toastify__close-button")
      .focus()
      .should("be.focused")
      .and("have.css", "opacity", "1")
      .click()
    cy.get("#sso-refresh-failed").should("not.exist")
    cy.contains("button", "Retry connection").should("be.visible")
  })

  it("does not carry a session-ended query notification into password re-login", () => {
    cy.clock(Date.now(), ["Date"])
    signIn({
      idTokens: { authorization_code: idToken("initial", 3600) },
      refreshReply: { statusCode: 400, body: { error: "invalid_grant" } },
      credentials: { "auto.refresh.tables": "false" },
    })
    cy.getEditor().should("be.visible")
    cy.clearEditor()
    cy.typeQuery("select 42")
    cy.tick(3601000)
    // No SQL request is sent: refresh ends the session first, so runLine's
    // usual @exec wait would be incorrect here.
    cy.clickRunIconInLine(1)
    cy.getByDataHook("auth-login").should("be.visible")
    passwordRelogin()
    cy.getByDataHook("notifications-wrapper").should(
      "not.contain.text",
      "Your session has ended. Please sign in again.",
    )
    cy.get('[data-hook="expand-notifications"]').should("not.exist")
  })

  it("removes an already-visible loading notification before password re-login", () => {
    signIn({
      idTokens: { authorization_code: idToken("initial", 3600) },
      refreshReply: {
        delay: 2000,
        statusCode: 400,
        body: { error: "invalid_grant" },
      },
      credentials: { "auto.refresh.tables": "false" },
    })
    cy.getEditor().should("be.visible")
    cy.intercept(
      {
        method: "GET",
        url: `${baseUrl}/exec*`,
        query: { query: "select 42" },
      },
      { statusCode: 401, body: "Unauthorized" },
    ).as("rejectedQuery")
    cy.clearEditor()
    cy.typeQuery("select 42")
    cy.clickRunIconInLine(1)
    cy.wait("@rejectedQuery")
    cy.getByDataHook("loading-notification").should("be.visible")
    cy.getByDataHook("auth-login").should("be.visible")
    passwordRelogin()
    // Restore the original query's selection, not just the initial log view.
    cy.clickLine(1)
    cy.getByDataHook("loading-notification").should("not.exist")
    cy.get('[data-hook="expand-notifications"]').should("not.exist")
    cy.get("@rejectedQuery.all").should("have.length", 1)
  })

  it("stops a script on authentication loss even when continuing after errors", () => {
    const statements = []
    signIn({
      idTokens: { authorization_code: idToken("initial", 3600) },
      refreshReply: { statusCode: 400, body: { error: "invalid_grant" } },
      credentials: { "auto.refresh.tables": "false" },
    })
    cy.getEditor().should("be.visible")
    cy.intercept(
      {
        method: "GET",
        url: `${baseUrl}/exec*`,
        query: { query: /^select (111|222|333|444|555);?$/ },
      },
      (req) => {
        const query = new URL(req.url).searchParams.get("query")
        const value = Number(query.match(/\d+/)[0])
        statements.push(value)
        req.reply(
          value === 222
            ? { statusCode: 401, body: "Unauthorized" }
            : {
                body: {
                  query,
                  columns: [{ name: "value", type: "INT" }],
                  count: 1,
                  dataset: [[value]],
                },
              },
        )
      },
    )
    cy.clearEditor()
    cy.typeQuery("select 111;\nselect 222;\nselect 333;")
    cy.clickRunScript(true)
    cy.getByDataHook("auth-login").should("be.visible")
    cy.then(() => expect(statements).to.deep.equal([111, 222]))
    passwordRelogin()
    cy.getByDataHook("loading-notification").should("not.exist")
    cy.get('[data-hook="expand-notifications"]').should("not.exist")
    cy.getByDataHook("notifications-wrapper").should(
      "not.contain.text",
      "Running completed",
    )
    cy.clearEditor()
    cy.typeQuery("select 444;\nselect 555;")
    cy.clickRunScript()
    cy.getByDataHook("success-notification")
      .invoke("text")
      .should("match", /Running completed.*2 successful\s+queries/)
    cy.then(() => expect(statements).to.deep.equal([111, 222, 444, 555]))
  })

  it("starts telemetry only after the auth check and uses the refreshed SSO bearer", () => {
    const initial = idToken("initial", 20)
    const refreshed = idToken("refreshed", 3600)
    let authRequested = false
    let releaseAuth
    const telemetryHeaders = []
    signIn({
      idTokens: { authorization_code: initial, refresh_token: refreshed },
      credentials: { "auto.refresh.tables": "false" },
      authCheckReply: (req) => {
        authRequested = true
        return new Promise((resolve) => {
          releaseAuth = () => {
            req.reply({ body: queryResult })
            resolve()
          }
        })
      },
    })
    cy.intercept(
      {
        method: "GET",
        url: `${baseUrl}/exec*`,
        query: { query: /^telemetry_config limit -1$/i },
      },
      (req) => {
        telemetryHeaders.push(req.headers.authorization)
        req.reply({ body: { columns: [], count: 0, dataset: [] } })
      },
    ).as("telemetrySQL")
    cy.wrap(null).should(() => {
      expect(authRequested).to.equal(true)
      expect(telemetryHeaders).to.deep.equal([])
    })
    cy.getEditor().should("not.exist")
    cy.then(() => releaseAuth())
    cy.wait("@authCheck")
      .its("request.headers.authorization")
      .should("eq", `Bearer ${refreshed}`)
    cy.wait("@telemetrySQL")
      .its("request.headers.authorization")
      .should("eq", `Bearer ${refreshed}`)
    cy.getEditor().should("be.visible")
    cy.then(() =>
      expect(telemetryHeaders).to.deep.equal([`Bearer ${refreshed}`]),
    )
  })

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

describe("Auth - OIDC token without a lifetime", () => {
  const tokenUrl = "https://oauth.example.com/token"

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

  for (const expires_in of ["3600", 0, -1, null]) {
    it(`signs in with optional lifetime ${JSON.stringify(expires_in)} and null fields`, () => {
      cy.intercept("POST", tokenUrl, {
        body: {
          access_token: "mock-access-token",
          expires_in,
          refresh_token: null,
          id_token: null,
          token_type: null,
          error: null,
          error_description: null,
        },
      })
      visitCallback("?code=code-from-the-provider")
      cy.getEditor().should("be.visible")
    })
  }

  it("keeps readable recovery UI and keyboard focus while retrying the initial SQL check", () => {
    cy.intercept("POST", tokenUrl, { access_token: "mock-access-token" })
    let attempts = 0
    let completeRetry
    cy.intercept(
      { method: "GET", url: `${baseUrl}/exec*`, query: { query: "SELECT 1" } },
      (req) => {
        attempts++
        if (attempts === 1) {
          req.reply({ statusCode: 502 })
          return
        }
        return new Promise((resolve) => {
          completeRetry = () => {
            req.reply({ body: queryResult })
            resolve()
          }
        })
      },
    )
    visitCallback("?code=code-from-the-provider")
    cy.contains("QuestDB is not reachable [502]")
      .should("be.visible")
      .should(($error) => {
        const win = $error[0].ownerDocument.defaultView
        expect(win.getComputedStyle($error[0]).color).to.equal(
          win.getComputedStyle(win.document.body).color,
        )
      })
    cy.contains("button", "Retry connection").focus().click()
    cy.contains("button", "Retry connection")
      .should("be.focused")
      .and("have.attr", "aria-disabled", "true")
      .and("have.attr", "aria-busy", "true")
      .and("not.be.disabled")
      .click()
    cy.get('[role="status"]').should("contain.text", "Reconnecting…")
    cy.contains("QuestDB is not reachable [502]").should("be.visible")
    cy.getEditor().should("not.exist")
    cy.wrap(null).should(() => {
      expect(attempts).to.equal(2)
      expect(completeRetry).to.be.a("function")
    })
    cy.then(() => completeRetry())
    cy.getEditor().should("be.visible")
  })

  it("signs in, never refreshes the token, and signs out once the server rejects it", () => {
    // Given a provider that sends no expires_in, although it sends a refresh
    // token
    const grants = []
    cy.intercept({ method: "POST", url: tokenUrl }, (req) => {
      grants.push(new URLSearchParams(req.body).get("grant_type"))
      req.reply({
        access_token: "mock-access-token",
        refresh_token: "refresh-token",
        token_type: "Bearer",
      })
    })
    visitCallback("?code=code-from-the-provider")
    cy.wait("@settings")

    // Then the console signs in, and uses the token without refreshing it
    cy.getEditor().should("be.visible")
    cy.wrap(grants).should("deep.equal", ["authorization_code"])

    // When the server rejects the expired token
    cy.intercept(
      {
        method: "GET",
        url: `${baseUrl}/exec*`,
        query: { query: "select current_user()" },
      },
      { statusCode: 401, body: "Unauthorized" },
    ).as("rejected")
    cy.clearEditor()
    cy.typeQuery("select current_user()")
    cy.runLine()

    // Then the user signs in again, without a refresh or a retried query
    cy.getByDataHook("auth-login").should("be.visible")
    cy.get("@rejected.all").should("have.length", 1)
    cy.wrap(grants).should("deep.equal", ["authorization_code"])
  })
})
