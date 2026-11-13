export const resizeGridColumn = (column, delta) =>
  cy
    .get('[data-hook="grid-col-resizer"]')
    .eq(column)
    .then(($separator) => {
      const rect = $separator[0].getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      cy.wrap($separator).realMouseDown({ position: "center" })
      cy.get("body").realMouseMove(x + delta, y, { position: "topLeft" })
      cy.get("body").realMouseUp({ x: x + delta, y, position: "topLeft" })
    })

export const freezeGridThrough = (column) =>
  cy.get(`#cell-0-${column}`).then(($cell) => {
    const x = $cell[0].getBoundingClientRect().right
    cy.get('[data-hook="grid-freeze-handle"]').then(($handle) => {
      const rect = $handle[0].getBoundingClientRect()
      const y = rect.top + rect.height / 2
      cy.wrap($handle).realMouseDown({ position: "center" })
      cy.get("body").realMouseMove(x, y, { position: "topLeft" })
      cy.get("body").realMouseUp({ x, y, position: "topLeft" })
    })
  })
