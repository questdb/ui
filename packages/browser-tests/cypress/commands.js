const {
  addMatchImageSnapshotCommand,
} = require("@simonsmith/cypress-image-snapshot/command");

require("cypress-real-events");

addMatchImageSnapshotCommand({
  failureThreshold: 0.3,
  blackout: [".notifications", 'button[class*="BuildVersion"'],
});

const baseUrl = "http://localhost:9999";

const ctrlOrCmd = Cypress.platform === "darwin" ? "{cmd}" : "{ctrl}";

const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const tableSchemas = {
  btc_trades:
    "CREATE TABLE IF NOT EXISTS 'btc_trades' (symbol SYMBOL capacity 256 CACHE, side SYMBOL capacity 256 CACHE, price DOUBLE, amount DOUBLE, timestamp TIMESTAMP) timestamp (timestamp) PARTITION BY DAY WAL DEDUP UPSERT KEYS(symbol, price, amount, timestamp);",
  chicago_weather_stations:
    "CREATE TABLE IF NOT EXISTS 'chicago_weather_stations' (MeasurementTimestamp TIMESTAMP, StationName SYMBOL capacity 256 CACHE, AirTemperature DOUBLE, WetBulbTemperature DOUBLE, Humidity INT, RainIntensity DOUBLE, IntervalRain DOUBLE, TotalRain DOUBLE, PrecipitationType INT, WindDirection INT, WindSpeed DOUBLE, MaximumWindSpeed DOUBLE, BarometricPressure DOUBLE, SolarRadiation INT, Heading INT, BatteryLife DOUBLE, MeasurementTimestampLabel STRING, MeasurementID STRING) timestamp (MeasurementTimestamp) PARTITION BY MONTH WAL DEDUP UPSERT KEYS(MeasurementTimestamp, StationName);",
  ecommerce_stats:
    "CREATE TABLE IF NOT EXISTS 'ecommerce_stats' (ts TIMESTAMP, country SYMBOL capacity 256 CACHE, category SYMBOL capacity 256 CACHE, visits LONG, unique_visitors LONG, sales DOUBLE,  number_of_products INT) timestamp (ts) PARTITION BY DAY WAL DEDUP UPSERT KEYS(ts, country, category);",
  gitlog:
    "CREATE TABLE IF NOT EXISTS 'gitlog' (committed_datetime TIMESTAMP, repo SYMBOL capacity 256 CACHE, author_name SYMBOL capacity 256 CACHE, summary STRING, size INT, insertions INT, deletions INT, lines INT, files INT) timestamp (committed_datetime) PARTITION BY MONTH WAL DEDUP UPSERT KEYS(committed_datetime, repo, author_name);",
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
      method: "GET",
      url: "/news",
      hostname: "cloud.questdb.com",
    },
    (req) => {
      req.reply("[]");
    }
  );
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
  return cy.typeQuery(`${ctrlOrCmd}{enter}`).wait("@exec");
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

Cypress.Commands.add("getAutocomplete", () =>
  cy.get('[widgetid="editor.widget.suggestWidget"]')
);

Cypress.Commands.add("getErrorMarker", () => cy.get(".squiggly-error"));

Cypress.Commands.add("getCursorQueryDecoration", () =>
  cy.get(".cursorQueryDecoration")
);

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
  cy.request({
    method: "GET",
    url: `${baseUrl}/exec?query=${encodeURIComponent(tableSchemas[name])};`,
  });
});

Cypress.Commands.add("dropTable", (name) => {
  cy.request({
    method: "GET",
    url: `${baseUrl}/exec?query=${encodeURIComponent(`DROP TABLE ${name};`)}`,
  });
});

Cypress.Commands.add("interceptQuery", (query, response) => {
  cy.intercept(
    {
      method: "GET",
      url: new RegExp(
        `^${escapeRegExp(baseUrl)}\/exec.*query=${escapeRegExp(query)}`,
        "gmi"
      ),
    },
    response
  );
});
