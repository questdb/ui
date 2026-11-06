/// <reference types="cypress" />

const query = "sleep(30.0) /* query_activity_cancel_journey */"
const baseUrl = Cypress.config("baseUrl")
let queryId

const activeRow = () =>
  cy.get(`[data-hook="query-activity-row"][data-query-id="${queryId}"]`)

describe("Query Activity", () => {
  afterEach(() => {
    cy.execAdminQuery(
      `select query_id from query_activity() where query = '${query}'`,
    ).then(({ body }) => {
      for (const [id] of body.dataset) {
        cy.request({
          url: `${baseUrl}/exec`,
          qs: { query: `CANCEL QUERY ${id}` },
          headers: { Authorization: `Basic ${btoa("admin:quest")}` },
          failOnStatusCode: false,
        })
      }
    })
    queryId = undefined
  })

  it("finds a running query, keeps it on dismissal, and cancels it after confirmation", () => {
    // Given
    const cancellations = []
    cy.intercept("GET", "**/exec*", (request) => {
      const sql = new URL(request.url).searchParams
        .get("query")
        ?.replace(/;$/, "")
      if (sql === query) request.alias = "runningQuery"
      if (sql?.startsWith("CANCEL QUERY ")) {
        cancellations.push(sql)
        request.alias = "cancelQuery"
      }
    })
    cy.loadConsoleWithAuth(false, {}, { buffers: [{ value: query }] })

    // When
    cy.clickRunQuery()
    cy.getByDataHook("query-activity-toggle-button").click()
    cy.contains('[data-hook="query-activity-row"]', query)
      .should("have.attr", "data-state", "running")
      .then(($row) => {
        queryId = $row.attr("data-query-id")
      })
    cy.then(() =>
      activeRow().find('[data-hook="query-activity-row-cancel"]').click(),
    )
    cy.getByDataHook("query-activity-cancel-dismiss").click()

    // Then
    cy.getByDataHook("query-activity-cancel-dialog").should("not.exist")
    cy.then(() => {
      expect(cancellations).to.deep.equal([])
      activeRow().should("have.attr", "data-state", "running")
    })

    // When
    cy.then(() =>
      activeRow().find('[data-hook="query-activity-row-cancel"]').click(),
    )
    cy.getByDataHook("query-activity-cancel-confirm").click()

    // Then
    cy.wait("@cancelQuery").then(({ request, response }) => {
      expect(
        new URL(request.url).searchParams.get("query")?.replace(/;$/, ""),
      ).to.equal(`CANCEL QUERY ${queryId}`)
      expect(response.statusCode).to.equal(200)
    })
    cy.wait("@runningQuery").then(({ response }) => {
      expect(response.statusCode).to.equal(400)
      expect(response.body.error).to.match(/cancel/i)
    })
    cy.getByDataHook("query-activity-cancel-dialog").should("not.exist")
    cy.then(() =>
      expect(cancellations).to.deep.equal([`CANCEL QUERY ${queryId}`]),
    )
    cy.getByDataHook("error-notification").should("contain.text", "cancel")
  })
})

const {
  SELF_ROW,
  listingResponse,
  largeListing,
  LARGE_LISTING_SIZE,
  LARGE_LISTING_FIRST_ID,
  LARGE_LISTING_NEEDLE_USER,
  LARGE_LISTING_NEEDLE_INDEX,
  LARGE_LISTING_MAX_AGE_SECONDS,
} = require("../utils/queryActivity")
const get = (name) => cy.get(`[data-hook="${name}"]`)

const settledRows = () => {
  return get("query-activity-row")
}

const settledFirstRowId = (queryId) =>
  settledRows().should(($rows) =>
    expect($rows.first().attr("data-query-id")).to.equal(String(queryId)),
  )

const pickOrder = (key) => {
  get("query-activity-sort-trigger").click()
  get(`query-activity-sort-${key}`).click()
}

describe("Query Activity large catalog", () => {
  it("lists, filters and sorts ten thousand queries without stalling", () => {
    // Given
    cy.loadConsoleWithAuth(false, { "auto.refresh.queryActivity": "false" })
    cy.intercept(
      {
        method: "GET",
        pathname: "/exec",
        query: { query: /query_activity\(\)/ },
      },
      { body: listingResponse([SELF_ROW, ...largeListing()]) },
    ).as("queryActivity")

    // When
    get("query-activity-toggle-button").click()
    cy.wait("@queryActivity")

    // Then the listing renders through the virtual list
    get("query-activity-count-badge").should(($badge) =>
      expect($badge.text()).to.contain(`${LARGE_LISTING_SIZE} running`),
    )
    get("query-activity-row").should(($rows) =>
      expect($rows.length, "rendered rows").to.be.within(1, 199),
    )

    get("query-activity-row")
      .first()
      .find('[data-hook="query-activity-row-query"] pre')
      .should("contain.text", "SELECT")
    get("query-activity-row")
      .first()
      .find('[data-hook="query-activity-row-query"] pre [class*="mtk"]')
      .should("exist")

    // When the list is scrolled to the end
    get("query-activity-scroller").scrollTo("bottom")

    // Then the lightest query is rendered
    settledRows()
      .last()
      .within(() =>
        cy
          .get('[data-hook="query-activity-row-memory"]')
          .should(($memory) => expect($memory.text()).to.match(/^0 B \//)),
      )

    // When a filter matches a single user
    get("query-activity-search").type(LARGE_LISTING_NEEDLE_USER)

    // Then only that query remains
    settledRows().should(($rows) => {
      expect($rows.length).to.equal(1)
      expect($rows.first().attr("data-query-id")).to.equal(
        String(LARGE_LISTING_FIRST_ID + LARGE_LISTING_NEEDLE_INDEX),
      )
    })

    // When the filter is cleared
    get("query-activity-search-clear").click()

    // Then the list is back
    settledRows().should(($rows) => expect($rows.length).to.be.greaterThan(1))

    // When the list is sorted by lowest id
    pickOrder("id-asc")

    // Then
    settledFirstRowId(LARGE_LISTING_FIRST_ID)

    // When the list is sorted by highest id
    pickOrder("id-desc")

    // Then
    settledFirstRowId(LARGE_LISTING_FIRST_ID + LARGE_LISTING_SIZE - 1)

    // When the list is sorted by oldest start
    pickOrder("started-asc")

    // Then
    settledFirstRowId(
      LARGE_LISTING_FIRST_ID + LARGE_LISTING_MAX_AGE_SECONDS - 1,
    )
  })
})
