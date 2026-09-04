/// <reference types="cypress" />

const {
  PROVIDERS,
  interceptAIChatRequest,
  getAnthropicConfiguredSettings,
  createResponse,
  createFinalResponseData,
  createChatTitleResponse,
  isTitleRequest,
} = require("../../utils/aiAssistant")

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

/**
 * Intercepts AI provider model listing requests.
 * Validation now runs through GET /v1/models, so a mocked listing both
 * validates the key and feeds the model picker.
 *
 * The OpenAI listing carries noise (whisper-1) that the picker must filter,
 * and `created` timestamps that drive newest-first ordering.
 *
 * @param {"anthropic" | "openai"} provider - The AI provider to intercept
 * @param {boolean} success - If true, returns 200 with a listing; if false, returns 401
 */
function interceptTokenValidation(provider, success) {
  if (provider === "openai") {
    if (success) {
      cy.intercept("GET", "https://api.openai.com/v1/models*", {
        statusCode: 200,
        delay: 200,
        body: {
          object: "list",
          data: [
            { id: "gpt-5.4", object: "model", created: 1772000000 },
            { id: "gpt-5-mini", object: "model", created: 1754500000 },
            { id: "gpt-5", object: "model", created: 1754400000 },
            { id: "gpt-5-nano", object: "model", created: 1754300000 },
            { id: "whisper-1", object: "model", created: 1677532384 },
          ],
        },
      }).as("openaiValidation")
    } else {
      cy.intercept("GET", "https://api.openai.com/v1/models*", {
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
      cy.intercept("GET", "https://api.anthropic.com/v1/models*", {
        statusCode: 200,
        delay: 200,
        body: {
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
        },
      }).as("anthropicValidation")
    } else {
      cy.intercept("GET", "https://api.anthropic.com/v1/models*", {
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

    // Then the persisted settings carry the whole configuration
    cy.window().then((win) => {
      const settings = readAiSettings(win)
      expect(settings.selectedModel).to.equal("gpt-5.4")
      expect(settings.providers.openai.enabledModels).to.deep.equal([
        "gpt-5.4",
        "my-proxy-model",
      ])
      expect(settings.providers.openai.reasoningEffort).to.equal("high")
      expect(settings.providers.openai.utilityModel).to.equal("gpt-5-nano")
      expect(settings.providers.openai.modelLabels).to.deep.equal({
        "gpt-5.4": "GPT 5.4",
        "my-proxy-model": "my-proxy-model",
      })
    })

    // When a chat message is sent
    cy.intercept("POST", PROVIDERS.openai.endpoint, (req) => {
      if (isTitleRequest("openai", req.body)) {
        req.reply(createChatTitleResponse("openai", "Test Chat"))
        return
      }
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

    // Then the picker auto-opens from the validation fetch, with no extra request
    cy.getByDataHook("manage-models-model-row").should("have.length", 5)
    cy.get("@openaiListing.all").should("have.length", 1)

    // When the picker is cancelled with nothing selected
    cy.getByDataHook("manage-models-cancel").click()

    // Then the never-configured provider is dropped back to unvalidated
    cy.getByDataHook("ai-settings-test-api").should("be.visible")
    cy.getByDataHook("ai-settings-validated-badge").should("not.exist")

    // When validation runs again and Select All is used
    cy.getByDataHook("ai-settings-test-api").click()
    cy.wait("@openaiListing")
    cy.getByDataHook("manage-models-model-row").should("have.length", 5)
    cy.getByDataHook("manage-models-select-all").click()
    cy.getByDataHook("manage-models-save").click()
    cy.getByDataHook("manage-models-save").should("not.exist")

    // Then every listed chat model, including dated snapshots, persists
    cy.window().then((win) => {
      const settings = readAiSettings(win)
      expect(settings.providers.openai.enabledModels).to.deep.equal([
        "gpt-5.4",
        "gpt-5-mini",
        "gpt-5",
        "gpt-5-2025-08-06",
        "gpt-5-nano",
      ])
    })

    // When the parent modal closes without Save Settings and the page reloads
    cy.getByDataHook("ai-settings-cancel").click()
    cy.reload()
    cy.getEditor().should("be.visible")

    // Then the picks survive and an OpenAI model can be selected
    cy.getByDataHook("ai-settings-model-dropdown").click()
    cy.getByDataHook("ai-settings-model-item").should("have.length", 7)
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
      expect(settings.selectedModel).to.equal("gpt-5-mini")
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
      expect(settings.providers.openai.grantSchemaAccess).to.equal(true)
      expect(settings.providers.openai.read).to.equal(false)
      expect(settings.providers.openai.write).to.equal(false)
      expect(settings.providers.openai.reasoningEffort).to.equal(undefined)
    })

    // When the API key changes to a different one and validates
    interceptOpenAIListing()
    cy.getByDataHook("ai-assistant-settings-button").click()
    cy.getByDataHook("ai-settings-provider-openai").click()
    cy.getByDataHook("ai-settings-edit-api-key").click()
    cy.getByDataHook("ai-settings-api-key").should("not.have.attr", "readonly")
    cy.getByDataHook("ai-settings-api-key").clear().type("key-two")
    cy.getByDataHook("ai-settings-test-api").click()
    cy.wait("@openaiListing")

    // Then the old key's picks are cleared in the picker
    cy.getByDataHook("manage-models-model-row").should("have.length", 5)
    cy.getByDataHook("manage-models-model-row")
      .find("input[type=checkbox]:checked")
      .should("have.length", 0)

    // And cancelling reverts to the stored working configuration
    cy.getByDataHook("manage-models-cancel").click()
    cy.getByDataHook("ai-settings-validated-badge").should("be.visible")
    cy.window().then((win) => {
      const settings = readAiSettings(win)
      expect(settings.providers.openai.enabledModels).to.deep.equal([
        "gpt-5-mini",
        "gpt-5",
        "gpt-5-nano",
      ])
    })
  })

  it("keeps delisted and manual models as removable chips with exact row identity", () => {
    // Given stored models: a listed alias, a delisted dated snapshot, a manual id
    cy.loadConsoleWithAuth(false, {
      "ai.assistant.settings": JSON.stringify({
        selectedModel: "gpt-5.4",
        providers: {
          openai: {
            apiKey: "test-openai-key",
            enabledModels: ["gpt-5.4", "gpt-5.4-2026-03-05", "my-proxy-model"],
            grantSchemaAccess: false,
          },
        },
      }),
    })
    interceptOpenAIListing()

    // When Manage Models opens
    cy.getByDataHook("ai-assistant-settings-button").click()
    cy.getByDataHook("ai-settings-provider-openai").click()
    cy.getByDataHook("ai-settings-manage-models").click()
    cy.wait("@openaiListing")

    // Then the listed alias is checked and the other two are plain chips
    cy.getByDataHook("manage-models-model-row")
      .contains("gpt-5.4")
      .closest("label")
      .find("input[type=checkbox]")
      .should("be.checked")
    cy.getByDataHook("manage-models-model-chip").should("have.length", 2)
    cy.getByDataHook("manage-models-model-chip").contains("gpt-5.4-2026-03-05")
    cy.getByDataHook("manage-models-model-chip").contains("my-proxy-model")

    // The plain alias and dated snapshot rows toggle independently
    cy.getByDataHook("manage-models-model-row")
      .contains(/^gpt-5$/)
      .closest("label")
      .find("input[type=checkbox]")
      .click()
    cy.getByDataHook("manage-models-model-row")
      .contains("gpt-5-2025-08-06")
      .closest("label")
      .find("input[type=checkbox]")
      .should("not.be.checked")

    // When the dated chip is removed and the picker saves
    cy.getByDataHook("manage-models-model-chip")
      .contains("gpt-5.4-2026-03-05")
      .closest("[data-hook='manage-models-model-chip']")
      .find("[data-hook='manage-models-remove-model']")
      .click()
    cy.getByDataHook("manage-models-save").click()
    cy.getByDataHook("manage-models-save").should("not.exist")

    // Then only the removed id is gone — nothing was dropped silently
    cy.window().then((win) => {
      const settings = readAiSettings(win)
      expect(settings.providers.openai.enabledModels).to.deep.equal([
        "gpt-5.4",
        "my-proxy-model",
        "gpt-5",
      ])
    })

    // And the dropdown shows derived labels but never invents one for manual ids
    cy.getByDataHook("ai-settings-cancel").click()
    cy.getByDataHook("ai-settings-model-dropdown").click()
    cy.getByDataHook("ai-settings-model-item").contains("GPT 5.4")
    cy.getByDataHook("ai-settings-model-item").contains("my-proxy-model")
    cy.getByDataHook("ai-settings-model-item")
      .contains("My-proxy-model")
      .should("not.exist")
  })

  it("blocks model changes and identifies a rate-limited listing", () => {
    // Given an existing OpenAI configuration whose model listing is rate limited
    cy.loadConsoleWithAuth(false, {
      "ai.assistant.settings": JSON.stringify({
        selectedModel: "gpt-5.4",
        providers: {
          openai: {
            apiKey: "test-openai-key",
            enabledModels: ["gpt-5.4"],
            grantSchemaAccess: false,
          },
        },
      }),
    })
    cy.intercept("GET", OPENAI_MODELS_URL, {
      statusCode: 429,
      headers: { "retry-after": "0" },
      body: {
        error: {
          message: "Rate limit reached",
          type: "rate_limit_error",
          param: null,
          code: "rate_limit_exceeded",
        },
      },
    }).as("openaiListing")

    // When Manage Models attempts to refresh the provider listing
    cy.getByDataHook("ai-assistant-settings-button").click()
    cy.getByDataHook("ai-settings-provider-openai").click()
    cy.getByDataHook("ai-settings-manage-models").click()
    cy.wait("@openaiListing")

    // Then the failure is identified and no model changes can be made
    cy.getByDataHook("manage-models-fetch-error").should(
      "contain",
      "rate or usage limit was reached",
    )
    cy.getByDataHook("manage-models-model-row").should("not.exist")
    cy.getByDataHook("manage-models-manual-model-input").should("not.exist")
    cy.getByDataHook("manage-models-save").should("be.disabled")

    // And the saved configuration is untouched
    cy.window().then((win) => {
      expect(readAiSettings(win).providers.openai.enabledModels).to.deep.equal([
        "gpt-5.4",
      ])
    })
  })

  it("survives interruptions: wizard escape, tab switch mid-validation, stale key edits", () => {
    // Given a fresh console and a slow listing response
    cy.loadConsoleWithAuth()
    interceptOpenAIListing({ delay: 1500 })

    // When the wizard validation is escaped mid-flight
    cy.getByDataHook("ai-assistant-settings-button").click()
    cy.getByDataHook("ai-promo-continue").click()
    cy.getByDataHook("ai-settings-provider-openai").click()
    cy.getByDataHook("ai-settings-api-key").type("valid-key")
    cy.getByDataHook("multi-step-modal-next-button").click()
    cy.get("body").type("{esc}")
    cy.wait("@openaiListing")

    // Then reopening lands on a clean step one, not a dead-end step two
    cy.getByDataHook("ai-assistant-settings-button").click()
    cy.getByDataHook("ai-promo-continue").click()
    cy.getByDataHook("ai-settings-modal-step-one").should("be.visible")
    cy.getByDataHook("ai-settings-modal-step-two").should("not.exist")

    // When the wizard completes normally to reach the settings modal
    interceptOpenAIListing()
    cy.getByDataHook("ai-settings-provider-openai").click()
    cy.getByDataHook("ai-settings-api-key").type("valid-key")
    cy.getByDataHook("multi-step-modal-next-button").click()
    cy.wait("@openaiListing")
    cy.getByDataHook("configure-models-model-row").contains("gpt-5.4").click()
    cy.getByDataHook("multi-step-modal-next-button").click()
    cy.get(".toast-success-container").should("be.visible").click()

    // And an Anthropic validation starts while the tab switches to OpenAI
    interceptAnthropicListing({ delay: 1500 })
    cy.getByDataHook("ai-assistant-settings-button").click()
    cy.getByDataHook("ai-settings-provider-anthropic").click()
    cy.getByDataHook("ai-settings-api-key").type("anthropic-key")
    cy.getByDataHook("ai-settings-test-api").click()
    cy.getByDataHook("ai-settings-provider-openai").click()
    cy.wait("@anthropicListing")

    // Then the tab switch aborted the validation: no picker, nothing validated
    cy.getByDataHook("manage-models-model-row").should("not.exist")
    cy.getByDataHook("ai-settings-provider-anthropic").click()
    cy.getByDataHook("ai-settings-test-api")
      .should("be.visible")
      .should("not.be.disabled")

    // And validating without switching opens the Anthropic picker and saves there
    interceptAnthropicListing()
    cy.getByDataHook("ai-settings-test-api").click()
    cy.wait("@anthropicListing")
    cy.getByDataHook("manage-models-model-row").should("have.length", 3)
    cy.get("[role=dialog]").should("contain", "Enable the Anthropic models")
    cy.getByDataHook("manage-models-model-row")
      .contains("Claude Haiku 4.5")
      .click()
    cy.getByDataHook("manage-models-save").click()
    cy.getByDataHook("manage-models-save").should("not.exist")
    cy.window().then((win) => {
      const settings = readAiSettings(win)
      expect(settings.providers.anthropic.enabledModels).to.deep.equal([
        "claude-haiku-4-5",
      ])
      expect(settings.providers.openai.enabledModels).to.deep.equal(["gpt-5.4"])
    })

    // When a validation response arrives for a key that was already edited
    interceptOpenAIListing({ delay: 1500 })
    cy.getByDataHook("ai-settings-provider-openai").click()
    cy.getByDataHook("ai-settings-edit-api-key").click()
    cy.getByDataHook("ai-settings-api-key").should("not.have.attr", "readonly")
    cy.getByDataHook("ai-settings-api-key").clear().type("key-a")
    cy.getByDataHook("ai-settings-test-api").click()
    cy.getByDataHook("ai-settings-edit-api-key").click()
    cy.getByDataHook("ai-settings-api-key").should("not.have.attr", "readonly")
    cy.getByDataHook("ai-settings-api-key").clear()
    cy.getByDataHook("ai-settings-api-key").type("key-b-changed")
    cy.wait("@openaiListing")

    // Then the stale response is discarded: no badge, no picker, ready to validate
    cy.getByDataHook("ai-settings-validated-badge").should("not.exist")
    cy.getByDataHook("manage-models-model-row").should("not.exist")
    cy.getByDataHook("ai-settings-test-api")
      .should("be.visible")
      .should("not.be.disabled")
  })

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
      // API key input is hidden until a provider is selected
      cy.getByDataHook("ai-settings-api-key").should("not.exist")

      // When - select Anthropic
      cy.getByDataHook("ai-settings-provider-anthropic").click()

      // Then - API key input appears
      cy.getByDataHook("ai-settings-api-key")
        .should("be.visible")
        .should("have.attr", "placeholder", "Enter Anthropic API key")

      // When - switch to OpenAI
      cy.getByDataHook("ai-settings-provider-openai").click()

      // Then
      cy.getByDataHook("ai-settings-api-key")
        .should("be.visible")
        .should("have.attr", "placeholder", "Enter OpenAI API key")
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

      // Then - step two shows the filtered listing, nothing preselected
      cy.getByDataHook("ai-settings-modal-step-two").should("be.visible")
      cy.getByDataHook("configure-models-model-row").should("have.length", 4)

      // When - enable two models and activate
      cy.getByDataHook("configure-models-model-row").contains("gpt-5.4").click()
      cy.getByDataHook("configure-models-model-row")
        .contains("gpt-5-mini")
        .click()
      cy.getByDataHook("multi-step-modal-next-button").click()

      // Then
      cy.getByDataHook("ai-assistant-settings-button").should(
        "contain",
        "AI Settings",
      )
      cy.getByDataHook("ai-chat-button").should("be.visible")
      cy.getByDataHook("ai-settings-model-dropdown").should("be.visible")

      // When / Then — selecting a model closes the dropdown (handleModelSelect
      // calls setDropdownActive(false)), so re-open it for each model and
      // re-query the item just before clicking; otherwise the list detaches the
      // node as it settles/closes and cy.click() hits a stale element.
      ;[0, 1].forEach((index) => {
        cy.getByDataHook("ai-settings-model-dropdown").click()
        cy.getByDataHook("ai-settings-model-item").should("be.visible")

        cy.getByDataHook("ai-settings-model-item")
          .eq(index)
          .find("[data-hook='ai-settings-model-item-label']")
          .invoke("text")
          .then((text) => {
            const label = text.trim()
            cy.getByDataHook("ai-settings-model-item").eq(index).click()
            cy.getByDataHook("ai-settings-model-dropdown").should(
              "contain",
              label,
            )
          })
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
      cy.getByDataHook("ai-settings-remove-provider").scrollIntoView()
      cy.getByDataHook("ai-settings-remove-provider")
        .should("be.visible")
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

      // When - enable a model, drop permissions to None so schema tools are excluded.
      cy.getByDataHook("configure-models-model-row")
        .contains("gpt-5-mini")
        .click()
      cy.getByDataHook("permissions-trigger").click()
      cy.getByDataHook("permission-level-none").click()
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

      // When - Open settings modal and re-enable schema access
      cy.getByDataHook("ai-assistant-settings-button").click()
      cy.getByDataHook("permissions-trigger").click()
      cy.getByDataHook("permission-level-schema").click()
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
      const openaiEnabledModels = ["GPT 5.4", "GPT 5 Mini"]
      const anthropicEnabledModels = ["Claude Opus 4.5", "Claude Sonnet 4.5"]

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

      // When - Enable two OpenAI models
      cy.getByDataHook("configure-models-model-row").contains("gpt-5.4").click()
      cy.getByDataHook("configure-models-model-row")
        .contains("gpt-5-mini")
        .click()

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
      cy.get("body").type("{esc}") // close dropdown

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

      // Then - Validation opens Manage Models with the fetched listing
      cy.wait("@anthropicValidation")
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
        .getByDataHook("ai-settings-provider-status")
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
})
