require("@cypress/snapshot").register();

Cypress.Commands.add("getGrid", () =>
  cy.get(".qg-canvas").should("be.visible")
);

Cypress.Commands.add("getGridViewport", () => cy.get(".qg-viewport"));

Cypress.Commands.add("getGridRow", () => cy.get(".qg-r"));

Cypress.Commands.add("runQuery", (query) =>
  cy
    .get(".monaco-editor")
    .first()
    .click()
    .focused()
    .type("{ctrl}a")
    .type(`${query}{ctrl}{enter}`)
);
