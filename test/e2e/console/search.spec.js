/// <reference types="cypress" />

const loadSearchConsole = (buffers) => {
  cy.loadConsoleWithAuth(false, {}, { buffers })
}

describe("search panel", () => {
  describe("search functionality", () => {
    beforeEach(() => {
      // Given three saved SQL tabs
      loadSearchConsole([
        {
          value:
            "SELECT timestamp, symbol, price, volume FROM crypto_trades WHERE symbol = 'BTC-USD';\n",
        },
        {
          value:
            "SELECT count(*), avg(price), sum(volume) FROM crypto_trades WHERE price > 50000;\n",
        },
        {
          label: "markets",
          value:
            "CREATE TABLE market_data_staging (\n  timestamp TIMESTAMP,\nsymbol SYMBOL,\nopen_price DOUBLE,\nclose_price DOUBLE,\nvolume LONG \n{rightArrow}{rightArrow}TIMESTAMP(timestamp);\n",
        },
      ])

      cy.openSearchPanel()
    })

    it("should update search results when editor content changes", () => {
      // Given
      cy.searchFor("crypto_trades")
      cy.getSearchResults().should("have.length", 2)
      cy.getSearchResultGroups().should("have.length", 2)
      cy.getSearchResultGroups().eq(0).should("contain", "SQL")
      cy.getSearchResultGroups().eq(1).should("contain", "SQL 1")
      // When
      cy.getSearchResults().first().click()
      // Then
      cy.getEditorTabByTitle("SQL").should("have.attr", "active")
      cy.getEditorContent().should(
        "have.value",
        "SELECT timestamp, symbol, price, volume FROM crypto_trades WHERE symbol = 'BTC-USD';\n",
      )
      cy.get(".searchHighlight").should("be.visible")
      cy.window().should((win) => {
        const model = win.monaco.editor.getEditors()[0].getModel()
        const highlights = model
          .getAllDecorations()
          .filter(
            (decoration) => decoration.options.className === "searchHighlight",
          )
        expect(
          highlights.map((highlight) => model.getValueInRange(highlight.range)),
        ).to.deep.eq(["crypto_trades"])
      })
      // When
      cy.searchFor("market_data_staging")
      cy.getByDataHook("search-summary").should("contain", "1 result in 1 tab")
      cy.getEditorTabByTitle("SQL").find(".chrome-tab-drag-handle").click()
      cy.window().then((win) => {
        const editor = win.monaco.editor.getEditors()[0]
        const model = editor.getModel()
        editor.setPosition({
          lineNumber: model.getLineCount(),
          column: model.getLineMaxColumn(model.getLineCount()),
        })
        editor.trigger("test", "type", {
          text: "-- INSERT INTO market_data_staging VALUES",
        })
      })
      // Then
      cy.getByDataHook("search-summary").should(
        "contain",
        "2 results in 2 tabs",
      )
      cy.getSearchResults().should("have.length", 2)
      cy.getSearchResults()
        .filter(':contains("INSERT INTO")')
        .should("have.length", 1)
      cy.getSearchResultGroups()
        .should("contain", "SQL")
        .and("contain", "markets")
    })

    it("should update open & closed status in search results", () => {
      // Given
      cy.searchFor("market")
      cy.getByDataHook("search-summary").should("contain", "2 results in 1 tab")
      cy.getSearchResultGroups().should("not.contain", "closed")
      // When
      cy.getEditorTabByTitle("markets").find(".chrome-tab-close").click()
      // Then
      cy.getSearchResultGroups().should("contain", "closed")
      // When
      cy.getSearchResults().contains("market_data_staging").click()
      // Then
      cy.getEditorTabs().should("have.length", 3)
      cy.getEditorTabByTitle("markets")
        .should("have.class", "temporary-tab")
        .and("have.attr", "active")
      cy.getEditorContent().should(
        "include.value",
        "CREATE TABLE market_data_staging",
      )
      cy.get(".searchHighlight").should("be.visible")
      cy.getSearchResultGroups().should("contain", "closed")
      // When keeping it open from the preview bar
      cy.getByDataHook("tab-preview-keep-open").click()
      // Then
      cy.getEditorTabByTitle("markets")
        .should("not.have.class", "temporary-tab")
        .and("have.attr", "active")
      cy.get(".searchHighlight").should("not.exist")
      cy.getSearchResultGroups().should("not.contain", "closed")
    })
  })

  describe("search with closed tabs", () => {
    beforeEach(() => {
      // Given two open tabs and one archived tab
      loadSearchConsole([
        {
          value:
            "SELECT symbol, avg(return_pct) as avg_return FROM portfolio_returns;",
        },
        {
          value: "DROP TABLE IF EXISTS portfolio_positions;",
          archived: true,
          archivedAt: Date.now(),
        },
        {
          value:
            "CREATE TABLE portfolio_positions (symbol SYMBOL, risk_score DOUBLE);",
        },
      ])

      cy.openSearchPanel()
    })

    it("should preview the closed tab when result is clicked", () => {
      cy.searchFor("DROP")

      cy.getSearchResults().contains("DROP").click()

      // Should preview the closed tab
      cy.getEditorTabs().should("have.length", 3)
      cy.getEditorTabByTitle("SQL 1").should("have.class", "temporary-tab")
      cy.getEditorTabByTitle("SQL 1").should("have.attr", "active")
      cy.getEditor().should("contain", "DROP")
      cy.getEditor().should("contain", "TABLE")
      cy.getEditor().get(".searchHighlight").should("be.visible")

      cy.getSearchResults().contains("DROP").dblclick()

      // double click keeps the preview; only the preview bar promotes it
      cy.getEditorTabByTitle("SQL 1").should("have.class", "temporary-tab")
      cy.getEditorTabByTitle("SQL 1").should("have.attr", "active")
      cy.getByDataHook("tab-preview-bar").should("be.visible")

      // the preview is read-only: clicking and typing change nothing
      cy.getEditor().realClick()
      cy.realType("XYZ")
      cy.getEditor().should("not.contain", "XYZ")
      cy.getEditorTabByTitle("SQL 1").should("have.class", "temporary-tab")

      cy.getByDataHook("tab-preview-keep-open").click()

      cy.getByDataHook("tab-preview-bar").should("not.exist")
      cy.getEditor().get(".searchHighlight").should("not.exist")
      cy.getEditorTabByTitle("SQL 1").should("not.have.class", "temporary-tab")
      cy.getEditorTabByTitle("SQL 1").should("have.attr", "active")

      cy.window().then((win) => {
        const editor = win.monaco.editor.getEditors()[0]
        editor.setPosition({ lineNumber: 1, column: 1 })
        editor.trigger("test", "type", { text: "-- restored\n" })
      })
      cy.waitForActiveBufferValue(
        "-- restored\nDROP TABLE IF EXISTS portfolio_positions;",
      )
    })

    it("should focus the editor after keeping the preview open", () => {
      cy.searchFor("DROP")

      cy.getSearchResults().contains("DROP").click()
      cy.getEditorTabByTitle("SQL 1").should("have.class", "temporary-tab")

      cy.getByDataHook("tab-preview-keep-open").realClick()

      cy.getByDataHook("tab-preview-bar").should("not.exist")
      cy.getEditorTabByTitle("SQL 1").should("not.have.class", "temporary-tab")
      // typing right away goes into the kept tab, no click needed
      cy.focused().should("have.class", "inputarea")
      cy.realType("XYZ")
      cy.getEditor().should("contain", "XYZ")
    })

    it("moves focus to Keep open when a closed match is opened with Enter", () => {
      // Given a match in a closed tab, selected in the results
      cy.searchFor("DROP")
      cy.getSearchResults().contains("DROP").click()
      cy.getEditorTabByTitle("SQL 1").should("have.class", "temporary-tab")

      // When the user presses Enter on it
      cy.realPress("Enter")

      // Then the read-only preview hands focus to its Keep open button
      cy.getByDataHook("tab-preview-bar").should("be.visible")
      cy.focused().should("have.attr", "data-hook", "tab-preview-keep-open")

      // And Enter keeps the tab open
      cy.realPress("Enter")
      cy.getByDataHook("tab-preview-bar").should("not.exist")
      cy.getEditorTabByTitle("SQL 1").should("not.have.class", "temporary-tab")
    })

    it("should close the preview from the preview bar", () => {
      cy.searchFor("DROP")

      cy.getSearchResults().contains("DROP").click()
      cy.getEditorTabByTitle("SQL 1").should("have.class", "temporary-tab")

      cy.getByDataHook("tab-preview-close").click()

      cy.getByDataHook("tab-preview-bar").should("not.exist")
      cy.getEditorTabs().should("have.length", 2)
      cy.getEditorTabByTitle("SQL 1").should("not.exist")
    })
  })

  describe("title matching functionality", () => {
    it("should navigate between metrics and editor without losing focus", () => {
      // Given a metrics tab and a SQL tab
      loadSearchConsole([
        {},
        { label: "trades", metricsViewState: {} },
        { value: "SELECT symbol, price FROM trades WHERE symbol = 'BTC-USD';" },
      ])

      // Navigate to the "trades" tab
      cy.getEditorTabByTitle("trades").find(".chrome-tab-drag-handle").click()
      cy.getByDataHook("metrics-root").should("be.visible")

      // Search for "trades"
      cy.openSearchPanel()
      cy.searchFor("trades")
      cy.getByDataHook("search-summary").should(
        "contain",
        "2 results in 2 tabs",
      )

      // Click on metrics tab result
      cy.getByDataHook("search-result-title-match").click()
      cy.getByDataHook("metrics-root").should("be.visible")
      // Navigate to editor tab result
      cy.realPress("ArrowDown")
      cy.focused().closest('[role="tree"]').should("be.visible")
      cy.getEditor().should("be.visible")
      // Search result should not lose focus
      cy.getByDataHook("search-result-buffer-group").should(
        "have.attr",
        "data-active",
        "true",
      )

      // Go back to metrics result
      cy.realPress("ArrowUp")
      cy.focused().closest('[role="tree"]').should("be.visible")
      cy.getByDataHook("search-result-title-match").should(
        "have.attr",
        "data-active",
        "true",
      )
      // Close editor tab
      cy.getEditorTabs().eq(2).find(".chrome-tab-close").click()
      cy.getByDataHook("search-result-title-match").click()
      // Navigate to editor tab result
      cy.realPress("ArrowDown")
      cy.focused().closest('[role="tree"]').should("be.visible")
      cy.getEditor().should("be.visible")
      // Focus should be on search results
      cy.getByDataHook("search-result-buffer-group").should(
        "have.attr",
        "data-active",
        "true",
      )

      cy.focused().closest('[role="tree"]').should("be.visible")
    })
  })
})

describe("search browser navigation", () => {
  it("switches panels, focuses search, and closes the active panel", () => {
    cy.loadConsoleWithAuth()

    // Data sources panel should be visible by default
    cy.getByDataHook("tables-panel-button").should(
      "have.attr",
      "data-selected",
      "true",
    )
    cy.getByDataHook("schema-tree").should("be.visible")

    // Search panel should be hidden by default
    cy.getByDataHook("search-panel-button").should(
      "have.attr",
      "data-selected",
      "false",
    )
    cy.getByDataHook("search-input").should("not.be.visible")

    // Initially data sources is open
    cy.getByDataHook("schema-tree").should("be.visible")
    cy.getByDataHook("search-input").should("not.be.visible")

    // Open search panel (should close data sources)
    cy.getByDataHook("search-panel-button").click()
    cy.getByDataHook("search-panel-button").should(
      "have.attr",
      "data-selected",
      "true",
    )
    cy.getByDataHook("search-input").should("be.visible")
    cy.getByDataHook("schema-tree").should("not.be.visible")
    cy.getByDataHook("tables-panel-button").should(
      "have.attr",
      "data-selected",
      "false",
    )
    cy.getByDataHook("search-input").should("be.focused")

    // Then open data sources panel (should close search)
    cy.getByDataHook("tables-panel-button").click()
    cy.getByDataHook("tables-panel-button").should(
      "have.attr",
      "data-selected",
      "true",
    )
    cy.getByDataHook("schema-tree").should("be.visible")
    cy.getByDataHook("search-input").should("not.be.visible")
    cy.getByDataHook("search-panel-button").should(
      "have.attr",
      "data-selected",
      "false",
    )

    // Open search panel
    cy.getByDataHook("search-panel-button").click()
    cy.getByDataHook("search-input").should("be.visible")

    // Close search panel by clicking again
    cy.getByDataHook("search-panel-button").click()
    cy.getByDataHook("search-panel-button").should(
      "have.attr",
      "data-selected",
      "false",
    )
    cy.getByDataHook("search-input").should("not.be.visible")

    // No panel should be visible
    cy.getByDataHook("schema-tree").should("not.be.visible")
  })
  it("reveals distant lines and navigates beyond the visible result window", () => {
    cy.loadConsoleWithAuth()

    cy.clearEditor()
    let longContent = ""
    for (let i = 0; i < 100; i++) {
      longContent += `-- Trading day ${i}: SELECT timestamp, symbol, price, volume FROM trades_${i} WHERE price > (SELECT avg(price) FROM trades_${i});\n`
    }
    cy.typeQueryDirectly(
      longContent +
        "-- Final aggregation: SELECT symbol, vwap(price, volume) FROM all_trades_consolidated GROUP BY symbol",
    )

    cy.openSearchPanel()
    cy.searchFor("all_trades_consolidated")

    cy.getSearchResults().should("have.length", 1)
    cy.getSearchResults()
      .find('[data-hook="search-result-line-number"]')
      .should("contain", "101")

    cy.getSearchResults().first().click()

    cy.get(".view-lines").should("contain", "all_trades_consolidated")
    cy.window().should((win) =>
      expect(
        win.monaco.editor
          .getEditors()[0]
          .getVisibleRanges()
          .some(
            (range) =>
              range.startLineNumber <= 101 && range.endLineNumber >= 101,
          ),
      ).to.eq(true),
    )

    cy.searchFor("Trading day \\d+")
    cy.getByDataHook("search-option-regex").click()
    cy.getByDataHook("search-summary").should("contain", "100 results in 1 tab")
    cy.getByDataHook("search-result-buffer-group").click()
    for (let i = 0; i < 25; i++) {
      cy.realPress("ArrowDown")
      cy.get('[data-hook="search-result-match"][data-active="true"]')
        .should("contain", `Trading day ${i}`)
        .find("mark")
        .should("contain", `Trading day ${i}`)
      cy.get('[data-hook="search-result-match"][data-active="true"]')
        .find('[data-hook="search-result-line-number"]')
        .should("have.text", `${i + 1}`)
      cy.get('[data-hook="search-result-match"][data-active="true"]')
        .find("mark")
        .should("have.text", `Trading day ${i}`)
      cy.window().should((win) => {
        expect(
          win.monaco.editor
            .getEditors()[0]
            .getVisibleRanges()
            .some(
              (range) =>
                range.startLineNumber <= i + 1 && range.endLineNumber >= i + 1,
            ),
        ).to.eq(true)
      })
    }

    // When an invalid regex is searched while regex mode is on
    cy.getByDataHook("search-option-regex").should(
      "have.attr",
      "aria-pressed",
      "true",
    )
    cy.searchFor("[invalid-regex")
    // Then the worker's regex error is shown and no results remain
    cy.getByDataHook("search-error")
      .should("be.visible")
      .and("contain", "Invalid regular expression")
    cy.getSearchResults().should("not.exist")
    // When the regex becomes valid again
    cy.searchFor("Trading day 99:")
    // Then the error clears and results return
    cy.getByDataHook("search-error").should("not.exist")
    cy.getByDataHook("search-summary").should("contain", "1 result in 1 tab")
    cy.getSearchResults().should("have.length", 1)
  })
  it("activates a matching tab and updates the title match after rename", () => {
    loadSearchConsole([
      { label: "markets", value: "SELECT * FROM market_data_staging" },
      {},
    ])
    cy.openSearchPanel()

    cy.searchFor("market")

    cy.getByDataHook("search-summary").should("contain", "2 results in 1 tab")
    cy.getByDataHook("search-result-buffer-group")
      .find("mark")
      .should("be.visible")

    cy.getByDataHook("search-result-buffer-group").click()
    cy.getEditorTabByTitle("markets").should("have.attr", "active")
    cy.window().should((win) =>
      expect(win.monaco.editor.getEditors()[0].getValue()).to.eq(
        "SELECT * FROM market_data_staging",
      ),
    )
    cy.getEditorTabByTitle("markets").should("have.attr", "active")
    cy.getEditorTabByTitle("markets").find(".chrome-tab-drag-handle").dblclick()

    cy.get(".chrome-tab[active]")
      .find(".chrome-tab-rename")
      .should("be.visible")
      .type("changed!{enter}")

    cy.getByDataHook("search-summary").should("contain", "1 result in 1 tab")
    cy.getByDataHook("search-result-buffer-group")
      .find("mark")
      .should("not.exist")
  })
  it("restores an archived tab from its result header and keeps it after reload", () => {
    // Given an archived query
    loadSearchConsole([
      {},
      {
        label: "order entry",
        value: "INSERT INTO orders VALUES(now(), 'BTC-USD', 1.5);",
        archived: true,
        archivedAt: Date.now(),
      },
    ])

    // When previewing its search result
    cy.openSearchPanel()
    cy.searchFor("order")

    cy.getByDataHook("search-result-buffer-group").click()

    cy.getEditorTabByTitle("order entry").should("have.class", "temporary-tab")

    cy.getByDataHook("search-result-buffer-group").dblclick()

    cy.getEditorTabByTitle("order entry").should("have.class", "temporary-tab")

    // Then keeping it open from the preview bar makes it permanent
    cy.getByDataHook("tab-preview-keep-open").click()

    cy.getEditorTabByTitle("order entry").should(
      "not.have.class",
      "temporary-tab",
    )
    cy.getEditorTabByTitle("order entry").should("have.attr", "active")

    cy.getEditorContent().should(
      "have.value",
      "INSERT INTO orders VALUES(now(), 'BTC-USD', 1.5);",
    )
    cy.waitForActiveBufferValue(
      "INSERT INTO orders VALUES(now(), 'BTC-USD', 1.5);",
    )
    cy.reload()
    cy.getEditorTabByTitle("order entry")
      .should("not.have.class", "temporary-tab")
      .and("have.attr", "active")
  })
})

describe("search while a script runs", () => {
  it("keeps the editor read-only when a match in the running tab is opened", () => {
    // Given a script the user has just written, whose first statement is held
    // in flight (the edit gives the tab list a newer copy of the buffer than
    // the active one, which a re-activation then swaps in)
    const script = "select 1;\nselect 'needle';"
    loadSearchConsole([{ value: "" }])
    cy.getEditorContent().should("be.visible")
    cy.window().then((win) =>
      win.monaco.editor.getEditors()[0].setValue(script),
    )
    cy.waitForActiveBufferValue(script)
    let release
    cy.intercept(
      { url: "**/exec*", query: { explain: "true" }, times: 1 },
      () =>
        new Cypress.Promise((resolve) => {
          release = resolve
        }),
    )
    const readOnly = () =>
      cy.window().then((win) => {
        const editor = win.monaco.editor.getEditors()[0]
        return editor.getOption(win.monaco.editor.EditorOption.readOnly)
      })
    cy.clickRunScript()
    cy.getByDataHook("button-cancel-script").should("be.visible")
    cy.wrap(null).should(() => expect(release).to.be.a("function"))
    readOnly().should("eq", true)

    // When the user opens a search match in the running tab
    cy.openSearchPanel()
    cy.searchFor("needle")
    cy.getSearchResults().should("have.length", 1)
    cy.getSearchResults().first().click()
    cy.get(".searchHighlight").should("be.visible")

    // Then the editor stays locked and typing does not change the script
    readOnly().should("eq", true)
    cy.getEditorContent().type("XYZ", { force: true })
    cy.window().then((win) => {
      expect(win.monaco.editor.getEditors()[0].getValue()).to.eq(script)
    })

    // And it unlocks once the script ends
    cy.then(() => release())
    cy.getByDataHook("button-cancel-script").should("not.exist")
    readOnly().should("eq", false)
  })
})
