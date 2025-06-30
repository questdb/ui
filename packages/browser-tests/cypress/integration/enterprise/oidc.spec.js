/// <reference types="cypress" />

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl = `http://localhost:9999${contextPath}`;
const settingsUrl = `${baseUrl}/settings`;

const oidcProviderUrl = "http://localhost:9032";
const oidcAuthorizationCodeUrl = `${oidcProviderUrl}/authorization`;
const oidcTokenUrl = `${oidcProviderUrl}/token`;

const interceptSettings = (payload) => {
  cy.intercept({ method: "GET", url: settingsUrl }, payload).as(
    "settings"
  );
};

const interceptAuthorizationCodeRequest = (redirectUrl, stateError) => {
  cy.intercept("GET", `${oidcAuthorizationCodeUrl}?**`, (req) => {
    const url = new URL(req.url);
    const state = url.searchParams.get('state');

    req.redirect(redirectUrl + (state && !stateError ? `&state=${state}` : ""));
  }).as('authorizationCode');
};

const interceptTokenRequest = (payload) => {
  cy.intercept({ method: "POST", url: oidcTokenUrl }, payload).as(
    "tokens"
  );
};

describe("OIDC", () => {
  before(() => {
    // setup SSO group mappings
    cy.loadConsoleAsAdminAndCreateSSOGroup("group1");
  });
  
  describe("OIDC authentication", () => {
    beforeEach(() => {
      cy.clearLocalStorage();
  
      // load login page
      interceptSettings({
        "config": {
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
        }
      });
      cy.visit(baseUrl);

      cy.wait("@settings");
      cy.getByDataHook("auth-login").should("be.visible");
      cy.getByDataHook("button-sso-continue").should("not.exist");
      cy.getByDataHook("button-sso-login").should("be.visible");
      cy.getByDataHook("button-sso-login").contains("Continue with SSO");
      cy.getEditor().should("not.exist");
    });

    it("should login via OIDC", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`);
      cy.getByDataHook("button-sso-login").click();
      cy.wait("@authorizationCode");

      interceptTokenRequest({
        "access_token": "gslpJtzmmi6RwaPSx0dYGD4tEkom",
        "refresh_token": "FUuAAqMp6LSTKmkUd5uZuodhiE4Kr6M7Eyv",
        "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6I",
        "token_type": "Bearer",
        "expires_in": 300
      });
      cy.wait("@tokens");
      cy.getEditor().should("be.visible");

      cy.executeSQL("select current_user();");
      cy.getGridRow(0).should("contain", "user1");

      cy.logout();
    });

    it("should request a new token on page reload, even if there is no refresh token", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`);
      cy.getByDataHook("button-sso-login").click();
      cy.wait("@authorizationCode");

      interceptTokenRequest({
        "access_token": "gslpJtzmmi6RwaPSx0dYGD4tEkom",
        "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6I",
        "token_type": "Bearer",
        "expires_in": 0
      });
      cy.wait("@tokens");
      cy.getEditor().should("be.visible");

      cy.reload();
      cy.getEditor().should("be.visible");
    });

    it("should not force SSO re-authentication with 'Continue as <username>' button", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`);
      cy.getByDataHook("button-sso-login").click();
      cy.wait("@authorizationCode");

      interceptTokenRequest({
        "access_token": "gslpJtzmmi6RwaPSx0dYGD4tEkom",
        "refresh_token": "FUuAAqMp6LSTKmkUd5uZuodhiE4Kr6M7Eyv",
        "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6I",
        "token_type": "Bearer",
        "expires_in": 300
      });
      cy.wait("@tokens");
      cy.getEditor().should("be.visible");

      cy.executeSQL("select current_user();");
      cy.getGridRow(0).should("contain", "user1");

      cy.logout();
      cy.getByDataHook("button-sso-continue").should("be.visible");
      cy.getByDataHook("button-sso-login").should("be.visible");
      cy.getByDataHook("button-sso-login").contains("Choose a different account");

      cy.getByDataHook("button-sso-continue").click();
      cy.wait("@authorizationCode").then((interception) => {
        expect(interception.request.url).to.include("/authorization");
        const url = new URL(interception.request.url);
        expect(url.searchParams.get("prompt")).to.equal(null);
      });
    });

    it("should force SSO re-authentication with 'Choose a different account' button", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`);
      cy.getByDataHook("button-sso-login").click();
      cy.wait("@authorizationCode");

      interceptTokenRequest({
        "access_token": "gslpJtzmmi6RwaPSx0dYGD4tEkom",
        "refresh_token": "FUuAAqMp6LSTKmkUd5uZuodhiE4Kr6M7Eyv",
        "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6I",
        "token_type": "Bearer",
        "expires_in": 300
      });
      cy.wait("@tokens");
      cy.getEditor().should("be.visible");

      cy.executeSQL("select current_user();");
      cy.getGridRow(0).should("contain", "user1");

      cy.logout();
      cy.getByDataHook("button-sso-continue").should("be.visible");
      cy.getByDataHook("button-sso-login").should("be.visible");
      cy.getByDataHook("button-sso-login").contains("Choose a different account");

      cy.getByDataHook("button-sso-login").click();
      cy.wait("@authorizationCode").then((interception) => {
        expect(interception.request.url).to.include("/authorization");
        const url = new URL(interception.request.url);
        expect(url.searchParams.get("prompt")).to.equal("login");
      });
    });

    it("display import panel", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`);
      cy.getByDataHook("button-sso-login").click();
      cy.wait("@authorizationCode");

      interceptTokenRequest({
        "access_token": "gslpJtzmmi6RwaPSx0dYGD4tEkom",
        "refresh_token": "FUuAAqMp6LSTKmkUd5uZuodhiE4Kr6M7Eyv",
        "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6I",
        "token_type": "Bearer",
        "expires_in": 300
      });
      cy.wait("@tokens");
      cy.getEditor().should("be.visible");

      cy.getByDataHook("import-panel-button").click();
      cy.getByDataHook("import-dropbox").should("be.visible");
      cy.getByDataHook("import-browse-from-disk").should("be.visible");

      cy.get('input[type="file"]').selectFile("cypress/fixtures/test.csv", { force: true });
      cy.getByDataHook("import-table-column-schema").should("be.visible");
      cy.getByDataHook("import-table-column-owner").should("be.visible");
      cy.contains("option", "user1").should("not.exist");
      cy.contains("option", "group1").should("exist");
    });
  });

  describe("OIDC authentication - with state", () => {
    beforeEach(() => {
      cy.clearLocalStorage();

      // load login page
      interceptSettings({
        "config": {
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
        }
      });
      cy.visit(baseUrl);

      cy.wait("@settings");
      cy.getByDataHook("auth-login").should("be.visible");
      cy.getByDataHook("button-sso-continue").should("not.exist");
      cy.getByDataHook("button-sso-login").should("be.visible");
      cy.getByDataHook("button-sso-login").contains("Continue with SSO");
      cy.getEditor().should("not.exist");
    });

    it("should login via OIDC with state required", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`);
      cy.getByDataHook("button-sso-login").click();
      cy.wait("@authorizationCode");

      interceptTokenRequest({
        "access_token": "gslpJtzmmi6RwaPSx0dYGD4tEkom",
        "refresh_token": "FUuAAqMp6LSTKmkUd5uZuodhiE4Kr6M7Eyv",
        "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6I",
        "token_type": "Bearer",
        "expires_in": 300
      });
      cy.wait("@tokens");
      cy.getEditor().should("be.visible");

      cy.executeSQL("select current_user();");
      cy.getGridRow(0).should("contain", "user1");

      cy.logout();
      cy.getByDataHook("auth-login").should("be.visible");
      cy.getByDataHook("button-sso-continue").should("be.visible");
      cy.getByDataHook("button-sso-login").should("be.visible");
      cy.getByDataHook("button-sso-login").contains("Choose a different account");
      cy.getEditor().should("not.exist");
    });

    it("should login via OIDC, then admin, then OIDC again without re-authenticating if the OAuth2 provider session is still alive", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`);
      cy.getByDataHook("button-sso-login").click();
      cy.wait("@authorizationCode");

      interceptTokenRequest({
        "access_token": "gslpJtzmmi6RwaPSx0dYGD4tEkom",
        "refresh_token": "FUuAAqMp6LSTKmkUd5uZuodhiE4Kr6M7Eyv",
        "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6I",
        "token_type": "Bearer",
        "expires_in": 300
      });
      cy.wait("@tokens");
      cy.getEditor().should("be.visible");

      cy.executeSQL("select current_user();");
      cy.getGridRow(0).should("contain", "user1");

      cy.logout();
      cy.getByDataHook("auth-login").should("be.visible");
      cy.getByDataHook("button-sso-continue").should("be.visible");
      cy.getByDataHook("button-sso-login").should("be.visible");
      cy.getByDataHook("button-sso-login").contains("Choose a different account");
      cy.getEditor().should("not.exist");

      cy.loginWithUserAndPassword();

      cy.executeSQL("select current_user();");
      cy.getGridRow(0).should("contain", "admin");

      cy.logout();
      cy.getByDataHook("auth-login").should("be.visible");
      cy.getByDataHook("button-sso-continue").should("be.visible");
      cy.getByDataHook("button-sso-continue").contains("Continue as user1");
      cy.getByDataHook("button-sso-login").should("be.visible");
      cy.getByDataHook("button-sso-login").contains("Choose a different account");
      cy.getEditor().should("not.exist");

      cy.getByDataHook("button-sso-continue").click();
      cy.getEditor().should("be.visible");

      cy.executeSQL("select current_user();");
      cy.getGridRow(0).should("contain", "user1");
    });

    it("should force SSO re-authentication with state error", () => {
      interceptAuthorizationCodeRequest(`${baseUrl}?code=abcdefgh`, true);
      cy.getByDataHook("button-sso-login").click();
      cy.wait("@authorizationCode");

      cy.getByDataHook("auth-login").should("be.visible");
      cy.getByDataHook("button-sso-continue").should("not.exist");
      cy.getByDataHook("button-sso-login").should("be.visible");
      cy.getByDataHook("button-sso-login").contains("Continue with SSO");
      cy.getEditor().should("not.exist");

      cy.getByDataHook("button-sso-login").click();
      cy.wait("@authorizationCode").then((interception) => {
        expect(interception.request.url).to.include("/authorization");
        const url = new URL(interception.request.url);
        expect(url.searchParams.get("prompt")).to.equal("login");
      });
    });
  });
});
