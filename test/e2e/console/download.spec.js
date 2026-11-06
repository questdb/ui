const loadDownloadConsole = (query) => {
  cy.loadConsoleWithAuth(false, {}, { buffers: [{ value: query }] })
  cy.getEditor().should("be.visible")

  cy.document().should((doc) => {
    const activeElement = doc.activeElement
    expect(activeElement).to.exist
    expect(activeElement.classList.contains("monaco-mouse-cursor-text")).to.be
      .true
  })
}

describe("download functionality", () => {
  it("downloads the query results as a CSV file", () => {
    // Given
    const query = "select x from long_sequence(10)"
    loadDownloadConsole(query)
    cy.intercept("GET", "**/exp?*").as("exportRequest")

    // When
    cy.clickRunIconInLine(1)

    // Then
    cy.getByDataHook("download-parquet-button").should("be.visible")
    cy.getByDataHook("download-dropdown-button").should("be.visible")
    cy.getByDataHook("download-csv-button").should("not.exist")

    // When
    cy.getByDataHook("download-dropdown-button").click()
    cy.getByDataHook("download-csv-button").should("be.visible").click()

    // Then
    cy.wait("@exportRequest").then(({ request, response }) => {
      const url = new URL(request.url)
      const filename = `${url.searchParams.get("filename")}.csv`
      expect(url.searchParams.get("fmt")).to.equal("csv")
      expect(request.url).to.include(encodeURIComponent(query))
      expect(response.statusCode).to.equal(200)
      expect(response.headers["content-disposition"]).to.equal(
        `attachment; filename="${filename}"`,
      )
      cy.readFile(`${Cypress.config("downloadsFolder")}/${filename}`).should(
        (csv) => {
          expect(csv.trim().split(/\r?\n/)).to.deep.equal([
            '"x"',
            ...Array.from({ length: 10 }, (_, index) => String(index + 1)),
          ])
        },
      )
    })
  })

  it("shows the server export error in a toast", () => {
    // Given
    loadDownloadConsole("select x from long_sequence(5)")
    cy.intercept("GET", "**/exp?*", (req) => {
      const url = new URL(req.url)
      url.searchParams.set("query", "badquery")
      req.url = url.toString()
    }).as("badExportRequest")

    // When
    cy.runLine()
    cy.getByDataHook("download-dropdown-button").click()
    cy.getByDataHook("download-csv-button").click()

    // Then
    cy.wait("@badExportRequest").then(({ response }) => {
      expect(response.statusCode).to.equal(400)
      expect(response.body.error).to.equal(
        "table does not exist [table=badquery]",
      )
    })
    cy.getByRoleAttribute("alert").should(
      "contain",
      "An error occurred while downloading the file: table does not exist [table=badquery]",
    )
  })
})
