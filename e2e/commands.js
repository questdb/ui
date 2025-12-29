require("cypress-real-events");

require("@4tw/cypress-drag-drop");

const { ctrlOrCmd, escapeRegExp } = require("./utils");

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || "";
const baseUrl = `http://localhost:9999${contextPath}`;

const tableSchemas = {
  btc_trades:
    "CREATE TABLE IF NOT EXISTS 'btc_trades' (symbol SYMBOL capacity 256 CACHE, side SYMBOL capacity 256 CACHE, price DOUBLE, amount DOUBLE, timestamp TIMESTAMP) timestamp (timestamp) PARTITION BY DAY WAL DEDUP UPSERT KEYS(symbol, price, amount, timestamp);",
  chicago_weather_stations:
    "CREATE TABLE IF NOT EXISTS 'chicago_weather_stations' (MeasurementTimestamp TIMESTAMP, StationName SYMBOL capacity 256 CACHE, AirTemperature DOUBLE, WetBulbTemperature DOUBLE, Humidity INT, RainIntensity DOUBLE, IntervalRain DOUBLE, TotalRain DOUBLE, PrecipitationType INT, WindDirection INT, WindSpeed DOUBLE, MaximumWindSpeed DOUBLE, BarometricPressure DOUBLE, SolarRadiation INT, Heading INT, BatteryLife DOUBLE, MeasurementTimestampLabel STRING, MeasurementID STRING) timestamp (MeasurementTimestamp) PARTITION BY MONTH WAL DEDUP UPSERT KEYS(MeasurementTimestamp, StationName);",
  ecommerce_stats:
    "CREATE TABLE IF NOT EXISTS 'ecommerce_stats' (ts TIMESTAMP, country SYMBOL capacity 256 CACHE, category SYMBOL capacity 256 CACHE, visits LONG, unique_visitors LONG, sales DOUBLE,  number_of_products INT) timestamp (ts) PARTITION BY DAY WAL DEDUP UPSERT KEYS(ts, country, category);",
  gitlog:
    "CREATE TABLE IF NOT EXISTS 'gitlog' (committed_datetime TIMESTAMP, repo SYMBOL capacity 256 CACHE, author_name SYMBOL capacity 256 CACHE, summary STRING, size INT, insertions INT, deletions INT, lines INT, files INT) timestamp (committed_datetime) PARTITION BY MONTH WAL DEDUP UPSERT KEYS(committed_datetime, repo, author_name);",
  my_publics: "CREATE TABLE IF NOT EXISTS 'my_publics' (public STRING);",
  my_secrets: "CREATE TABLE IF NOT EXISTS 'my_secrets' (secret STRING);",
  my_secrets2: "CREATE TABLE IF NOT EXISTS 'my_secrets2' (secret STRING);",
  contains_magicword:
    "CREATE TABLE IF NOT EXISTS 'contains_magicword' (ts TIMESTAMP, magicword VARCHAR) timestamp (ts) PARTITION BY DAY;",
  contains_simpleword:
    "CREATE TABLE IF NOT EXISTS 'contains_simpleword' (timestamp TIMESTAMP, simpleword VARCHAR) timestamp (timestamp) PARTITION BY DAY;",
};

const materializedViewSchemas = {
  btc_trades_mv:
    "CREATE MATERIALIZED VIEW IF NOT EXISTS btc_trades_mv WITH BASE btc_trades as (" +
    "SELECT timestamp, avg(amount) avg FROM btc_trades SAMPLE BY 1m) PARTITION BY week;",
};

before(() => {
  Cypress.on("uncaught:exception", (err) => {
    // this error can be safely ignored
    if (err.message.includes("ResizeObserver loop")) {
      return false;
    }
  });

  indexedDB.deleteDatabase("web-console");
});

beforeEach(() => {
  cy.intercept(
    {
      method: "GET",
      url: "/github/latest",
      hostname: "github-api.questdb.io",
    },
    (req) => {
      req.reply("{}");
    }
  );

  cy.intercept(
    {
      method: "POST",
      url: "/**",
      hostname: "fara.questdb.io",
    },
    (req) => {
      req.reply("{}");
    }
  ).as("addTelemetry");

  cy.intercept(
    {
      method: "POST",
      url: "/**",
      hostname: "alurin.questdb.io",
    },
    (req) => {
      req.reply("{}");
    }
  ).as("addTelemetry");

  cy.intercept(
    {
      method: "GET",
      url: "/api/news*",
      hostname: "cloud.questdb.com",
    },
    (req) => {
      req.reply("[]");
    }
  );
});

Cypress.Commands.add("clearSimulatedWarnings", () => {
  cy.execQuery("select simulate_warnings('', '');");
});

Cypress.Commands.add("getByDataHook", (name) =>
  cy.get(`[data-hook="${name}"]`)
);

Cypress.Commands.add("getByRole", (name) => cy.get(`[role="${name}"]`));

Cypress.Commands.add("getGrid", () =>
  cy.get(".qg-viewport .qg-canvas").should("be.visible")
);

Cypress.Commands.add("getGridViewport", () => cy.get(".qg-viewport"));

Cypress.Commands.add("getGridRow", (n) =>
  cy.get(".qg-r").filter(":visible").eq(n)
);

Cypress.Commands.add("getColumnName", (n) =>
  cy.get(".qg-header-name").eq(n).invoke("text")
);

Cypress.Commands.add("getGridCol", (n) =>
  cy.get(".qg-c").filter(":visible").eq(n)
);

Cypress.Commands.add("getGridRows", () => cy.get(".qg-r").filter(":visible"));

Cypress.Commands.add("typeQuery", (query) =>
  cy.getEditor().realClick().type(query)
);

Cypress.Commands.add("typeQueryDirectly", (query) => {
  cy.window().then((win) => {
    const monacoEditor = win.monaco.editor.getEditors()[0];
    monacoEditor.setValue(query);
  });
});

Cypress.Commands.add("runLine", () => {
  cy.intercept("/exec*").as("exec");
  cy.typeQuery(`${ctrlOrCmd}{enter}`);
  cy.wait("@exec");
});

Cypress.Commands.add("runLineWithResponse", (response) => {
  cy.intercept("/exec*", response).as("exec");
  cy.typeQuery(`${ctrlOrCmd}{enter}`);
  cy.wait("@exec");
});

Cypress.Commands.add("clickLine", (n) => {
  cy.window().then((win) => {
    const monacoEditor = win.monaco.editor.getEditors()[0];
    monacoEditor.revealLine(n);
    monacoEditor.setPosition({
      lineNumber: n,
      column: monacoEditor.getModel().getLineMaxColumn(n),
    });
  });
  cy.get(".active-line-number").should("contain", n);
});

Cypress.Commands.add("scrollToLine", (n) => {
  cy.window().then((win) => {
    const monacoEditor = win.monaco.editor.getEditors()[0];
    monacoEditor.revealLine(n);
  });
});

Cypress.Commands.add("clearEditor", () => {
  cy.window().then((win) => {
    const monacoEditor = win.monaco.editor.getEditors()[0];
    monacoEditor.setValue("");
    monacoEditor.focus();
  });
});

Cypress.Commands.add("selectQuery", (n) =>
  cy
    .contains("Example queries")
    .first()
    .click()
    .get('[class^="QueryPicker__Wrapper"] [class^="Row__Wrapper"]')
    .eq(n)
    .click()
);

Cypress.Commands.add("getMountedEditor", () =>
  cy.get(".monaco-scrollable-element")
);

Cypress.Commands.add("getEditor", () => cy.get(".monaco-editor.vs-dark"));

Cypress.Commands.add("getEditorContent", () =>
  cy.get(".monaco-editor").find("textarea").should("be.visible")
);

Cypress.Commands.add("getEditorHitbox", () =>
  cy.get(".monaco-editor .view-lines")
);

Cypress.Commands.add("getAutocomplete", () =>
  cy.get('[widgetid="editor.widget.suggestWidget"]')
);

Cypress.Commands.add("getMonacoListRow", () => cy.get(".monaco-list-row"));

Cypress.Commands.add("getErrorMarker", () => cy.get(".squiggly-error"));

Cypress.Commands.add("getCursorQueryDecoration", () =>
  cy.get(".cursorQueryDecoration")
);

Cypress.Commands.add("getCursorQueryGlyph", () => cy.get(".glyph-widget-container"));

Cypress.Commands.add("getRunIconInLine", (lineNumber) => {
  cy.getCursorQueryGlyph().should("be.visible");
  const selector = `.glyph-widget-${lineNumber}`;
  return cy.get(selector).find(".glyph-run-icon").first();
});

Cypress.Commands.add("getAIIconInLine", (lineNumber) => {
  const selector = `.glyph-widget-${lineNumber}`;
  cy.get(selector).should("be.visible");
  return cy.get(selector).find(".glyph-ai-icon").first();
});

Cypress.Commands.add("getCancelIconInLine", (lineNumber) => {
  const selector = `.glyph-widget-${lineNumber}`;
  cy.get(selector).should("be.visible");
  return cy.get(selector).find(".glyph-run-icon.cancel");
});

Cypress.Commands.add("getSuccessIcons", () => cy.get(".glyph-run-icon.success"));

Cypress.Commands.add("getErrorIcons", () => cy.get(".glyph-run-icon.error"));

Cypress.Commands.add("openRunDropdownInLine", (lineNumber) => {
  cy.getRunIconInLine(lineNumber).rightclick({ force: true });
});

Cypress.Commands.add("clickRunIconInLine", (lineNumber) => {
  cy.getRunIconInLine(lineNumber).click({ force: true });
});

Cypress.Commands.add("clickDropdownRunQuery", () => {
  cy.intercept("/exec*").as("exec");
  return cy.getByDataHook("dropdown-item-run-query").click().wait("@exec");
});

Cypress.Commands.add("clickDropdownGetQueryPlan", () => {
  cy.intercept("/exec*").as("exec");
  return cy.getByDataHook("dropdown-item-get-query-plan").click().wait("@exec");
});

Cypress.Commands.add("clickRunQuery", () => {
  cy.intercept("/exec*").as("exec");
  cy.getByDataHook("button-run-query")
    .should("not.be.disabled")
    .click()
    .wait("@exec");
});

Cypress.Commands.add("clickRunScript", (continueOnFailure = false) => {
  cy.getEditor().should("be.visible");
  cy.getByDataHook("button-run-query-dropdown").click();
  cy.getByDataHook("button-run-script").click();

  cy.getByRole("dialog").should("be.visible");
  if (continueOnFailure) {
    cy.getByDataHook("stop-after-failure-checkbox").uncheck();
  }
  cy.getByDataHook("run-all-queries-confirm").click();
});

const numberRangeRegexp = (n, width = 3) => {
  const [min, max] = [n - width, n + width];
  const numbers = Array.from(
    { length: Math.abs(max - min) },
    (_, i) => min + i
  );
  return `(${numbers.join("|")})`;
};

Cypress.Commands.add("matchErrorMarkerPosition", ({ left, width }) =>
  cy
    .getErrorMarker()
    .should("have.attr", "style")
    .and(
      "match",
      new RegExp(
        `left:${numberRangeRegexp(left)}px;width:${numberRangeRegexp(width)}px;`
      )
    )
);

Cypress.Commands.add("F9", () => {
  cy.intercept("/exec*").as("exec");
  return cy.getEditor().realPress("F9").wait("@exec").wait(501);
});

Cypress.Commands.add("getSelectedLines", () => cy.get(".selected-text"));

Cypress.Commands.add("selectRange", (startPos, endPos) => {
  cy.window().then((win) => {
    const monacoEditor = win.monaco.editor.getEditors()[0];
    monacoEditor.setSelection({
      startLineNumber: startPos.lineNumber,
      startColumn: startPos.column,
      endLineNumber: endPos.lineNumber,
      endColumn: endPos.column,
    });
  });
});

Cypress.Commands.add("getVisibleLines", () => cy.get(".view-lines"));

Cypress.Commands.add("expandNotifications", () =>
  cy.get('[data-hook="expand-notifications"]').click()
);

Cypress.Commands.add("collapseNotifications", () => {
  cy.get('[data-hook="collapse-notifications"]').click();
  cy.get('[data-hook="notifications-collapsed"]').should("be.visible");
});

Cypress.Commands.add("getCollapsedNotifications", () =>
  cy.get('[data-hook="notifications-collapsed"]')
);

Cypress.Commands.add("getExpandedNotifications", () =>
  cy.get('[data-hook="notifications-expanded"]')
);

Cypress.Commands.add("execQuery", (query) => {
  const authHeader = localStorage.getItem("basic.auth.header");
  cy.request({
    method: "GET",
    url: `${baseUrl}/exec?query=${encodeURIComponent(query)};`,
    headers: {
      Authorization: authHeader,
    },
  });
});

Cypress.Commands.add("createTable", (name) => {
  cy.execQuery(tableSchemas[name]);
});

Cypress.Commands.add("createMaterializedView", (name) => {
  cy.execQuery(materializedViewSchemas[name]);
});

Cypress.Commands.add("dropTable", (name) => {
  cy.execQuery(`DROP TABLE ${name};`);
});

Cypress.Commands.add("dropTableIfExists", (name) => {
  cy.execQuery(`DROP TABLE IF EXISTS ${name};`);
});

Cypress.Commands.add("dropMaterializedView", (name) => {
  cy.execQuery(`DROP MATERIALIZED VIEW ${name};`);
});

Cypress.Commands.add("interceptQuery", (query, alias, response) => {
  cy.intercept(
    {
      method: "GET",
      url: new RegExp(
        `^${escapeRegExp(baseUrl)}\/exec.*query=${encodeURIComponent(
          escapeRegExp(query)
        )}`,
        "gmi"
      ),
    },
    response
  ).as(alias);
});

Cypress.Commands.add(
  "loginWithUserAndPassword",
  (username = "admin", password = "quest") => {
    cy.getByDataHook("auth-login").should("be.visible");
    cy.get("input[name='username']").type(username);
    cy.get("input[type='password']").type(password);
    cy.get("button[type='submit']").click();

    cy.getEditor().should("be.visible");
  }
);

Cypress.Commands.add(
  "handleStorageAndVisit",
  (url, clearLocalStorage = true, localStorageItems = {}) => {
    cy.visit(url, {
      onBeforeLoad: (win) => {
        if (clearLocalStorage) {
          win.localStorage.clear();
        }
        for (const [key, value] of Object.entries(localStorageItems)) {
          win.localStorage.setItem(key, value);
        }
        win.indexedDB.deleteDatabase("web-console");
      },
    });
  }
);

Cypress.Commands.add(
  "loadConsoleWithAuth",
  (clearWarnings = false, localStorageItems = {}) => {
    cy.handleStorageAndVisit(baseUrl, true, localStorageItems);
    cy.loginWithUserAndPassword();
    if (clearWarnings) {
      cy.clearSimulatedWarnings();
      cy.handleStorageAndVisit(baseUrl, false, localStorageItems);
      cy.getEditor().should("be.visible");
    }
  }
);

Cypress.Commands.add(
  "loadConsoleAsAdminAndCreateSSOGroup",
  (group, externalGroup = undefined) => {
    cy.loadConsoleWithAuth(true);

    cy.executeSQL(
      `CREATE GROUP '${group}' WITH EXTERNAL ALIAS '${externalGroup || group}';`
    );
    cy.getByDataHook("success-notification").should("be.visible");
    cy.executeSQL(`GRANT HTTP TO '${group}';`);
    cy.getByDataHook("success-notification").should("be.visible");

    cy.logout();
  }
);

Cypress.Commands.add(
  "loadConsoleAsAdminAndCreateDBUser",
  (username, password = "pwd") => {
    cy.loadConsoleWithAuth(true);

    cy.executeSQL(`create user '${username}' with password '${password}'`);
    cy.getByDataHook("success-notification").should("be.visible");
    cy.executeSQL(`grant HTTP to '${username}'`);
    cy.getByDataHook("success-notification").should("be.visible");

    cy.logout();
  }
);

Cypress.Commands.add("logout", () => {
  cy.getByDataHook("button-logout").click();
  cy.getByDataHook("auth-login").should("be.visible");
});

Cypress.Commands.add("executeSQL", (sql) => {
  cy.clearEditor();
  cy.typeQuery(sql);
  cy.intercept("/exec*").as("exec");
  cy.clickRunIconInLine(1);
  cy.wait("@exec");
});

Cypress.Commands.add("refreshSchema", () => {
  // toggle between auto-refresh modes to trigger a schema refresh
  cy.getByDataHook("schema-auto-refresh-button").click();
  cy.getByDataHook("schema-auto-refresh-button").click();
});

Cypress.Commands.add("expandTables", () => {
  cy.get("body").then((body) => {
    if (body.find('[data-hook="expand-tables"]').length > 0) {
      cy.get('[data-hook="expand-tables"]').dblclick({ force: true });
    }
  });
});

Cypress.Commands.add("collapseTables", () => {
  cy.get("body").then((body) => {
    if (body.find('[data-hook="collapse-tables"]').length > 0) {
      cy.get('[data-hook="collapse-tables"]').dblclick({ force: true });
    }
  });
});

Cypress.Commands.add("expandMatViews", () => {
  cy.get("body").then((body) => {
    if (body.find('[data-hook="expand-materialized-views"]').length > 0) {
      cy.get('[data-hook="expand-materialized-views"]').dblclick({
        force: true,
      });
    }
  });
});

Cypress.Commands.add("collapseMatViews", () => {
  cy.get("body").then((body) => {
    if (body.find('[data-hook="collapse-materialized-views"]').length > 0) {
      cy.get('[data-hook="collapse-materialized-views"]').dblclick({
        force: true,
      });
    }
  });
});

Cypress.Commands.add("getEditorTabs", () => {
  return cy.get(".chrome-tab");
});

Cypress.Commands.add("getEditorTabByTitle", (title) => {
  return cy.get(`.chrome-tab[data-tab-title="${title}"]`);
});

Cypress.Commands.add("openSearchPanel", () => {
  cy.getByDataHook("search-panel-button").then(($btn) => {
    if ($btn.attr("data-selected") === "false") {
      cy.wrap($btn).click();
    }
  });
  cy.getByDataHook("search-input").should("be.visible");
});

Cypress.Commands.add("closeSearchPanel", () => {
  cy.getByDataHook("search-panel-button").then(($btn) => {
    if ($btn.attr("data-selected") === "true") {
      cy.wrap($btn).click();
    }
  });
  cy.getByDataHook("search-input").should("not.be.visible");
});

Cypress.Commands.add("ensureDataSourcesPanel", () => {
  cy.getByDataHook("tables-panel-button").then(($btn) => {
    if ($btn.attr("data-selected") === "false") {
      cy.wrap($btn).click();
    }
  });
  cy.getByDataHook("schema-tree").should("be.visible");
});

Cypress.Commands.add("searchFor", (query) => {
  cy.getByDataHook("search-input").clear().type(query);
  cy.wait(400); // Wait for debounce
});

Cypress.Commands.add("toggleSearchOption", (option) => {
  const hooks = {
    caseSensitive: "search-option-case-sensitive",
    wholeWord: "search-option-whole-word",
    useRegex: "search-option-regex",
    includeDeleted: "search-option-include-closed",
  };
  cy.getByDataHook(hooks[option]).realHover();
  cy.getByDataHook(hooks[option]).click({ force: true });
});

Cypress.Commands.add("getSearchResults", () => {
  return cy.getByDataHook("search-result-match");
});

Cypress.Commands.add("getSearchResultGroups", () => {
  return cy.getByDataHook("search-result-buffer-group");
});

Cypress.Commands.add("createTabWithContent", (content, title) => {
  cy.getByDataHook("new-tab-button").click();
  cy.get(".chrome-tab-was-just-added").should("be.visible");
  cy.get(".chrome-tab-was-just-added").should("not.exist");
  cy.typeQueryDirectly(content);

  if (title) {
    cy.get(".chrome-tab[active] .chrome-tab-drag-handle").dblclick();
    cy.get(".chrome-tab[active] .chrome-tab-rename")
      .should("be.visible")
      .type(title + "{enter}");
    cy.get(".chrome-tab[active] .chrome-tab-rename").should("not.be.visible");
  }
});
