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

const interceptAuthorizationCodeRequest = (redirectUrl) => {
  cy.intercept("GET", `${oidcAuthorizationCodeUrl}?**`, (req) => {
    req.redirect(redirectUrl);
  }).as('authorizationCode');
};

const interceptTokenRequest = (payload) => {
  cy.intercept({ method: "POST", url: oidcTokenUrl }, payload).as(
    "tokens"
  );
};

describe("OIDC authentication", () => {
  before(() => {
    // setup SSO group mappings
    cy.loadConsoleAsAdminAndCreateSSOGroup("group1");
  });

  beforeEach(() => {
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
    cy.getByDataHook("button-sso-login").should("be.visible");
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

  it("should force authentication if token expired, and there is no refresh token", () => {
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
    cy.getByDataHook("button-log-in").should("be.visible");

    cy.getByDataHook("button-log-in").click()
    cy.getEditor().should("be.visible");
  });
});
