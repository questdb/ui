/// <reference types="cypress" />

describe("System configuration - 3 warnings", () => {
  after(() => {
    cy.clearSimulatedWarnings()
  })

  before(() => {
    cy.clearSimulatedWarnings()
    ;[
      "select simulate_warnings('UNSUPPORTED FILE SYSTEM', 'Unsupported file system [dir=/questdb/path/dbRoot, magic=0x6400A468]');",
      "select simulate_warnings('TOO MANY OPEN FILES', 'fs.file-max limit is too low [current=1024, recommended=1048576]');",
      "select simulate_warnings('OUT OF MMAP AREAS', 'vm.max_map_count limit is too low [current=4096, recommended=1048576]');",
    ].forEach((query) => {
      cy.execAdminQuery(query)
    })
  })

  beforeEach(() => {
    cy.loadConsoleWithAuth()
  })

  it("shows each server warning and dismisses only the selected warning", () => {
    cy.getByDataHook("warnings").should("be.visible")
    cy.getByDataHook("warning").should("have.length", 3)
    cy.getByDataHook("warning-text").should(
      "contain",
      "Unsupported file system",
    )
    cy.getByDataHook("warning-text").should(
      "contain",
      "fs.file-max limit is too low",
    )
    cy.getByDataHook("warning-text").should(
      "contain",
      "vm.max_map_count limit is too low",
    )
    const messages = [
      "Unsupported file system",
      "fs.file-max limit is too low",
      "vm.max_map_count limit is too low",
    ]
    messages.forEach((message, index) => {
      cy.contains('[data-hook="warning"]', message)
        .find('[data-hook="warning-close-button"]')
        .click()
      cy.contains('[data-hook="warning-text"]', message).should("not.exist")
      messages.slice(index + 1).forEach((remaining) => {
        cy.contains('[data-hook="warning-text"]', remaining).should(
          "be.visible",
        )
      })
    })
    cy.getByDataHook("warnings").should("not.exist")
  })
})
