/// <reference types="cypress" />

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl =
  Cypress.config("baseUrl") || `http://localhost:9999${contextPath}`
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
          "acl.oidc.state.required":
            Cypress.expose("oidcStateRequired") !== false,
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

    it(
      "renews and resends once when the server rejects the bearer of a cookie session",
      { expose: { oidcStateRequired: false } },
      () => {
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
          {
            method: "GET",
            url: `${baseUrl}/exec*`,
            query: { session: "true" },
          },
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
            req.reply(
              tokens(rejectedBearer, "refresh-token-of-rejected-bearer"),
            )
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
      },
    )

    it("should keep silent re-auth on refresh, suppress it after logout, and reset state across users", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`)
      interceptTokenRequest({
        access_token: "gslpJtzmmi6RwaPSx0dYGD4tEkom",
        id_token: "eyJhbGciOiJSUzI1NiIsImtpZCI6I",
        token_type: "Bearer",
        expires_in: 300,
      })

      // Step 1 — log in as OIDC user
      cy.getByDataHook("button-sso-login").click()
      cy.wait("@authorizationCode")
      cy.wait("@tokens").then(({ request }) =>
        expect(new URLSearchParams(request.body).get("grant_type")).to.equal(
          "authorization_code",
        ),
      )
      cy.getEditor().should("be.visible")
      cy.executeSQL("select current_user();")
      cy.getGridRow(0).should("contain", "john doe")
      // Wait for the toolbar to write the SSO username to localStorage,
      // otherwise the boot-time silent re-auth gate won't fire on reload.
      cy.window()
        .its("localStorage")
        .invoke("getItem", "sso.username.client1")
        .should("not.be.empty")

      // Step 2 — refresh: silent re-auth keeps the user signed in
      cy.reload()
      cy.wait("@authorizationCode").then(({ request }) =>
        expect(new URL(request.url).searchParams.get("prompt")).to.equal(
          "none",
        ),
      )
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
      cy.wait("@authorizationCode").then(({ request }) =>
        expect(new URL(request.url).searchParams.get("prompt")).to.equal(null),
      )
      cy.wait("@tokens")
      cy.getEditor().should("be.visible")

      cy.executeSQL("select * from long_sequence(100);")
      cy.getGridRows().should("have.length.greaterThan", 0)

      // Step 5 — logout, log in as admin: previous user's grid must be gone
      cy.logout()
      cy.loginWithUserAndPassword()
      cy.getEditor().should("be.visible")
      cy.get("[data-hook='grid-row']").should("not.exist")
      cy.executeSQL("select current_user();")
      cy.getGridRow(0).should("contain", "admin")
      cy.logout()
      cy.getByDataHook("auth-login").should("be.visible")
      cy.getByDataHook("button-sso-login").should(
        "contain",
        "Choose a different account",
      )
      // The admin password session must not overwrite the remembered SSO user
      cy.getByDataHook("button-sso-continue").should(
        "contain",
        "Continue as john doe",
      )
      cy.getByDataHook("button-sso-continue").click()
      cy.wait("@authorizationCode").then(({ request }) =>
        expect(new URL(request.url).searchParams.get("prompt")).to.equal(null),
      )
      cy.wait("@tokens")
      cy.getEditor().should("be.visible")
      cy.executeSQL("select current_user();")
      cy.getGridRow(0).should("contain", "john doe")
      cy.get("@tokens.all").each(({ request }) =>
        expect(new URLSearchParams(request.body).get("grant_type")).to.equal(
          "authorization_code",
        ),
      )
    })

    it("should preserve query and executeQuery params across OIDC redirect and show share-link confirmation dialog", () => {
      // Given
      const query =
        "DROP TABLE IF EXISTS share_link_oidc_a; DROP TABLE IF EXISTS share_link_oidc_b"
      const sharedExecutions = []
      cy.intercept("GET", "**/exec*", (request) => {
        const sql = new URL(request.url).searchParams.get("query")
        if (sql?.startsWith("DROP TABLE IF EXISTS share_link_oidc_")) {
          sharedExecutions.push(sql)
          request.alias = "sharedExecution"
        }
      })
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
      cy.then(() => expect(sharedExecutions).to.deep.equal([]))

      // When
      cy.getByDataHook("share-link-confirmation-confirm").click()
      cy.wait("@sharedExecution")
        .its("response.statusCode")
        .should("equal", 200)
      cy.wait("@sharedExecution")
        .its("response.statusCode")
        .should("equal", 200)
      cy.then(() => expect(sharedExecutions).to.deep.equal(query.split("; ")))

      // Then
      cy.getByDataHook("success-notification")
        .invoke("text")
        .should(
          "match",
          /Running completed in \d+ms with\s+2 successful\s+queries/,
        )

      cy.logout()
    })

    it("selects a group owner after SSO sign-in", () => {
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

      cy.get('input[type="file"]').selectFile("test/e2e/fixtures/test.csv", {
        force: true,
      })
      cy.getByDataHook("import-table-column-schema").should("be.visible")
      cy.getByDataHook("import-table-column-owner").should("be.visible")
      cy.getByDataHook("import-table-owner-select").click()
      cy.contains('[role="menuitemradio"]', "group1").should("exist")
      cy.contains('[role="menuitemradio"]', "john doe").should("not.exist")
      cy.contains('[role="menuitemradio"]', "group1").click()
      cy.getByDataHook("import-table-owner-select").should("contain", "group1")
    })
  })
})
