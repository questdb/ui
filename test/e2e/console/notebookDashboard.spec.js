/// <reference types="cypress" />

const SOURCE = '[data-cell-id="desk-picker"]'
const DEPENDENT = '[data-cell-id="selected-desk"]'

describe("notebook dashboard", () => {
  it("shows the latest stat selection when a dependent query is already fetching", () => {
    let releaseParis
    cy.intercept("GET", "**/exec?*", (request) => {
      const query = new URL(request.url).searchParams.get("query") ?? ""
      if (
        query.includes("concat('Active desk: '") &&
        query.includes("@desk := 'Paris'")
      ) {
        request.continue(
          () =>
            new Promise((resolve) => {
              releaseParis = resolve
            }),
        )
      }
    })
    cy.loadConsoleWithAuth(
      false,
      {},
      {
        buffers: [
          {
            label: "Desk dashboard",
            notebookViewState: {
              focusedCellId: "desk-picker",
              settings: { variables: [{ name: "desk", value: "'London'" }] },
              cells: [
                {
                  id: "desk-picker",
                  position: 0,
                  value:
                    "select 'London' as desk, 1 as volume union all select 'Paris', 2 union all select 'Tokyo', 3",
                  mode: "draw",
                  paneView: "editor_result",
                  chartConfig: {
                    xColumn: null,
                    queries: [null],
                    visual: { type: "stat" },
                  },
                  interactions: { click: { variable: "desk" } },
                },
                {
                  id: "selected-desk",
                  position: 1,
                  value:
                    "select concat('Active desk: ', @desk) as desk, 1 as volume",
                  mode: "draw",
                  paneView: "result",
                  chartConfig: {
                    xColumn: null,
                    queries: [null],
                    visual: { type: "stat" },
                  },
                },
              ],
            },
          },
        ],
      },
    )

    cy.contains(DEPENDENT, "Active desk: London").should("be.visible")
    cy.contains(`${SOURCE} button[aria-pressed="false"]`, "Paris").click()
    cy.wrap(null).should(() => expect(releaseParis).to.be.a("function"))
    cy.contains(`${SOURCE} button[aria-pressed="false"]`, "Tokyo").click()
    cy.contains(`${SOURCE} button[aria-pressed="true"]`, "Tokyo").should(
      "be.visible",
    )
    cy.then(() => {
      releaseParis()
    })
    cy.contains(DEPENDENT, "Active desk: Tokyo").should("be.visible")
  })
})
