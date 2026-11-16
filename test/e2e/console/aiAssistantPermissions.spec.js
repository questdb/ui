/// <reference types="cypress" />

const {
  PROVIDERS,
  getOpenAIConfiguredSettings,
  createResponse,
  createFinalResponse,
  createChatTitleResponse,
  isTitleRequest,
} = require("../utils/aiAssistant")

const table = "ai_permission_consent"
const readSQL = `SELECT price FROM ${table} ORDER BY price`
const dropSQL = `DROP TABLE ${table}`
const firstQuestion = "Read the prices, then drop the permission test table."
const deniedExplanation =
  "I read the prices. Write access is required to drop the table."
const successExplanation =
  "The table was dropped after you granted Write access."

const toolResponse = (callId, sql) =>
  createResponse(
    "openai",
    {
      id: `resp_${callId}`,
      object: "response",
      status: "completed",
      output: [
        {
          type: "function_call",
          id: `fc_${callId}`,
          call_id: callId,
          name: "run_query",
          arguments: JSON.stringify({ sql }),
        },
      ],
      output_text: "",
    },
    { streaming: true },
  )

const toolResult = (body, callId) => {
  const result = body.input.find(
    (item) => item.type === "function_call_output" && item.call_id === callId,
  )
  expect(result, `tool result for ${callId}`).to.exist
  return result.output
}

const choosePermission = (level) => {
  cy.getByDataHook("permissions-trigger").click()
  cy.getByDataHook(`permission-level-${level}`).click()
  cy.getByDataHook("ai-settings-save").click()
}

const assertSavedPermissions = (write) =>
  cy.window().should((win) => {
    const settings = JSON.parse(
      win.localStorage.getItem("ai.assistant.settings"),
    )
    expect(settings.providers.openai).to.include({
      grantSchemaAccess: true,
      read: true,
      write,
    })
  })

describe("ai assistant permissions", () => {
  beforeEach(() => {
    cy.dropTableIfExists(table)
    cy.execAdminQuery(`CREATE TABLE ${table} (price INT)`)
    cy.execAdminQuery(`INSERT INTO ${table} VALUES (53), (89)`)
  })

  afterEach(() => {
    cy.dropTableIfExists(table)
  })

  it("saved Read blocks writes until the user grants Write", () => {
    // Given a real table and Read permission saved through Settings
    const executedSQL = []
    const validatedSQL = []
    let providerRequestCount = 0
    cy.intercept("GET", "**/exec*", (req) => {
      const sql = new URL(req.url).searchParams.get("query")
      if (sql === readSQL || sql === dropSQL) executedSQL.push(sql)
    })
    cy.intercept("GET", "**/api/v1/sql/validate*", (req) => {
      const sql = new URL(req.url).searchParams.get("query")
      if (sql === readSQL || sql === dropSQL) validatedSQL.push(sql)
    })
    cy.intercept("POST", PROVIDERS.openai.endpoint, (req) => {
      if (isTitleRequest("openai", req.body)) {
        req.reply(createChatTitleResponse("openai", "Permission consent"))
        return
      }
      providerRequestCount++
      req.alias = "permissionTurn"
      switch (providerRequestCount) {
        case 1:
          req.reply(toolResponse("read_prices", readSQL))
          break
        case 2:
          expect(JSON.parse(toolResult(req.body, "read_prices"))).to.include({
            type: "dql",
            returned_count: 2,
          })
          expect(
            JSON.parse(toolResult(req.body, "read_prices")).rows,
          ).to.deep.equal([[53], [89]])
          req.reply(toolResponse("denied_drop", dropSQL))
          break
        case 3:
          expect(toolResult(req.body, "denied_drop")).to.include(
            "PERMISSION_DENIED",
          )
          expect(toolResult(req.body, "denied_drop")).to.include(
            "'write' permission",
          )
          expect(executedSQL).to.deep.equal([readSQL])
          req.reply(
            createFinalResponse("openai", deniedExplanation, {
              streaming: true,
            }),
          )
          break
        case 4:
          expect(JSON.stringify(req.body.input)).to.include(firstQuestion)
          expect(toolResult(req.body, "denied_drop")).to.include(
            "PERMISSION_DENIED",
          )
          req.reply(toolResponse("consented_drop", dropSQL))
          break
        case 5:
          expect(JSON.parse(toolResult(req.body, "consented_drop"))).to.include(
            { type: "ddl", ok: true },
          )
          req.reply(
            createFinalResponse("openai", successExplanation, {
              streaming: true,
            }),
          )
          break
        default:
          throw new Error(`Unexpected AI request ${providerRequestCount}`)
      }
    })
    cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
    cy.getByDataHook("ai-assistant-settings-button").click()
    choosePermission("read")
    assertSavedPermissions(false)
    cy.reload()
    cy.getByDataHook("ai-assistant-settings-button").click()
    cy.getByDataHook("permissions-trigger").should("contain", "Read")
    assertSavedPermissions(false)
    cy.getByDataHook("ai-settings-cancel").click()

    // When the assistant reads prices and tries to drop the table
    cy.getByDataHook("ai-chat-button").click()
    cy.getByDataHook("chat-input-textarea").type(firstQuestion)
    cy.getByDataHook("chat-send-button").click()
    cy.wait("@permissionTurn")
    cy.wait("@permissionTurn")
    cy.wait("@permissionTurn")
    cy.waitForStreamingComplete()

    // Then rows reached the model, the write was denied, and the table still exists
    cy.getByDataHook("chat-message-assistant").should(
      "contain",
      deniedExplanation,
    )
    cy.execAdminQuery(readSQL)
      .its("body.dataset")
      .should("deep.equal", [[53], [89]])
    cy.then(() => {
      expect(executedSQL).to.deep.equal([readSQL])
      expect(validatedSQL).to.include(readSQL).and.include(dropSQL)
    })

    // When the user grants Write and retries in the same conversation
    cy.getByDataHook("ai-assistant-settings-button").click()
    choosePermission("write")
    assertSavedPermissions(true)
    cy.getByDataHook("chat-input-textarea").type(
      "I granted Write access. Drop the table now.",
    )
    cy.getByDataHook("chat-send-button").click()
    cy.wait("@permissionTurn")
    cy.wait("@permissionTurn")
    cy.waitForStreamingComplete()

    // Then the actual DROP succeeds and the database no longer contains the table
    cy.getByDataHook("chat-message-assistant").should(
      "contain",
      successExplanation,
    )
    cy.execAdminQuery(
      `SELECT table_name FROM tables() WHERE table_name = '${table}'`,
    )
      .its("body.dataset")
      .should("deep.equal", [])
    cy.then(() => {
      expect(executedSQL).to.deep.equal([readSQL, dropSQL])
      expect(providerRequestCount).to.equal(5)
    })
  })
})
