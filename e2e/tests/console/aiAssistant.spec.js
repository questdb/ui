/// <reference types="cypress" />

const { createToolCallFlow, createMultiTurnFlow } = require("../../utils")

/**
 * Intercepts AI requests with a custom response body.
 * Use this when you need to control the exact response content.
 *
 * @param {"anthropic" | "openai"} provider - The AI provider to intercept
 * @param {Object} responseBody - The response body to return
 * @param {string} [alias] - Optional custom alias for the intercept
 */
function interceptAIRequestWithResponse(provider, responseBody, alias) {
  const aliasName = alias || `${provider}CustomResponse`

  if (provider === "openai") {
    cy.intercept("POST", "https://api.openai.com/v1/responses", {
      statusCode: 200,
      delay: 200,
      body: responseBody,
    }).as(aliasName)
  } else if (provider === "anthropic") {
    cy.intercept("POST", "https://api.anthropic.com/v1/messages", {
      statusCode: 200,
      delay: 200,
      body: responseBody,
    }).as(aliasName)
  }
}

/**
 * Creates a valid OpenAI response for explain schema requests.
 * @param {Object} schemaData - The schema explanation data
 * @returns {Object} OpenAI response body
 */
function createOpenAIExplainSchemaResponse(schemaData) {
  return {
    id: "resp_mock_schema",
    object: "response",
    created_at: Date.now(),
    status: "completed",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(schemaData),
          },
        ],
      },
    ],
    output_parsed: schemaData,
    usage: {
      input_tokens: 150,
      output_tokens: 200,
    },
  }
}

/**
 * Creates an OpenAI response where output_parsed is null, triggering parse error.
 * This happens when OpenAI cannot parse the response into the expected schema format.
 * @returns {Object} OpenAI response body with null output_parsed
 */
function createOpenAIParseFailureResponse() {
  return {
    id: "resp_mock_parse_fail",
    object: "response",
    created_at: Date.now(),
    status: "completed",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "",
          },
        ],
      },
    ],
    output_parsed: null,
    usage: {
      input_tokens: 150,
      output_tokens: 50,
    },
  }
}

function interceptAIChatRequest(provider, alias, delay = 200) {
  const aliasName = alias || `${provider}ChatRequest`

  if (provider === "openai") {
    cy.intercept("POST", "https://api.openai.com/v1/responses", {
      statusCode: 200,
      delay,
      body: {
        id: "resp_mock_chat",
        object: "response",
        created_at: Date.now(),
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Test response" }],
          },
        ],
      },
    }).as(aliasName)
  } else if (provider === "anthropic") {
    cy.intercept("POST", "https://api.anthropic.com/v1/messages", {
      statusCode: 200,
      delay,
      body: {
        id: "msg_mock_chat",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Test response" }],
        model: "claude-sonnet-4-20250514",
        stop_reason: "end_turn",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      },
    }).as(aliasName)
  }
}

/**
 * Intercepts AI provider token validation requests.
 *
 * @param {"anthropic" | "openai"} provider - The AI provider to intercept
 * @param {boolean} success - If true, returns 200 success response; if false, returns 401 error response
 */
function interceptTokenValidation(provider, success) {
  if (provider === "openai") {
    if (success) {
      cy.intercept("POST", "https://api.openai.com/v1/responses", {
        statusCode: 200,
        delay: 200,
        body: {
          id: "resp_mock_test",
          object: "response",
          created_at: Date.now(),
          status: "completed",
          output: [],
        },
      }).as("openaiValidation")
    } else {
      cy.intercept("POST", "https://api.openai.com/v1/responses", {
        statusCode: 401,
        delay: 200,
        body: {
          error: {
            message:
              "Incorrect API key provided: ***. You can find your API key at https://platform.openai.com/account/api-keys.",
            type: "invalid_request_error",
            param: null,
            code: "invalid_api_key",
          },
        },
      }).as("openaiValidation")
    }
  } else if (provider === "anthropic") {
    if (success) {
      cy.intercept("POST", "https://api.anthropic.com/v1/messages", {
        statusCode: 200,
        delay: 200,
        body: {
          id: "msg_mock_test",
          type: "message",
          role: "assistant",
          content: [],
          model: "claude-sonnet-4-20250514",
          stop_reason: "end_turn",
          usage: {
            input_tokens: 10,
            output_tokens: 5,
          },
        },
      }).as("anthropicValidation")
    } else {
      cy.intercept("POST", "https://api.anthropic.com/v1/messages", {
        statusCode: 401,
        delay: 200,
        body: {
          type: "error",
          error: {
            type: "authentication_error",
            message: "invalid x-api-key",
          },
          request_id: "req_mock_test",
        },
      }).as("anthropicValidation")
    }
  }
}

/**
 * Creates localStorage value for AI assistant settings with OpenAI configured.
 * Use this with cy.loadConsoleWithAuth's localStorageItems parameter.
 *
 * @returns {Object} Object with localStorage key-value pair
 */
function getOpenAIConfiguredSettings() {
  return {
    "ai.assistant.settings": JSON.stringify({
      selectedModel: "gpt-5-mini",
      providers: {
        openai: {
          apiKey: "test-openai-key",
          enabledModels: ["gpt-5-mini", "gpt-5"],
          grantSchemaAccess: true,
        },
      },
    }),
  }
}

describe("ai assistant", () => {
  describe("onboarding and settings", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth()
    })

    it("should display ai assistant promo", () => {
      // When
      cy.getByDataHook("ai-assistant-settings-button")
        .should("be.visible")
        .click()

      // Then
      cy.getByDataHook("ai-promo-modal").should("be.visible")

      // When
      cy.getByDataHook("ai-promo-close").should("be.visible").click()

      // Then
      cy.getByDataHook("ai-promo-modal").should("not.exist")

      // When
      cy.getByDataHook("ai-assistant-settings-button")
        .should("be.visible")
        .click()
      cy.getByDataHook("ai-promo-continue").should("be.visible").click()

      // Then
      cy.getByDataHook("ai-settings-modal-step-one").should("be.visible")
    })

    it("should handle invalid api key", () => {
      // When
      cy.getByDataHook("ai-assistant-settings-button")
        .should("be.visible")
        .click()
      cy.getByDataHook("ai-promo-continue").should("be.visible").click()

      // Then
      cy.getByDataHook("ai-settings-modal-step-one").should("be.visible")
      cy.getByDataHook("ai-settings-api-key")
        .should("be.visible")
        .should("have.attr", "placeholder", "Enter API key")
        .should("be.disabled")

      // When
      cy.getByDataHook("ai-settings-provider-anthropic").click()

      // Then
      cy.getByDataHook("ai-settings-api-key")
        .should("be.visible")
        .should("have.attr", "placeholder", "Enter Anthropic API key")
        .should("not.be.disabled")

      // When
      cy.getByDataHook("ai-settings-provider-openai").click()

      // Then
      cy.getByDataHook("ai-settings-api-key")
        .should("be.visible")
        .should("have.attr", "placeholder", "Enter OpenAI API key")
        .should("not.be.disabled")
      ;["anthropic", "openai"].forEach((provider) => {
        // Given
        interceptTokenValidation(provider, false)

        // When
        cy.getByDataHook(`ai-settings-provider-${provider}`).click()

        // Then
        cy.getByDataHook("ai-settings-api-key")
          .should("be.visible")
          .should(
            "have.attr",
            "placeholder",
            `Enter ${provider === "anthropic" ? "Anthropic" : "OpenAI"} API key`,
          )
          .should("not.be.disabled")
          .should("be.empty")

        // When
        cy.getByDataHook("ai-settings-api-key").type("invalid-api-key")
        cy.getByDataHook("multi-step-modal-next-button").click()

        // Then
        cy.getByDataHook("multi-step-modal-next-button")
          .should("be.disabled")
          .should("contain", "Validating...")

        // When
        cy.wait(`@${provider}Validation`)

        // Then
        cy.getByDataHook("ai-settings-api-key-error").should("be.visible")
      })
    })

    it("should handle valid api key", () => {
      // Given
      cy.getByDataHook("ai-assistant-settings-button")
        .should("be.visible")
        .click()
      cy.getByDataHook("ai-promo-continue").should("be.visible").click()
      ;["anthropic", "openai"].forEach((provider) => {
        // Given
        interceptTokenValidation(provider, true)

        // When
        cy.getByDataHook(`ai-settings-provider-${provider}`).click()

        // When
        cy.getByDataHook("ai-settings-api-key").type("valid-api-key")
        cy.getByDataHook("multi-step-modal-next-button").click()

        // Then
        cy.getByDataHook("ai-settings-modal-step-two").should("be.visible")
        cy.getByDataHook("multi-step-modal-cancel-button").click()
      })
    })

    it("should show ai buttons after setup is completed", () => {
      // Given
      interceptTokenValidation("openai", true)

      // When
      cy.getByDataHook("ai-assistant-settings-button")
        .should("be.visible")
        .click()
      cy.getByDataHook("ai-promo-continue").should("be.visible").click()
      cy.getByDataHook("ai-settings-provider-openai").click()
      cy.getByDataHook("ai-settings-api-key").type("valid-api-key")
      cy.getByDataHook("multi-step-modal-next-button").click()

      // Then
      cy.getByDataHook("ai-settings-modal-step-two").should("be.visible")

      // When
      cy.getByDataHook("multi-step-modal-next-button").click()

      // Then
      cy.getByDataHook("ai-assistant-settings-button").should(
        "contain",
        "Settings",
      )
      cy.getByDataHook("ai-chat-button").should("be.visible")
      cy.getByDataHook("ai-settings-model-dropdown").should("be.visible")

      // When
      cy.getByDataHook("ai-settings-model-dropdown").click()

      // Then
      cy.getByDataHook("ai-settings-model-item").should("be.visible")
      ;[0, 1].forEach((index) => {
        let label = ""
        cy.getByDataHook(`ai-settings-model-item`)
          .eq(index)
          .getByDataHook(`ai-settings-model-item-label`)
          .invoke("text")
          .then((text) => {
            label = text
          })
        cy.getByDataHook(`ai-settings-model-item`).eq(index).click()
        cy.getByDataHook("ai-settings-model-dropdown").should("contain", label)
      })

      // When
      cy.typeQuery("SELECT 1;")

      // Then
      cy.getAIIconInLine(1).should("be.visible")

      // When
      cy.getByDataHook("ai-assistant-settings-button").click()

      // Then
      cy.getByDataHook("ai-settings-validated-badge")
        .should("be.visible")
        .should("contain", "Validated")
      cy.getByDataHook("ai-settings-provider-openai")
        .getByDataHook("ai-settings-provider-status")
        .should("be.visible")
        .should("contain", "Enabled")

      cy.getByDataHook("ai-settings-provider-anthropic")
        .getByDataHook("ai-settings-provider-status")
        .should("be.visible")
        .should("contain", "Inactive")

      // When
      cy.getByDataHook("ai-settings-test-api")
        .should("be.visible")
        .should("contain", "Remove API Key")
        .click()

      // Then
      cy.getByDataHook("ai-settings-validated-badge").should("not.exist")
      cy.getByDataHook("ai-settings-provider-openai")
        .getByDataHook("ai-settings-provider-status")
        .should("be.visible")
        .should("contain", "Inactive")

      // When
      cy.getByDataHook("ai-settings-save").click()

      // Then
      cy.getByDataHook("ai-settings-model-dropdown").should("not.exist")
      cy.getByDataHook("ai-chat-button").should("not.exist")
      cy.getByDataHook("ai-assistant-settings-button").should(
        "contain",
        "Configure",
      )
    })

    it("should not provide schema tools when schema access is disabled", () => {
      const schemaTools = ["get_tables", "get_table_schema"]

      // Given
      interceptTokenValidation("openai", true)

      // When
      cy.getByDataHook("ai-assistant-settings-button")
        .should("be.visible")
        .click()
      cy.getByDataHook("ai-promo-continue").should("be.visible").click()
      cy.getByDataHook("ai-settings-provider-openai").click()
      cy.getByDataHook("ai-settings-api-key").type("valid-api-key")
      cy.getByDataHook("multi-step-modal-next-button").click()

      // Then
      cy.getByDataHook("ai-settings-modal-step-two").should("be.visible")

      // When
      cy.getByDataHook("ai-settings-schema-access").click()
      cy.getByDataHook("multi-step-modal-next-button").click()

      // Then - AI chat should be available
      cy.get(".toast-success-container").should("be.visible").click()
      cy.getByDataHook("ai-chat-button").should("be.visible")

      // When - Open chat and send a message
      interceptAIChatRequest("openai", "chatWithoutSchema")
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type("Hello, test message")
      cy.getByDataHook("chat-send-button").click()

      // Then - Verify request does NOT contain schema tools
      cy.wait("@chatWithoutSchema").then((interception) => {
        const tools = interception.request.body.tools || []
        const toolNames = tools.map((t) => t.name || t.function?.name)
        schemaTools.forEach((schemaTool) => {
          expect(toolNames).to.not.include(schemaTool)
        })
      })

      // When - Open settings modal and enable schema access
      cy.getByDataHook("ai-assistant-settings-button").click()
      cy.getByDataHook("ai-settings-schema-access").click()
      cy.getByDataHook("ai-settings-save").click()
      cy.get(".toast-success-container").should("be.visible").click()

      // When - Send another message
      interceptAIChatRequest("openai", "chatWithSchema")
      cy.getByDataHook("chat-input-textarea").type("Another test message")
      cy.getByDataHook("chat-send-button").click()

      // Then - Verify request DOES contain schema tools
      cy.wait("@chatWithSchema").then((interception) => {
        const tools = interception.request.body.tools || []
        const toolNames = tools.map((t) => t.name || t.function?.name)
        schemaTools.forEach((schemaTool) => {
          expect(toolNames).to.include(schemaTool)
        })
      })
    })

    it("should work with multiple providers", () => {
      const openaiEnabledModels = []
      const anthropicEnabledModels = []

      // Given - Set up OpenAI provider first
      interceptTokenValidation("openai", true)

      // When - Complete setup with OpenAI
      cy.getByDataHook("ai-assistant-settings-button")
        .should("be.visible")
        .click()
      cy.getByDataHook("ai-promo-continue").should("be.visible").click()
      cy.getByDataHook("ai-settings-provider-openai").click()
      cy.getByDataHook("ai-settings-api-key").type("valid-openai-key")
      cy.getByDataHook("multi-step-modal-next-button").click()

      // Then - Should be on step two
      cy.getByDataHook("ai-settings-modal-step-two").should("be.visible")

      // When - Store enabled model labels for OpenAI
      cy.get('[data-model-enabled="true"]').each(($modelRow) => {
        openaiEnabledModels.push($modelRow.attr("data-model"))
      })

      cy.getByDataHook("multi-step-modal-next-button").click()

      // Then - Verify model dropdown shows exactly the enabled OpenAI models
      cy.get(".toast-success-container").should("be.visible").click()
      cy.getByDataHook("ai-settings-model-dropdown").click()
      cy.then(() => {
        cy.getByDataHook("ai-settings-model-item").should(
          "have.length",
          openaiEnabledModels.length,
        )
        openaiEnabledModels.forEach((modelLabel) => {
          cy.getByDataHook("ai-settings-model-item").contains(modelLabel)
        })
      })
      cy.getByDataHook("ai-settings-model-dropdown").click() // close dropdown

      // When - Open settings and configure Anthropic provider
      interceptTokenValidation("anthropic", true)
      cy.getByDataHook("ai-assistant-settings-button").click()

      // Then - OpenAI should show Enabled, Anthropic should show Inactive
      cy.getByDataHook("ai-settings-provider-openai")
        .getByDataHook("ai-settings-provider-status")
        .should("contain", "Enabled")
      cy.getByDataHook("ai-settings-provider-anthropic")
        .getByDataHook("ai-settings-provider-status")
        .should("contain", "Inactive")

      // When - Configure Anthropic
      cy.getByDataHook("ai-settings-provider-anthropic").click()
      cy.getByDataHook("ai-settings-api-key").type("valid-anthropic-key")
      cy.getByDataHook("ai-settings-test-api").click()

      // Then - Should show validating and then validated
      cy.wait("@anthropicValidation")

      // Then - Anthropic should no longer show Inactive
      cy.getByDataHook("ai-settings-provider-anthropic")
        .getByDataHook("ai-settings-provider-status")
        .should("not.contain", "Inactive")

      // When - Store enabled model labels for Anthropic
      cy.get('[data-enabled="true"]').each(($modelRow) => {
        anthropicEnabledModels.push($modelRow.attr("data-model"))
      })

      // When - Save settings
      cy.getByDataHook("ai-settings-save").click()
      cy.get(".toast-success-container").should("be.visible").click()

      // Then - Model dropdown should contain models from both providers
      cy.getByDataHook("ai-settings-model-dropdown").click()
      cy.then(() => {
        const allEnabledModels = [
          ...openaiEnabledModels,
          ...anthropicEnabledModels,
        ]
        cy.getByDataHook("ai-settings-model-item").should(
          "have.length",
          allEnabledModels.length,
        )
        allEnabledModels.forEach((modelLabel) => {
          cy.getByDataHook("ai-settings-model-item").contains(modelLabel)
        })
      })

      // When - Select first OpenAI model and open chat
      cy.then(() => {
        cy.getByDataHook("ai-settings-model-item")
          .contains(openaiEnabledModels[0])
          .click()
      })
      interceptAIChatRequest("openai", "openaiChat")
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type("Test message for OpenAI")
      cy.getByDataHook("chat-send-button").click()

      // Then - Should intercept OpenAI request
      cy.wait("@openaiChat")

      // When - Select first Anthropic model from dropdown
      cy.getByDataHook("ai-settings-model-dropdown").click()
      cy.then(() => {
        cy.getByDataHook("ai-settings-model-item")
          .contains(anthropicEnabledModels[0])
          .click()
      })

      // When - Send another message
      interceptAIChatRequest("anthropic", "anthropicChat")
      cy.getByDataHook("chat-input-textarea").type("Test message for Anthropic")
      cy.getByDataHook("chat-send-button").click()

      // Then - Should intercept Anthropic request
      cy.wait("@anthropicChat")
    })
  })

  describe("ai chat window ergonomics", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
    })

    it("should open chat window with blank state on first open", () => {
      // When - Click the chat button
      cy.getByDataHook("ai-chat-button").should("be.visible").click()

      // Then - Chat window should be visible with blank state
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("chat-blank-state").should("be.visible")
      cy.getByDataHook("chat-window-title").should("contain", "AI Assistant")
    })

    it("should show current empty chat in history", () => {
      // When - Open chat window
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("ai-chat-window").should("be.visible")

      // When - Click history
      cy.getByDataHook("chat-window-history").click()

      // Then - Should see the current empty chat in history
      cy.getByDataHook("chat-history-list").should("be.visible")
      cy.getByDataHook("chat-history-item").should("have.length", 1)
    })

    it("should have new chat disabled when current chat is empty", () => {
      // When - Open chat window
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("ai-chat-window").should("be.visible")

      // Then - New chat button should be disabled (current chat is empty)
      cy.getByDataHook("chat-window-new").should("be.disabled")
    })

    it("should persist messages and restore on reopen", () => {
      // Given - Set up intercept for chat request
      interceptAIChatRequest("openai")

      // When - Open chat and send a message
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type("Hello AI")
      cy.getByDataHook("chat-send-button").click()

      // Then - Message should appear
      cy.wait("@openaiChatRequest")
      cy.getByDataHook("chat-message-user").should("be.visible")
      cy.getByDataHook("chat-message-assistant").should("be.visible")

      // When - Close chat window using close button
      cy.getByDataHook("chat-window-close").click()

      // Then - Chat window should be closed
      cy.getByDataHook("ai-chat-window").should("not.exist")

      // When - Reopen chat window
      cy.getByDataHook("ai-chat-button").click()

      // Then - Previous messages should be restored
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("chat-message-user").should("be.visible")
      cy.getByDataHook("chat-message-assistant").should("be.visible")
    })

    it("should show chats in history after creating multiple chats", () => {
      // Given - Create first chat with a message
      interceptAIChatRequest("openai", "firstChat")
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").type("First chat message")
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@firstChat")
      cy.getByDataHook("chat-message-assistant").should("be.visible")

      // When - Create a new chat
      cy.getByDataHook("chat-window-new").should("not.be.disabled").click()

      // Then - Should see blank state for new chat
      cy.getByDataHook("chat-blank-state").should("be.visible")

      // When - Send message in second chat
      interceptAIChatRequest("openai", "secondChat")
      cy.getByDataHook("chat-input-textarea").type("Second chat message")
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@secondChat")
      cy.getByDataHook("chat-message-assistant").should("be.visible")

      // When - Open history
      cy.getByDataHook("chat-window-history").should("not.be.disabled").click()

      // Then - Should see both chats in history
      cy.getByDataHook("chat-history-list").should("be.visible")
      cy.getByDataHook("chat-history-item").should("have.length", 2)
    })

    it("should rename chats from history", () => {
      // Given - Create a chat with a message
      interceptAIChatRequest("openai")
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").type("Test message")
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@openaiChatRequest")

      // When - Open history and click edit on the chat
      cy.getByDataHook("chat-window-history").click()
      cy.getByDataHook("chat-history-item").first().trigger("mouseover")
      cy.getByDataHook("chat-history-edit").first().click()

      // Then - Rename input should be visible
      cy.getByDataHook("chat-history-rename").should("be.visible")

      // When - Type new name and press Enter
      cy.getByDataHook("chat-history-rename")
        .clear()
        .type("Renamed Chat{enter}")

      // Then - Chat should be renamed
      cy.getByDataHook("chat-history-title")
        .first()
        .should("contain", "Renamed Chat")

      // When - Navigate to that chat
      cy.getByDataHook("chat-history-item").first().click()

      // Then - Chat window title should show the new name
      cy.getByDataHook("chat-window-title").should("contain", "Renamed Chat")
    })

    it("should delete chats from history", () => {
      // Given - Create two chats
      interceptAIChatRequest("openai", "firstChat")
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").type("First message")
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@firstChat")
      cy.getByDataHook("chat-message-assistant").should("be.visible")

      cy.getByDataHook("chat-window-new").click()
      interceptAIChatRequest("openai", "secondChat")
      cy.getByDataHook("chat-blank-state").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type("Second message")
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@secondChat")
      cy.getByDataHook("chat-message-assistant").should("be.visible")

      // When - Open history
      cy.getByDataHook("chat-window-history").click()
      cy.getByDataHook("chat-history-item").should("have.length", 2)

      // When - Delete the first chat
      cy.getByDataHook("chat-history-item").first().trigger("mouseover")
      cy.getByDataHook("chat-history-delete").first().click()

      // Then - Confirm deletion dialog
      cy.contains("button", "Delete").should("be.visible").click()

      // Then - Only one chat should remain
      cy.getByDataHook("chat-history-item").should("have.length", 1)
    })

    it("should delete empty chat when closing chat window", () => {
      // When - Open chat window (creates empty chat)
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("chat-blank-state").should("be.visible")

      // When - Close chat window without sending any message
      cy.getByDataHook("chat-window-close").click()

      // Then - Chat window should be closed
      cy.getByDataHook("ai-chat-window").should("not.exist")

      // When - Reopen chat window
      cy.getByDataHook("ai-chat-button").click()

      // Then - Should see blank state again (empty chat was deleted)
      cy.getByDataHook("chat-blank-state").should("be.visible")
    })

    it("should delete empty chat when creating new chat", () => {
      // Given - Create a chat with a message first
      interceptAIChatRequest("openai")
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").type("First message")
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@openaiChatRequest")
      cy.getByDataHook("chat-message-assistant").should("be.visible")

      // When - Create new chat (which is empty)
      cy.getByDataHook("chat-window-new").click()
      cy.getByDataHook("chat-blank-state").should("be.visible")

      // When - Create another new chat without sending message in previous
      cy.getByDataHook("chat-window-new").should("be.disabled")

      // Then - New chat button should be disabled when current chat is empty
      // (This prevents creating multiple empty chats)
    })

    it("should search chats by name", () => {
      // Given - Create three chats with different names
      const chatNames = [
        "Database Queries",
        "Performance Tips",
        "Schema Design",
      ]

      // Create first chat
      interceptAIChatRequest("openai", "chat1")
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-blank-state").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type("First message")
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@chat1")
      cy.getByDataHook("chat-message-assistant").should("be.visible")

      // Create second chat
      cy.getByDataHook("chat-window-new").should("not.be.disabled").click()
      interceptAIChatRequest("openai", "chat2")
      cy.getByDataHook("chat-blank-state").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type("Second message")
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@chat2")
      cy.getByDataHook("chat-message-assistant").should("be.visible")

      // Create third chat
      cy.getByDataHook("chat-window-new").should("not.be.disabled").click()
      interceptAIChatRequest("openai", "chat3")
      cy.getByDataHook("chat-blank-state").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type("Third message")
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@chat3")
      cy.getByDataHook("chat-message-assistant").should("be.visible")

      // When - Open history
      cy.getByDataHook("chat-window-history").click()
      cy.getByDataHook("chat-history-item").should("have.length", 3)

      // When - Rename each chat
      chatNames.forEach((name, index) => {
        cy.getByDataHook("chat-history-item").eq(index).trigger("mouseover")
        cy.getByDataHook("chat-history-edit").eq(index).click()
        cy.getByDataHook("chat-history-rename").clear().type(`${name}{enter}`)
        cy.getByDataHook("chat-history-title").eq(index).should("contain", name)
      })

      // Then - Search for "Database" should show only one result
      cy.getByDataHook("chat-history-search").type("Database")
      cy.getByDataHook("chat-history-item").should("have.length", 1)
      cy.getByDataHook("chat-history-title").should(
        "contain",
        "Database Queries",
      )

      // When - Search for "Performance"
      cy.getByDataHook("chat-history-search").clear().type("Performance")
      cy.getByDataHook("chat-history-item").should("have.length", 1)
      cy.getByDataHook("chat-history-title").should(
        "contain",
        "Performance Tips",
      )

      // When - Search for "Schema"
      cy.getByDataHook("chat-history-search").clear().type("Schema")
      cy.getByDataHook("chat-history-item").should("have.length", 1)
      cy.getByDataHook("chat-history-title").should("contain", "Schema Design")

      // When - Search for partial match "e" (should match all three)
      cy.getByDataHook("chat-history-search").clear().type("e")
      cy.getByDataHook("chat-history-item").should("have.length", 3)

      // When - Search for non-existent term
      cy.getByDataHook("chat-history-search").clear().type("xyz123")
      cy.getByDataHook("chat-history-item").should("have.length", 0)
      cy.contains("No chats match your search").should("be.visible")

      // When - Clear search with Escape key
      cy.getByDataHook("chat-history-search").type("{esc}")
      cy.getByDataHook("chat-history-search").should("have.value", "")
      cy.getByDataHook("chat-history-item").should("have.length", 3)
    })

    it("should switch between chats from history", () => {
      // Given - Create two chats with different messages
      interceptAIChatRequest("openai", "chat1")
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea")
        .should("be.visible")
        .should("not.be.disabled")
        .type("First chat unique message")
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@chat1")

      cy.getByDataHook("chat-message-assistant")
        .should("be.visible")
        .should("contain", "Failed to parse assistant response.")

      cy.getByDataHook("chat-window-new").should("not.be.disabled").click()
      cy.getByDataHook("chat-blank-state").should("be.visible")
      interceptAIChatRequest("openai", "chat2")
      cy.getByDataHook("chat-input-textarea")
        .should("be.visible")
        .should("not.be.disabled")
        .type("Second chat different content")
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@chat2")

      cy.getByDataHook("chat-message-assistant").should("be.visible")

      // When - Open history
      cy.getByDataHook("chat-window-history").should("not.be.disabled").click()
      cy.getByDataHook("chat-history-item").should("have.length", 2)

      // When - Click on the first chat (older one)
      cy.getByDataHook("chat-history-item")
        .should(($items) => {
          expect($items.eq(1)).not.to.contain("Current")
        })
        .eq(1)
        .click()

      // Then - Should see the first chat's message
      cy.getByDataHook("chat-message-user").should(
        "contain",
        "First chat unique message",
      )

      // When - Go back to history and select second chat
      cy.getByDataHook("chat-window-history").click()
      cy.getByDataHook("chat-history-item").eq(0).click()

      // Then - Should see the second chat's message
      cy.getByDataHook("chat-message-user").should(
        "contain",
        "Second chat different content",
      )
    })
  })

  describe("ai status indicator", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
    })

    it("should show status indicator only when chat window is closed during AI operation", () => {
      // Given - Set up intercept with latency
      interceptAIChatRequest("openai", "slowRequest")

      // When - Open chat window and send a message
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type("Test question for status")
      cy.getByDataHook("chat-send-button").click()

      // Then - Status indicator should NOT be visible while chat is open
      cy.getByDataHook("ai-status-indicator").should("not.exist")

      // When - Close chat window
      cy.getByDataHook("chat-window-close").click()

      // Then - Status indicator should be visible
      cy.getByDataHook("ai-status-indicator").should("be.visible")
      cy.getByDataHook("ai-status-text").should("contain", "Working...")

      // When - Open chat panel again
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("ai-chat-window").should("be.visible")

      // Then - Status indicator should NOT be visible
      cy.getByDataHook("ai-status-indicator").should("not.exist")

      // Cleanup - Wait for request to complete
      cy.wait("@slowRequest")
    })

    it("should open chat window with previous message when clicking View chat button", () => {
      // Given - Set up intercept with latency
      interceptAIChatRequest("openai", "slowRequest")

      // When - Open chat window and send a message
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type("My specific test question")
      cy.getByDataHook("chat-send-button").click()

      // When - Close chat window
      cy.getByDataHook("chat-window-close").click()

      // Then - Status indicator should be visible with View chat button
      cy.getByDataHook("ai-status-indicator").should("be.visible")
      cy.getByDataHook("ai-status-view-chat").should("be.visible")

      // When - Click View chat button
      cy.getByDataHook("ai-status-view-chat").click()

      // Then - Chat window should open and contain the previous message
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("chat-message-user").should(
        "contain",
        "My specific test question",
      )

      // And - Status indicator should be gone
      cy.getByDataHook("ai-status-indicator").should("not.exist")

      // Cleanup - Wait for request to complete
      cy.wait("@slowRequest")
    })

    it("should show aborted status and display cancellation message in chat when aborting", () => {
      // Given - Set up intercept with latency
      interceptAIChatRequest("openai", "slowRequest", 2000)

      // When - Open chat window and send a message
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type("Question to abort")
      cy.getByDataHook("chat-send-button").click()

      // When - Close chat window
      cy.getByDataHook("chat-window-close").click()

      // Then - Status indicator should be visible with Abort button
      cy.getByDataHook("ai-status-indicator").should("be.visible")
      cy.getByDataHook("ai-status-stop").should("be.visible")

      // When - Click Abort button
      cy.getByDataHook("ai-status-stop").click()

      // Then - Status indicator should show Cancelled status
      cy.getByDataHook("ai-status-text").should("contain", "Cancelled")
      cy.getByDataHook("assistant-mode-operation-has-been-cancelled").should(
        "be.visible",
      )

      // Then - After a few seconds, status indicator should disappear
      cy.wait(2000)
      cy.getByDataHook("ai-status-indicator").should("not.exist")

      // When - Open chat window
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("ai-chat-window").should("be.visible")

      // Then - Chat should show cancellation error message
      cy.getByDataHook("chat-message-error")
        .should("be.visible")
        .should("contain", "Operation has been cancelled")
    })
  })

  describe("query - chat integration", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
    })

    it("should show initial query box with quick actions when glyph icon is clicked", () => {
      // Given - Type a query
      cy.typeQuery("SELECT a;")
      cy.clickRunIconInLine(1)
      cy.getByDataHook("error-notification").should("be.visible")

      // Then - AI icon should be in noChat state (hollow)
      cy.getAIIconInLine(1, "noChat").should("be.visible")

      // When - Click on AI icon to open chat window
      cy.getAIIconInLine(1).click()

      // Then - Chat window should open and finish loading
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("chat-input-textarea").should("be.visible") // Wait for loading to complete
      cy.getByDataHook("chat-context-badge")
        .should("be.visible")
        .should("contain", "SELECT a")
      cy.getByDataHook("chat-initial-query-box").should("be.visible")
      cy.getByDataHook("button-explain-query").should("be.visible")
      cy.getByDataHook("button-fix-query").should("be.visible")
    })

    it("should transition AI glyph icon from noChat to highlight to active", () => {
      // Given - Type a query
      cy.typeQuery("SELECT 1;")

      // Then - AI icon should be in noChat state (hollow)
      cy.getAIIconInLine(1, "noChat").should("be.visible")

      // When - Click on AI icon to open chat window
      cy.getAIIconInLine(1).click()

      // Then - Chat window should open and finish loading
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("chat-input-textarea").should("be.visible") // Wait for loading to complete
      cy.getByDataHook("chat-context-badge").should("be.visible")

      // When - Send a message
      interceptAIChatRequest("openai")
      // Use force:true because context badge overlays the textarea
      cy.getByDataHook("chat-input-textarea").type("Explain this query", {
        force: true,
      })
      cy.getByDataHook("chat-send-button").click()

      // Then - AI icon should transition to highlight state
      cy.getAIIconInLine(1, "highlight").should("be.visible")

      // Then - After ~1 second, AI icon should transition to active state
      cy.wait("@openaiChatRequest")
      cy.getAIIconInLine(1, "active").should("be.visible")
    })

    it("should show active state for queries with existing chats", () => {
      // Given - Create two queries
      cy.typeQuery("SELECT 1;\n\nSELECT 2;")

      // Then - Both should be in noChat state initially
      cy.getAIIconInLine(1, "noChat").should("be.visible")
      cy.getAIIconInLine(3, "noChat").should("be.visible")

      // When - Create chat for first query
      cy.getAIIconInLine(1).click()
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("chat-input-textarea").should("be.visible") // Wait for loading
      interceptAIChatRequest("openai", "chat1")
      cy.getByDataHook("chat-input-textarea").type("Explain first query", {
        force: true,
      })
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@chat1")

      // Then - First query should have active state, second should still be noChat
      cy.getAIIconInLine(1, "active").should("be.visible")
      cy.getAIIconInLine(3, "noChat").should("be.visible")

      // When - Create chat for second query
      cy.getAIIconInLine(3).click()
      cy.getByDataHook("chat-input-textarea").should("be.visible") // Wait for loading
      interceptAIChatRequest("openai", "chat2")
      cy.getByDataHook("chat-initial-query-box").should("be.visible")
      cy.getByDataHook("chat-input-textarea")
        .should("not.be.disabled")
        .type("Explain second query", { force: true })
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@chat2")
      cy.wait(2000) // Wait for highlight -> active transition

      // Then - Both queries should have active state
      cy.getAIIconInLine(1, "active").should("be.visible")
      cy.getAIIconInLine(3, "active").should("be.visible")
    })

    it("should toggle chat window when clicking AI icon for current query", () => {
      // Given - Type a query and create a chat
      cy.typeQuery("SELECT 1;")
      cy.getAIIconInLine(1).click()
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("chat-input-textarea").should("be.visible") // Wait for loading
      cy.getByDataHook("chat-initial-query-box").should("be.visible")
      interceptAIChatRequest("openai")
      cy.getByDataHook("chat-input-textarea").type("Test message", {
        force: true,
      })
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@openaiChatRequest")

      // Then - Chat window should be open
      cy.getByDataHook("ai-chat-window").should("be.visible")

      // When - Click AI icon again (should close chat)
      cy.getAIIconInLine(1, "active").click()

      // Then - Chat window should be closed
      cy.getByDataHook("ai-chat-window").should("not.exist")

      // When - Click AI icon again (should open chat)
      cy.getAIIconInLine(1, "active").click()

      // Then - Chat window should be open with previous messages
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("chat-message-user").should("be.visible") // Wait for messages to load
      cy.getByDataHook("chat-message-user").should("contain", "Test message")
    })

    it("should move glyph icons when query position changes", () => {
      // Given - Type a query starting at line 1
      cy.typeQuery("DECLARE @myVar := 'shift-this' select @myVar;")

      // Then - AI icon should be on line 1
      cy.getAIIconInLine(1, "noChat").should("be.visible").click()

      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("chat-input-textarea").should("be.visible")
      cy.getByDataHook("chat-context-badge").should("be.visible")

      interceptAIChatRequest("openai")
      cy.getByDataHook("chat-input-textarea").type("Explain this query", {
        force: true,
      })
      cy.getByDataHook("chat-send-button").click()
      cy.getAIIconInLine(1, "highlight").should("be.visible")

      cy.wait("@openaiChatRequest")
      cy.getByDataHook("chat-message-assistant").should("be.visible")
      cy.getAIIconInLine(1, "active").should("be.visible")

      cy.getByDataHook("chat-window-close").click()
      cy.getByDataHook("ai-chat-window").should("not.exist")

      // When - Add empty lines before the query (press Home, then Enter twice)
      cy.typeQuery("{home}{enter}{enter}")

      // Then - AI icon should move to line 3
      cy.getAIIconInLine(3, "active").should("be.visible")

      // And - Line 1 should not have an AI icon
      cy.get(".glyph-widget-1 .glyph-ai-icon").should("not.exist")
    })

    it("should navigate to query tab when clicking context badge from different tab", () => {
      // Given - Create a query with chat in Tab 1
      cy.typeQuery("SELECT 'tab1_query';")
      cy.getAIIconInLine(1).click()
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("chat-input-textarea").should("be.visible") // Wait for loading
      interceptAIChatRequest("openai", "tab1Chat")
      cy.getByDataHook("chat-input-textarea").type("Message for tab 1", {
        force: true,
      })
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@tab1Chat")

      // When - Open history and rename this chat
      cy.getByDataHook("chat-window-history").click()
      cy.getByDataHook("chat-history-list").should("be.visible") // Wait for history to load
      cy.getByDataHook("chat-history-item").first().trigger("mouseover")
      cy.getByDataHook("chat-history-edit").first().click()
      cy.getByDataHook("chat-history-rename").clear().type("Tab 1 Chat{enter}")

      // When - Close chat and create a new tab
      cy.getByDataHook("chat-window-close").click()
      cy.get(".new-tab-button").click()

      // Then - New tab should be created (2 tabs total now)
      cy.getEditorTabs().should("have.length", 2)
      cy.focused()
        .should("have.class", "monaco-mouse-cursor-text")
        .should("not.be.disabled")

      // When - Create a query with chat in Tab 2
      cy.typeQuery("SELECT 'tab2_query';")
      cy.getAIIconInLine(1).click()
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("chat-input-textarea").should("be.visible") // Wait for loading
      interceptAIChatRequest("openai", "tab2Chat")
      cy.getByDataHook("chat-input-textarea").type("Message for tab 2", {
        force: true,
      })
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@tab2Chat")

      // When - Open history and rename this chat
      cy.getByDataHook("chat-window-history").click()
      cy.getByDataHook("chat-history-list").should("be.visible") // Wait for history to load
      cy.getByDataHook("chat-history-item").first().trigger("mouseover")
      cy.getByDataHook("chat-history-edit").first().click()
      cy.getByDataHook("chat-history-rename").clear().type("Tab 2 Chat{enter}")

      // When - Navigate to Tab 1 Chat via history
      cy.getByDataHook("chat-history-item").contains("Tab 1 Chat").click()

      // Then - Should automatically switch to Tab 1 and show context badge
      cy.getByDataHook("chat-input-textarea").should("be.visible") // Wait for chat to load
      cy.getByDataHook("chat-context-badge").should("contain", "tab1_query")

      // When - Click context badge
      cy.getByDataHook("chat-context-badge").click()

      // Then - Query should be highlighted in the editor
      cy.get(".aiQueryHighlight").should("exist")
      cy.getActiveTabName().should("contain", "SQL")

      // When - Navigate to Tab 2 Chat via history
      cy.getByDataHook("chat-window-history").click()
      cy.getByDataHook("chat-history-list").should("be.visible") // Wait for history to load
      cy.getByDataHook("chat-history-item").contains("Tab 2 Chat").click()

      // Then - Should automatically switch to Tab 2 and show context badge
      cy.getByDataHook("chat-input-textarea").should("be.visible") // Wait for chat to load
      cy.getByDataHook("chat-context-badge").should("contain", "tab2_query")

      // When - Click context badge
      cy.getByDataHook("chat-context-badge").click()

      // Then - Query should be highlighted in the editor
      cy.get(".aiQueryHighlight").should("exist")
      cy.getActiveTabName().should("contain", "SQL 1")
    })
  })

  describe("explain schema", () => {
    before(() => {
      cy.loadConsoleWithAuth()
      cy.createTable("test_trades")
      cy.refreshSchema()
    })
    after(() => {
      cy.loadConsoleWithAuth()
      cy.dropTable("test_trades")
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
    })

    it("should show processing status and display valid schema explanation", () => {
      // Given - Set up intercept with valid schema response
      const validSchemaResponse = createOpenAIExplainSchemaResponse({
        explanation:
          "The test_trades table stores trading data with symbol identification, price values, and timestamps.",
        columns: [
          {
            name: "symbol",
            description: "Stock ticker symbol identifier",
            data_type: "SYMBOL",
          },
          {
            name: "price",
            description: "Trade execution price",
            data_type: "DOUBLE",
          },
          {
            name: "ts",
            description: "Timestamp of the trade",
            data_type: "TIMESTAMP",
          },
        ],
        storage_details: [
          "WAL enabled for durability",
          "Partitioned by DAY",
          "Designated timestamp: ts",
        ],
      })
      interceptAIRequestWithResponse(
        "openai",
        validSchemaResponse,
        "explainSchema",
      )

      cy.refreshSchema()
      // When - Right-click on table and select explain schema
      cy.getByDataHook("schema-table-title")
        .contains("test_trades")
        .rightclick()
      cy.getByDataHook("table-context-menu-explain-schema").click()

      // Then - Chat window should open with processing status
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("assistant-modes-container").should("be.visible")
      cy.getByDataHook("assistant-mode-processing-request").should("be.visible")

      // When - Wait for response
      cy.wait("@explainSchema")

      // Then - Should display the schema explanation content
      cy.getByDataHook("chat-message-assistant").should("be.visible")

      // Verify explanation summary
      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        "The test_trades table stores trading data",
      )

      // Verify Columns section header and table content
      cy.getByDataHook("chat-message-assistant").should("contain", "Columns")
      cy.getByDataHook("chat-message-assistant").should("contain", "symbol")
      cy.getByDataHook("chat-message-assistant").should("contain", "SYMBOL")
      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        "Stock ticker symbol identifier",
      )
      cy.getByDataHook("chat-message-assistant").should("contain", "price")
      cy.getByDataHook("chat-message-assistant").should("contain", "DOUBLE")
      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        "Trade execution price",
      )
      cy.getByDataHook("chat-message-assistant").should("contain", "ts")
      cy.getByDataHook("chat-message-assistant").should("contain", "TIMESTAMP")
      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        "Timestamp of the trade",
      )

      // Verify Storage Details section
      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        "Storage Details",
      )
      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        "WAL enabled for durability",
      )
      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        "Partitioned by DAY",
      )
      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        "Designated timestamp: ts",
      )
    })

    it("should show error when schema explanation fails to parse", () => {
      // Given - Set up intercept with parse failure response (output_parsed: null)
      const parseFailureResponse = createOpenAIParseFailureResponse()
      interceptAIRequestWithResponse(
        "openai",
        parseFailureResponse,
        "explainSchemaFail",
      )

      cy.refreshSchema()
      // When - Right-click on table and select explain schema
      cy.getByDataHook("schema-table-title")
        .contains("test_trades")
        .rightclick()
      cy.getByDataHook("table-context-menu-explain-schema").click()

      // Then - Chat window should open with processing status
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("assistant-modes-container").should("be.visible")
      cy.getByDataHook("assistant-mode-processing-request").should("be.visible")

      // When - Wait for response
      cy.wait("@explainSchemaFail")

      // Then - Should display error message
      cy.getByDataHook("chat-message-error")
        .should("be.visible")
        .should("contain", "An unexpected error occurred. Please try again.")
    })
  })

  describe("tool calls", () => {
    const testTables = ["btc_trades", "ecommerce_stats"]

    before(() => {
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
      testTables.forEach((table) => {
        cy.createTable(table)
      })
      cy.refreshSchema()
    })

    after(() => {
      cy.loadConsoleWithAuth()
      testTables.forEach((table) => {
        cy.dropTableIfExists(table)
      })
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
    })

    it("should provide correct table list when model calls get_tables tool", () => {
      const assistantResponse =
        "I found the following tables in your database: btc_trades and ecommerce_stats."
      const flow = createToolCallFlow({
        question: "What tables are in the database?",
        steps: [
          { toolCall: { name: "get_tables", args: {} } },
          {
            finalResponse: {
              explanation: assistantResponse,
              sql: null,
            },
            expectToolResult: { includes: ["btc_trades", "ecommerce_stats"] },
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
        .should("contain", "btc_trades")
        .should("contain", "ecommerce_stats")

      cy.getByDataHook("assistant-mode-processing-request").should("exist")
      cy.getByDataHook("assistant-mode-reviewing-tables").should("exist")
      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        assistantResponse,
      )
    })

    it("should provide correct schema when model calls get_table_schema tool", () => {
      const flow = createToolCallFlow({
        question: "What is the schema of btc_trades table?",
        steps: [
          {
            toolCall: {
              name: "get_table_schema",
              args: { table_name: "btc_trades" },
            },
          },
          {
            finalResponse: {
              explanation:
                "The btc_trades table has columns: symbol (SYMBOL), side (SYMBOL), price (DOUBLE), amount (DOUBLE), and timestamp (TIMESTAMP).",
              sql: null,
            },
            expectToolResult: {
              includes: [
                "CREATE TABLE",
                "btc_trades",
                "symbol SYMBOL",
                "price DOUBLE",
                "timestamp TIMESTAMP",
              ],
            },
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
        .should("contain", "symbol")
        .should("contain", "price")
        .should("contain", "timestamp")
    })

    it("should handle sequential tool calls (get_tables then get_table_schema)", () => {
      const assistantResponse =
        "The ecommerce_stats table tracks sales data by country and category, including visits, unique visitors, sales amount, and number of products."
      const flow = createToolCallFlow({
        question: "Describe the ecommerce_stats table",
        steps: [
          { toolCall: { name: "get_tables", args: {} } },
          {
            toolCall: {
              name: "get_table_schema",
              args: { table_name: "ecommerce_stats" },
            },
            expectToolResult: { includes: ["btc_trades", "ecommerce_stats"] },
          },
          {
            finalResponse: {
              explanation: assistantResponse,
              sql: null,
            },
            expectToolResult: {
              includes: [
                "CREATE TABLE",
                "ecommerce_stats",
                "country SYMBOL",
                "sales DOUBLE",
              ],
            },
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
        .should("contain", "ecommerce_stats")
        .should("contain", "sales")

      cy.getByDataHook("assistant-mode-processing-request").should("exist")
      cy.getByDataHook("assistant-mode-reviewing-tables").should("exist")
      cy.getByDataHook("assistant-mode-investigating-table-schema").should(
        "be.visible",
      )

      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        assistantResponse,
      )
    })

    it("should retrieve QuestDB table of contents when model calls get_questdb_toc tool", () => {
      // Mock the QuestDB docs TOC endpoint
      cy.intercept("GET", "**/questdb.com/docs/web-console/toc-list.json", {
        statusCode: 200,
        body: {
          functions: ["sum", "avg", "count", "first", "last"],
          operators: ["AND", "OR", "NOT", "IN", "BETWEEN"],
          sql: ["SELECT", "INSERT", "UPDATE", "CREATE TABLE"],
          concepts: ["Partitions", "WAL", "Designated Timestamp"],
          schema: ["Tables", "Columns", "Indexes"],
        },
      }).as("tocRequest")

      const assistantResponse =
        "QuestDB supports various aggregate functions including sum, avg, count, first, and last for data aggregation operations."
      const flow = createToolCallFlow({
        question: "What aggregate functions does QuestDB support?",
        steps: [
          { toolCall: { name: "get_questdb_toc", args: {} } },
          {
            finalResponse: {
              explanation: assistantResponse,
              sql: null,
            },
            expectToolResult: {
              includes: ["sum", "avg", "count", "Functions"],
            },
          },
        ],
      })

      flow.intercept()

      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type(flow.question)
      cy.getByDataHook("chat-send-button").click()

      flow.waitForCompletion()

      // Verify inline status indicators
      cy.getByDataHook("assistant-mode-processing-request").should("exist")
      cy.getByDataHook("assistant-mode-reviewing-docs").should("exist")

      // Verify final response text
      cy.getByDataHook("chat-message-assistant")
        .should("be.visible")
        .should("contain", assistantResponse)

      // Hover on assistant header to reveal token display
      cy.getByDataHook("assistant-header").realHover()

      // Verify token usage is displayed (1 tool call + 1 final = 300 input / 150 output)
      cy.get(".token-display")
        .should("be.visible")
        .should("contain", "300")
        .should("contain", "150")
        .should("contain", "input")
        .should("contain", "output")
    })

    it("should retrieve specific documentation when model calls get_questdb_documentation tool", () => {
      // Mock the QuestDB docs metadata endpoint
      cy.intercept(
        "GET",
        "**/questdb.com/docs/web-console/functions-docs.json",
        {
          statusCode: 200,
          body: [
            {
              path: "reference/function/aggregation.md",
              title: "Aggregation Functions",
              headers: ["sum", "avg", "count"],
              url: "https://questdb.com/docs/reference/function/aggregation.md",
            },
          ],
        },
      ).as("functionsMetadata")

      // Mock the actual documentation content
      cy.intercept(
        "GET",
        "**/questdb.com/docs/reference/function/aggregation.md",
        {
          statusCode: 200,
          body: `# Aggregation Functions

## sum
Returns the sum of all values in a column.

Syntax: \`sum(column)\`

## avg
Returns the average of all values in a column.

Syntax: \`avg(column)\`
`,
        },
      ).as("aggregationDocs")

      const assistantResponse =
        "The sum function returns the sum of all values in a column. Syntax: sum(column)"

      const flow = createToolCallFlow({
        question: "How do I use the sum function in QuestDB?",
        steps: [
          {
            toolCall: {
              name: "get_questdb_documentation",
              args: { category: "functions", items: ["sum"] },
            },
          },
          {
            finalResponse: {
              explanation: assistantResponse,
              sql: "SELECT sum(price) FROM btc_trades;",
            },
            expectToolResult: {
              includes: ["sum", "Returns the sum"],
            },
          },
        ],
      })

      flow.intercept()

      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type(flow.question)
      cy.getByDataHook("chat-send-button").click()

      flow.waitForCompletion()

      // Verify inline status indicators
      cy.getByDataHook("assistant-mode-processing-request").should("exist")
      cy.getByDataHook("assistant-mode-investigating-docs").should("exist")

      // Verify final response text
      cy.getByDataHook("chat-message-assistant")
        .should("be.visible")
        .should("contain", assistantResponse)

      // Hover on assistant header to reveal token display
      cy.getByDataHook("assistant-header").realHover()

      // Verify token usage is displayed (1 tool call + 1 final = 300 input / 150 output)
      cy.get(".token-display")
        .should("be.visible")
        .should("contain", "300")
        .should("contain", "150")
        .should("contain", "input")
        .should("contain", "output")
    })

    it("should validate SQL query syntax using validate_query tool against real QuestDB", () => {
      const assistantResponse =
        "The query is syntactically valid. It will select all columns from the btc_trades table."
      const flow = createToolCallFlow({
        question: "Is this query valid: SELECT * FROM btc_trades",
        steps: [
          {
            toolCall: {
              name: "validate_query",
              args: { query: "SELECT * FROM btc_trades" },
            },
          },
          {
            finalResponse: {
              explanation: assistantResponse,
              sql: "SELECT * FROM btc_trades;",
            },
            expectToolResult: {
              includes: ['"valid": true'],
            },
          },
        ],
      })

      flow.intercept()

      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type(flow.question)
      cy.getByDataHook("chat-send-button").click()

      flow.waitForCompletion()

      // Verify inline status indicators
      cy.getByDataHook("assistant-mode-processing-request").should("exist")
      cy.getByDataHook("assistant-mode-validating-generated-query").should(
        "exist",
      )

      // Verify final response text
      cy.getByDataHook("chat-message-assistant")
        .should("be.visible")
        .should("contain", assistantResponse)

      // Hover on assistant header to reveal token display
      cy.getByDataHook("assistant-header").realHover()

      // Verify token usage is displayed (1 tool call + 1 final = 300 input / 150 output)
      cy.get(".token-display")
        .should("be.visible")
        .should("contain", "300")
        .should("contain", "150")
        .should("contain", "input")
        .should("contain", "output")
    })

    it("should detect invalid SQL syntax using validate_query tool", () => {
      const assistantResponse =
        "The query has syntax errors. 'SELEC' should be 'SELECT' and 'FORM' should be 'FROM'."
      const flow = createToolCallFlow({
        question: "Is this query valid: SELEC * FORM btc_trades",
        steps: [
          {
            toolCall: {
              name: "validate_query",
              args: { query: "SELEC * FORM btc_trades" },
            },
          },
          {
            finalResponse: {
              explanation: assistantResponse,
              sql: "SELECT * FROM btc_trades;",
            },
            expectToolResult: {
              includes: ['"valid": false'],
            },
          },
        ],
      })

      flow.intercept()

      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type(flow.question)
      cy.getByDataHook("chat-send-button").click()

      flow.waitForCompletion()

      // Verify inline status indicators
      cy.getByDataHook("assistant-mode-processing-request").should("exist")
      cy.getByDataHook("assistant-mode-validating-generated-query").should(
        "exist",
      )

      // Verify final response text
      cy.getByDataHook("chat-message-assistant")
        .should("be.visible")
        .should("contain", assistantResponse)

      // Hover on assistant header to reveal token display
      cy.getByDataHook("assistant-header").realHover()

      // Verify token usage is displayed (1 tool call + 1 final = 300 input / 150 output)
      cy.get(".token-display")
        .should("be.visible")
        .should("contain", "300")
        .should("contain", "150")
        .should("contain", "input")
        .should("contain", "output")
    })
  })

  describe("accept and reject suggestions", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
    })

    it("should accept suggestion and update editor", () => {
      // Setup: Use flow to generate SQL suggestion
      const flow = createToolCallFlow({
        question: "Show all data",
        steps: [
          {
            finalResponse: {
              explanation: "Here's a query to show data.",
              sql: "SELECT * FROM btc_trades LIMIT 10;",
            },
          },
        ],
      })

      flow.intercept()

      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type(flow.question)
      cy.getByDataHook("chat-send-button").click()

      flow.waitForCompletion()

      cy.getByDataHook("message-action-accept").should("be.visible")
      cy.getByDataHook("message-action-accept").click()

      cy.getByDataHook("diff-status-accepted").should("contain", "Accepted")
      cy.getByDataHook("chat-context-badge").should(
        "contain",
        "SELECT * FROM btc_trades",
      )

      cy.getByDataHook("chat-context-badge").click()
      cy.get(".aiQueryHighlight").should("exist")
    })

    it("should reject suggestion and show Rejected status", () => {
      const flow = createToolCallFlow({
        question: "Count rows",
        steps: [
          {
            finalResponse: {
              explanation: "Here's a count query.",
              sql: "SELECT count() FROM btc_trades;",
            },
          },
        ],
      })

      flow.intercept()

      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type(flow.question)
      cy.getByDataHook("chat-send-button").click()

      flow.waitForCompletion()

      cy.getByDataHook("message-action-reject").should("be.visible")
      cy.getByDataHook("message-action-reject").click()

      cy.getByDataHook("diff-status-rejected").should("contain", "Rejected")
      cy.getByDataHook("message-action-accept").should("not.exist")
      cy.getByDataHook("message-action-reject").should("not.exist")
      cy.getByDataHook("chat-context-badge").should("not.exist")
    })

    it("should apply previous suggestion to editor using Apply button", () => {
      const flow = createToolCallFlow({
        question: "Get latest price",
        steps: [
          {
            finalResponse: {
              explanation: "Here's a query for latest price.",
              sql: "SELECT price FROM btc_trades LIMIT 1;",
            },
          },
        ],
      })

      flow.intercept()

      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type(flow.question)
      cy.getByDataHook("chat-send-button").click()

      flow.waitForCompletion()

      cy.getByDataHook("message-action-reject").click()

      cy.getByDataHook("message-action-apply").should("be.visible")
      cy.getByDataHook("message-action-apply").click()

      cy.getByDataHook("chat-context-badge").should(
        "contain",
        "SELECT price FROM btc_trades",
      )

      cy.getByDataHook("chat-context-badge").click()
      cy.get(".aiQueryHighlight").should("exist")
    })

    it("should show Followed up status when user sends follow-up without accepting/rejecting", () => {
      const flow = createMultiTurnFlow({
        turns: [
          {
            explanation: "Query for symbols.",
            sql: "SELECT symbol FROM btc_trades;",
          },
          {
            explanation: "Query for unique symbols.",
            sql: "SELECT DISTINCT symbol FROM btc_trades;",
          },
        ],
      })

      flow.intercept()

      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type("Show symbols")
      cy.getByDataHook("chat-send-button").click()

      flow.waitForTurn(0)

      cy.getByDataHook("message-action-accept").should("be.visible")

      cy.getByDataHook("chat-input-textarea").type("Make it unique")
      cy.getByDataHook("chat-send-button").click()

      cy.getByDataHook("inline-diff-container").should("contain", "Followed up")
      cy.getByDataHook("inline-diff-container")
        .getByDataHook("message-action-reject")
        .should("not.exist")
      cy.getByDataHook("inline-diff-container")
        .getByDataHook("message-action-accept")
        .should("not.exist")

      flow.waitForTurn(1)

      // Second suggestion is now the last one - expanded with Accept/Reject buttons
      cy.getByDataHook("chat-message-assistant")
        .eq(1)
        .getByDataHook("inline-diff-container")
        .getByDataHook("message-action-reject")
        .should("be.visible")
      cy.getByDataHook("chat-message-assistant")
        .eq(1)
        .contains("Query for unique symbols.")
        .getByDataHook("message-action-accept")
        .should("be.visible")
    })

    it("should toggle diff view expansion for older suggestions", () => {
      const flow = createMultiTurnFlow({
        turns: [
          { explanation: "First simple query.", sql: "SELECT 1;" },
          { explanation: "Second simple query.", sql: "SELECT 2;" },
        ],
      })

      flow.intercept()

      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type("First query")
      cy.getByDataHook("chat-send-button").click()

      flow.waitForTurn(0)

      // Send second suggestion to make first one collapse
      cy.getByDataHook("chat-input-textarea").type("Second query")
      cy.getByDataHook("chat-send-button").click()

      flow.waitForTurn(1)

      cy.getByDataHook("message-action-accept").should("have.length", 1)

      cy.getByDataHook("diff-open-in-editor-button")
        .first()
        .click({ force: true })
      cy.getByDataHook("diff-editor-container").should("be.visible")
      cy.getByDataHook("diff-reject-button").should("not.exist")
      cy.getByDataHook("diff-accept-button").should("not.exist")

      cy.getByDataHook("diff-open-in-editor-button")
        .eq(1)
        .click({ force: true })
      cy.getByDataHook("diff-editor-container").should("be.visible")
      cy.getByDataHook("diff-reject-button").should("be.visible")
      cy.getByDataHook("diff-accept-button").should("be.visible")
    })

    it("should correctly maintain the history for multi-turn actions", () => {
      const flow = createMultiTurnFlow({
        turns: [
          { explanation: "This is 1", sql: "SELECT 1;" },
          { explanation: "This is 2", sql: "SELECT 2;" },
          { explanation: "This is 3", sql: "SELECT 3;" },
          { explanation: "This is 4", sql: "SELECT 4;" },
          { explanation: "This is 5", sql: "SELECT 5;" },
          { explanation: "This is 6", sql: "SELECT 6;" },
        ],
      })

      flow.intercept()

      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").should("be.visible")
      cy.getByDataHook("chat-context-badge").should("not.exist")

      // Turn 0: User sends "select 1"
      cy.getByDataHook("chat-input-textarea").type("select 1")
      cy.getByDataHook("chat-send-button").click()

      flow.waitForTurn(0).then(() => {
        const body = flow.getRequestBody(0)
        expect(body.input).to.have.length(1)
        expect(body.input[0].content).to.include("select 1")
      })
      cy.getByDataHook("inline-diff-container").should("have.length", 1)

      cy.getByDataHook("message-action-accept").should("be.visible")
      cy.getByDataHook("chat-context-badge").should("not.exist")

      // Turn 1: User sends "select 2" without accepting/rejecting turn 0
      cy.getByDataHook("chat-input-textarea").type("select 2")
      cy.getByDataHook("chat-send-button").click()

      flow.waitForTurn(1).then(() => {
        const body = flow.getRequestBody(1)
        expect(body.input).to.have.length(3)
        expect(body.input[2].content).to.include("select 2")
      })
      cy.getByDataHook("inline-diff-container").should("have.length", 2)

      // Accept turn 1's suggestion (SELECT 2)
      cy.getByDataHook("message-action-accept").click()
      cy.getByDataHook("inline-diff-container")
        .contains("Accepted")
        .should("be.visible")
      cy.getByDataHook("chat-context-badge").should("contain", "SELECT 2")
      cy.getByDataHook("chat-context-badge").click()
      cy.get(".aiQueryHighlight").should("exist")

      // Turn 2: User sends "select 3" - should see "User accepted" message
      cy.getByDataHook("chat-input-textarea").type("select 3", { force: true })
      cy.getByDataHook("chat-send-button").click()

      flow.waitForTurn(2).then(() => {
        const body = flow.getRequestBody(2)
        expect(body.input).to.have.length(6)
        expect(body.input[4].content).to.include("User accepted")
        expect(body.input[4].content).to.include("SELECT 2")
        expect(body.input[5].content).to.include("select 3")
      })
      cy.getByDataHook("inline-diff-container").should("have.length", 3)

      cy.getByDataHook("inline-diff-container")
        .eq(2)
        .getByDataHook("message-action-accept")
        .should("exist")

      // Turn 3: User sends "select 4"
      cy.getByDataHook("chat-input-textarea").type("select 4", { force: true })
      cy.getByDataHook("chat-send-button").click()

      flow.waitForTurn(3).then(() => {
        const body = flow.getRequestBody(3)
        expect(body.input).to.have.length(8)
        expect(body.input[7].content).to.include("select 4")
      })
      cy.getByDataHook("inline-diff-container").should("have.length", 4)

      // Reject turn 3's suggestion (SELECT 4)
      cy.getByDataHook("message-action-reject").click()
      cy.getByDataHook("diff-status-rejected").should("contain", "Rejected")

      // Turn 4: User sends "select 5" - should see "User rejected" message
      cy.getByDataHook("chat-input-textarea").type("select 5", { force: true })
      cy.getByDataHook("chat-send-button").click()

      flow.waitForTurn(4).then(() => {
        const body = flow.getRequestBody(4)
        expect(body.input).to.have.length(11)
        expect(body.input[9].content).to.include("User rejected")
        expect(body.input[10].content).to.include("select 5")
      })
      cy.getByDataHook("inline-diff-container").should("have.length", 5)
      // Accept turn 4's suggestion (SELECT 5)
      cy.getByDataHook("message-action-accept").click()
      cy.getByDataHook("inline-diff-container")
        .eq(4)
        .contains("Accepted")
        .should("be.visible")
      cy.getByDataHook("chat-context-badge").should("contain", "SELECT 5")

      // Turn 5: Final turn - should see "User accepted" for SELECT 5
      cy.getByDataHook("chat-input-textarea").type("select 6", { force: true })
      cy.getByDataHook("chat-send-button").click()

      flow.waitForTurn(5).then(() => {
        const body = flow.getRequestBody(5)
        expect(body.input).to.have.length(14)
        expect(body.input[12].content).to.include("User accepted")
        expect(body.input[13].content).to.include("select 6")
      })
      cy.getByDataHook("inline-diff-container").should("have.length", 6)
    })
  })
})
