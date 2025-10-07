/// <reference types="cypress" />

const toggleTelemetry = (enabled) => {
  // expected dataset format of the first row:
  // [id, enabled, version, os, package, instance_name, instance_type, instance_desc]
  cy.interceptQuery("telemetry_config LIMIT -1", "telemetryConfig", (req) => {
    return req.reply({
      query: "telemetry_config LIMIT -1",
      columns: [
        { name: "id", type: "LONG256" },
        { name: "enabled", type: "BOOLEAN" },
        { name: "version", type: "SYMBOL" },
        { name: "os", type: "SYMBOL" },
        { name: "package", type: "SYMBOL" },
        { name: "instance_name", type: "SYMBOL" },
        { name: "instance_type", type: "SYMBOL" },
        { name: "instance_desc", type: "SYMBOL" },
      ],
      dataset: [
        [
          "mock-id-123",
          enabled,
          "1.0.0",
          "mock-os",
          "mock-package",
          "mock-instance",
          "mock-type",
          "mock-desc",
        ],
      ],
      count: 1,
    });
  });

  if (enabled) {
    cy.intercept(
      {
        method: "POST",
        url: "**/config",
        hostname: /(alurin|fara)\.questdb\.io/,
      },
      (req) => {
        req.reply({
          lastUpdated: null,
        });
      }
    ).as("telemetryRemoteConfig");
  }
};

describe("telemetry disabled", () => {
  beforeEach(() => {
    toggleTelemetry(false);
    cy.loadConsoleWithAuth();
  });

  it("should not start telemetry when disabled", () => {
    cy.wait("@telemetryConfig").then(({ response }) => {
      cy.intercept("@addTelemetry").then((interception) => {
        expect(interception).to.be.null;
      });
    });
  });
});

describe("telemetry enabled", () => {
  beforeEach(() => {
    toggleTelemetry(true);
    cy.loadConsoleWithAuth();
  });

  it("should start telemetry when enabled", () => {
    cy.wait("@telemetryConfig").then(({ response }) => {
      cy.wait("@telemetryRemoteConfig");
      cy.wait("@addTelemetry").then(({ request }) => {
        const payload = request.body;
        expect(payload.id).to.equal(response.body.dataset[0][0]);
        expect(payload.version).to.equal(response.body.dataset[0][2]);
        expect(payload.os).to.equal(response.body.dataset[0][3]);
        expect(payload.package).to.equal(response.body.dataset[0][4]);
      });
    });
  });
});
