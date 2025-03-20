const {
  addMatchImageSnapshotCommand,
} = require("@simonsmith/cypress-image-snapshot/command");

require("cypress-real-events");

require("@4tw/cypress-drag-drop");

addMatchImageSnapshotCommand({
  failureThreshold: 0.3,
  blackout: [".notifications", 'button[class*="BuildVersion"'],
});

const { ctrlOrCmd, escapeRegExp } = require("./utils");

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
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
};

const materializedViewSchemas = {
  btc_trades_mv:
    "CREATE MATERIALIZED VIEW IF NOT EXISTS btc_trades_mv WITH BASE btc_trades as (" +
    "SELECT timestamp, avg(amount) FROM btc_trades SAMPLE BY 1m) PARTITION BY week;",
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
  cy.typeQuery("select simulate_warnings('', '');");
  cy.clickRun();
});

Cypress.Commands.add("getByDataHook", (name) =>
  cy.get(`[data-hook="${name}"]`)
);

Cypress.Commands.add("getGrid", () =>
  cy.get(".qg-viewport .qg-canvas").should("be.visible")
);

Cypress.Commands.add("getGridViewport", () => cy.get(".qg-viewport"));

Cypress.Commands.add("getGridRow", (n) =>
  cy.get(".qg-r").filter(":visible").eq(n)
);

Cypress.Commands.add("getGridCol", (n) =>
  cy.get(".qg-c").filter(":visible").eq(n)
);

Cypress.Commands.add("getGridRows", () => cy.get(".qg-r").filter(":visible"));

Cypress.Commands.add("typeQuery", (query) =>
  cy.getEditor().realClick().type(query)
);

Cypress.Commands.add("runLine", () => {
  cy.intercept("/exec*").as("exec");
  cy.typeQuery(`${ctrlOrCmd}{enter}`);
  cy.wait("@exec");
});

Cypress.Commands.add("clickRun", () => {
  cy.intercept("/exec*").as("exec");
  return cy.get("button").contains("Run").click().wait("@exec");
});

Cypress.Commands.add("clearEditor", () =>
  cy.typeQuery(`${ctrlOrCmd}a{backspace}`)
);

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

Cypress.Commands.add("getEditor", () => cy.get(".monaco-editor[role='code'] "));

Cypress.Commands.add("getEditorContent", () =>
  cy.get(".monaco-editor textarea")
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

Cypress.Commands.add("getCursorQueryGlyph", () => cy.get(".cursorQueryGlyph"));

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

Cypress.Commands.add("getVisibleLines", () => cy.get(".view-lines"));

Cypress.Commands.add("getCollapsedNotifications", () =>
  cy.get('[data-hook="notifications-collapsed"]')
);

Cypress.Commands.add("getExpandedNotifications", () =>
  cy.get('[data-hook="notifications-expanded"]')
);

Cypress.Commands.add("createTable", (name) => {
  const authHeader = localStorage.getItem("basic.auth.header");
  cy.request({
    method: "GET",
    url: `${baseUrl}/exec?query=${encodeURIComponent(tableSchemas[name])};`,
    headers: {
      Authorization: authHeader,
    },
  });
});

Cypress.Commands.add("createMaterializedView", (name) => {
  const authHeader = localStorage.getItem("basic.auth.header");
  cy.request({
    method: "GET",
    url: `${baseUrl}/exec?query=${encodeURIComponent(
      materializedViewSchemas[name]
    )};`,
    headers: {
      Authorization: authHeader,
    },
  });
});

Cypress.Commands.add("dropTable", (name) => {
  const authHeader = localStorage.getItem("basic.auth.header");
  cy.request({
    method: "GET",
    url: `${baseUrl}/exec?query=${encodeURIComponent(`DROP TABLE ${name};`)}`,
    headers: {
      Authorization: authHeader,
    },
  });
});

Cypress.Commands.add("dropTableIfExists", (name) => {
  const authHeader = localStorage.getItem("basic.auth.header");
  cy.request({
    method: "GET",
    url: `${baseUrl}/exec?query=${encodeURIComponent(
      `DROP TABLE IF EXISTS ${name};`
    )}`,
    headers: {
      Authorization: authHeader,
    },
  });
});

Cypress.Commands.add("dropMaterializedView", (name) => {
  const authHeader = localStorage.getItem("basic.auth.header");
  cy.request({
    method: "GET",
    url: `${baseUrl}/exec?query=${encodeURIComponent(
      `DROP MATERIALIZED VIEW ${name};`
    )}`,
    headers: {
      Authorization: authHeader,
    },
  });
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

Cypress.Commands.add("loginWithUserAndPassword", () => {
  cy.getByDataHook("auth-login").should("be.visible");
  cy.get("input[name='username']").type("admin");
  cy.get("input[type='password']").type("quest");
  cy.get("button[type='submit']").click();
});

Cypress.Commands.add("loadConsoleWithAuth", (clearWarnings) => {
  cy.clearLocalStorage();
  indexedDB.deleteDatabase("web-console");
  cy.visit(baseUrl);
  cy.loginWithUserAndPassword();
  cy.getEditorContent().should("be.visible");
  if (clearWarnings) {
    cy.clearSimulatedWarnings();
    indexedDB.deleteDatabase("web-console");
    cy.visit(baseUrl);
    cy.getEditorContent().should("be.visible");
  }
});

Cypress.Commands.add("loadConsoleAsAdminAndCreateSSOGroup", (group, externalGroup = undefined) => {
  cy.loadConsoleWithAuth(true);
  cy.executeSQL(`CREATE GROUP ${group} WITH EXTERNAL ALIAS ${externalGroup || group};`);
  cy.executeSQL(`GRANT HTTP TO ${group};`);
  cy.logout();
});

Cypress.Commands.add("logout", () => {
  cy.getByDataHook("button-logout").click();
  cy.getByDataHook("auth-login").should("be.visible");
});

Cypress.Commands.add("executeSQL", (sql) => {
  cy.clearEditor();
  cy.typeQuery(sql);
  cy.clickRun();
});

Cypress.Commands.add("refreshSchema", () => {
  // toggle between auto-refresh modes to trigger a schema refresh
  cy.getByDataHook("schema-auto-refresh-button").click();
  cy.getByDataHook("schema-auto-refresh-button").click();
});

Cypress.Commands.add("expandTables", () => {
  cy.get("body").then((body) => {
    if (body.find('[data-hook="expand-tables"]').length > 0) {
      cy.get('[data-hook="expand-tables"]').click({ force: true });
    }
  });
});

Cypress.Commands.add("collapseTables", () => {
  cy.get("body").then((body) => {
    if (body.find('[data-hook="collapse-tables"]').length > 0) {
      cy.get('[data-hook="collapse-tables"]').click({ force: true });
    }
  });
});

Cypress.Commands.add("expandMatViews", () => {
  cy.get("body").then((body) => {
    if (body.find('[data-hook="expand-materialized-views"]').length > 0) {
      cy.get('[data-hook="expand-materialized-views"]').click({ force: true });
    }
  });
});

Cypress.Commands.add("collapseMatViews", () => {
  cy.get("body").then((body) => {
    if (body.find('[data-hook="collapse-materialized-views"]').length > 0) {
      cy.get('[data-hook="collapse-materialized-views"]').click({
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
