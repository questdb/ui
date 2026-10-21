/// <reference types="cypress" />

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl = `http://localhost:9999${contextPath}`
const settingsUrl = `${baseUrl}/settings`

const oidcProviderUrl = "http://localhost:9032"
const oidcAuthorizationCodeUrl = `${oidcProviderUrl}/authorization`
const oidcTokenUrl = `${oidcProviderUrl}/token`

const interceptSettings = (payload) => {
  cy.intercept({ method: "GET", url: settingsUrl }, payload).as("settings")
}

const interceptAuthorizationCodeRequest = (redirectUrl, stateError) => {
  cy.intercept("GET", `${oidcAuthorizationCodeUrl}?**`, (req) => {
    const url = new URL(req.url)
    const state = url.searchParams.get("state")

    req.redirect(redirectUrl + (state && !stateError ? `&state=${state}` : ""))
  }).as("authorizationCode")
}

const interceptTokenRequest = (payload) => {
  cy.intercept({ method: "POST", url: oidcTokenUrl }, payload).as("tokens")
}

describe("OIDC", () => {
  before(() => {
    // setup SSO group mappings
    cy.loadConsoleAsAdminAndCreateSSOGroup("group1")
  })

  describe("OIDC authentication", () => {
    beforeEach(() => {
      cy.clearLocalStorage()

      // load login page
      interceptSettings({
        config: {
          "release.type": "EE",
          "release.version": "1.2.3",
          "acl.enabled": true,
          "acl.basic.auth.realm.enabled": false,
          "acl.oidc.enabled": true,
          "acl.oidc.client.id": "client1",
          "acl.oidc.authorization.endpoint": oidcAuthorizationCodeUrl,
          "acl.oidc.token.endpoint": oidcTokenUrl,
          "acl.oidc.pkce.required": true,
          "acl.oidc.state.required": false,
          "acl.oidc.groups.encoded.in.token": false,
        },
      })
      cy.visit(baseUrl)

      cy.wait("@settings")
      cy.getByDataHook("auth-login").should("be.visible")
      cy.getByDataHook("button-sso-continue").should("not.exist")
      cy.getByDataHook("button-sso-login").should("be.visible")
      cy.getByDataHook("button-sso-login").contains("Single Sign-On (SSO)")
      cy.getEditor().should("not.exist")
    })

    it("refreshes an immediately expired zero-lifetime OIDC token before SQL", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`)
      interceptTokenRequest({
        access_token: "gslpJtzmmi6RwaPSx0dYGD4tEkom",
        refresh_token: "FUuAAqMp6LSTKmkUd5uZuodhiE4Kr6M7Eyv",
        id_token: "eyJhbGciOiJSUzI1NiIsImtpZCI6I",
        token_type: "Bearer",
        expires_in: 0,
      })
      cy.getByDataHook("button-sso-login").click()
      cy.wait("@authorizationCode")
      cy.wait("@tokens").then(({ request }) => {
        expect(new URLSearchParams(request.body).get("grant_type")).to.eq(
          "authorization_code",
        )
      })
      cy.wait("@tokens").then(({ request }) => {
        expect(new URLSearchParams(request.body).get("grant_type")).to.eq(
          "refresh_token",
        )
      })
      cy.getEditor().should("be.visible")

      cy.executeSQL("select current_user();")
      cy.getGridRow(0).should("contain", "john doe")

      cy.logout()
      cy.getByDataHook("auth-login").should("be.visible")
    })

    it("accepts an IdP's string expiry with null optional fields", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`)
      interceptTokenRequest({
        access_token: "gslpJtzmmi6RwaPSx0dYGD4tEkom", // gitleaks:allow
        refresh_token: null,
        id_token: null,
        token_type: "Bearer",
        expires_in: "300",
      })
      cy.getByDataHook("button-sso-login").click()
      cy.wait("@authorizationCode")
      cy.getEditor().should("be.visible")
      cy.executeSQL("select current_user();")
      cy.getGridRow(0).should("contain", "john doe")
    })

    it("uses the SSO token instead of retained REST credentials", () => {
      cy.window().then(({ localStorage }) => {
        localStorage.setItem("rest.token", "expired-rest-token")
        localStorage.setItem("basic.auth.header", "Basic expired")
      })
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`)
      interceptTokenRequest({
        access_token: "gslpJtzmmi6RwaPSx0dYGD4tEkom", // gitleaks:allow
        refresh_token: "FUuAAqMp6LSTKmkUd5uZuodhiE4Kr6M7Eyv", // gitleaks:allow
        id_token: "eyJhbGciOiJSUzI1NiIsImtpZCI6I", // gitleaks:allow
        token_type: "Bearer",
        expires_in: 300,
      })

      cy.getByDataHook("button-sso-login").click()
      cy.wait("@authorizationCode")
      cy.getEditor().should("be.visible")
      cy.executeSQL("select current_user();")
      cy.getGridRow(0).should("contain", "john doe")
      cy.window().then(({ localStorage, sessionStorage }) => {
        expect(localStorage.getItem("rest.token")).to.eq("expired-rest-token")
        expect(localStorage.getItem("basic.auth.header")).to.eq("Basic expired")
        expect(sessionStorage.getItem("auth.login.method")).to.eq("sso")
      })
    })

    for (const { name, reply } of [
      { name: "a network error", reply: { forceNetworkError: true } },
      {
        name: "a non-JSON 502",
        reply: { statusCode: 502, body: "<html>Bad Gateway</html>" },
      },
    ]) {
      it(`continues loading the editor when token refresh fails with ${name}`, () => {
        interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`)
        cy.intercept("POST", oidcTokenUrl, (req) => {
          if (
            new URLSearchParams(req.body).get("grant_type") === "refresh_token"
          ) {
            req.alias = "refreshFailure"
            req.reply(reply)
          } else {
            req.reply({
              access_token: "gslpJtzmmi6RwaPSx0dYGD4tEkom", // gitleaks:allow
              refresh_token: "FUuAAqMp6LSTKmkUd5uZuodhiE4Kr6M7Eyv", // gitleaks:allow
              id_token: "eyJhbGciOiJSUzI1NiIsImtpZCI6I", // gitleaks:allow
              token_type: "Bearer",
              expires_in: 20,
            })
          }
        }).as("tokens")

        cy.getByDataHook("button-sso-login").click()
        cy.wait("@authorizationCode")
        cy.wait("@refreshFailure")
        cy.getEditor().should("be.visible")
        cy.executeSQL("select current_user();")
        cy.getGridRow(0).should("contain", "john doe")
      })
    }

    it("keeps the session after a refresh network failure and a later SQL 401, then recovers", () => {
      // Freeze Date only: keep the bearer valid during refresh backoff while
      // real timers continue driving requests and notification transitions.
      cy.clock(Date.now(), ["Date"])
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`)
      cy.intercept("POST", oidcTokenUrl, (req) => {
        if (
          new URLSearchParams(req.body).get("grant_type") === "refresh_token"
        ) {
          req.alias = "refreshFailure"
          req.reply({ forceNetworkError: true })
        } else {
          req.reply({
            access_token: "gslpJtzmmi6RwaPSx0dYGD4tEkom", // gitleaks:allow
            refresh_token: "FUuAAqMp6LSTKmkUd5uZuodhiE4Kr6M7Eyv", // gitleaks:allow
            id_token: "eyJhbGciOiJSUzI1NiIsImtpZCI6I", // gitleaks:allow
            token_type: "Bearer",
            expires_in: 20,
          })
        }
      })

      cy.getByDataHook("button-sso-login").click()
      cy.wait("@authorizationCode")
      cy.wait("@refreshFailure")
      cy.getEditor().should("be.visible")
      cy.window()
        .its("localStorage")
        .invoke("getItem", "sso.username.client1")
        .should("not.be.empty")

      cy.intercept(
        {
          method: "GET",
          url: "**/exec?*",
          query: { query: "select current_user()" },
          times: 1,
        },
        { statusCode: 401, body: "Unauthorized" },
      ).as("rejectedBearerQuery")
      cy.clearEditor()
      cy.typeQuery("select current_user()")
      cy.runLine()
      cy.wait("@rejectedBearerQuery")
      cy.contains("the request was not executed").should("be.visible")
      cy.getEditor().should("be.visible")
      cy.getByDataHook("auth-login").should("not.exist")
      cy.get("#sso-refresh-failed").should("be.visible")
      cy.window()
        .its("localStorage")
        .invoke("getItem", "sso.session.active")
        .should("eq", "true")

      // The EE userinfo fixture recognizes this access token. Renew its
      // lifetime and rotate the refresh token, then execute against real EE.
      cy.intercept("POST", oidcTokenUrl, {
        access_token: "gslpJtzmmi6RwaPSx0dYGD4tEkom", // gitleaks:allow
        refresh_token: "rotated-refresh-token",
        id_token: "eyJhbGciOiJSUzI1NiIsImtpZCI6I", // gitleaks:allow
        token_type: "Bearer",
        expires_in: 3600,
      }).as("refreshRecovery")
      cy.intercept({
        method: "GET",
        url: "**/exec?*",
        query: { query: "select current_user()" },
      }).as("recoveredQuery")
      cy.tick(5000)
      cy.runLine()
      cy.wait("@refreshRecovery")
      cy.wait("@recoveredQuery")
        .its("request.headers.authorization")
        .should("eq", "Bearer gslpJtzmmi6RwaPSx0dYGD4tEkom") // gitleaks:allow
      cy.getGridRow(0).should("contain", "john doe")
      cy.get("#sso-refresh-failed").should("not.exist")
      cy.getByDataHook("auth-login").should("not.exist")

      // The next renewal must consume the refresh token from the recovery
      // response, while keeping the bearer recognized by the EE fixture.
      cy.intercept("POST", oidcTokenUrl, (req) => {
        const body = new URLSearchParams(req.body)
        expect(body.get("grant_type")).to.eq("refresh_token")
        expect(body.get("refresh_token")).to.eq("rotated-refresh-token")
        req.reply({
          access_token: "gslpJtzmmi6RwaPSx0dYGD4tEkom", // gitleaks:allow
          refresh_token: "next-refresh-token",
          id_token: "eyJhbGciOiJSUzI1NiIsImtpZCI6I", // gitleaks:allow
          token_type: "Bearer",
          expires_in: 3600,
        })
      }).as("rotatedRefresh")
      cy.tick(3600000)
      cy.runLine()
      cy.wait("@rotatedRefresh")
      cy.wait("@recoveredQuery")
        .its("request.headers.authorization")
        .should("eq", "Bearer gslpJtzmmi6RwaPSx0dYGD4tEkom") // gitleaks:allow
      cy.getGridRow(0).should("contain", "john doe")
      cy.getByDataHook("auth-login").should("not.exist")
    })

    it("renews and resends once when the server rejects the bearer of a cookie session", () => {
      // No /exec request is stubbed: the EE server answers them all. Its
      // userinfo fixture accepts acceptedBearer and rejects rejectedBearer.
      const acceptedBearer = "gslpJtzmmi6RwaPSx0dYGD4tEkom" // gitleaks:allow
      const rejectedBearer = "access-token-unknown-to-userinfo" // gitleaks:allow
      const grants = []
      const sessionStarts = []
      const authChecks = []
      const recordTo = (requests) => (req) => {
        const request = {
          authorization: req.headers.authorization,
          cookie: req.headers.cookie ?? "",
          session: req.query.session,
        }
        requests.push(request)
        req.continue((res) => {
          request.statusCode = res.statusCode
          request.setCookie = String(res.headers["set-cookie"] ?? "")
        })
      }
      const outcomes = (requests) =>
        requests.map(
          ({ authorization, statusCode }) =>
            `${authorization} -> ${statusCode}`,
        )
      cy.intercept(
        { method: "GET", url: `${baseUrl}/exec*`, query: { session: "true" } },
        recordTo(sessionStarts),
      ).as("sessionStart")
      cy.intercept(
        {
          method: "GET",
          url: `${baseUrl}/exec*`,
          query: { query: /^SELECT 1$/ },
        },
        recordTo(authChecks),
      )
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`)
      cy.intercept("POST", oidcTokenUrl, (req) => {
        const body = new URLSearchParams(req.body)
        const grant = {
          type: body.get("grant_type"),
          refreshToken: body.get("refresh_token"),
        }
        grants.push(grant)
        const tokens = (accessToken, refreshToken) => ({
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: "Bearer",
          expires_in: 3600,
        })
        const codeExchanges = grants.filter(
          ({ type }) => type === "authorization_code",
        ).length
        if (grant.type === "refresh_token") {
          req.reply(tokens(acceptedBearer, "refresh-token-after-recovery"))
        } else if (codeExchanges === 1) {
          req.reply(tokens(acceptedBearer, "refresh-token-of-first-sign-in"))
        } else {
          req.reply(tokens(rejectedBearer, "refresh-token-of-rejected-bearer"))
        }
      })

      // Signing in with the accepted bearer opens a qdb_session cookie session.
      cy.getByDataHook("button-sso-login").click()
      cy.wait("@authorizationCode")
      cy.wait("@sessionStart").then(({ response }) => {
        expect(response.statusCode).to.eq(200)
        expect(String(response.headers["set-cookie"])).to.contain(
          "qdb_session=",
        )
      })
      cy.getEditor().should("be.visible")
      // The silent re-auth on reload needs the username the toolbar stores.
      cy.window()
        .its("localStorage")
        .invoke("getItem", "sso.username.client1")
        .should("not.be.empty")

      // Silent re-auth installs a bearer the server rejects, while the browser
      // still sends the cookie of the session opened above.
      cy.reload()
      cy.wait("@authorizationCode")
      cy.getEditor().should("be.visible")
      cy.getByDataHook("auth-login").should("not.exist")

      // questdb#7799: the server no longer serves a rejected bearer from the
      // cookie. Before it, this session start was answered with 200.
      cy.wrap(sessionStarts).should((requests) => {
        expect(outcomes(requests)).to.deep.equal([
          `Bearer ${acceptedBearer} -> 200`,
          `Bearer ${rejectedBearer} -> 401`,
        ])
        expect(requests[1].cookie).to.contain("qdb_session=")
      })
      // A 401 executed no SQL: the console renews the token once and resends
      // its startup check once, with the renewed bearer.
      cy.wrap(authChecks).should((requests) => {
        expect(outcomes(requests)).to.deep.equal([
          `Bearer ${acceptedBearer} -> 200`,
          `Bearer ${rejectedBearer} -> 401`,
          `Bearer ${acceptedBearer} -> 200`,
        ])
      })
      // The 401 also deleted the qdb_session cookie, which downloads use. The
      // resent check asks for a new session, so exports keep working.
      cy.wrap(authChecks).should((requests) => {
        expect(requests[2].session).to.eq("true")
        expect(requests[2].setCookie).to.contain("qdb_session=")
      })
      // Like a download, this request authenticates with the cookie alone.
      cy.request({
        url: `${baseUrl}/exp?query=${encodeURIComponent("select 1")}`,
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 200)
      cy.executeSQL("select current_user();")
      cy.getGridRow(0).should("contain", "john doe")
      cy.getByDataHook("auth-login").should("not.exist")
      cy.wrap(grants).should("deep.equal", [
        { type: "authorization_code", refreshToken: null },
        { type: "authorization_code", refreshToken: null },
        {
          type: "refresh_token",
          refreshToken: "refresh-token-of-rejected-bearer",
        },
      ])
    })

    it("shows the expired-session error when refresh is authoritatively rejected", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`)
      cy.intercept("POST", oidcTokenUrl, (req) => {
        if (
          new URLSearchParams(req.body).get("grant_type") === "refresh_token"
        ) {
          req.alias = "refreshRejected"
          req.reply({ statusCode: 400, body: { error: "invalid_grant" } })
        } else {
          req.reply({
            access_token: "gslpJtzmmi6RwaPSx0dYGD4tEkom", // gitleaks:allow
            refresh_token: "FUuAAqMp6LSTKmkUd5uZuodhiE4Kr6M7Eyv", // gitleaks:allow
            id_token: "eyJhbGciOiJSUzI1NiIsImtpZCI6I", // gitleaks:allow
            token_type: "Bearer",
            expires_in: 300,
          })
        }
      })
      cy.getByDataHook("button-sso-login").click()
      cy.wait("@authorizationCode")
      cy.getEditor().should("be.visible")
      cy.window()
        .its("localStorage")
        .invoke("getItem", "sso.username.client1")
        .should("not.be.empty")

      // The first SQL 401 triggers refresh while the token is locally valid.
      // The invalid_grant, not that old bearer's rejection, ends the session.
      cy.intercept(
        {
          method: "GET",
          url: "**/exec?*",
          query: { query: "select current_user()" },
        },
        { statusCode: 401, body: "Unauthorized" },
      ).as("rejectedBearerQuery")
      cy.clearEditor()
      cy.typeQuery("select current_user()")
      cy.runLine()
      cy.wait("@rejectedBearerQuery")
      cy.wait("@refreshRejected")
      cy.getByDataHook("auth-login").should("be.visible")
      cy.contains("Your SSO session has expired")
        .closest("[data-hook='sign-in-error']")
        .should("be.focused")
      cy.contains(
        "Could not renew your SSO session. Please sign in again.",
      ).should("be.visible")
      cy.getByDataHook("button-sso-continue").should("be.visible")
    })

    it("should request a new token on page reload, even if there is no refresh token", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`)
      interceptTokenRequest({
        access_token: "gslpJtzmmi6RwaPSx0dYGD4tEkom",
        id_token: "eyJhbGciOiJSUzI1NiIsImtpZCI6I",
        token_type: "Bearer",
        expires_in: 300,
      })
      cy.getByDataHook("button-sso-login").click()
      cy.wait("@authorizationCode")

      cy.wait("@tokens")
      cy.getEditor().should("be.visible")
      cy.window()
        .its("localStorage")
        .invoke("getItem", "sso.username.client1")
        .should("not.be.empty")

      cy.reload()
      cy.getEditor().should("be.visible")
    })

    it("should not force SSO re-authentication with 'Continue as <username>' button", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`)
      interceptTokenRequest({
        access_token: "gslpJtzmmi6RwaPSx0dYGD4tEkom",
        refresh_token: "FUuAAqMp6LSTKmkUd5uZuodhiE4Kr6M7Eyv",
        id_token: "eyJhbGciOiJSUzI1NiIsImtpZCI6I",
        token_type: "Bearer",
        expires_in: 300,
      })
      cy.getByDataHook("button-sso-login").click()
      cy.wait("@authorizationCode")

      cy.wait("@tokens")
      cy.getEditor().should("be.visible")

      cy.executeSQL("select current_user();")
      cy.getGridRow(0).should("contain", "john doe")

      cy.logout()
      cy.getByDataHook("button-sso-continue").should("be.visible")
      cy.getByDataHook("button-sso-login").should("be.visible")
      cy.getByDataHook("button-sso-login").contains(
        "Choose a different account",
      )

      cy.getByDataHook("button-sso-continue").click()
      cy.wait("@authorizationCode").then((interception) => {
        expect(interception.request.url).to.include("/authorization")
        const url = new URL(interception.request.url)
        expect(url.searchParams.get("prompt")).to.equal(null)
      })
    })

    it("should force SSO re-authentication with 'Choose a different account' button", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`)
      interceptTokenRequest({
        access_token: "gslpJtzmmi6RwaPSx0dYGD4tEkom",
        refresh_token: "FUuAAqMp6LSTKmkUd5uZuodhiE4Kr6M7Eyv",
        id_token: "eyJhbGciOiJSUzI1NiIsImtpZCI6I",
        token_type: "Bearer",
        expires_in: 300,
      })
      cy.getByDataHook("button-sso-login").click()
      cy.wait("@authorizationCode")

      cy.wait("@tokens")
      cy.getEditor().should("be.visible")

      cy.executeSQL("select current_user();")
      cy.getGridRow(0).should("contain", "john doe")

      cy.logout()
      cy.getByDataHook("button-sso-continue").should("be.visible")
      cy.getByDataHook("button-sso-login").should("be.visible")
      cy.getByDataHook("button-sso-login").contains(
        "Choose a different account",
      )

      cy.getByDataHook("button-sso-login").click()
      cy.wait("@authorizationCode").then((interception) => {
        expect(interception.request.url).to.include("/authorization")
        const url = new URL(interception.request.url)
        expect(url.searchParams.get("prompt")).to.equal("login")
      })
    })

    it("should keep silent re-auth on refresh, suppress it after logout, and reset state across users", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`)
      interceptTokenRequest({
        access_token: "gslpJtzmmi6RwaPSx0dYGD4tEkom",
        refresh_token: "FUuAAqMp6LSTKmkUd5uZuodhiE4Kr6M7Eyv",
        id_token: "eyJhbGciOiJSUzI1NiIsImtpZCI6I",
        token_type: "Bearer",
        expires_in: 300,
      })

      // Step 1 — log in as OIDC user
      cy.getByDataHook("button-sso-login").click()
      cy.wait("@authorizationCode")
      cy.wait("@tokens")
      cy.getEditor().should("be.visible")
      // Wait for the toolbar to write the SSO username to localStorage,
      // otherwise the boot-time silent re-auth gate won't fire on reload.
      cy.window()
        .its("localStorage")
        .invoke("getItem", "sso.username.client1")
        .should("not.be.empty")

      // Step 2 — refresh: silent re-auth keeps the user signed in
      cy.reload()
      cy.wait("@authorizationCode")
      cy.wait("@tokens")
      cy.getEditor().should("be.visible")

      // Step 3 — logout lands on login screen; refreshing must NOT silently log back in
      cy.logout()
      cy.getByDataHook("button-sso-continue").should("be.visible")
      cy.getEditor().should("not.exist")

      cy.reload()
      cy.getByDataHook("auth-login").should("be.visible")
      cy.getByDataHook("button-sso-continue").should("be.visible")
      cy.getEditor().should("not.exist")

      // Step 4 — log back in via "Continue as ...", run a query, see results
      cy.getByDataHook("button-sso-continue").click()
      cy.wait("@authorizationCode")
      cy.wait("@tokens")
      cy.getEditor().should("be.visible")

      cy.executeSQL("select * from long_sequence(100);")
      cy.getGridRows().should("have.length.greaterThan", 0)

      // Step 5 — logout, log in as admin: previous user's grid must be gone
      cy.logout()
      cy.loginWithUserAndPassword()
      cy.getEditor().should("be.visible")
      cy.get("[data-hook='grid-row']").should("not.exist")
    })

    it("should preserve query and executeQuery params across OIDC redirect and show share-link confirmation dialog", () => {
      // Given
      const query =
        "DROP TABLE IF EXISTS share_link_oidc_a; DROP TABLE IF EXISTS share_link_oidc_b"
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`)
      interceptTokenRequest({
        access_token: "gslpJtzmmi6RwaPSx0dYGD4tEkom",
        refresh_token: "FUuAAqMp6LSTKmkUd5uZuodhiE4Kr6M7Eyv",
        id_token: "eyJhbGciOiJSUzI1NiIsImtpZCI6I",
        token_type: "Bearer",
        expires_in: 300,
      })

      // When
      cy.visit(
        `${baseUrl}?query=${encodeURIComponent(query)}&executeQuery=true`,
      )
      cy.getByDataHook("auth-login").should("be.visible")
      cy.getByDataHook("button-sso-login").click()
      cy.wait("@authorizationCode")
      cy.wait("@tokens")

      // Then
      cy.getEditor().should("be.visible")
      cy.getByDataHook("share-link-confirmation-dialog").should("be.visible")

      // When
      cy.getByDataHook("share-link-confirmation-confirm").click()

      // Then
      cy.getByDataHook("success-notification")
        .invoke("text")
        .should(
          "match",
          /Running completed in \d+ms with\s+2 successful\s+queries/,
        )

      cy.logout()
    })

    it("display import panel", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`)
      interceptTokenRequest({
        access_token: "gslpJtzmmi6RwaPSx0dYGD4tEkom",
        refresh_token: "FUuAAqMp6LSTKmkUd5uZuodhiE4Kr6M7Eyv",
        id_token: "eyJhbGciOiJSUzI1NiIsImtpZCI6I",
        token_type: "Bearer",
        expires_in: 300,
      })
      cy.getByDataHook("button-sso-login").click()
      cy.wait("@authorizationCode")

      cy.wait("@tokens")
      cy.getEditor().should("be.visible")

      cy.getByDataHook("import-panel-button").click()
      cy.getByDataHook("import-dropbox").should("be.visible")
      cy.getByDataHook("import-browse-from-disk").should("be.visible")

      cy.get('input[type="file"]').selectFile("e2e/fixtures/test.csv", {
        force: true,
      })
      cy.getByDataHook("import-table-column-schema").should("be.visible")
      cy.getByDataHook("import-table-column-owner").should("be.visible")
      cy.getByDataHook("import-table-owner-select").click()
      cy.contains('[role="menuitemradio"]', "group1").should("exist")
      cy.contains('[role="menuitemradio"]', "john doe").should("not.exist")
    })
  })

  describe("OIDC authentication - with state", () => {
    beforeEach(() => {
      cy.clearLocalStorage()

      // load login page
      interceptSettings({
        config: {
          "release.type": "EE",
          "release.version": "1.2.3",
          "acl.enabled": true,
          "acl.basic.auth.realm.enabled": false,
          "acl.oidc.enabled": true,
          "acl.oidc.client.id": "client1",
          "acl.oidc.authorization.endpoint": oidcAuthorizationCodeUrl,
          "acl.oidc.token.endpoint": oidcTokenUrl,
          "acl.oidc.pkce.required": true,
          "acl.oidc.state.required": true,
          "acl.oidc.groups.encoded.in.token": false,
        },
      })
      cy.visit(baseUrl)

      cy.wait("@settings")
      cy.getByDataHook("auth-login").should("be.visible")
      cy.getByDataHook("button-sso-continue").should("not.exist")
      cy.getByDataHook("button-sso-login").should("be.visible")
      cy.getByDataHook("button-sso-login").contains("Single Sign-On (SSO)")
      cy.getEditor().should("not.exist")
    })

    it("should login via OIDC with state required", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`)
      interceptTokenRequest({
        access_token: "gslpJtzmmi6RwaPSx0dYGD4tEkom",
        refresh_token: "FUuAAqMp6LSTKmkUd5uZuodhiE4Kr6M7Eyv",
        id_token: "eyJhbGciOiJSUzI1NiIsImtpZCI6I",
        token_type: "Bearer",
        expires_in: 300,
      })
      cy.getByDataHook("button-sso-login").click()
      cy.wait("@authorizationCode")

      cy.wait("@tokens")
      cy.getEditor().should("be.visible")

      cy.executeSQL("select current_user();")
      cy.getGridRow(0).should("contain", "john doe")

      cy.logout()
      cy.getByDataHook("auth-login").should("be.visible")
      cy.getByDataHook("button-sso-continue").should("be.visible")
      cy.getByDataHook("button-sso-login").should("be.visible")
      cy.getByDataHook("button-sso-login").contains(
        "Choose a different account",
      )
      cy.getEditor().should("not.exist")
    })

    it("should login via OIDC, then admin, then OIDC again without re-authenticating if the OAuth2 provider session is still alive", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`)
      interceptTokenRequest({
        access_token: "gslpJtzmmi6RwaPSx0dYGD4tEkom",
        refresh_token: "FUuAAqMp6LSTKmkUd5uZuodhiE4Kr6M7Eyv",
        id_token: "eyJhbGciOiJSUzI1NiIsImtpZCI6I",
        token_type: "Bearer",
        expires_in: 300,
      })
      cy.getByDataHook("button-sso-login").click()
      cy.wait("@authorizationCode")

      cy.wait("@tokens")
      cy.getEditor().should("be.visible")

      cy.executeSQL("select current_user();")
      cy.getGridRow(0).should("contain", "john doe")

      cy.logout()
      cy.getByDataHook("auth-login").should("be.visible")
      cy.getByDataHook("button-sso-continue").should("be.visible")
      cy.getByDataHook("button-sso-login").should("be.visible")
      cy.getByDataHook("button-sso-login").contains(
        "Choose a different account",
      )
      cy.getEditor().should("not.exist")

      cy.loginWithUserAndPassword()

      cy.executeSQL("select current_user();")
      cy.getGridRow(0).should("contain", "admin")

      cy.logout()
      cy.getByDataHook("auth-login").should("be.visible")
      cy.getByDataHook("button-sso-continue").should("be.visible")
      cy.getByDataHook("button-sso-continue").contains("Continue as john doe")
      cy.getByDataHook("button-sso-login").should("be.visible")
      cy.getByDataHook("button-sso-login").contains(
        "Choose a different account",
      )
      cy.getEditor().should("not.exist")

      cy.getByDataHook("button-sso-continue").click()
      cy.getEditor().should("be.visible")

      cy.executeSQL("select current_user();")
      cy.getGridRow(0).should("contain", "john doe")
    })

    it("should force SSO re-authentication with state error", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`, true)
      cy.getByDataHook("button-sso-login").click()
      cy.wait("@authorizationCode")

      cy.getByDataHook("auth-login").should("be.visible")
      cy.getByDataHook("button-sso-continue").should("not.exist")
      cy.getByDataHook("button-sso-login").should("be.visible")
      cy.getByDataHook("button-sso-login").contains("Single Sign-On (SSO)")
      cy.getEditor().should("not.exist")

      cy.getByDataHook("button-sso-login").click()
      cy.wait("@authorizationCode").then((interception) => {
        expect(interception.request.url).to.include("/authorization")
        const url = new URL(interception.request.url)
        expect(url.searchParams.get("prompt")).to.equal("login")
      })
    })
  })
})
