/// <reference types="cypress" />

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || "";
const baseUrl = `http://localhost:9999${contextPath}`;

describe("TopBar", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth();
  });

  it("should show the instance warning and no description", () => {
    cy.getByDataHook("topbar-instance-name").should(
      "have.text",
      "Instance name is not set"
    );
    cy.getByDataHook("topbar-instance-badge").should(
      "have.css",
      "background-color",
      "rgb(40, 42, 54)"
    );
  });

  it("should preview the color, show error when instance name is empty, and don't save changes on cancel", () => {
    cy.getByDataHook("topbar-instance-name").realHover();
    cy.getByDataHook("topbar-instance-edit-icon").should("be.visible");
    cy.getByDataHook("topbar-instance-edit-icon").click();
    cy.getByDataHook("topbar-instance-color-option-r").click();
    cy.getByDataHook("topbar-instance-badge").should(
      "have.css",
      "background-color",
      "rgb(199, 7, 45)"
    );
    cy.getByDataHook("topbar-instance-save-button").click();
    cy.contains("Instance name is required").should("be.visible");
    cy.getByDataHook("topbar-instance-cancel-button").click();
    cy.getByDataHook("topbar-instance-name").should(
      "have.text",
      "Instance name is not set"
    );
    cy.getByDataHook("topbar-instance-badge").should(
      "have.css",
      "background-color",
      "rgb(40, 42, 54)"
    );
  });

  it("should change the instance name, description, and type", () => {
    cy.getByDataHook("topbar-instance-badge").realHover();
    cy.getByDataHook("topbar-instance-edit-icon").should("be.visible");
    cy.getByDataHook("topbar-instance-edit-icon").click();
    cy.getByDataHook("topbar-instance-name-input").type("test-instance");
    cy.getByDataHook("topbar-instance-type-select").select("production");
    cy.getByDataHook("topbar-instance-description-input").type(
      "test description of the test instance"
    );
    cy.getByDataHook("topbar-instance-color-option-g").click();
    cy.getByDataHook("topbar-instance-save-button").click();
    cy.getByDataHook("topbar-instance-save-button").should("not.exist");
    cy.getByDataHook("topbar-instance-name").should("contain", "Production");
    cy.getByDataHook("topbar-instance-name").should("contain", "test-instance");
    cy.getByDataHook("topbar-instance-icon").realHover();
    cy.contains("test description of the test instance").should("be.visible");
    cy.contains(
      "You are connected to a QuestDB instance for production"
    ).should("be.visible");
  });
});

describe("Instance information access control", () => {
  it("should not allow editing instance information in OSS if the instance is readonly", () => {
    cy.intercept(
      {
        method: "GET",
        url: `${baseUrl}/settings`,
      },
      (req) => {
        req.reply((res) => {
          const originalConfig = res.body.config || {};
          res.body.config = Object.assign({}, originalConfig, {
            "http.settings.readonly": true,
          });
          return res;
        });
      }
    ).as("settings");
    cy.loadConsoleWithAuth();

    cy.wait("@settings");
    cy.getByDataHook("topbar-instance-badge").should("be.visible");
    cy.getByDataHook("topbar-instance-edit-icon").should("not.exist");
  });

  it("should show edit icon if the user has SETTINGS permission", () => {
    cy.loadConsoleWithAuth();
    cy.intercept(
      {
        method: "GET",
        url: `${baseUrl}/settings`,
      },
      (req) => {
        req.reply((res) => {
          const originalConfig = res.body.config || {};
          res.body.config = Object.assign({}, originalConfig, {
            "release.type": "EE",
          });
          return res;
        });
      }
    ).as("settings");
    cy.interceptQuery("SHOW PERMISSIONS admin", "showPermissions", {
      type: "dql",
      columns: [
        {
          name: "permission",
          type: "STRING",
        },
        {
          name: "table_name",
          type: "STRING",
        },
        {
          name: "column_name",
          type: "STRING",
        },
        {
          name: "grant_option",
          type: "BOOLEAN",
        },
        {
          name: "origin",
          type: "STRING",
        },
      ],
      dataset: [["SETTINGS", null, null, false, null]],
      count: 1,
    });
    cy.reload();
    cy.wait("@settings");
    cy.wait("@showPermissions");
    cy.getByDataHook("topbar-instance-badge").should("be.visible");
    cy.getByDataHook("topbar-instance-edit-icon").should("be.visible");
  });

  it("should not show edit icon if the user has no SETTINGS permission", () => {
    cy.loadConsoleWithAuth();
    cy.intercept(
      {
        method: "GET",
        url: `${baseUrl}/settings`,
      },
      (req) => {
        req.reply((res) => {
          const originalConfig = res.body.config || {};
          res.body.config = Object.assign({}, originalConfig, {
            "release.type": "EE",
          });
          return res;
        });
      }
    ).as("settings");
    cy.interceptQuery("SHOW PERMISSIONS admin", "showPermissions", {
      type: "dql",
      columns: [
        {
          name: "permission",
          type: "STRING",
        },
        {
          name: "table_name",
          type: "STRING",
        },
        {
          name: "column_name",
          type: "STRING",
        },
        {
          name: "grant_option",
          type: "BOOLEAN",
        },
        {
          name: "origin",
          type: "STRING",
        },
      ],
      dataset: [["HTTP", null, null, false, null]],
      count: 1,
    });
    cy.reload();
    cy.wait("@settings");
    cy.wait("@showPermissions");
    cy.getByDataHook("topbar-instance-badge").should("be.visible");
    cy.getByDataHook("topbar-instance-edit-icon").should("not.exist");
  });
});
