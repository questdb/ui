/// <reference types="cypress" />

describe("import", () => {
  describe("CSV Import", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth();
    });

    afterEach(() => {
      cy.loadConsoleWithAuth();
      cy.typeQueryDirectly("drop all tables;");
      cy.clickRunIconInLine(1);
      cy.getByDataHook("success-notification").should("be.visible");
      cy.clearEditor();
    });

    it("display import panel", () => {
      cy.getByDataHook("import-panel-button").click();
      cy.getByDataHook("import-csv-button").should("be.visible");
      cy.getByDataHook("import-parquet-button").should("be.visible");

      cy.getByDataHook("import-csv-button").click();
      cy.getByDataHook("import-dropbox").should("be.visible");
      cy.getByDataHook("import-browse-from-disk").should("be.visible");

      cy.get('input[type="file"]').selectFile("cypress/fixtures/test.csv", {
        force: true,
      });
      cy.getByDataHook("import-table-column-schema").should("be.visible");
      cy.getByDataHook("import-table-column-owner").should("not.exist");
    });

    it("should import csv with a nanosecond timestamp", () => {
      cy.getByDataHook("import-panel-button").click();
      cy.getByDataHook("import-csv-button").should("be.visible");
      cy.getByDataHook("import-parquet-button").should("be.visible");

      cy.getByDataHook("import-csv-button").click();
      cy.getByDataHook("import-dropbox").should("be.visible");
      cy.getByDataHook("import-browse-from-disk").should("be.visible");

      cy.get('input[type="file"]').selectFile("cypress/fixtures/nanos.csv", {
        force: true,
      });
      cy.getByDataHook("import-table-column-schema").should("be.visible");
      cy.getByDataHook("import-upload-button").should("be.enabled");
      cy.getByDataHook("import-upload-button").click();

      cy.getByDataHook("import-file-status").should(
        "contain",
        "Imported 7 rows"
      );
      cy.getByDataHook("schema-table-title").should("contain", "nanos.csv");

      cy.getByDataHook("schema-table-title").dblclick();
      cy.getByDataHook("schema-folder-title").contains("Columns").dblclick();
      cy.get('[data-id="questdb:expanded:tables:nanos.csv:columns:timestamp"]')
        .should("be.visible")
        .should("contain", "timestamp")
        .should("contain", "TIMESTAMP_NS");
      cy.getByDataHook("designated-timestamp-icon").should("not.exist");

      cy.getByDataHook("table-schema-dialog-trigger")
        .should("be.visible")
        .should("contain", "4 cols");
      cy.getByDataHook("table-schema-dialog-trigger").click();

      cy.getByDataHook("create-table-panel").should("be.visible");
      cy.getByDataHook("table-schema-dialog-column-0").should("be.visible");
      cy.get("input[name='schemaColumns.0.name']").should(
        "have.value",
        "timestamp"
      );

      cy.get("select[name='schemaColumns.0.type']")
        .get("option[value='TIMESTAMP_NS']")
        .should("be.selected");

      cy.getByDataHook(
        "table-schema-dialog-column-0-designated-button"
      ).click();
      cy.getByDataHook("form-submit-button").click();

      cy.getByDataHook("create-table-panel").should("not.be.visible");

      cy.get('select[name="overwrite"]').select("true");

      cy.getByDataHook("import-upload-button").should("be.enabled");
      cy.getByDataHook("import-upload-button").click();

      cy.getByDataHook("import-file-status").should(
        "contain",
        "Imported 7 rows"
      );
      cy.getByDataHook("designated-timestamp-icon").should("be.visible");
    });
  });
  describe("Parquet import", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth();
    });

    describe("Basic Upload Operations", () => {
      it("should display parquet import panel", () => {
        cy.getByDataHook("import-panel-button").click();
        cy.getByDataHook("import-csv-button").should("be.visible");
        cy.getByDataHook("import-parquet-button").should("be.visible");

        cy.getByDataHook("import-parquet-button").click();
        cy.getByDataHook("import-dropbox").should("be.visible");
        cy.getByDataHook("import-browse-from-disk").should("be.visible");
      });

      it("should successfully upload a single parquet file", () => {
        cy.mockParquetUploadSuccess();
        cy.getByDataHook("import-panel-button").click();
        cy.getByDataHook("import-parquet-button").click();

        cy.uploadParquetFile("trades-original.parquet");
        cy.getByDataHook("import-parquet-file-name").should("be.visible");
        cy.getByDataHook("import-parquet-file-name").should(
          "contain",
          "trades-original.parquet"
        );

        cy.getByDataHook("import-parquet-upload-all").click();
        cy.wait("@parquetUpload");

        cy.getByDataHook("import-parquet-status", { timeout: 3000 }).should(
          "contain",
          "Uploaded 1 file successfully"
        );
      });

      it("should handle multiple parquet file uploads", () => {
        cy.mockParquetUploadSuccess();
        cy.getByDataHook("import-panel-button").click();
        cy.getByDataHook("import-parquet-button").click();

        cy.uploadParquetFile("trades-original.parquet");
        cy.uploadParquetFile("trades-original2.parquet");
        cy.uploadParquetFile("trades-original3.parquet");

        cy.getByDataHook("import-parquet-file-name").should("have.length", 3);
        cy.getByDataHook("import-parquet-upload-all").click();
        cy.wait("@parquetUpload");
        cy.getByDataHook("import-parquet-status", { timeout: 3000 }).should(
          "contain",
          "Uploaded 3 files successfully"
        );

        cy.getByDataHook("import-file-status").should(($statuses) => {
          expect($statuses).to.have.length(3);
          $statuses.each((_, status) => {
            expect(status).to.contain.text("Imported");
          });
        });
      });
    });

    describe("Error Handling", () => {
      it("should handle 409 conflict when file already exists", () => {
        cy.mockParquetUploadError({
          status: 409,
          body: {
            errors: [
              {
                meta: { name: "trades-original.parquet" },
                detail: "file already exists [file=trades-original]",
                status: "409",
              },
            ],
          },
        });

        cy.getByDataHook("import-panel-button").click();
        cy.getByDataHook("import-parquet-button").click();
        cy.uploadParquetFile("trades-original.parquet");
        cy.getByDataHook("import-parquet-upload-all").click();
        cy.wait("@parquetUploadError");

        cy.getByDataHook("import-file-status").should("be.visible");

        cy.getByDataHook("import-file-status").within(() => {
          cy.getByDataHook("import-file-status-expand").click({ force: true });
        });

        cy.getByDataHook("import-file-status-details").should(
          "contain",
          "file already exists"
        );
        cy.getByDataHook("import-parquet-retry-upload").should("be.visible");
      });

      it("should show network error message", () => {
        cy.intercept("POST", "**/api/v1/imports*", (req) => {
          req.destroy(); // Prevent the request from reaching the server
        }).as("networkError");

        cy.getByDataHook("import-panel-button").click();
        cy.getByDataHook("import-parquet-button").click();
        cy.uploadParquetFile("trades-original.parquet");
        cy.getByDataHook("import-parquet-upload-all").click();
        cy.wait("@networkError");

        cy.getByDataHook("import-file-status").should("be.visible");
        cy.getByDataHook("import-file-status").should("contain", "Cancelled");

        cy.getByDataHook("import-parquet-status").should("be.visible");
        cy.getByDataHook("import-parquet-status").should(
          "contain",
          "Upload error"
        );
      });

      it("should handle server error gracefully", () => {
        cy.mockParquetUploadError({
          status: 500,
          body: {
            errors: [
              {
                meta: { name: "trades-original.parquet" },
                detail: "internal server error",
                status: "500",
              },
            ],
          },
        });

        cy.getByDataHook("import-panel-button").click();
        cy.getByDataHook("import-parquet-button").click();
        cy.uploadParquetFile("trades-original.parquet");
        cy.getByDataHook("import-parquet-upload-all").click();
        cy.wait("@parquetUploadError");

        cy.getByDataHook("import-file-status").should("be.visible");

        cy.getByDataHook("import-file-status").within(() => {
          cy.getByDataHook("import-file-status-expand").click({ force: true });
        });

        cy.getByDataHook("import-file-status-details").should(
          "contain",
          "internal server error"
        );
      });
    });

    describe("File Operations", () => {
      it("should allow renaming files before upload", () => {
        cy.getByDataHook("import-panel-button").click();
        cy.getByDataHook("import-parquet-button").click();
        cy.uploadParquetFile("trades-original.parquet");
        cy.getByDataHook("import-parquet-file-name").should("be.visible");

        cy.getByDataHook("import-parquet-rename-file").first().click();

        cy.getByDataHook("import-parquet-rename-file-input").should(
          "be.visible"
        );
        cy.getByDataHook("import-parquet-rename-file-input")
          .clear()
          .type("btc_trades_2024");
        cy.getByDataHook("import-parquet-rename-file-submit").click();

        cy.getByDataHook("import-parquet-rename-file")
          .first()
          .should("contain", "btc_trades_2024");
      });

      it("should remove files from upload queue", () => {
        cy.getByDataHook("import-panel-button").click();
        cy.getByDataHook("import-parquet-button").click();

        cy.uploadParquetFile("trades-original.parquet");
        cy.uploadParquetFile("trades-original2.parquet");
        cy.getByDataHook("import-parquet-file-name").should("have.length", 2);

        cy.getByDataHook("import-parquet-remove-file").first().click();
        cy.getByDataHook("import-parquet-file-name").should("have.length", 1);
        cy.getByDataHook("import-parquet-file-name").should(
          "not.contain",
          "trades-original.parquet"
        );

        cy.getByDataHook("import-parquet-remove-file").should("have.length", 1);
        cy.getByDataHook("import-parquet-remove-file").click();
        cy.getByDataHook("import-dropbox").should("be.visible");
      });

      it("should respect overwrite mode in API calls", () => {
        cy.intercept("POST", "**/api/v1/imports?overwrite=false", {
          statusCode: 201,
          body: { data: [{ type: "import", id: "trades-original.parquet" }] },
        }).as("overwriteFalse");

        cy.getByDataHook("import-panel-button").click();
        cy.getByDataHook("import-parquet-button").click();
        cy.uploadParquetFile("trades-original.parquet");
        cy.getByDataHook("import-parquet-upload-all").click();
        cy.wait("@overwriteFalse");

        cy.getByDataHook("import-parquet-overwrite").click();

        cy.intercept("POST", "**/api/v1/imports?overwrite=true", {
          statusCode: 201,
          body: { data: [{ type: "import", id: "trades-original2.parquet" }] },
        }).as("overwriteTrue");

        cy.uploadParquetFile("trades-original2.parquet");
        cy.getByDataHook("import-parquet-upload-all").click();
        cy.wait("@overwriteTrue");
      });
    });

    describe("Batch Upload with Retry Mechanism", () => {
      it("should continue with remaining files after partial failure", () => {
        let callCount = 0;
        cy.intercept("POST", "**/api/v1/imports*", (req) => {
          if (callCount === 0) {
            callCount++;
            req.reply({
              statusCode: 409,
              body: {
                errors: [
                  {
                    meta: { name: "trades-original2.parquet" },
                    detail:
                      "file already exists [file=trades-original2.parquet]",
                    status: "409",
                  },
                ],
              },
            });
          } else {
            req.reply({
              statusCode: 201,
              body: {
                data: [{ type: "import", id: "trades-original3.parquet" }],
              },
            });
          }
        }).as("batchUpload");

        cy.getByDataHook("import-panel-button").click();
        cy.getByDataHook("import-parquet-button").click();

        cy.uploadParquetFile("trades-original.parquet");
        cy.uploadParquetFile("trades-original2.parquet");
        cy.uploadParquetFile("trades-original3.parquet");

        cy.getByDataHook("import-parquet-upload-all").click();
        cy.wait("@batchUpload");
        cy.wait("@batchUpload");

        cy.getByDataHook("import-file-status").should("have.length", 3);

        cy.getByDataHook("import-file-status")
          .eq(0)
          .should("contain", "Imported");
        cy.getByDataHook("import-file-status")
          .eq(1)
          .should("contain", "Upload error");
        cy.getByDataHook("import-file-status")
          .eq(2)
          .should("contain", "Imported");
      });

      it("should allow retrying failed single file upload", () => {
        cy.mockParquetUploadError({
          status: 409,
          body: {
            errors: [
              {
                meta: { name: "trades-original.parquet" },
                detail: "file already exists [file=trades-original.parquet]",
                status: "409",
              },
            ],
          },
        });

        cy.getByDataHook("import-panel-button").click();
        cy.getByDataHook("import-parquet-button").click();
        cy.uploadParquetFile("trades-original.parquet");
        cy.getByDataHook("import-parquet-upload-all").click();
        cy.wait("@parquetUploadError");

        cy.getByDataHook("import-parquet-retry-upload").should("be.visible");

        cy.mockParquetUploadSuccess();
        cy.getByDataHook("import-parquet-retry-upload").click();
        cy.wait("@parquetUpload");

        cy.getByDataHook("import-file-status").should("contain", "Imported");
      });
    });

    describe("UI States and Interactions", () => {
      it("should show loading state during upload", () => {
        cy.intercept("POST", "**/api/v1/imports*", (req) => {
          req.reply({
            delay: 2000,
            statusCode: 201,
            body: { data: [{ type: "import", id: "trades-original.parquet" }] },
          });
        }).as("slowUpload");

        cy.getByDataHook("import-panel-button").click();
        cy.getByDataHook("import-parquet-button").click();
        cy.uploadParquetFile("trades-original.parquet");
        cy.getByDataHook("import-parquet-upload-all").click();

        cy.getByDataHook("import-parquet-upload-all").should("be.disabled");

        cy.getByDataHook("import-parquet-status").should(
          "contain",
          "Uploading..."
        );

        cy.wait("@slowUpload");

        cy.getByDataHook("import-parquet-upload-all").should("not.be.disabled");
      });

      it("should allow viewing data after successful upload", () => {
        cy.getByDataHook("import-panel-button").click();
        cy.getByDataHook("import-parquet-button").click();
        cy.uploadParquetFile("trades-original.parquet");

        cy.getByDataHook("import-parquet-overwrite").click();
        cy.getByDataHook("import-parquet-upload-all").click();

        cy.getByDataHook("import-parquet-view-data").first().click();
        cy.getByDataHook("success-notification").should(
          "contain",
          "SELECT * FROM read_parquet('trades-original.parquet')"
        );

        cy.getGrid().should("be.visible");
        cy.getColumnName(0).should("contain", "symbol");
      });

      it("should handle empty response gracefully", () => {
        cy.intercept("POST", "**/api/v1/imports*", {
          statusCode: 201,
          body: {},
        }).as("emptyResponse");

        cy.getByDataHook("import-panel-button").click();
        cy.getByDataHook("import-parquet-button").click();
        cy.uploadParquetFile("trades-original.parquet");
        cy.getByDataHook("import-parquet-upload-all").click();
        cy.wait("@emptyResponse");

        cy.getByDataHook("import-file-status").should("contain", "Imported");
      });
    });
  });
});
