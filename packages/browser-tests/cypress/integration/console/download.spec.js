describe("download functionality", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth();
  });

  it("should show download button with results", () => {
    // When
    cy.typeQuery("select x from long_sequence(10)");
    cy.runLine();

    // Then
    cy.getByDataHook("download-parquet-button").should("be.visible");
    cy.getByDataHook("download-dropdown-button").should("be.visible");
    cy.getByDataHook("download-csv-button").should("not.exist");

    // When
    cy.getByDataHook("download-dropdown-button").click();

    // Then
    cy.getByDataHook("download-csv-button").should("be.visible");
  });

  it("should trigger CSV download", () => {
    const query = "select x from long_sequence(10)";

    // Given
    cy.intercept("GET", "**/exp?*", (req) => {
      req.reply({
        statusCode: 200,
        body: null,
      });
    }).as("exportRequest");

    // When
    cy.typeQuery(query);
    cy.runLine();
    cy.getByDataHook("download-dropdown-button").click();
    cy.getByDataHook("download-csv-button").click();

    // Then
    cy.wait("@exportRequest").then((interception) => {
      expect(interception.request.url).to.include("fmt=csv");
      expect(interception.request.url).to.include(
        encodeURIComponent(query.replace(/\s+/g, " "))
      );
    });
  });

  it("should trigger Parquet download", () => {
    const query = "select x from long_sequence(10)";

    // Given
    cy.intercept("GET", "**/exp?*", (req) => {
      req.reply({
        statusCode: 200,
        body: null,
      });
    }).as("exportRequest");

    // When
    cy.typeQuery(query);
    cy.runLine();
    cy.getByDataHook("download-parquet-button").click();

    // Then
    cy.wait("@exportRequest").then((interception) => {
      expect(interception.request.url).to.include("fmt=parquet");
      expect(interception.request.url).to.include("rmode=nodelay");
      expect(interception.request.url).to.include(
        encodeURIComponent(query.replace(/\s+/g, " "))
      );
    });
  });
});
