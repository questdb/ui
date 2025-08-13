/// <reference types="cypress" />

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || "";
const baseUrl = `http://localhost:9999${contextPath}`;

describe("search panel", () => {
  describe("panel visibility and basic functionality", () => {
    before(() => {
      cy.loadConsoleWithAuth();
    });
    beforeEach(() => {
      cy.ensureDataSourcesPanel();
      cy.closeSearchPanel();
    });

    it("should show data sources panel by default and hide search panel", () => {
      // Data sources panel should be visible by default
      cy.getByDataHook("tables-panel-button").should(
        "have.attr",
        "data-selected",
        "true"
      );
      cy.getByDataHook("schema-tree").should("be.visible");

      // Search panel should be hidden by default
      cy.getByDataHook("search-panel-button").should(
        "have.attr",
        "data-selected",
        "false"
      );
      cy.getByDataHook("search-input").should("not.be.visible");
    });

    it("should switch from data sources to search panel", () => {
      // Initially data sources is open
      cy.getByDataHook("schema-tree").should("be.visible");
      cy.getByDataHook("search-input").should("not.be.visible");

      // Open search panel (should close data sources)
      cy.getByDataHook("search-panel-button").click();
      cy.getByDataHook("search-panel-button").should(
        "have.attr",
        "data-selected",
        "true"
      );
      cy.getByDataHook("search-input").should("be.visible");
      cy.getByDataHook("schema-tree").should("not.be.visible");
      cy.getByDataHook("tables-panel-button").should(
        "have.attr",
        "data-selected",
        "false"
      );
    });

    it("should switch from search to data sources panel", () => {
      // First open search panel
      cy.getByDataHook("search-panel-button").click();
      cy.getByDataHook("search-input").should("be.visible");
      cy.getByDataHook("schema-tree").should("not.be.visible");

      // Then open data sources panel (should close search)
      cy.getByDataHook("tables-panel-button").click();
      cy.getByDataHook("tables-panel-button").should(
        "have.attr",
        "data-selected",
        "true"
      );
      cy.getByDataHook("schema-tree").should("be.visible");
      cy.getByDataHook("search-input").should("not.be.visible");
      cy.getByDataHook("search-panel-button").should(
        "have.attr",
        "data-selected",
        "false"
      );
    });

    it("should close search panel when clicked again", () => {
      // Open search panel
      cy.getByDataHook("search-panel-button").click();
      cy.getByDataHook("search-input").should("be.visible");

      // Close search panel by clicking again
      cy.getByDataHook("search-panel-button").click();
      cy.getByDataHook("search-panel-button").should(
        "have.attr",
        "data-selected",
        "false"
      );
      cy.getByDataHook("search-input").should("not.be.visible");

      // No panel should be visible
      cy.getByDataHook("schema-tree").should("not.be.visible");
    });

    it("should focus search input when search panel opens", () => {
      cy.getByDataHook("search-panel-button").click();
      cy.getByDataHook("search-input").should("be.focused");
    });
  });

  describe("search functionality", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth();
      cy.ensureDataSourcesPanel();
      cy.closeSearchPanel();
      cy.typeQueryDirectly(
        "SELECT timestamp, symbol, price, volume FROM crypto_trades WHERE symbol = 'BTC-USD';\n"
      );

      cy.createTabWithContent(
        "SELECT count(*), avg(price), sum(volume) FROM crypto_trades WHERE price > 50000;\n"
      );

      cy.createTabWithContent(
        "CREATE TABLE market_data_staging (\n  timestamp TIMESTAMP,\nsymbol SYMBOL,\nopen_price DOUBLE,\nclose_price DOUBLE,\nvolume LONG \n{rightArrow}{rightArrow}TIMESTAMP(timestamp);\n"
      );

      cy.openSearchPanel();
    });

    it("should search across all open tabs", () => {
      cy.searchFor("crypto_trades");

      cy.getSearchResults().should("have.length.at.least", 2);
      cy.getByDataHook("search-summary").should("contain", "results in 2 tabs");
    });

    it("should highlight search results when clicked", () => {
      cy.searchFor("SELECT");

      cy.getSearchResults().first().click();

      cy.getEditor().should("contain", "SELECT");

      cy.get(".searchHighlight").should("be.visible");
    });

    it("should update search results when editor content changes", () => {
      cy.searchFor("market_data_staging");

      cy.getByDataHook("search-summary").should("contain", "1 result in 1 tab");

      cy.getEditorTabByTitle("SQL").get(".chrome-tab-title").realClick();
      cy.getEditorTabByTitle("SQL").should("have.attr", "active");
      cy.getEditor().click();
      cy.typeQueryDirectly("\n-- INSERT INTO market_data_staging VALUES");

      cy.wait(400);

      cy.getByDataHook("search-summary").should(
        "contain",
        "2 results in 2 tabs"
      );
    });

    it("should show no results when no matches found", () => {
      cy.searchFor("nonexistenttext123");

      cy.getSearchResults().should("not.exist");
      cy.getByDataHook("search-no-results").should("be.visible");
    });
  });

  describe("search options", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth();
      cy.ensureDataSourcesPanel();
      cy.closeSearchPanel();
      cy.typeQueryDirectly(
        "-- Daily OHLC aggregation for major cryptocurrency symbols\nSELECT \n  SYMBOL,\nfirst(price) as open_price,\nmax(price) as high_price,\nmin(price) as low_price,\nlast(price) as close_price,\nsum(volume) as total_volume\nFROM crypto_trades \nWHERE SYMBOL IN ('BTC-USD', 'ETH-USD', 'ADA-USD');\n"
      );
      cy.openSearchPanel();
    });

    it("should perform case-sensitive search when enabled", () => {
      cy.searchFor("symbol");
      cy.getByDataHook("search-summary").should(
        "contain",
        "3 results in 1 tab"
      );

      cy.toggleSearchOption("caseSensitive");
      cy.wait(400);

      cy.getByDataHook("search-summary").should("contain", "1 result in 1 tab");
    });

    it("should perform whole word search when enabled", () => {
      cy.searchFor("price");
      cy.getByDataHook("search-summary").should(
        "contain",
        "8 results in 1 tab"
      );

      cy.toggleSearchOption("wholeWord");
      cy.wait(400);

      cy.getSearchResults().should("have.length", 4);

      cy.searchFor("open_price");
      cy.getSearchResults().should("have.length", 1);
    });

    it("should perform regex search when enabled", () => {
      cy.clearEditor();
      cy.typeQueryDirectly(
        "SELECT * FROM positions WHERE symbol = 'BTC-ETH';\nSELECT * FROM positions WHERE symbol = 'ETH-BTC';\nSELECT * FROM forex_rates WHERE pair = 'USD-TRY';"
      );

      cy.toggleSearchOption("useRegex");

      cy.searchFor("[A-Z]{{}3}-[A-Z]{{}3}"); // this will type [A-Z]{3}-[A-Z]{3}

      cy.getByDataHook("search-summary").should(
        "contain",
        "3 results in 1 tab"
      );
    });

    it("should toggle search option buttons visually", () => {
      const checkButton = (hookName) => {
        const button = cy.getByDataHook(hookName);

        // Click to activate
        button.click();

        // Click to deactivate
        button.click();
      };

      checkButton("search-option-case-sensitive");
      checkButton("search-option-whole-word");
      checkButton("search-option-regex");
    });
  });

  describe("search with closed tabs", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth();
      cy.ensureDataSourcesPanel();
      cy.closeSearchPanel();
      cy.typeQueryDirectly(
        "SELECT symbol, avg(return_pct) as avg_return FROM portfolio_returns;"
      );

      cy.createTabWithContent("DROP TABLE IF EXISTS portfolio_positions;");

      cy.createTabWithContent(
        "CREATE TABLE portfolio_positions (symbol SYMBOL, risk_score DOUBLE);"
      );

      // Close the middle tab
      cy.getEditorTabs().eq(1).find(".chrome-tab-close").click();

      cy.openSearchPanel();
    });

    it("should search in closed tabs when option is enabled", () => {
      cy.searchFor("portfolio");

      cy.getByDataHook("search-summary").should(
        "contain",
        "3 results in 3 tabs"
      );

      cy.toggleSearchOption("includeDeleted");
      cy.wait(400);

      cy.getByDataHook("search-summary").should(
        "contain",
        "2 results in 2 tabs"
      );
    });

    it("should preview the closed tab when result is clicked", () => {
      cy.searchFor("DROP");

      cy.getSearchResults().contains("DROP").click();

      // Should preview the closed tab
      cy.getEditorTabs().should("have.length", 3);
      cy.getEditorTabByTitle("SQL 1").should("have.class", "temporary-tab");
      cy.getEditorTabByTitle("SQL 1").should("have.attr", "active");
      cy.getEditor().should("contain", "DROP");
      cy.getEditor().should("contain", "TABLE");
      cy.getEditor().get(".searchHighlight").should("be.visible");

      cy.getSearchResults().contains("DROP").dblclick();

      // should navigate to editor on double click
      cy.getEditor().get(".searchHighlight").should("not.exist");
      cy.getEditorTabByTitle("SQL 1").should("not.have.class", "temporary-tab");
      cy.getEditorTabByTitle("SQL 1").should("have.attr", "active");
    });

    it("should navigate to closed tab when result is clicked", () => {
      cy.searchFor("DROP");

      cy.getSearchResults().contains("DROP").click();

      cy.getEditorTabs().should("have.length", 3);
      cy.getEditorTabByTitle("SQL 1").should("have.class", "temporary-tab");
      cy.getEditorTabByTitle("SQL 1").should("have.attr", "active");

      // clicking on editor should activate the tab
      cy.getEditor().realClick();

      cy.getEditor().get(".searchHighlight").should("not.exist");
      cy.getEditorTabByTitle("SQL 1").should("not.have.class", "temporary-tab");
      cy.getEditorTabByTitle("SQL 1").should("have.attr", "active");
    });
  });

  describe("search performance and edge cases", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth();
      cy.ensureDataSourcesPanel();
      cy.closeSearchPanel();
    });

    it("should handle empty search query", () => {
      cy.openSearchPanel();
      cy.getByDataHook("search-input").clear();
      cy.wait(400);

      cy.getSearchResults().should("not.exist");
      cy.getByDataHook("search-summary").should("not.exist");
    });

    it("should handle special characters in search", () => {
      cy.typeQueryDirectly(
        "SELECT * FROM customer_trades WHERE trader_email = 'john.doe+crypto@trading-firm.com';"
      );
      cy.openSearchPanel();

      cy.searchFor("@trading-firm.com");

      cy.getSearchResults().should("have.length", 1);
    });

    it("should handle search in very long content", () => {
      cy.clearEditor();
      let longContent = "";
      for (let i = 0; i < 100; i++) {
        longContent += `-- Trading day ${i}: SELECT timestamp, symbol, price, volume FROM trades_${i} WHERE price > (SELECT avg(price) FROM trades_${i});\n`;
      }
      cy.typeQueryDirectly(
        longContent +
          "-- Final aggregation: SELECT symbol, vwap(price, volume) FROM all_trades_consolidated GROUP BY symbol"
      );

      cy.openSearchPanel();
      cy.searchFor("all_trades_consolidated");

      cy.getSearchResults().should("have.length", 1);
      cy.getByDataHook("search-result-line-number").should("contain", "101");

      cy.getSearchResults().first().click();

      cy.getEditor().should("contain", "all_trades_consolidated");

      cy.searchFor("Trading day \\d+");
      cy.getByDataHook("search-option-regex").click();
      cy.getByDataHook("search-summary").should(
        "contain",
        "100 results in 1 tab"
      );
      cy.getByDataHook("search-result-buffer-group").click();
      for (let i = 0; i < 25; i++) {
        cy.realPress("ArrowDown");
        cy.get('[data-hook="search-result-match"][data-active="true"]')
          .should("contain", `Trading day ${i}`)
          .get("mark")
          .should("contain", `Trading day ${i}`);
        cy.get('[data-hook="search-result-match"][data-active="true"]')
          .getByDataHook("search-result-line-number")
          .should("contain", `${i + 1}`);
        cy.getEditor()
          .get(".line-numbers")
          .should("contain", `${i + 1}`)
          .should("be.visible");
      }
    });
  });

  describe("keyboard shortcuts", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth();
      cy.ensureDataSourcesPanel();
      cy.closeSearchPanel();
      cy.typeQueryDirectly(
        "SELECT symbol, position_size, unrealized_pnl FROM active_positions WHERE status = 'ACTIVE';"
      );
      cy.openSearchPanel();
    });

    it("should trigger search on Enter key", () => {
      cy.getByDataHook("search-input").type("active_positions");

      // Press Enter to trigger immediate search
      cy.getByDataHook("search-input").type("{enter}");

      cy.getSearchResults().should("have.length", 1);
    });
  });

  describe("search result display", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth();
      cy.ensureDataSourcesPanel();
      cy.closeSearchPanel();
      cy.typeQueryDirectly(
        "SELECT \n  trader_id,\ntrader_name,\ntrader_email,\nsum(profit_loss) as total_pnl,\ncount(*) as trade_count\nFROM trading_activity \nWHERE trader_email LIKE '%@hedgefund.com'\nAND trade_date >= '2024-01-01'\nGROUP BY trader_id, trader_name, trader_email\n;"
      );
      cy.openSearchPanel();
    });

    it("should group results by buffer/tab", () => {
      cy.createTabWithContent(
        "SELECT customer_email, sum(trade_volume) as total_volume FROM customer_trades WHERE account_status = 'ACTIVE' AND trade_date > dateadd('m', -1, now()) GROUP BY customer_email;"
      );

      cy.searchFor("_email");

      cy.getSearchResultGroups().should("have.length", 2);
    });

    it("should show match counts in buffer groups", () => {
      cy.searchFor("trader_email");

      cy.getSearchResultGroups().first().should("contain", "result");
    });

    it("should display context around matches", () => {
      cy.searchFor("WHERE");

      cy.getSearchResults().first().should("contain.text", "trader_email");
    });
  });

  describe("title matching functionality", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth();
      cy.ensureDataSourcesPanel();
      cy.closeSearchPanel();
    });

    it("should find title-only matches", () => {
      cy.typeQueryDirectly("SELECT symbol FROM market_data;");
      cy.createTabWithContent(
        "INSERT INTO trades VALUES(now(), 'BTC-USD', 45000.0, 1000);",
        "crypto analysis"
      );
      cy.createTabWithContent(
        "DROP TABLE temp_portfolio;",
        "portfolio cleanup"
      );

      cy.openSearchPanel();
      cy.searchFor("crypto");

      cy.getByDataHook("search-result-title-match").should("have.length", 1);
      cy.getByDataHook("search-result-title-match-text").should(
        "contain",
        "crypto analysis"
      );
      cy.getByDataHook("search-result-title-match-text")
        .find("mark")
        .should("contain", "crypto");
    });

    it("should find title matches with closed tabs", () => {
      cy.createTabWithContent(
        "CREATE TABLE trading_positions (symbol SYMBOL, qty DOUBLE);",
        "position tracking"
      );
      cy.createTabWithContent(
        "SELECT * FROM market_data WHERE symbol = 'ETH-USD';"
      );
      cy.toggleSearchOption("wholeWord");

      cy.getEditorTabs().eq(1).find(".chrome-tab-close").click();

      cy.openSearchPanel();
      cy.searchFor("position");

      cy.getByDataHook("search-result-title-match").should("have.length", 1);
      cy.getByDataHook("search-result-title-match-closed-status").should(
        "contain",
        "closed"
      );
    });

    it("should show header with title highlight when buffer has both title and content matches", () => {
      cy.createTabWithContent(
        "SELECT price FROM crypto_trades WHERE symbol = 'BTC-USD';",
        "crypto price query"
      );

      cy.openSearchPanel();
      cy.searchFor("crypto");

      cy.getByDataHook("search-result-buffer-group").should("have.length", 1);
      cy.getByDataHook("search-result-buffer-group")
        .find("mark")
        .should("contain", "crypto");
      cy.getByDataHook("search-result-buffer-group").should(
        "contain",
        "1 result"
      );
    });

    it("should navigate to buffer when title match is clicked", () => {
      cy.createTabWithContent(
        "SELECT timestamp FROM price_history;",
        "price analysis"
      );

      cy.openSearchPanel();
      cy.searchFor("price");

      cy.getByDataHook("search-result-buffer-group").click();

      cy.getEditorTabByTitle("price analysis").should("have.attr", "active");
      cy.getEditor().should("contain", "price_history");
    });

    it("should convert temporary buffer to permanent on double click", () => {
      cy.createTabWithContent(
        "INSERT INTO orders VALUES(now(), 'BTC-USD', 1.5);",
        "order entry"
      );

      cy.getEditorTabs().eq(1).find(".chrome-tab-close").click();

      cy.openSearchPanel();
      cy.searchFor("order");

      cy.getByDataHook("search-result-buffer-group").click();

      cy.getEditorTabByTitle("order entry").should(
        "have.class",
        "temporary-tab"
      );

      cy.getByDataHook("search-result-buffer-group").dblclick();

      cy.getEditorTabByTitle("order entry").should(
        "not.have.class",
        "temporary-tab"
      );
      cy.getEditorTabByTitle("order entry").should("have.attr", "active");
    });
  });

  describe("search error handling", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth();
      cy.ensureDataSourcesPanel();
      cy.closeSearchPanel();
      cy.typeQueryDirectly(
        "SELECT symbol, price FROM trades WHERE symbol = 'BTC-USD';"
      );
      cy.openSearchPanel();
    });

    it("should display error when invalid regex is used", () => {
      cy.toggleSearchOption("useRegex");
      cy.searchFor("[invalid-regex");

      cy.getByDataHook("search-error").should("be.visible");
      cy.getByDataHook("search-error").should("contain", "SyntaxError");
      cy.getSearchResults().should("not.exist");
      cy.getByDataHook("search-summary").should("not.exist");
    });

    it("should clear error when valid search is performed after error", () => {
      cy.toggleSearchOption("useRegex");
      cy.searchFor("[invalid-regex");
      cy.getByDataHook("search-error").should("be.visible");

      cy.searchFor("symbol");
      cy.getByDataHook("search-error").should("not.exist");
      cy.getSearchResults().should("have.length.at.least", 1);
      cy.getByDataHook("search-summary").should("be.visible");
    });

    it("should display SyntaxError for invalid regex when regex option is enabled", () => {
      cy.toggleSearchOption("useRegex");
      cy.searchFor("(unclosed-group");

      cy.getByDataHook("search-error").should("be.visible");
      cy.getByDataHook("search-error").should("contain", "SyntaxError:");
    });

    it("should hide error when search input is cleared", () => {
      cy.toggleSearchOption("useRegex");
      cy.searchFor("[invalid-regex");
      cy.getByDataHook("search-error").should("be.visible");

      cy.getByDataHook("search-input").clear();
      cy.wait(400);

      cy.getByDataHook("search-error").should("not.exist");
      cy.getSearchResults().should("not.exist");
    });
  });

  describe("special character escaping", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth();
      cy.ensureDataSourcesPanel();
      cy.closeSearchPanel();
    });

    it("should properly escape regex special characters when regex is disabled", () => {
      cy.clearEditor();
      cy.typeQueryDirectly(
        "-- Find patterns with special characters\n" +
          "SELECT * FROM prices WHERE pattern = '^BTC.*$';\n" +
          "INSERT INTO regex_patterns VALUES ('[A-Z]+\\.(ETH|BTC)\\*');\n" +
          "INSERT INTO logs VALUES('Error: File not found at /path/to/file+backup');\n" +
          "CREATE TABLE test_patterns (id INT, email VARCHAR(50) CHECK (email ~ '@.*\\.(com|org)'));\n" +
          "-- Special query: price >= $100 && volume > 1000\n" +
          "SELECT COUNT(*) FROM trades WHERE notes LIKE '%profit: +15.5%';\n"
      );
      cy.openSearchPanel();

      const testCases = [
        { search: "^BTC.*$", expectedMatches: 1 },
        { search: "[A-Z]+", expectedMatches: 1 },
        { search: "\\.(ETH|BTC)\\*", expectedMatches: 1 },
        { search: "/path/to/file+backup", expectedMatches: 1 },
        { search: "price >= $100 && volume", expectedMatches: 1 },
        { search: "%profit: +15.5%", expectedMatches: 1 },
        { search: "@.*\\.(com|org)", expectedMatches: 1 },
        { search: "(email", expectedMatches: 1 },
        { search: ")", expectedMatches: 8 },
        { search: "*", expectedMatches: 5 },
        { search: ".", expectedMatches: 5 },
      ];

      testCases.forEach((testCase) => {
        cy.searchFor(testCase.search);
        cy.wait(400);

        cy.getByDataHook("search-error").should("not.exist");

        cy.getByDataHook("search-summary").should(
          "contain",
          `${testCase.expectedMatches} result${
            testCase.expectedMatches > 1 ? "s" : ""
          } in 1 tab`
        );

        if (testCase.expectedMatches > 0) {
          cy.getSearchResults().first().should("contain", testCase.search);
        }
      });
    });

    it("should treat special characters as regex when regex is enabled", () => {
      cy.clearEditor();
      cy.typeQueryDirectly(
        "SELECT price FROM btc_trades;\n" +
          "SELECT price FROM eth_trades;\n" +
          "SELECT price FROM ada_trades;\n"
      );
      cy.openSearchPanel();
      cy.toggleSearchOption("useRegex");

      cy.searchFor("(btc|eth)_trades");
      cy.wait(400);

      cy.getByDataHook("search-error").should("not.exist");
      cy.getByDataHook("search-summary").should(
        "contain",
        "2 results in 1 tab"
      );

      cy.searchFor("\\(btc\\|eth\\)_trades");
      cy.wait(400);

      cy.getByDataHook("search-error").should("not.exist");
      cy.getSearchResults().should("have.length", 0);
    });
  });

  describe("all search option combinations", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth();
      cy.ensureDataSourcesPanel();
      cy.closeSearchPanel();
    });
    const allWords = [
      "Find",
      "product",
      "in",
      "production",
      "PRODUCT",
      "products",
      "Product",
      "testX",
      "text",
      "teXt",
    ];
    const checkMatches = (matches) => {
      for (let i = 0; i < matches.length; i++) {
        const result = cy.getSearchResults().eq(i);
        result.should("contain", allWords[matches[i]]);
        result
          .getByDataHook("search-result-line-number")
          .should("contain", `${matches[i] + 1}`);
      }
    };

    it("should handle all combinations correctly", () => {
      cy.clearEditor();
      cy.typeQueryDirectly(allWords.join("\n"));
      cy.openSearchPanel();

      // !regex + !wholeWord + !caseSensitive (default)
      cy.searchFor("product");
      cy.wait(400);
      checkMatches([1, 3, 4, 5, 6]);

      // !regex + !wholeWord + caseSensitive
      cy.toggleSearchOption("caseSensitive");
      cy.wait(400);
      checkMatches([1, 3, 5]);

      // !regex + wholeWord + caseSensitive
      cy.toggleSearchOption("wholeWord");
      cy.wait(400);
      checkMatches([1]);

      // !regex + wholeWord + !caseSensitive
      cy.toggleSearchOption("caseSensitive");
      cy.wait(400);
      checkMatches([1, 4, 6]);

      cy.searchFor("te[sx]t");

      // regex + wholeWord + !caseSensitive
      cy.toggleSearchOption("useRegex");
      cy.wait(400);
      checkMatches([8, 9]);

      // regex + !wholeWord + !caseSensitive
      cy.toggleSearchOption("wholeWord");
      cy.wait(400);
      checkMatches([7, 8, 9]);

      // regex + !wholeWord + caseSensitive
      cy.toggleSearchOption("caseSensitive");
      cy.wait(400);
      checkMatches([7, 8]);

      // regex + wholeWord + caseSensitive
      cy.toggleSearchOption("wholeWord");
      cy.wait(400);
      checkMatches([8]);
    });
  });
});
