describe("download functionality", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth();
  });

  it("should show download button with results", () => {
    // When
    cy.typeQuery("select x from long_sequence(10)");
    cy.runLine();

    // Then
    cy.getByDataHook("result-download-button").should("be.visible");

    // When
    cy.getByDataHook("result-download-button").click();

    // Then
    cy.getByDataHook("download-csv-button").should("be.visible");
    cy.getByDataHook("download-parquet-button").should("be.visible");
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
    cy.getByDataHook("result-download-button").click();
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
    cy.getByDataHook("result-download-button").click();
    cy.getByDataHook("download-parquet-button").click();

    // Then
    cy.wait("@exportRequest").then((interception) => {
      expect(interception.request.url).to.include("fmt=parquet");
      expect(interception.request.url).to.include("parquetVersion=1");
      expect(interception.request.url).to.include(
        encodeURIComponent(query.replace(/\s+/g, " "))
      );
    });
  });

  it("should show error toast on bad request", () => {
    // Given
    cy.intercept("GET", "**/exp?*", (req) => {
      const url = new URL(req.url);
      url.searchParams.set("fmt", "badformat");
      req.url = url.toString();
    }).as("badExportRequest");

    // When
    cy.typeQuery("select x from long_sequence(5)");
    cy.runLine();
    cy.getByDataHook("result-download-button").click();
    cy.getByDataHook("download-csv-button").click();

    // Then
    cy.wait("@badExportRequest").then(() => {
      cy.getByRole("alert").should(
        "contain",
        "Download failed with status code 400: unrecognised format [format=badformat]"
      );
    });
  });

  it("should show error toast on server error", () => {
    // Given
    cy.intercept("GET", "**/exp?*", (req) => {
      req.reply({
        statusCode: 500,
      });
    }).as("serverErrorRequest");

    // When
    cy.typeQuery("select x from long_sequence(5)");
    cy.runLine();
    cy.getByDataHook("result-download-button").click();
    cy.getByDataHook("download-csv-button").click();

    // Then
    cy.wait("@serverErrorRequest").then(() => {
      cy.getByRole("alert").should(
        "contain",
        "Download failed with status code 500: Internal Server Error"
      );
    });
  });

  it("should show loading spinner when downloading", () => {
    // Given
    cy.intercept("GET", "**/exp?*", (req) => {
      req.reply({
        statusCode: 200,
        body: null,
        delay: 1000,
      });
    }).as("exportRequest");

    // When
    cy.typeQuery("select * from long_sequence(10)");
    cy.runLine();
    cy.getByDataHook("result-download-button").click();
    cy.getByDataHook("download-parquet-button").click();

    // Then
    cy.getByDataHook("download-loading-indicator").should("be.visible");

    // Then
    cy.wait("@exportRequest").then(() => {
      cy.getByDataHook("download-loading-indicator").should("not.exist");
    });
  });

  it("should download the file", () => {
    const query = "select x from long_sequence(10)";
    // Given
    cy.intercept("GET", "**/exp?*").as("exportRequest");

    // When
    cy.typeQuery(query);
    cy.runLine();
    cy.getByDataHook("result-download-button").click();
    cy.getByDataHook("download-csv-button").click();

    // Then
    cy.wait("@exportRequest").then((interception) => {
      expect(interception.request.url).to.include("fmt=csv");
      expect(interception.request.url).to.include(
        encodeURIComponent(query.replace(/\s+/g, " "))
      );
      const filename = new URL(interception.request.url).searchParams.get(
        "filename"
      );
      cy.readFile(`cypress/downloads/${filename}.csv`).should(
        "eq",
        '"x"\r\n1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7\r\n8\r\n9\r\n10\r\n'
      );
    });
  });
});
