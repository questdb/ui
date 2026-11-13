/// <reference types="cypress" />
const baseUrl = Cypress.config("baseUrl")
const {
  installFakeWebSocket,
  TEST_BRIDGE_TOKEN,
  TEST_BRIDGE_URL,
} = require("../utils/mcpFakeWebSocket")
const read = { grantSchemaAccess: true, read: true, write: false }
const write = { grantSchemaAccess: true, read: true, write: true }
const table = "mcp_permission_journey"

const pair = () => {
  cy.loadConsoleWithAuth(
    false,
    {},
    {
      url: `${baseUrl}/?mcp-pair=1&mcp-ws=${encodeURIComponent(TEST_BRIDGE_URL)}&mcp-token=${TEST_BRIDGE_TOKEN}`,
      onBeforeLoad: installFakeWebSocket,
    },
  )
  cy.getByDataHook("permissions").should("be.visible")
  cy.getByDataHook("permissions-trigger").should("contain", "Read")
}

const acknowledge = (permissions) => {
  cy.window().should((win) => {
    expect(win.__mcpFakeWS.framesOfType("hello")).to.have.length(1)
    const hello = win.__mcpFakeWS.framesOfType("hello")[0]
    expect(hello.token).to.equal(TEST_BRIDGE_TOKEN)
    expect(hello.permissions).to.deep.equal(permissions)
  })
  cy.window().then((win) => win.__mcpFakeWS.helloAck())
  cy.getByDataHook("mcp-status-pill").should("contain", "MCP connected")
}

const call = (name, args, id) => {
  cy.window().then((win) => win.__mcpFakeWS.toolCall(name, args, id))
  return cy
    .window()
    .should((win) => {
      expect(
        win.__mcpFakeWS
          .framesOfType("tool_result")
          .find((result) => result.requestId === id),
      ).to.exist
    })
    .then((win) =>
      win.__mcpFakeWS
        .framesOfType("tool_result")
        .find((result) => result.requestId === id),
    )
}

const successful = (result) => {
  expect(result.isError).to.equal(false)
  return result.content.map((part) => part.text).join("\n")
}

describe("MCP consent and live permissions", () => {
  afterEach(() => cy.execAdminQuery(`DROP TABLE IF EXISTS ${table}`))

  it("denies writes under Read, then executes them after Write is committed without reconnecting", () => {
    // Given
    cy.execAdminQuery(`DROP TABLE IF EXISTS ${table}`)
    cy.execAdminQuery(`CREATE TABLE ${table} (a INT)`)
    cy.execAdminQuery(`INSERT INTO ${table} VALUES (41)`)
    const deniedSQL = [
      `INSERT INTO ${table} VALUES (42)`,
      "CREATE TABLE mcp_forbidden (a INT)",
    ]
    const executedWrites = []
    cy.intercept("GET", "**/exec?*", (req) => {
      const sql = new URL(req.url).searchParams.get("query")
      if (deniedSQL.includes(sql)) executedWrites.push(sql)
    })
    pair()
    cy.getByDataHook("mcp-pair-consent-connect").click()
    acknowledge(read)

    // When / Then
    call(
      "run_query",
      { sql: `SELECT a FROM ${table}`, limit: 10 },
      "read-before",
    ).then((result) => {
      expect(successful(result)).to.contain("41")
    })
    call("get_tables", {}, "schema-before").then((result) =>
      expect(successful(result)).to.contain(table),
    )
    deniedSQL.forEach((sql, index) => {
      call("run_query", { sql, limit: 10 }, `denied-${index}`).then(
        (result) => {
          expect(result.isError).to.equal(true)
          expect(result.content[0].text)
            .to.contain("PERMISSION_DENIED")
            .and.to.contain("'write' permission")
        },
      )
    })
    cy.then(() => expect(executedWrites).to.have.length(0))
    let socket
    cy.window().then((win) => {
      socket = win.__mcpFakeWS
    })
    cy.getByDataHook("mcp-status-pill").click()
    cy.getByDataHook("permissions-trigger").click()
    cy.getByDataHook("permission-level-write").click()
    cy.getByDataHook("mcp-pair-submit").should("contain", "Connect").click()
    cy.window().then((win) => {
      expect(
        JSON.parse(win.localStorage.getItem("mcp:permissions")),
      ).to.deep.equal(write)
      expect(win.__mcpFakeWS).to.equal(socket)
      expect(win.__mcpFakeSockets).to.have.length(1)
      expect(socket.framesOfType("hello")).to.have.length(1)
    })
    cy.getByDataHook("mcp-status-pill").should("contain", "MCP connected")
    call("run_query", { sql: deniedSQL[0], limit: 10 }, "write-after").then(
      successful,
    )
    call(
      "run_query",
      { sql: `SELECT a FROM ${table} ORDER BY a`, limit: 10 },
      "read-after",
    ).then((result) => {
      const payload = successful(result)
      expect(payload).to.contain("41").and.to.contain("42")
    })
    call("get_tables", {}, "schema-after").then((result) =>
      expect(successful(result)).to.contain(table),
    )
    cy.execAdminQuery(`SELECT a FROM ${table} ORDER BY a`)
      .its("body.dataset")
      .should("deep.equal", [[41], [42]])
  })

  it("commits Write during consent and restores that grant and token after a revisit", () => {
    // Given
    pair()
    cy.getByDataHook("permissions-trigger").click()
    cy.getByDataHook("permission-level-write").click()
    cy.getByDataHook("permissions-trigger").should("contain", "Write")
    cy.getByDataHook("mcp-pair-consent-connect").click()
    acknowledge(write)
    cy.window().then((win) =>
      expect(
        JSON.parse(win.localStorage.getItem("mcp:permissions")),
      ).to.deep.equal(write),
    )

    // When
    cy.visit(baseUrl, { onBeforeLoad: installFakeWebSocket })

    // Then
    acknowledge(write)
    cy.getByDataHook("mcp-pair-consent-connect").should("not.exist")
  })
})
