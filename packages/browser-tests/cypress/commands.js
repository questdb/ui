require("@cypress/snapshot").register();

Cypress.Commands.add("getGrid", () =>
  cy.get(".qg-canvas").should("be.visible")
);

Cypress.Commands.add("getGridViewport", () => cy.get(".qg-viewport"));

Cypress.Commands.add("getGridRow", (n) => cy.get(".qg-r").eq(n));

Cypress.Commands.add("typeQuery", (query) =>
  cy.get(".monaco-editor").first().click().focused().type("{ctrl}a").type(query)
);

Cypress.Commands.add("runQuery", (query) => {
  cy.intercept("/exec*").as("exec");
  return cy.typeQuery(query).type("{ctrl}{enter}").wait("@exec");
});

Cypress.Commands.add("clearEditor", () => cy.typeQuery("{ctrl}a{backspace}"));

Cypress.Commands.add("selectQuery", (n) =>
  cy
    .contains("Example queries")
    .first()
    .click()
    .get('[class^="QueryPicker__Wrapper"] [class^="Row__Wrapper"]')
    .eq(n)
    .wait(50)
    .click()
);

Cypress.Commands.add("getEditor", () => cy.get(".monaco-editor textarea"));

Cypress.Commands.add("getAutocomplete", () =>
  cy.get('[widgetid="editor.widget.suggestWidget"]')
);

Cypress.Commands.add("getErrorMarker", () => cy.get(".squiggly-error"));

Cypress.Commands.add("F9", () =>
  cy.getEditor().trigger("keydown", {
    keyCode: 120,
  })
);

Cypress.Commands.add("getSelectedLines", () => cy.get(".selected-text"));
