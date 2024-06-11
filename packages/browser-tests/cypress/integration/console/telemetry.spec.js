/// <reference types="cypress" />

const baseUrl = "http://localhost:9999";

const toggleTelemetry = (enabled) => {
  // expected dataset format of the first row:
  // [id, enabled, version, os, package]
  cy.interceptQuery("telemetry_config", "telemetryConfig", (req) => {
    return req.continue((res) => {
      // enable telemetry to kick start the process on the client side
      res.body.dataset[0][1] = enabled;
      return res;
    });
  });
};

describe("telemetry config", () => {
  beforeEach(() => {
    cy.visit(baseUrl);
    toggleTelemetry(true);
  });

  it("should get telemetry config", () => {
    cy.wait("@telemetryConfig").then(({ response }) => {
      const columnNames = response.body.columns.map((c) => c.name);
      expect(response.statusCode).to.equal(200);
      ["id", "enabled", "version", "os", "package"].forEach((name) => {
        expect(columnNames).to.include(name);
      });
      expect(response.body.dataset[0][0]).to.be.string;
      expect(response.body.dataset[0][1]).to.satisfy(
        (v) => typeof v === "boolean"
      );
      expect(response.body.dataset[0][2]).to.be.string;
      expect(response.body.dataset[0][3]).to.be.string;
      expect(typeof response.body.dataset[0][4]).to.satisfy(
        (v) => v === null || typeof v === "string"
      );
    });
  });
});

describe("telemetry disabled", () => {
  beforeEach(() => {
    cy.visit(baseUrl);
    toggleTelemetry(false);
  });

  it("should not start telemetry when disabled", () => {
    cy.wait("@telemetryConfig").then(({ response }) => {
      cy.intercept("POST", "https://*.questdb.io/add").as("addTelemetry");
      cy.wait(5000);
      cy.get("@addTelemetry.all").should("have.length", 0);
    });
  });
});

describe("telemetry enabled", () => {
  beforeEach(() => {
    cy.visit(baseUrl);
    toggleTelemetry(true);
  });

  it("should start telemetry when enabled", () => {
    cy.wait("@telemetryConfig").then(({ response }) => {
      cy.intercept("POST", "https://*.questdb.io/add", (req) => {
        // Prevent the request from successfully pinging the telemetry lambda
        req.reply({ statusCode: 200 });
      }).as("addTelemetry");
      cy.wait("@addTelemetry").then(({ request }) => {
        const payload = JSON.parse(request.body);
        expect(payload.id).to.equal(response.body.dataset[0][0]);
        expect(payload.version).to.equal(response.body.dataset[0][2]);
        expect(payload.os).to.equal(response.body.dataset[0][3]);
        expect(payload.package).to.equal(response.body.dataset[0][4]);
      });
    });
  });
});
