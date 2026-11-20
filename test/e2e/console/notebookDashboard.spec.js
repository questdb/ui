/// <reference types="cypress" />

const SOURCE = '[data-cell-id="desk-picker"]'
const DEPENDENT = '[data-cell-id="selected-desk"]'

describe("notebook dashboard", () => {
  it("refreshes a dependent visualization when a stat tile changes the notebook variable", () => {
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
                    "select 'London' as desk, 1 as volume union all select 'Paris', 2",
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
    cy.contains(`${SOURCE} button[aria-pressed="true"]`, "Paris").should(
      "be.visible",
    )
    cy.contains(DEPENDENT, "Active desk: Paris").should("be.visible")
  })
})
