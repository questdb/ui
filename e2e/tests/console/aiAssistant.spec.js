/// <reference types="cypress" />
function interceptAIChatRequest(provider, alias) {
  const aliasName = alias || `${provider}ChatRequest`

  if (provider === "openai") {
    cy.intercept("POST", "https://api.openai.com/v1/responses", {
      statusCode: 200,
      delay: 200,
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
      delay: 200,
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

      // When - Create a new chat
      cy.getByDataHook("chat-window-new").should("not.be.disabled").click()

      // Then - Should see blank state for new chat
      cy.getByDataHook("chat-blank-state").should("be.visible")

      // When - Send message in second chat
      interceptAIChatRequest("openai", "secondChat")
      cy.getByDataHook("chat-input-textarea").type("Second chat message")
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@secondChat")

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

      cy.getByDataHook("chat-window-new").click()
      interceptAIChatRequest("openai", "secondChat")
      cy.getByDataHook("chat-input-textarea").type("Second message")
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@secondChat")

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
      cy.getByDataHook("chat-input-textarea").type("First message")
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@chat1")

      // Create second chat
      cy.getByDataHook("chat-window-new").click()
      interceptAIChatRequest("openai", "chat2")
      cy.getByDataHook("chat-input-textarea").type("Second message")
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@chat2")

      // Create third chat
      cy.getByDataHook("chat-window-new").click()
      interceptAIChatRequest("openai", "chat3")
      cy.getByDataHook("chat-input-textarea").type("Third message")
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@chat3")

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
      cy.getByDataHook("chat-input-textarea").type("First chat unique message")
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@chat1")

      cy.getByDataHook("chat-window-new").click()
      interceptAIChatRequest("openai", "chat2")
      cy.getByDataHook("chat-input-textarea").type(
        "Second chat different content",
      )
      cy.getByDataHook("chat-send-button").click()
      cy.wait("@chat2")

      // When - Open history
      cy.getByDataHook("chat-window-history").click()
      cy.getByDataHook("chat-history-item").should("have.length", 2)

      // When - Click on the first chat (older one)
      cy.getByDataHook("chat-history-item").eq(1).click()

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
      cy.getByDataHook("chat-input-textarea").type("Explain second query", {
        force: true,
      })
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
      cy.typeQuery("SELECT 1;")

      // Then - AI icon should be on line 1
      cy.getAIIconInLine(1, "noChat").should("be.visible")

      // When - Add empty lines before the query (press Home, then Enter twice)
      cy.get(".monaco-editor textarea").type("{home}{enter}{enter}")

      // Then - AI icon should move to line 3
      cy.getAIIconInLine(3, "noChat").should("be.visible")

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
})
