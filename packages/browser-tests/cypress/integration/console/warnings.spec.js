/// <reference types="cypress" />

const baseUrl = "http://localhost:9999";

const interceptWarnings = (payload) => {
  cy.intercept({ method: "GET", url: `${baseUrl}/warnings` }, payload).as(
    "warnings"
  );
};

const warningsMock = [
  {
    tag: "UNSUPPORTED FILE SYSTEM",
    warning:
      "Unsupported file system [dir=/var/folders/ds/mflhl4j12vvccsw9n4y2m_vw0000gn/T/junit595608896859548676/dbRoot, magic=0x6400]",
  },
  {
    tag: "TOO MANY OPEN FILES",
    warning: "fs.file-max limit is too low [current=1024, recommended=1048576]",
  },
  {
    tag: "OUT OF MMAP AREAS",
    warning:
      "vm.max_map_count limit is too low [current=1024, recommended=1048576]",
  },
];

describe("System configuration - no warnings", () => {
  before(() => {
    interceptWarnings([]);
    cy.visit(baseUrl);
  });

  it("should not display warnings if there aren't any in /warnings", () => {
    cy.wait("@warnings");
    cy.getByDataHook("warnings").should("not.exist");
  });
});

describe("System configuration - 3 warnings", () => {
  beforeEach(() => {
    interceptWarnings(warningsMock);
    cy.visit(baseUrl);
  });

  it("should show all three warnings in the UI", () => {
    cy.wait("@warnings");
    cy.getByDataHook("warnings").should("be.visible");
    cy.getByDataHook("warning").should("have.length", warningsMock.length);
    cy.getByDataHook("warning-text").should(
      "contain",
      "Unsupported file system"
    );
    cy.getByDataHook("warning-text").should(
      "contain",
      "fs.file-max limit is too low"
    );
    cy.getByDataHook("warning-text").should(
      "contain",
      "vm.max_map_count limit is too low"
    );
  });

  it("should clear out all the warnings", () => {
    cy.wait("@warnings");
    [0, 1, 2].forEach((idx) => {
      cy.getByDataHook("warning-close-button").eq(0).click();
    });
    cy.getByDataHook("warnings").should("not.exist");
  });
});
