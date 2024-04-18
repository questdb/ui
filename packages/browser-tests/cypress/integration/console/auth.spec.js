/// <reference types="cypress" />

const baseUrl = "http://localhost:9999";

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
      "acl.oidc.host": null,
      "acl.oidc.port": null,
      "acl.oidc.tls.enabled": null,
      "acl.oidc.authorization.endpoint": null,
      "acl.oidc.token.endpoint": null,
      "acl.oidc.pkce.required": null,
    });
    cy.visit(baseUrl);
  });

  it("should display UI auth", () => {
    cy.wait("@settings");
    cy.get('[data-hook="auth-login"]').should("be.visible");
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
      "acl.oidc.host": "host",
      "acl.oidc.port": 9999,
      "acl.oidc.tls.enabled": true,
      "acl.oidc.authorization.endpoint": "/auth",
      "acl.oidc.token.endpoint": "/token",
      "acl.oidc.pkce.required": true,
    });
    cy.visit(baseUrl);
  });

  it("should display UI auth with OIDC support", () => {
    cy.wait("@settings");
    cy.get('[data-hook="auth-login"]').should("be.visible");
    cy.get('[data-hook="button-sso-login"]').should("be.visible");
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
      "acl.oidc.host": null,
      "acl.oidc.port": null,
      "acl.oidc.tls.enabled": null,
      "acl.oidc.authorization.endpoint": null,
      "acl.oidc.token.endpoint": null,
      "acl.oidc.pkce.required": null,
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
      "acl.oidc.host": null,
      "acl.oidc.port": null,
      "acl.oidc.tls.enabled": null,
      "acl.oidc.authorization.endpoint": null,
      "acl.oidc.token.endpoint": null,
      "acl.oidc.pkce.required": null,
    });
    cy.visit(baseUrl);
  });

  it("should display the console", () => {
    cy.wait("@settings");
    cy.getEditor().should("be.visible");
  });
});
