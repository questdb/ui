/// <reference types="cypress" />

const { ctrlOrCmd, seedNotebookOnboarding } = require("../utils")

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl =
  Cypress.config("baseUrl") || `http://localhost:9999${contextPath}`

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
      win.sessionStorage.clear()
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
      cy.window().then((win) => {
        expect(win.localStorage.getItem(STORE_KEY.oauthState)).to.be.null
      })
      cy.location("search").should("eq", "")
      cy.reload()
      expectNoTokenExchange()
    })

    it("exchanges a code that matches the flow this browser started", () => {
      const expectBearer = (req) => {
        expect(req.headers.authorization).to.eq("Bearer mock-access-token")
        req.reply({ body: queryResult })
      }
      cy.intercept(
        { method: "GET", url: `${baseUrl}/exec*`, query: { session: "true" } },
        expectBearer,
      ).as("sessionStart")
      cy.intercept(
        {
          method: "GET",
          url: `${baseUrl}/exec*`,
          query: { query: "SELECT 1" },
        },
        expectBearer,
      ).as("authCheck")
      cy.intercept(
        {
          method: "GET",
          url: `${baseUrl}/exec*`,
          query: { query: "select current_user()" },
        },
        expectBearer,
      ).as("statement")
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
      cy.wait("@sessionStart")
      cy.wait("@authCheck")
      cy.getEditor().should("be.visible")
      cy.typeQueryDirectly("select current_user()")
      cy.runLine()
      cy.wait("@statement")
      cy.getByDataHook("grid-cell").first().should("contain.text", "2")
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
        win.sessionStorage.clear()
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
    cy.getByDataHook("sign-in-error")
      .should("be.focused")
      .should(($error) => {
        const style = $error[0].ownerDocument.defaultView.getComputedStyle(
          $error[0],
        )
        expect(style.outlineStyle).not.to.equal("none")
        expect(parseFloat(style.outlineWidth)).to.be.greaterThan(0)
      })

    // Then the URL gets back the console's own params instead of the code
    cy.location("search").should("eq", `?${returnParams}`)

    // When the page is reloaded
    cy.reload()

    // Then the console shows the login page without exchanging the code again
    cy.getByDataHook("auth-login").should("be.visible")
    cy.contains("Code not valid").should("not.exist")
    cy.get("@tokenExchange.all").should("have.length", 1)
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
        if (typeof refreshReply === "function") return refreshReply(req)
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

  it("keeps the session after a refresh JSON 503 and a later SQL 401, then recovers", () => {
    // Freeze only Date so the SQL rejection occurs during refresh backoff;
    // real timers still drive requests and notification transitions.
    cy.clock(Date.now(), ["Date"])
    const initial = idToken("initial", 20)
    signIn({
      idTokens: { authorization_code: initial },
      refreshReply: {
        statusCode: 503,
        body: { error: "temporarily_unavailable" },
      },
    })
    cy.wait("@refreshFailure")
    cy.wait("@authCheck")
      .its("request.headers.authorization")
      .should("eq", `Bearer ${initial}`)
    cy.getEditor().should("be.visible")
    cy.contains(
      "Could not renew your SSO session. Your current token expires at",
      { matchCase: false },
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
    ).as("expiredBearerQuery")
    cy.typeQueryDirectly("select current_user()")
    cy.runLine()
    cy.wait("@expiredBearerQuery")
    cy.contains("the request was not executed").should("be.visible")
    cy.getEditor().should("be.visible")
    cy.getByDataHook("auth-login").should("not.exist")
    cy.get("#sso-refresh-failed").should("be.visible")
    cy.window()
      .its("localStorage")
      .invoke("getItem", "sso.session.active")
      .should("eq", "true")

    const renewed = idToken("renewed", 3600)
    cy.intercept("POST", tokenUrl, {
      body: {
        access_token: "renewed-access-token",
        id_token: renewed,
        refresh_token: "rotated-refresh-token",
        token_type: "Bearer",
        expires_in: 3600,
      },
    }).as("refreshRecovery")
    cy.intercept(
      {
        method: "GET",
        url: `${baseUrl}/exec*`,
        query: { query: "select current_user()" },
      },
      { statusCode: 200, body: queryResult },
    ).as("recoveredQuery")
    cy.tick(5000)
    cy.runLine()
    cy.wait("@refreshRecovery")
    cy.wait("@recoveredQuery")
      .its("request.headers.authorization")
      .should("eq", `Bearer ${renewed}`)
    cy.getByDataHook("grid-cell").first().should("contain.text", "2")
    cy.get("#sso-refresh-failed").should("not.exist")
    cy.getByDataHook("auth-login").should("not.exist")

    // Exercise the installed rotated credential through the next real
    // AuthProvider -> QuestProvider -> token POST, not just its storage.
    const renewedAgain = idToken("renewed-again", 7200)
    cy.intercept("POST", tokenUrl, (req) => {
      const body = new URLSearchParams(req.body)
      expect(body.get("grant_type")).to.eq("refresh_token")
      expect(body.get("refresh_token")).to.eq("rotated-refresh-token")
      req.reply({
        access_token: "renewed-again-access-token",
        id_token: renewedAgain,
        refresh_token: "next-refresh-token",
        token_type: "Bearer",
        expires_in: 3600,
      })
    }).as("rotatedRefresh")
    cy.clock().then((clock) => clock.setSystemTime(Date.now() + 3600000))
    cy.runLine()
    cy.wait("@rotatedRefresh")
    cy.wait("@recoveredQuery")
      .its("request.headers.authorization")
      .should("eq", `Bearer ${renewedAgain}`)
    cy.getByDataHook("grid-cell").first().should("contain.text", "2")
    cy.getByDataHook("auth-login").should("not.exist")
  })

  it("renews and resends an editor statement exactly once after the server rejects its bearer", () => {
    // The server rejects a bearer the console still considers valid (revoked,
    // or the browser clock is behind). A 401 executed no SQL, so the console
    // renews and resends the statement once, without signing out.
    const initial = idToken("initial", 3600)
    const renewed = idToken("renewed", 3600)
    signIn({
      idTokens: { authorization_code: initial, refresh_token: renewed },
      credentials: { "auto.refresh.tables": "false" },
    })
    cy.wait("@authCheck")
    cy.getEditor().should("be.visible")
    const sentWith = []
    cy.intercept(
      {
        method: "GET",
        url: `${baseUrl}/exec*`,
        query: { query: "select current_user()" },
      },
      (req) => {
        sentWith.push(req.headers.authorization)
        req.reply(
          req.headers.authorization === `Bearer ${initial}`
            ? { statusCode: 401, body: "Unauthorized" }
            : { statusCode: 200, body: queryResult },
        )
      },
    ).as("statement")
    cy.typeQueryDirectly("select current_user()")
    cy.runLine()
    cy.wait("@statement")
    cy.wait("@statement")
    cy.getByDataHook("success-notification").should("be.visible")
    cy.getByDataHook("grid-cell").first().should("contain.text", "2")
    cy.getByDataHook("auth-login").should("not.exist")
    cy.wrap(sentWith).should("deep.equal", [
      `Bearer ${initial}`,
      `Bearer ${renewed}`,
    ])
  })

  it("clears the remembered identity before the redirect guard forces sign-in", () => {
    // Given: five rejected redirects and a remembered identity.
    // Unknown expiry prevents token renewal from replacing the SQL 401.
    signIn({
      idTokens: { authorization_code: "opaque-id-token" },
      accessTokenLifetime: null,
      credentials: {
        "sso.username.test-client": "previous-user",
        "oauth.redirect.count": "5",
      },
      authCheckReply: { statusCode: 401, body: "Unauthorized" },
    })

    // When: reject before successful startup queries can reset the guard.
    cy.wait("@authCheck").its("response.statusCode").should("eq", 401)

    // Then: the guard clears the identity before Login renders.
    cy.getByDataHook("auth-login").should("be.visible")
    cy.getByDataHook("button-sso-continue").should("not.exist")
    cy.getByDataHook("button-sso-login").should(
      "contain.text",
      "Single Sign-On (SSO)",
    )
    cy.window()
      .its("localStorage")
      .invoke("getItem", "sso.username.test-client")
      .should("be.null")
    cy.intercept("GET", "https://oauth.example.com/auth*", (req) => {
      req.redirect(`${baseUrl}?error=access_denied`)
    }).as("forcedSignIn")
    cy.getByDataHook("button-sso-login").click()
    cy.wait("@forcedSignIn").then(({ request }) => {
      expect(new URL(request.url).searchParams.get("prompt")).to.eq("login")
    })
    cy.getByDataHook("auth-login").should("be.visible")
  })

  describe("an editor script when the session ends", () => {
    const statements = ["select 1001", "select 1002", "select 1003"]

    // Statement 1 gets the given reply, the others would succeed.
    const interceptStatements = (firstStatement) => {
      statements.forEach((statement, index) => {
        cy.intercept(
          {
            method: "GET",
            url: `${baseUrl}/exec*`,
            query: { query: new RegExp(`^${statement}$`) },
          },
          index === 0 ? firstStatement : { statusCode: 200, body: queryResult },
        ).as(`statement${index + 1}`)
      })
    }

    const runScriptDespiteFailures = () => {
      cy.typeQueryDirectly(
        statements.map((statement) => `${statement};`).join("\n"),
      )
      cy.typeQuery(`${ctrlOrCmd}{shift}{enter}`)
      cy.getByRoleAttribute("dialog").should("contain", "Run all queries")
      // Then only the end of the session can stop the script after statement 1
      cy.getByDataHook("stop-after-failure-checkbox").uncheck()
      cy.getByDataHook("run-all-queries-confirm").click()
    }

    // Signing in with a password does not leave the page, so the console
    // still shows what the previous session left in the query log.
    const signInWithPassword = () => {
      cy.intercept(
        {
          method: "GET",
          url: `${baseUrl}/exec*`,
          query: { session: "true", query: /alter user .* create token/ },
        },
        {
          statusCode: 200,
          body: {
            query: "alter user",
            columns: [
              { name: "username", type: "STRING" },
              { name: "token", type: "STRING" },
            ],
            dataset: [["admin", "password-rest-token"]],
            count: 1,
          },
        },
      ).as("passwordSignIn")
      cy.get('form[name="login"] input[name="username"]').type("admin")
      cy.get('form[name="login"] input[name="password"]').type("quest{enter}")
      cy.wait("@passwordSignIn")
      cy.getEditor().should("be.visible")
    }

    const expectStoppedAfterStatement1 = (statement1Outcome) => {
      cy.get("@statement2.all").should("have.length", 0)
      cy.get("@statement3.all").should("have.length", 0)
      cy.expandNotifications()
      cy.getExpandedNotifications()
        .should("contain", statement1Outcome)
        .invoke("text")
        .should("match", /Stopped after running\s+1 failed\s+query/)
    }

    it("stops before the next statement when signing in again, and says the interrupted one may have executed", () => {
      // Freeze only Date, so the token stays valid while renewal fails.
      cy.clock(Date.now(), ["Date"])
      signIn({
        idTokens: { authorization_code: idToken("initial", 20) },
        refreshReply: {
          statusCode: 503,
          body: { error: "temporarily_unavailable" },
        },
        credentials: { "auto.refresh.tables": "false" },
      })
      cy.wait("@refreshFailure")
      cy.getEditor().should("be.visible")
      cy.get("#sso-refresh-failed").should("be.visible")
      // Statement 1 reaches the server, which does not answer it yet
      let releaseStatement
      interceptStatements((req) => {
        return new Promise((resolve) => {
          releaseStatement = () => {
            req.reply({ statusCode: 200, body: queryResult })
            resolve()
          }
        })
      })
      runScriptDespiteFailures()
      cy.wrap(null).should(() => expect(releaseStatement).to.be.a("function"))

      cy.on("window:confirm", (text) => {
        expect(text).to.contain("statements may already have executed")
        return true
      })
      cy.contains("#sso-refresh-failed button", "Sign in again").click()
      cy.getByDataHook("auth-login").should("be.visible")
      cy.getByDataHook("sign-in-error")
        .should("contain.text", "Your previous session has ended.")
        .and("contain.text", "statements may have executed")
      cy.then(() => releaseStatement())

      signInWithPassword()
      expectStoppedAfterStatement1(
        "Interrupted when your previous session ended. The query may have executed; verify its outcome before running it again.",
      )
    })

    it("stops before the next statement when the server signs the session out, and says the rejected one was not run", () => {
      // Unknown expiry: the console signs out on 401 instead of renewing.
      signIn({
        idTokens: { authorization_code: "opaque-id-token" },
        accessTokenLifetime: null,
        credentials: { "auto.refresh.tables": "false" },
      })
      cy.getEditor().should("be.visible")
      interceptStatements({ statusCode: 401, body: "Unauthorized" })
      runScriptDespiteFailures()
      cy.wait("@statement1")
      cy.getByDataHook("auth-login").should("be.visible")

      signInWithPassword()
      expectStoppedAfterStatement1(
        "Not executed: your previous session ended without running this query.",
      )
    })
  })

  it("shows Login when a pending refresh fails after Settings recovery replaces the providers", () => {
    let releaseRefresh
    let failSettings = false
    cy.clock(Date.now(), ["Date"])
    const grants = signIn({
      idTokens: { authorization_code: idToken("initial", 3600) },
      refreshReply: (req) =>
        new Promise((resolve) => {
          releaseRefresh = () => {
            req.reply({
              statusCode: 400,
              body: { error: "invalid_grant", error_description: "Revoked" },
            })
            resolve()
          }
        }),
      credentials: { "auto.refresh.tables": "true" },
    })
    cy.getEditor().should("be.visible")
    cy.get("@settings").then(({ response }) => {
      cy.intercept({ method: "GET", url: `${baseUrl}/settings` }, (req) => {
        req.reply(
          failSettings
            ? { statusCode: 503, body: "Unavailable" }
            : { body: response.body },
        )
      })
    })
    cy.typeQueryDirectly("select 42")
    cy.tick(3575000)
    cy.clickRunIconInLine(1)
    cy.wrap(null).should(() => expect(releaseRefresh).to.be.a("function"))
    cy.window().then((win) => {
      failSettings = true
      win.dispatchEvent(new win.Event("focus"))
    })
    cy.contains("button", "Retry")
      .should("be.visible")
      .then(() => {
        failSettings = false
      })
      .click()
    cy.contains("button", "Retry").should("not.exist")
    cy.then(() => {
      expect(
        grants.filter((grant) => grant === "refresh_token"),
      ).to.have.length(1)
      releaseRefresh()
    })
    cy.getByDataHook("auth-login").should("be.visible")
    cy.getByDataHook("sign-in-error")
      .should("be.focused")
      .and("contain.text", "Your SSO session has expired")
      .and("contain.text", "Revoked. Please sign in again.")
    cy.getEditor().should("not.exist")
  })
})
