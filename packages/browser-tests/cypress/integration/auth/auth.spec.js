/// <reference types="cypress" />

const contextPath = process.env.QDB_HTTP_CONTEXT_PATH || ""
const baseUrl = `http://localhost:9999${contextPath}`;

const interceptSettings = (payload) => {
  cy.intercept({ method: "GET", url: `${baseUrl}/settings` }, payload).as(
    "settings"
  );
};

describe("OSS", () => {
  before(() => {
    interceptSettings({
      "release.type": "OSS",
      "release.version": "1.2.3",
    });
    cy.visit(baseUrl);
  });

  it("should display the console", () => {
    cy.wait("@settings");
    cy.getEditor().should("be.visible");
  });
});

describe("Auth - UI", () => {
  before(() => {
    interceptSettings({
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
    });
    cy.visit(baseUrl);
  });

  it("should display UI auth", () => {
    cy.wait("@settings");
    cy.getByDataHook("auth-login").should("be.visible");
    cy.getEditor().should("not.exist");
  });
});


describe("Auth - OIDC", () => {
  before(() => {
    interceptSettings({
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
    });
    cy.visit(baseUrl);
  });

  it("should display UI auth with OIDC support", () => {
    cy.wait("@settings");
    cy.getByDataHook("auth-login").should("be.visible");
    cy.getByDataHook("button-sso-login").should("be.visible");
    cy.getEditor().should("not.exist");
  });
});

describe("Auth - Basic", () => {
  before(() => {
    interceptSettings({
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
    });
    cy.visit(baseUrl);
  });

  it("should display the console", () => {
    cy.wait("@settings");
    cy.getEditor().should("be.visible");
  });
});

describe("Auth - Disabled", () => {
  before(() => {
    interceptSettings({
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
    });
    cy.visit(baseUrl);
  });

  it("should display the console", () => {
    cy.wait("@settings");
    cy.getEditor().should("be.visible");
  });
});
