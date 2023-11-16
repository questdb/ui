const {
  addMatchImageSnapshotCommand,
} = require("@simonsmith/cypress-image-snapshot/command");

addMatchImageSnapshotCommand({
  failureThreshold: 0.3,
  blackout: [".notifications", 'button[class*="BuildVersion"'],
});

const ctrlOrCmd = Cypress.platform === "darwin" ? "{cmd}" : "{ctrl}";

before(() => {
  Cypress.on("uncaught:exception", (err) => {
    // this error can be safely ignored
    if (err.message.includes("ResizeObserver loop")) {
      return false;
    }
  });

  indexedDB.deleteDatabase("web-console");
});

beforeEach(() => {
  cy.intercept(
    {
      method: "GET",
      url: "/**",
      hostname: "api.github.com",
    },
    (req) => {
      req.reply("{}");
    }
  );
});

Cypress.Commands.add("getGrid", () =>
  cy.get(".qg-viewport .qg-canvas").should("be.visible")
);

Cypress.Commands.add("getGridViewport", () => cy.get(".qg-viewport"));

Cypress.Commands.add("getGridRow", (n) =>
  cy.get(".qg-r").filter(":visible").eq(n)
);

Cypress.Commands.add("getGridRows", () => cy.get(".qg-r").filter(":visible"));

Cypress.Commands.add("typeQuery", (query) =>
  cy.getEditor().click({ force: true }).type(query)
);

Cypress.Commands.add("runLine", () => {
  cy.intercept("/exec*").as("exec");
  return cy.typeQuery(`${ctrlOrCmd}{enter}`).wait("@exec");
});

Cypress.Commands.add("clickRun", () => {
  cy.intercept("/exec*").as("exec");
  return cy.get("button").contains("Run").click().wait("@exec");
});

Cypress.Commands.add("clearEditor", () =>
  cy.typeQuery(`${ctrlOrCmd}a{backspace}`)
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

Cypress.Commands.add("getEditor", () => cy.get(".monaco-editor[role='code'] "));

Cypress.Commands.add("getEditorContent", () =>
  cy.get(".monaco-editor textarea")
);

Cypress.Commands.add("getAutocomplete", () =>
  cy.get('[widgetid="editor.widget.suggestWidget"]')
);

Cypress.Commands.add("getErrorMarker", () => cy.get(".squiggly-error"));

Cypress.Commands.add("getCursorQueryDecoration", () =>
  cy.get(".cursorQueryDecoration")
);

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

Cypress.Commands.add("F9", () => {
  cy.intercept("/exec*").as("exec");
  return cy
    .getEditor()
    .trigger("keydown", {
      keyCode: 120,
    })
    .wait("@exec")
    .wait(501);
});

Cypress.Commands.add("getSelectedLines", () => cy.get(".selected-text"));

Cypress.Commands.add("getVisibleLines", () => cy.get(".view-lines"));

Cypress.Commands.add("getCollapsedNotifications", () =>
  cy.get('[data-hook="notifications-collapsed"]')
);

Cypress.Commands.add("getExpandedNotifications", () =>
  cy.get('[data-hook="notifications-expanded"]')
);
