/// <reference types="cypress" />

const SERVER_NOW = "2026-09-14T10:42:15.000000Z"
const LISTING_QUERY =
  "SELECT query_id, worker_id, worker_pool, username, query_start, state_change, state, is_wal, query, memory_used, memory_limit, now() AS server_now FROM query_activity();"

const COLUMNS = [
  { name: "query_id", type: "LONG" },
  { name: "worker_id", type: "LONG" },
  { name: "worker_pool", type: "STRING" },
  { name: "username", type: "STRING" },
  { name: "query_start", type: "TIMESTAMP" },
  { name: "state_change", type: "TIMESTAMP" },
  { name: "state", type: "STRING" },
  { name: "is_wal", type: "BOOLEAN" },
  { name: "query", type: "STRING" },
  { name: "memory_used", type: "LONG" },
  { name: "memory_limit", type: "LONG" },
  { name: "server_now", type: "TIMESTAMP" },
]

const MIB = 1024 * 1024

const row = ({
  queryId,
  query,
  startedSecondsAgo,
  state = "active",
  isWal = false,
  memoryUsed = null,
  memoryLimit = null,
  username = "alice",
  workerPool = "shared",
}) => {
  const start = new Date(
    Date.parse(SERVER_NOW) - startedSecondsAgo * 1000,
  ).toISOString()
  return [
    queryId,
    3,
    workerPool,
    username,
    start,
    state === "cancelled" ? SERVER_NOW : start,
    state,
    isWal,
    query,
    memoryUsed,
    memoryLimit,
    SERVER_NOW,
  ]
}

const SELF_ROW = row({
  queryId: 1,
  query: LISTING_QUERY,
  startedSecondsAgo: 0,
  memoryUsed: 0,
})

const CRITICAL_ROW = row({
  queryId: 62179,
  query: "SELECT symbol, approx_percentile(price, 0.5, 2) FROM trades",
  startedSecondsAgo: 72,
  memoryUsed: 812 * MIB,
  memoryLimit: 1024 * MIB,
})

const WARNING_ROW = row({
  queryId: 57777,
  query: "INSERT INTO trades SELECT * FROM staging",
  startedSecondsAgo: 14,
  memoryUsed: 96 * MIB,
  username: "bob",
})

const WAL_ROW = row({
  queryId: 58001,
  query: "ALTER TABLE trades ADD COLUMN venue SYMBOL",
  startedSecondsAgo: 3,
  isWal: true,
  username: "system",
  workerPool: "wal-apply",
})

const CANCELLED_ROW = row({
  queryId: 58010,
  query: "SELECT count() FROM trades WHERE symbol = 'BTC-USD'",
  startedSecondsAgo: 42,
  state: "cancelled",
  memoryUsed: 12 * MIB,
})

const listingResponse = (dataset) => ({
  query: LISTING_QUERY,
  columns: COLUMNS,
  timestamp: -1,
  dataset,
  count: dataset.length,
})

const interceptListing = (dataset) =>
  cy
    .intercept(
      {
        method: "GET",
        pathname: "/exec",
        query: { query: /query_activity\(\)/ },
      },
      { statusCode: 200, body: listingResponse(dataset) },
    )
    .as("queryActivity")

const interceptCancel = () =>
  cy
    .intercept(
      {
        method: "GET",
        pathname: "/exec",
        query: { query: /CANCEL QUERY/ },
      },
      { statusCode: 200, body: { ddl: "OK" } },
    )
    .as("cancelQuery")

const openDrawer = () => {
  cy.getByDataHook("query-activity-toggle-button").click()
  cy.getByDataHook("query-activity-drawer").should("be.visible")
}

const rowIds = () =>
  cy
    .getByDataHook("query-activity-row")
    .then(($rows) => [...$rows].map((row) => row.dataset.queryId))

describe("Query Activity drawer", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
  })

  it("lists running queries without its own listing query", () => {
    // Given
    interceptListing([SELF_ROW, CRITICAL_ROW, WARNING_ROW, WAL_ROW])

    // When
    openDrawer()
    cy.wait("@queryActivity")

    // Then
    cy.getByDataHook("query-activity-count-badge").should(
      "contain",
      "3 running",
    )
    cy.getByDataHook("query-activity-summary-active").should("contain", "3")
    cy.getByDataHook("query-activity-summary-memory").should(
      "contain",
      "908.0 MiB",
    )
    cy.getByDataHook("query-activity-row").should("have.length", 3)
    cy.getByDataHook("query-activity-row").should(
      "not.contain",
      "query_activity()",
    )
  })

  it("sorts by memory by default and grades memory-heavy queries", () => {
    // Given
    interceptListing([SELF_ROW, WAL_ROW, WARNING_ROW, CRITICAL_ROW])

    // When
    openDrawer()
    cy.wait("@queryActivity")

    // Then
    rowIds().should("deep.equal", ["62179", "57777", "58001"])
    cy.get('[data-hook="query-activity-row"][data-query-id="62179"]')
      .should("have.attr", "data-severity", "warning")
      .within(() => {
        cy.getByDataHook("query-activity-row-started").should(
          "contain",
          "Started 1m 12s ago",
        )
        cy.getByDataHook("query-activity-row-memory").should(
          "contain",
          "812.0 MiB / 1.0 GiB",
        )
      })
    cy.get('[data-hook="query-activity-row"][data-query-id="57777"]').should(
      "have.attr",
      "data-severity",
      "none",
    )
    cy.get('[data-hook="query-activity-row"][data-query-id="58001"]')
      .should("have.attr", "data-severity", "none")
      .within(() => {
        cy.getByDataHook("query-activity-row-wal").should("be.visible")
        cy.getByDataHook("query-activity-row-cancel").should("not.exist")
      })
  })

  it("re-sorts from the sort menu with untracked memory last", () => {
    // Given
    interceptListing([SELF_ROW, CRITICAL_ROW, WARNING_ROW, WAL_ROW])
    openDrawer()
    cy.wait("@queryActivity")

    // When
    cy.getByDataHook("query-activity-sort-trigger").click()
    cy.getByDataHook("query-activity-sort-memory-desc").click()

    // Then
    cy.getByDataHook("query-activity-sort-trigger").should(
      "contain",
      "Most memory",
    )
    rowIds().should("deep.equal", ["62179", "57777", "58001"])

    // When
    cy.getByDataHook("query-activity-sort-trigger").click()
    cy.getByDataHook("query-activity-sort-memory-asc").click()

    // Then
    rowIds().should("deep.equal", ["57777", "62179", "58001"])

    // When
    cy.getByDataHook("query-activity-sort-trigger").click()
    cy.getByDataHook("query-activity-sort-started-desc").click()

    // Then
    rowIds().should("deep.equal", ["58001", "57777", "62179"])
  })

  it("mutes a cancelled query and never grades it", () => {
    // Given
    interceptListing([SELF_ROW, CANCELLED_ROW])

    // When
    openDrawer()
    cy.wait("@queryActivity")

    // Then
    cy.get('[data-hook="query-activity-row"][data-query-id="58010"]')
      .should("have.attr", "data-state", "cancelled")
      .should("have.attr", "data-severity", "none")
      .within(() => {
        cy.getByDataHook("query-activity-row-state").should(
          "contain",
          "Cancelled",
        )
        cy.getByDataHook("query-activity-row-cancel").should("not.exist")
      })
  })

  it("cancels a query on the server after confirmation", () => {
    // Given
    interceptListing([SELF_ROW, CRITICAL_ROW])
    interceptCancel()
    openDrawer()
    cy.wait("@queryActivity")

    // When
    cy.get('[data-hook="query-activity-row"][data-query-id="62179"]').within(
      () => {
        cy.getByDataHook("query-activity-row-cancel").click({ force: true })
      },
    )
    cy.getByDataHook("query-activity-cancel-dialog").should("be.visible")
    cy.getByDataHook("query-activity-cancel-confirm").click()

    // Then
    cy.wait("@cancelQuery")
      .its("request.url")
      .should("match", /CANCEL(?:%20|\+)QUERY(?:%20|\+)62179/)
    cy.getByDataHook("query-activity-cancel-dialog").should("not.exist")
  })

  it("keeps the query when the confirmation is dismissed", () => {
    // Given
    interceptListing([SELF_ROW, CRITICAL_ROW])
    interceptCancel()
    openDrawer()
    cy.wait("@queryActivity")

    // When
    cy.getByDataHook("query-activity-row-cancel").click({ force: true })
    cy.getByDataHook("query-activity-cancel-dismiss").click()

    // Then
    cy.getByDataHook("query-activity-cancel-dialog").should("not.exist")
    cy.get("@cancelQuery.all").should("have.length", 0)
  })

  it("filters rows by query text, user, or id", () => {
    // Given
    interceptListing([SELF_ROW, CRITICAL_ROW, WARNING_ROW, WAL_ROW])
    openDrawer()
    cy.wait("@queryActivity")

    // When
    cy.getByDataHook("query-activity-search").type("staging")

    // Then
    rowIds().should("deep.equal", ["57777"])

    // When
    cy.getByDataHook("query-activity-search").clear().type("SYSTEM")

    // Then
    rowIds().should("deep.equal", ["58001"])

    // When
    cy.getByDataHook("query-activity-search").clear().type("621")

    // Then
    rowIds().should("deep.equal", ["62179"])

    // When
    cy.getByDataHook("query-activity-search").clear().type("nothing here")

    // Then
    cy.getByDataHook("query-activity-no-match").should("be.visible")

    // When
    cy.getByDataHook("query-activity-search-clear").click()

    // Then
    cy.getByDataHook("query-activity-row").should("have.length", 3)

    // When Escape is pressed inside a filled search box
    cy.getByDataHook("query-activity-search").type("staging{esc}")

    // Then the filter clears and the drawer stays open
    cy.getByDataHook("query-activity-search").should("have.value", "")
    cy.getByDataHook("query-activity-row").should("have.length", 3)
    cy.getByDataHook("query-activity-drawer").should("be.visible")
  })

  it("keeps a vanished query as finished for a few seconds", () => {
    // Given the second poll no longer lists one of the queries
    let polls = 0
    cy.intercept(
      {
        method: "GET",
        pathname: "/exec",
        query: { query: /query_activity\(\)/ },
      },
      (req) => {
        polls += 1
        req.reply({
          statusCode: 200,
          body: listingResponse(
            polls === 1
              ? [SELF_ROW, CRITICAL_ROW, WARNING_ROW]
              : [SELF_ROW, CRITICAL_ROW],
          ),
        })
      },
    ).as("queryActivity")
    openDrawer()
    cy.wait("@queryActivity")
    rowIds().should("deep.equal", ["62179", "57777"])

    // When the next poll arrives
    cy.wait("@queryActivity")

    // Then the row lingers as finished without a cancel action
    cy.get('[data-hook="query-activity-row"][data-query-id="57777"]')
      .should("have.attr", "data-state", "finished")
      .within(() => {
        cy.getByDataHook("query-activity-row-state").should(
          "contain",
          "Finished",
        )
        cy.getByDataHook("query-activity-row-cancel").should("not.exist")
      })

    // And it is wiped after the grace period
    cy.get('[data-hook="query-activity-row"][data-query-id="57777"]', {
      timeout: 8000,
    }).should("not.exist")
    rowIds().should("deep.equal", ["62179"])
  })

  it("shows an empty state when only its own listing query runs", () => {
    // Given
    interceptListing([SELF_ROW])

    // When
    openDrawer()
    cy.wait("@queryActivity")

    // Then
    cy.getByDataHook("query-activity-empty").should("be.visible")
    cy.getByDataHook("query-activity-row").should("not.exist")
  })

  it("shows an error state when the listing keeps failing", () => {
    // Given
    cy.intercept(
      {
        method: "GET",
        pathname: "/exec",
        query: { query: /query_activity\(\)/ },
      },
      { statusCode: 500, body: { error: "registry unavailable", position: 0 } },
    ).as("queryActivityFailure")

    // When
    openDrawer()
    cy.wait("@queryActivityFailure")
    cy.wait("@queryActivityFailure")
    cy.wait("@queryActivityFailure")

    // Then
    cy.getByDataHook("query-activity-error-banner").should("be.visible")
  })

  it("shows an error with a retry action when auto refresh is off", () => {
    // Given
    cy.loadConsoleWithAuth(false, { "auto.refresh.queryActivity": "false" })
    cy.intercept(
      {
        method: "GET",
        pathname: "/exec",
        query: { query: /query_activity\(\)/ },
      },
      { statusCode: 500, body: { error: "registry unavailable", position: 0 } },
    ).as("queryActivityFailure")

    // When
    openDrawer()
    cy.wait("@queryActivityFailure")

    // Then the first failure is shown instead of a spinner
    cy.getByDataHook("query-activity-error-banner").should("be.visible")
    cy.getByDataHook("query-activity-loading").should("not.exist")

    // When the server recovers and the user retries
    interceptListing([SELF_ROW, CRITICAL_ROW])
    cy.getByDataHook("query-activity-retry-button").click()
    cy.wait("@queryActivity")

    // Then one successful retry restores the list
    cy.getByDataHook("query-activity-error-banner").should("not.exist")
    rowIds().should("deep.equal", ["62179"])
  })

  it("fetches immediately when auto refresh is turned on", () => {
    // Given the list was loaded with auto refresh off
    cy.loadConsoleWithAuth(false, { "auto.refresh.queryActivity": "false" })
    interceptListing([SELF_ROW, CRITICAL_ROW])
    openDrawer()
    cy.wait("@queryActivity")
    cy.intercept(
      {
        method: "GET",
        pathname: "/exec",
        query: { query: /query_activity\(\)/ },
      },
      { statusCode: 200, body: listingResponse([SELF_ROW]) },
    ).as("listingAfterToggle")

    // When auto refresh is turned on
    cy.getByDataHook("query-activity-auto-refresh-button").click()

    // Then a listing is requested before the first poll interval
    cy.wait("@listingAfterToggle", { requestTimeout: 700 })
    cy.getByDataHook("query-activity-empty").should("be.visible")
  })

  it("refreshes right after a cancel and drops the in-flight listing", () => {
    // Given the list is loaded and a slow poll is in flight
    interceptListing([SELF_ROW, CRITICAL_ROW])
    interceptCancel()
    openDrawer()
    cy.wait("@queryActivity")
    rowIds().should("deep.equal", ["62179"])
    let slowRequests = 0
    cy.intercept(
      {
        method: "GET",
        pathname: "/exec",
        query: { query: /query_activity\(\)/ },
      },
      (req) => {
        slowRequests += 1
        req.reply({
          delay: 3000,
          statusCode: 200,
          body: listingResponse([SELF_ROW, CRITICAL_ROW]),
        })
      },
    ).as("slowListing")
    cy.wrap(null).should(() => expect(slowRequests).to.be.greaterThan(0))
    cy.intercept(
      {
        method: "GET",
        pathname: "/exec",
        query: { query: /query_activity\(\)/ },
      },
      { statusCode: 200, body: listingResponse([SELF_ROW]) },
    ).as("freshListing")

    // When the query is cancelled during that poll
    cy.get('[data-hook="query-activity-row"][data-query-id="62179"]').within(
      () => {
        cy.getByDataHook("query-activity-row-cancel").click({ force: true })
      },
    )
    cy.getByDataHook("query-activity-cancel-confirm").click()
    cy.wait("@cancelQuery")

    // Then a fresh listing lands without waiting for the slow one
    cy.wait("@freshListing", { timeout: 2000 })
    cy.get('[data-hook="query-activity-row"][data-query-id="62179"]').should(
      "have.attr",
      "data-state",
      "finished",
    )

    // And the slow response never revives the query
    cy.wait(3000)
    cy.get('[data-hook="query-activity-row"][data-query-id="62179"]').should(
      "not.have.attr",
      "data-state",
      "running",
    )
  })

  it("keeps the start time correct when the drawer reopens", () => {
    // Given
    cy.clock(Date.parse(SERVER_NOW), ["Date", "setInterval", "clearInterval"])
    interceptListing([SELF_ROW, CRITICAL_ROW])
    openDrawer()
    cy.wait("@queryActivity")
    cy.getByDataHook("query-activity-row-started").should(
      "contain",
      "Started 1m 12s ago",
    )

    // When the drawer stays closed for ten seconds and reopens
    cy.getByDataHook("query-activity-toggle-button").click()
    cy.getByDataHook("query-activity-drawer").should("not.exist")
    cy.tick(10000)
    openDrawer()
    cy.wait("@queryActivity")

    // Then the start time is correct before the next clock tick
    cy.getByDataHook("query-activity-row-started").should(
      "contain",
      "Started 1m 12s ago",
    )
  })

  it("reports how stale the listing is while auto refresh is off", () => {
    // Given the list loaded once with auto refresh off
    cy.clock(Date.parse(SERVER_NOW), ["Date", "setInterval", "clearInterval"])
    cy.loadConsoleWithAuth(false, { "auto.refresh.queryActivity": "false" })
    interceptListing([SELF_ROW, CRITICAL_ROW])
    openDrawer()
    cy.wait("@queryActivity")
    cy.getByDataHook("query-activity-last-updated").should(
      "contain",
      "Last updated <1s ago",
    )

    // When thirty seconds pass with no poll
    cy.tick(30000)

    // Then the drawer reports the age of the snapshot
    cy.getByDataHook("query-activity-last-updated").should(
      "contain",
      "Last updated 30s ago",
    )
  })

  it("closes from the sidebar button", () => {
    // Given
    interceptListing([SELF_ROW])
    openDrawer()

    // When
    cy.getByDataHook("query-activity-toggle-button").click()

    // Then
    cy.getByDataHook("query-activity-drawer").should("not.exist")
  })
})
