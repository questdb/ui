const ctrlOrCmd = Cypress.platform === "darwin" ? "{cmd}" : "{ctrl}";

Cypress.Commands.add("getGrid", () =>
  cy.get(".qg-canvas").should("be.visible")
);

Cypress.Commands.add("getGridViewport", () => cy.get(".qg-viewport"));

Cypress.Commands.add("getGridRow", (n) =>
  cy.get(".qg-r").filter(":visible").eq(n)
);

Cypress.Commands.add("getGridRows", (n) => cy.get(".qg-r").filter(":visible"));

Cypress.Commands.add("typeQuery", (query) =>
  cy
    .get(".monaco-editor")
    .first()
    .click()
    .focused()
    .type(`${ctrlOrCmd}a`, { delay: 10 })
    .type(query, { delay: 10 })
);

Cypress.Commands.add("runQuery", (query) => {
  cy.intercept("/exec*").as("exec");
  return cy
    .typeQuery(query)
    .type(`${ctrlOrCmd}{enter}`, { delay: 10 })
    .wait("@exec");
});

Cypress.Commands.add("clearEditor", () =>
  cy.typeQuery(`${ctrlOrCmd}a{backspace}`, { delay: 5 })
);

Cypress.Commands.add("selectQuery", (n) =>
  cy
    .contains("Example queries")
    .first()
    .click()
    .get('[class^="QueryPicker__Wrapper"] [class^="Row__Wrapper"]')
    .eq(n)
    .click()
);

Cypress.Commands.add("getEditor", () => cy.get(".monaco-editor textarea"));

Cypress.Commands.add("getAutocomplete", () =>
  cy.get('[widgetid="editor.widget.suggestWidget"]')
);

Cypress.Commands.add("getErrorMarker", () => cy.get(".squiggly-error"));

const numberRangeRegexp = (n, width = 3) => {
  const [min, max] = [n - width, n + width];
  const numbers = Array.from(
    { length: Math.abs(max - min) },
    (_, i) => min + i
  );
  return `(${numbers.join("|")})`;
};

Cypress.Commands.add("matchErrorMarkerPosition", ({ left, width }) =>
  cy
    .getErrorMarker()
    .should("have.attr", "style")
    .and(
      "match",
      new RegExp(
        `left:${numberRangeRegexp(left)}px;width:${numberRangeRegexp(width)}px;`
      )
    )
);

Cypress.Commands.add("F9", () =>
  cy.getEditor().trigger("keydown", {
    keyCode: 120,
  })
);

Cypress.Commands.add("getSelectedLines", () => cy.get(".selected-text"));

Cypress.Commands.add("getNotifications", () => cy.get(".notifications"));
