/// <reference types="cypress" />

const {
  PROVIDERS,
  interceptAIChatRequest,
  getAnthropicConfiguredSettings,
  getOpenAIConfiguredSettings,
  createResponse,
  createFinalResponseData,
  createChatTitleResponse,
  isTitleRequest,
} = require("../utils/aiAssistant")

const OPENAI_MODELS_URL = "https://api.openai.com/v1/models*"
const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models*"

const OPENAI_LISTING = {
  object: "list",
  data: [
    { id: "gpt-5.4", object: "model", created: 1772000000 },
    { id: "gpt-5-mini", object: "model", created: 1754500000 },
    { id: "gpt-5", object: "model", created: 1754400000 },
    { id: "gpt-5-nano", object: "model", created: 1754300000 },
    { id: "gpt-5-2025-08-06", object: "model", created: 1754400000 },
    { id: "whisper-1", object: "model", created: 1677532384 },
  ],
}

const ANTHROPIC_LISTING = {
  data: [
    {
      type: "model",
      id: "claude-opus-4-5",
      display_name: "Claude Opus 4.5",
      created_at: "2025-11-01T00:00:00Z",
    },
    {
      type: "model",
      id: "claude-sonnet-4-5",
      display_name: "Claude Sonnet 4.5",
      created_at: "2025-09-29T00:00:00Z",
    },
    {
      type: "model",
      id: "claude-haiku-4-5",
      display_name: "Claude Haiku 4.5",
      created_at: "2025-10-01T00:00:00Z",
    },
  ],
  has_more: false,
  first_id: "claude-opus-4-5",
  last_id: "claude-haiku-4-5",
}

function interceptOpenAIListing(options = {}) {
  cy.intercept("GET", OPENAI_MODELS_URL, {
    statusCode: 200,
    delay: options.delay ?? 200,
    body: OPENAI_LISTING,
  }).as("openaiListing")
}

function interceptAnthropicListing(options = {}) {
  cy.intercept("GET", ANTHROPIC_MODELS_URL, {
    statusCode: 200,
    delay: options.delay ?? 200,
    body: ANTHROPIC_LISTING,
  }).as("anthropicListing")
}

function readAiSettings(win) {
  return JSON.parse(win.localStorage.getItem("ai.assistant.settings"))
}

function interceptChatAnswer(provider, alias, answer) {
  cy.intercept("POST", PROVIDERS[provider].endpoint, (req) => {
    if (isTitleRequest(provider, req.body)) {
      req.reply(createChatTitleResponse(provider, "Test Chat"))
      return
    }
    req.alias = alias
    req.reply(
      createResponse(provider, createFinalResponseData(provider, answer), {
        streaming: req.body.stream === true,
      }),
    )
  })
}

describe("ai provider setup flows", () => {
  beforeEach(() => {
    cy.intercept("POST", PROVIDERS.openai.endpoint, (req) => {
      throw new Error(
        `Unhandled OpenAI request detected! Request body: ${JSON.stringify(req.body).slice(0, 200)}...`,
      )
    }).as("unhandledOpenAI")

    cy.intercept("POST", PROVIDERS.anthropic.endpoint, (req) => {
      throw new Error(
        `Unhandled Anthropic request detected! Request body: ${JSON.stringify(req.body).slice(0, 200)}...`,
      )
    }).as("unhandledAnthropic")

    cy.intercept("GET", "https://api.openai.com/v1/models*", () => {
      throw new Error("Unhandled OpenAI model listing request detected!")
    }).as("unhandledOpenAIModels")

    cy.intercept("GET", "https://api.anthropic.com/v1/models*", () => {
      throw new Error("Unhandled Anthropic model listing request detected!")
    }).as("unhandledAnthropicModels")
  })

  it("onboards a first-run OpenAI user from key to a reasoning chat and its fallback", () => {
    // Given a fresh console with intercepted OpenAI endpoints
    cy.loadConsoleWithAuth()
    cy.intercept("GET", OPENAI_MODELS_URL, {
      statusCode: 401,
      delay: 200,
      body: {
        error: {
          message: "Incorrect API key provided",
          type: "invalid_request_error",
          param: null,
          code: "invalid_api_key",
        },
      },
    }).as("openaiListing")

    // When the wizard opens and an invalid key is validated
    cy.getByDataHook("ai-assistant-settings-button").click()
    cy.getByDataHook("ai-promo-continue").click()
    cy.getByDataHook("ai-settings-provider-openai").click()
    cy.getByDataHook("ai-settings-api-key").type("invalid-key")
    cy.getByDataHook("multi-step-modal-next-button").click()
    cy.wait("@openaiListing")

    // Then the field shows an inline error and stays on step one
    cy.getByDataHook("ai-settings-api-key-error").should(
      "contain",
      "Invalid API key",
    )
    cy.getByDataHook("ai-settings-modal-step-one").should("be.visible")

    // When the key is corrected and validated
    interceptOpenAIListing()
    cy.getByDataHook("ai-settings-api-key").clear().type("valid-key")
    cy.getByDataHook("multi-step-modal-next-button").click()
    cy.wait("@openaiListing")
    cy.getByDataHook("ai-settings-modal-step-two").should("be.visible")

    // Then activating with no model shows the footer error bar
    cy.getByDataHook("multi-step-modal-next-button").click()
    cy.getByDataHook("multi-step-modal-error").should(
      "contain",
      "Please enable at least one model",
    )

    // When a listed model and a manual model are enabled
    cy.getByDataHook("configure-models-model-row").contains("gpt-5.4").click()
    cy.getByDataHook("configure-models-manual-model-input").type(
      "my-proxy-model",
    )
    cy.getByDataHook("configure-models-add-model-button").click()

    // Then the manual model shows as a chip and the error bar is gone on retry
    cy.getByDataHook("configure-models-model-chip").should(
      "contain",
      "my-proxy-model",
    )

    // When reasoning is set to High and the assistant is activated
    cy.getByDataHook("reasoning-trigger").click()
    cy.getByDataHook("reasoning-level-high").click()
    cy.getByDataHook("multi-step-modal-next-button").click()
    cy.get(".toast-success-container").should("be.visible").click()

    // Then the assistant controls and editor action become available
    cy.getByDataHook("ai-assistant-settings-button").should(
      "contain",
      "AI Settings",
    )
    cy.getByDataHook("ai-chat-button").should("be.visible")
    cy.getByDataHook("ai-settings-model-dropdown").should("be.visible")
    cy.typeQueryDirectly("SELECT 1;")
    cy.getAIIconInLine(1).should("be.visible")

    // Then the persisted settings carry the whole configuration
    cy.window().then((win) => {
      const settings = readAiSettings(win)
      expect(settings.selectedModel).to.equal("openai:gpt-5.4")
      expect(settings.providers.openai.enabledModels).to.deep.equal([
        "openai:gpt-5.4",
        "openai:my-proxy-model",
      ])
      expect(settings.providers.openai.reasoningEffort).to.equal("high")
      expect(settings.providers.openai.utilityModel).to.equal(
        "openai:gpt-5-nano",
      )
      expect(settings.providers.openai.modelLabels).to.deep.equal({
        "gpt-5.4": "GPT 5.4",
        "my-proxy-model": "my-proxy-model",
      })
    })

    // When a chat message is sent
    cy.intercept("POST", PROVIDERS.openai.endpoint, (req) => {
      if (isTitleRequest("openai", req.body)) {
        req.alias = "chatTitle"
        expect(req.body.model).to.equal("gpt-5-nano")
        req.reply(createChatTitleResponse("openai", "Test Chat"))
        return
      }
      expect(req.body.model).to.equal("gpt-5.4")
      req.alias = "reasoningChat"
      req.reply(
        createResponse(
          "openai",
          createFinalResponseData("openai", "First answer"),
          { streaming: req.body.stream === true },
        ),
      )
    })
    cy.getByDataHook("ai-chat-button").click()
    cy.getByDataHook("chat-input-textarea").type("hello")
    cy.getByDataHook("chat-send-button").click()

    // Then the request leaves the browser with high reasoning effort
    cy.wait("@reasoningChat")
      .its("request.body.reasoning")
      .should("deep.equal", { effort: "high", summary: "auto" })

    cy.wait("@chatTitle")
      .its("request.body.model")
      .should("equal", "gpt-5-nano")
    cy.getByDataHook("chat-message-assistant").should("contain", "First answer")
    cy.getByDataHook("chat-stop-button").should("not.exist")

    // When the model rejects the reasoning parameter on the next message
    cy.intercept("POST", PROVIDERS.openai.endpoint, (req) => {
      if (isTitleRequest("openai", req.body)) {
        req.reply(createChatTitleResponse("openai", "Test Chat"))
        return
      }
      if (req.body.reasoning) {
        req.alias = "rejectedChat"
        req.reply({
          statusCode: 400,
          body: {
            error: {
              message:
                "Unsupported parameter: 'reasoning.effort' is not supported with this model.",
              type: "invalid_request_error",
              param: "reasoning.effort",
              code: "unsupported_parameter",
            },
          },
        })
        return
      }
      req.alias = "strippedRetry"
      req.reply(
        createResponse(
          "openai",
          createFinalResponseData("openai", "Fallback answer"),
          { streaming: req.body.stream === true },
        ),
      )
    })
    cy.getByDataHook("chat-input-textarea").type("again")
    cy.getByDataHook("chat-send-button").click()

    // Then the rejected request is retried without reasoning
    cy.wait("@rejectedChat")
    cy.wait("@strippedRetry").then((interception) => {
      expect(interception.request.body).to.not.have.property("reasoning")
    })

    cy.getByDataHook("chat-message-assistant").should(
      "contain",
      "Fallback answer",
    )

    // And the downgrade is surfaced and persisted as Default
    cy.get(".toast-info-container").should(
      "contain",
      "Reasoning preference changed to Default",
    )
    cy.window().then((win) => {
      const settings = readAiSettings(win)
      expect(settings.providers.openai.reasoningEffort).to.equal("default")
    })
  })

  it("keeps the provider identity of identical built-in model ids", () => {
    // Given
    cy.loadConsoleWithAuth(false, {
      "ai.assistant.settings": JSON.stringify({
        modelValueFormat: 2,
        selectedModel: "anthropic:shared-model",
        providers: {
          anthropic: {
            apiKey: "test-anthropic-key",
            enabledModels: ["anthropic:shared-model"],
            grantSchemaAccess: false,
          },
          openai: {
            apiKey: "test-openai-key",
            enabledModels: ["openai:shared-model"],
            grantSchemaAccess: false,
          },
        },
      }),
    })

    // Both rows keep the raw model name as their visible label.
    cy.getByDataHook("ai-settings-model-dropdown").click()
    cy.getByDataHook("ai-settings-model-item")
      .should("have.length", 2)
      .find("[data-hook='ai-settings-model-item-label']")
      .each(($label) => {
        expect($label.text()).to.equal("Shared Model")
      })

    // Selecting the OpenAI row persists its provider-qualified identity.
    cy.getByDataHook("ai-settings-model-item").eq(1).click()
    cy.window().then((win) => {
      expect(readAiSettings(win).selectedModel).to.equal("openai:shared-model")
    })

    // Execution uses that identity to select the OpenAI provider.
    interceptAIChatRequest("openai", "overlappingOpenAIModel")
    cy.getByDataHook("ai-chat-button").click()
    cy.getByDataHook("chat-input-textarea").type("hello")
    cy.getByDataHook("chat-send-button").click()
    // Then
    cy.wait("@overlappingOpenAIModel").then(({ request }) => {
      expect(request.body.model).to.equal("shared-model")
      expect(request.headers.authorization).to.equal("Bearer test-openai-key")
    })
    cy.getByDataHook("chat-message-assistant").should(
      "contain",
      "Test response explanation",
    )
  })

  it("manages the OpenAI provider lifecycle from the settings modal", () => {
    // Given a console already configured with Anthropic
    cy.loadConsoleWithAuth(false, getAnthropicConfiguredSettings())
    interceptOpenAIListing()

    // When an OpenAI key validates
    cy.getByDataHook("ai-assistant-settings-button").click()
    cy.getByDataHook("ai-settings-provider-openai").click()
    cy.getByDataHook("ai-settings-api-key").type("key-one")
    cy.getByDataHook("ai-settings-test-api").click()
    cy.wait("@openaiListing")

    // When two models are enabled and the nested picker saves
    cy.getByDataHook("manage-models-model-row").contains("gpt-5.4").click()
    cy.getByDataHook("manage-models-model-row").contains("gpt-5-mini").click()
    cy.getByDataHook("manage-models-save").click()
    cy.getByDataHook("manage-models-save").should("not.exist")

    // When the parent modal closes without Save Settings and the page reloads
    cy.getByDataHook("ai-settings-cancel").click()
    cy.reload()
    cy.getEditor().should("be.visible")

    // Then the picks survive and an OpenAI model can be selected
    cy.getByDataHook("ai-settings-model-dropdown").click()
    cy.getByDataHook("ai-settings-model-item").should("have.length", 4)
    cy.getByDataHook("ai-settings-model-item").contains("GPT 5.4").click()

    // When the picker reopens manually it refetches a fresh listing
    interceptOpenAIListing()
    cy.getByDataHook("ai-assistant-settings-button").click()
    cy.getByDataHook("ai-settings-provider-openai").click()
    cy.getByDataHook("reasoning-trigger").click()
    cy.getByDataHook("reasoning-level-high").click()
    cy.getByDataHook("permissions-trigger").click()
    cy.getByDataHook("permission-level-write").click()
    cy.getByDataHook("ai-settings-manage-models").click()
    cy.wait("@openaiListing")

    // And unticking the selected model keeps the selection on OpenAI
    cy.getByDataHook("manage-models-model-row")
      .contains("gpt-5.4")
      .closest("label")
      .find("input[type=checkbox]")
      .click()
    cy.getByDataHook("manage-models-save").click()
    cy.getByDataHook("manage-models-save").should("not.exist")
    cy.window().then((win) => {
      const settings = readAiSettings(win)
      expect(settings.selectedModel).to.equal("openai:gpt-5-mini")
      expect(settings.providers.openai.grantSchemaAccess).to.equal(true)
      expect(settings.providers.openai.read).to.equal(false)
      expect(settings.providers.openai.write).to.equal(false)
      expect(settings.providers.openai.reasoningEffort).to.equal(undefined)
    })

    // Then cancelling the parent discards its permission and reasoning drafts
    cy.getByDataHook("ai-settings-cancel").click()
    cy.reload()
    cy.getEditor().should("be.visible")
    cy.window().then((win) => {
      const settings = readAiSettings(win)
      expect(settings.selectedModel).to.equal("openai:gpt-5-mini")
      expect(settings.providers.openai.enabledModels).to.deep.equal([
        "openai:gpt-5-mini",
      ])
      expect(settings.providers.openai.grantSchemaAccess).to.equal(true)
      expect(settings.providers.openai.read).to.equal(false)
      expect(settings.providers.openai.write).to.equal(false)
      expect(settings.providers.openai.reasoningEffort).to.equal(undefined)
    })
  })

  it("should not provide schema tools when schema access is disabled", () => {
    const schemaTools = ["get_tables", "get_table_schema"]

    // Given
    cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())

    // When
    cy.getByDataHook("ai-assistant-settings-button").click()
    cy.getByDataHook("permissions-trigger").click()
    cy.getByDataHook("permission-level-none").click()
    cy.getByDataHook("ai-settings-save").click()

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

    cy.getByDataHook("chat-message-assistant").should(
      "contain",
      "Test response explanation",
    )
    cy.getByDataHook("chat-stop-button").should("not.exist")

    // When - Open settings modal and re-enable schema access
    cy.getByDataHook("ai-assistant-settings-button").click()
    cy.getByDataHook("permissions-trigger").click()
    cy.getByDataHook("permission-level-schema").click()
    cy.getByDataHook("ai-settings-save").click()

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
    const openaiEnabledModels = ["GPT 5.4", "GPT 5 Mini"]
    const anthropicEnabledModels = ["Claude Opus 4.5", "Claude Sonnet 4.5"]

    // Given
    cy.loadConsoleWithAuth(false, {
      "ai.assistant.settings": JSON.stringify({
        modelValueFormat: 2,
        selectedModel: "openai:gpt-5.4",
        providers: {
          openai: {
            apiKey: "valid-openai-key",
            enabledModels: ["openai:gpt-5.4", "openai:gpt-5-mini"],
            grantSchemaAccess: true,
          },
        },
      }),
    })

    // When - Open settings and configure Anthropic provider
    interceptAnthropicListing()
    cy.getByDataHook("ai-assistant-settings-button").click()

    // Then - OpenAI should show Enabled, Anthropic should show Inactive
    cy.getByDataHook("ai-settings-provider-openai")
      .find("[data-hook=ai-settings-provider-status]")
      .should("contain", "Enabled")
    cy.getByDataHook("ai-settings-provider-anthropic")
      .find("[data-hook=ai-settings-provider-status]")
      .should("contain", "Inactive")

    // When - Configure Anthropic
    cy.getByDataHook("ai-settings-provider-anthropic").click()
    cy.getByDataHook("ai-settings-api-key").type("valid-anthropic-key")
    cy.getByDataHook("ai-settings-test-api").click()

    // Then - Validation opens Manage Models with the fetched listing
    cy.wait("@anthropicListing")
    cy.getByDataHook("manage-models-model-row").should("have.length", 3)

    // When - Enable two Anthropic models and save the picker
    cy.getByDataHook("manage-models-model-row")
      .contains("Claude Opus 4.5")
      .click()
    cy.getByDataHook("manage-models-model-row")
      .contains("Claude Sonnet 4.5")
      .click()
    cy.getByDataHook("manage-models-save").click()

    // Then - Anthropic should no longer show Inactive
    cy.getByDataHook("ai-settings-provider-anthropic")
      .find("[data-hook=ai-settings-provider-status]")
      .should("not.contain", "Inactive")

    // When - Save settings (the picker's own save may still show its toast)
    cy.getByDataHook("ai-settings-save").click()
    cy.get(".toast-success-container")
      .should("be.visible")
      .click({ multiple: true })

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
    interceptChatAnswer("openai", "openaiChat", "OpenAI answer")
    cy.getByDataHook("ai-chat-button").click()
    cy.getByDataHook("ai-chat-window").should("be.visible")
    cy.getByDataHook("chat-input-textarea").type("Test message for OpenAI")
    cy.getByDataHook("chat-send-button").click()

    // Then - Should intercept OpenAI request
    cy.wait("@openaiChat").then(({ request }) => {
      expect(request.body.model).to.equal("gpt-5.4")
      expect(request.headers.authorization).to.equal("Bearer valid-openai-key")
    })
    cy.getByDataHook("chat-message-assistant").should(
      "contain",
      "OpenAI answer",
    )
    cy.getByDataHook("chat-stop-button").should("not.exist")

    // When - Select first Anthropic model from dropdown
    cy.getByDataHook("ai-settings-model-dropdown").click()
    cy.then(() => {
      cy.getByDataHook("ai-settings-model-item")
        .contains(anthropicEnabledModels[0])
        .click()
    })

    // When - Send another message
    interceptChatAnswer("anthropic", "anthropicChat", "Anthropic answer")
    cy.getByDataHook("chat-input-textarea").type("Test message for Anthropic")
    cy.getByDataHook("chat-send-button").click()

    // Then - Should intercept Anthropic request
    cy.wait("@anthropicChat").then(({ request }) => {
      expect(request.body.model).to.equal("claude-opus-4-5")
      expect(request.headers["x-api-key"]).to.equal("valid-anthropic-key")
    })
    cy.getByDataHook("chat-message-assistant").should(
      "contain",
      "Anthropic answer",
    )
  })
})
