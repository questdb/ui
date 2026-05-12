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

    it("renders three permission checkboxes with cascade visible in SettingsModal", () => {
      cy.getByDataHook("ai-assistant-settings-button")
        .should("be.visible")
        .click()

      cy.getByDataHook("permissions").should("be.visible")
      cy.getByDataHook("permission-schema").should("be.checked")
      cy.getByDataHook("permission-read").should("not.be.checked")
      cy.getByDataHook("permission-write").should("not.be.checked")

      // Cascade: check Write → both Read and Schema lock as checked.
      cy.getByDataHook("permission-write").check()
      cy.getByDataHook("permission-write").should("be.checked")
      cy.getByDataHook("permission-read").should("be.checked")
      cy.getByDataHook("permission-read").should("be.disabled")
      cy.getByDataHook("permission-schema").should("be.checked")
      cy.getByDataHook("permission-schema").should("be.disabled")

      // Reverse cascade: unchecking Schema also clears Read and Write.
      cy.getByDataHook("permission-write").uncheck()
      cy.getByDataHook("permission-read").uncheck()
      cy.getByDataHook("permission-schema").uncheck()
      cy.getByDataHook("permission-schema").should("not.be.checked")
      cy.getByDataHook("permission-read").should("not.be.checked")
      cy.getByDataHook("permission-write").should("not.be.checked")
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
