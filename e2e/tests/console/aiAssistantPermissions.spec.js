/// <reference types="cypress" />

const {
  PROVIDERS,
  getOpenAIConfiguredSettings,
  createToolCallFlow,
} = require("../../utils/aiAssistant")

describe("ai assistant permissions", () => {
  beforeEach(() => {
    // Fail loudly on any unmocked provider request — each test scripts its own intercept.
    cy.intercept("POST", PROVIDERS.openai.endpoint, (req) => {
      throw new Error(
        `Unhandled OpenAI request detected! Request body: ${JSON.stringify(
          req.body,
        ).slice(0, 200)}...`,
      )
    }).as("unhandledOpenAI")
  })

  describe("PermissionsSection in settings modals", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
    })

    it("renders permission level select with cascading levels in SettingsModal", () => {
      cy.getByDataHook("ai-assistant-settings-button")
        .should("be.visible")
        .click()

      cy.getByDataHook("permissions").should("be.visible")
      cy.getByDataHook("permissions-trigger").should("contain", "Schema access")

      // Raise to Write: trigger label updates and all levels listed in menu.
      cy.getByDataHook("permissions-trigger").click()
      cy.getByDataHook("permission-level-write").click()
      cy.getByDataHook("permissions-trigger").should("contain", "Write")

      // Drop to None: trigger label updates back.
      cy.getByDataHook("permissions-trigger").click()
      cy.getByDataHook("permission-level-none").click()
      cy.getByDataHook("permissions-trigger").should("contain", "None")
    })
  })

  describe("gate denies run_query when read=false", () => {
    beforeEach(() => {
      // grantSchemaAccess keeps run_query in the catalog so the tool call fires; the gate refuses execution.
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
    })

    it("returns PERMISSION_DENIED to the model when it calls run_query without read access", () => {
      const expectedDenial = "PERMISSION_DENIED"

      const flow = createToolCallFlow({
        provider: "openai",
        streaming: true,
        question: "Please drop the btc_trades table.",
        steps: [
          {
            toolCall: {
              name: "run_query",
              args: { sql: "DROP TABLE btc_trades" },
            },
          },
          {
            finalResponse: {
              explanation:
                "I cannot drop that table — write access is not granted.",
              sql: null,
            },
            expectToolResult: { includes: [expectedDenial] },
          },
        ],
      })

      flow.intercept()

      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type(flow.question)
      cy.getByDataHook("chat-send-button").click()

      flow.waitForCompletion()

      cy.getByDataHook("chat-message-assistant")
        .should("be.visible")
        .should("contain", "write access is not granted")
    })
  })
})
