/// <reference types="cypress" />

const {
  PROVIDERS,
  interceptAIChatRequest,
  CUSTOM_PROVIDER_DEFAULTS,
  getOpenAIConfiguredSettings,
  getAnthropicConfiguredSettings,
  createToolCallFlow,
  createMultiTurnFlow,
  createResponse,
  createFinalResponseData,
  createChatTitleResponse,
  isTitleRequest,
  getCustomProviderConfiguredSettings,
  getCustomProviderEndpoint,
} = require("../utils/aiAssistant")

const { createChat, createQueryChat } = require("../utils/aiConversations")

const createResponseGate = () => {
  let release
  const promise = new Cypress.Promise((resolve) => {
    release = resolve
  })
  return { promise, release }
}

const loadConsoleWithChats = (conversations, options = {}) =>
  cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings(), {
    ...options,
    conversations,
  })

const openSavedChat = (name = "Test Chat") => {
  cy.getByDataHook("ai-chat-button").click()
  cy.getByDataHook("chat-window-history").click()
  cy.getByDataHook("chat-history-item").contains(name).click()
}

const loadConsoleWithQuery = (value) =>
  cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings(), {
    buffers: [{ value }],
  })

/**
 * Intercepts AI requests with a custom response body.
 * Automatically detects streaming vs non-streaming based on request body.
 *
 * @param {"anthropic" | "openai"} provider - The AI provider to intercept
 * @param {Object} responseBody - The response body to return
 * @param {string} [alias] - Optional custom alias for the intercept
 * @param {Object} [options] - Options
 * @param {boolean} [options.streaming] - Force streaming mode (auto-detected if not provided)
 */
function interceptAIRequestWithResponse(
  provider,
  responseBody,
  alias,
  options = {},
) {
  const aliasName = alias || `${provider}CustomResponse`
  const endpoint = PROVIDERS[provider].endpoint

  cy.intercept("POST", endpoint, (req) => {
    // Determine if streaming based on request or options
    const isStreaming =
      options.streaming !== undefined
        ? options.streaming
        : req.body.stream === true
    req.reply(
      createResponse(provider, responseBody, { streaming: isStreaming }),
    )
  }).as(aliasName)
}

describe("ai assistant", () => {
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

  describe("ai chat window ergonomics", () => {
    it("creates a first chat and restores its messages after reopening and reloading", () => {
      // Given
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
      interceptAIChatRequest("openai")

      // When
      cy.getByDataHook("ai-chat-button").click()

      // Then
      cy.getByDataHook("chat-blank-state").should("be.visible")
      cy.getByDataHook("chat-window-title").should("contain", "AI Assistant")
      cy.getByDataHook("chat-window-new").should("be.disabled")
      cy.getByDataHook("chat-window-history").click()
      cy.getByDataHook("chat-history-item").should("have.length", 1).click()

      // When
      cy.getByDataHook("chat-input-textarea").type("Hello AI")
      cy.getByDataHook("chat-send-button").click()
      cy.waitForAIResponse("@openaiChatRequest")
      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        "Test response explanation",
      )
      cy.getByDataHook("chat-stop-button").should("not.exist")
      cy.getByDataHook("chat-window-close").click()
      cy.getByDataHook("ai-chat-window").should("not.exist")
      cy.getByDataHook("ai-chat-button").click()

      // Then
      cy.getByDataHook("chat-message-user").should("have.text", "Hello AI")
      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        "Test response explanation",
      )

      // When
      cy.reload()
      cy.getEditor().should("be.visible")
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-window-history").click()
      cy.getByDataHook("chat-history-item").should("have.length", 1).click()

      // Then
      cy.getByDataHook("chat-message-user").should("have.text", "Hello AI")
      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        "Test response explanation",
      )
    })

    it("creates, switches, renames and deletes saved conversations", () => {
      // Given
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
      interceptAIChatRequest("openai", "firstChat")
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").type("First chat message")
      cy.getByDataHook("chat-send-button").click()
      cy.waitForAIResponse("@firstChat")
      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        "Test response explanation",
      )

      // When
      cy.getByDataHook("chat-window-new").should("be.enabled").click()

      // Then
      cy.getByDataHook("chat-blank-state").should("be.visible")
      cy.getByDataHook("chat-window-new").should("be.disabled")

      // When
      interceptAIChatRequest("openai", "secondChat")
      cy.getByDataHook("chat-input-textarea").type("Second chat message")
      cy.getByDataHook("chat-send-button").click()
      cy.waitForAIResponse("@secondChat")
      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        "Test response explanation",
      )
      cy.getByDataHook("chat-window-history").click()
      cy.getByDataHook("chat-history-item").should("have.length", 2)
      cy.getByDataHook("chat-history-item").eq(1).click()

      // Then
      cy.getByDataHook("chat-message-user").should(
        "have.text",
        "First chat message",
      )

      // When
      cy.getByDataHook("chat-window-history").click()
      cy.getByDataHook("chat-history-item").eq(0).click()

      // Then
      cy.getByDataHook("chat-message-user").should(
        "have.text",
        "Second chat message",
      )

      // When
      cy.getByDataHook("chat-window-history").click()
      cy.getByDataHook("chat-history-item").eq(0).trigger("mouseover")
      cy.getByDataHook("chat-history-edit").eq(0).click()
      cy.getByDataHook("chat-history-rename")
        .clear()
        .type("Renamed second chat{enter}")

      // Then
      cy.getByDataHook("chat-history-title")
        .eq(0)
        .should("have.text", "Renamed second chat")
      cy.getByDataHook("chat-history-item")
        .contains("Renamed second chat")
        .click()
      cy.getByDataHook("chat-window-title").should(
        "contain",
        "Renamed second chat",
      )
      cy.getByDataHook("chat-message-user").should(
        "have.text",
        "Second chat message",
      )

      // When
      cy.getByDataHook("chat-window-history").click()
      cy.getByDataHook("chat-history-item")
        .contains("Renamed second chat")
        .closest("[data-hook=chat-history-item]")
        .trigger("mouseover")
        .find("[data-hook=chat-history-delete]")
        .click()
      cy.contains("button", "Delete").click()

      // Then
      cy.getByDataHook("chat-history-item").should("have.length", 1)
      cy.getByDataHook("chat-history-title").should("have.text", "Test Chat")
      cy.getByDataHook("chat-history-item").click()
      cy.getByDataHook("chat-message-user").should(
        "have.text",
        "First chat message",
      )
      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        "Test response explanation",
      )
    })
  })

  describe("ai status indicator", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
    })

    it("returns to the running conversation through View chat", () => {
      // Given
      const gate = createResponseGate()
      cy.intercept("POST", PROVIDERS.openai.endpoint, async (req) => {
        if (isTitleRequest("openai", req.body)) {
          req.reply(createChatTitleResponse("openai"))
          return
        }
        req.alias = "backgroundAnswer"
        await gate.promise
        req.reply(
          createResponse(
            "openai",
            createFinalResponseData("openai", "The background answer"),
          ),
        )
      })

      // When
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").type("My specific test question")
      cy.getByDataHook("chat-send-button").click()
      cy.getByDataHook("chat-stop-button").should("be.visible")

      // Then
      cy.getByDataHook("ai-status-indicator").should("not.exist")

      // When
      cy.getByDataHook("chat-window-close").click()

      // Then
      cy.getByDataHook("ai-status-indicator").should("be.visible")
      cy.getByDataHook("ai-status-text").should("contain", "Working...")

      // When
      cy.getByDataHook("ai-status-view-chat").click()

      // Then
      cy.getByDataHook("chat-message-user").should(
        "have.text",
        "My specific test question",
      )
      cy.getByDataHook("ai-status-indicator").should("not.exist")

      // When
      cy.then(() => gate.release())
      cy.waitForAIResponse("@backgroundAnswer")

      // Then
      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        "The background answer",
      )
      cy.getByDataHook("chat-message-user").should(
        "have.text",
        "My specific test question",
      )
    })

    it("aborts a background request and ignores its late answer", () => {
      // Given
      const gate = createResponseGate()
      const transportAborted = cy.stub().as("transportAborted")
      cy.window().then((win) => {
        const fetch = win.fetch
        cy.stub(win, "fetch").callsFake((input, init) => {
          const url = typeof input === "string" ? input : input.url
          if (url === PROVIDERS.openai.endpoint && init?.signal) {
            init.signal.addEventListener("abort", transportAborted, {
              once: true,
            })
          }
          return fetch.call(win, input, init)
        })
      })
      cy.intercept("POST", PROVIDERS.openai.endpoint, async (req) => {
        if (isTitleRequest("openai", req.body)) {
          req.reply(createChatTitleResponse("openai"))
          return
        }
        req.alias = "cancelledAnswer"
        await gate.promise
        req.reply(
          createResponse(
            "openai",
            createFinalResponseData("openai", "Late successful answer"),
          ),
        )
      })

      // When
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").type("Question to abort")
      cy.getByDataHook("chat-send-button").click()
      cy.getByDataHook("chat-stop-button").should("be.visible")
      cy.getByDataHook("chat-window-close").click()
      cy.getByDataHook("ai-status-stop").click()

      // Then
      cy.get("@transportAborted").should("have.been.called")
      cy.getByDataHook("ai-status-text").should("contain", "Cancelled")

      // When
      cy.then(() => gate.release())
      cy.wait("@cancelledAnswer")
      cy.getByDataHook("ai-chat-button").click()

      // Then
      cy.getByDataHook("chat-message-error").should(
        "contain",
        "Operation has been cancelled",
      )
      cy.getByDataHook("chat-message-assistant").should(
        "not.contain",
        "Late successful answer",
      )
      cy.getByDataHook("chat-stop-button").should("not.exist")
    })
  })

  describe("query - chat integration", () => {
    it("repairs a failed query through its AI glyph and runs the accepted SQL", () => {
      // Given
      let queryError
      loadConsoleWithQuery("SELECT a;")
      cy.intercept("GET", "**/exec*", (req) => {
        if (String(req.query.query).replace(/;$/, "").trim() === "SELECT a")
          req.alias = "failedQuery"
        if (String(req.query.query).replace(/;$/, "").trim() === "SELECT 1")
          req.alias = "correctedQuery"
      })
      cy.clickRunIconInLine(1)
      cy.wait("@failedQuery").then(({ response }) => {
        queryError = response.body.error
        expect(queryError).to.be.a("string").and.not.be.empty
      })
      cy.getByDataHook("error-notification").should("be.visible")
      cy.getAIIconInLine(1, "noChat").should("be.visible")
      const flow = createToolCallFlow({
        provider: "openai",
        streaming: true,
        question: "Fix this SQL query",
        steps: [
          {
            finalResponse: {
              explanation: "Use a literal instead of the missing column.",
              sql: "SELECT 1;",
            },
          },
        ],
      })
      flow.intercept()
      cy.intercept("POST", PROVIDERS.openai.endpoint, (req) => {
        if (!isTitleRequest("openai", req.body)) {
          const context = JSON.stringify(req.body.input)
          expect(context).to.contain("SELECT a")
          expect(context).to.contain(queryError)
        }
      })

      // When
      cy.getAIIconInLine(1).click()

      // Then
      cy.getByDataHook("chat-context-badge").should("contain", "SELECT a")
      cy.getByDataHook("chat-initial-query-box").should("be.visible")
      cy.getByDataHook("button-explain-query").should("be.visible")
      cy.getByDataHook("button-fix-query").should("be.visible")

      // When
      cy.getByDataHook("button-fix-query").click()
      flow.waitForCompletion()
      cy.getByDataHook("message-action-accept").click()

      // Then
      cy.getByDataHook("diff-status-accepted").should("contain", "Accepted")
      cy.getEditorContent().should("have.value", "SELECT 1;")
      cy.getByDataHook("chat-context-badge").should("contain", "SELECT 1")

      // When
      cy.clickRunIconInLine(1)

      // Then
      cy.wait("@correctedQuery")
        .its("response.body.dataset")
        .should("deep.equal", [[1]])
      cy.getByDataHook("error-notification").should("not.exist")
    })

    it("should show active state for queries with existing chats", () => {
      // Given two queries without chats
      loadConsoleWithQuery("SELECT 1;\n\nSELECT 2;")

      // Then - Both should be in noChat state initially
      cy.getAIIconInLine(1, "noChat").should("be.visible")
      cy.getAIIconInLine(3, "noChat").should("be.visible")

      // When - Create chat for first query
      cy.getAIIconInLine(1).click()
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("chat-input-textarea").should("be.visible") // Wait for loading
      const firstAnswer = createResponseGate()
      cy.intercept("POST", PROVIDERS.openai.endpoint, async (req) => {
        if (isTitleRequest("openai", req.body)) {
          req.reply(createChatTitleResponse("openai"))
          return
        }
        req.alias = "chat1"
        await firstAnswer.promise
        req.reply(
          createResponse(
            "openai",
            createFinalResponseData("openai", "First query answer"),
          ),
        )
      })
      cy.getByDataHook("chat-input-textarea").type("Explain first query", {
        force: true,
      })
      cy.getByDataHook("chat-send-button").click()
      cy.getAIIconInLine(1, "highlight").should("be.visible")
      cy.then(() => firstAnswer.release())
      cy.waitForAIResponse("@chat1")

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
      cy.waitForAIResponse("@chat2")

      // Then - Both queries should have active state
      cy.getAIIconInLine(1, "active").should("be.visible")
      cy.getAIIconInLine(3, "active").should("be.visible")

      // When
      cy.getAIIconInLine(1, "active").click()

      // Then
      cy.getByDataHook("chat-message-user")
        .contains(/^Explain first query$/)
        .should("be.visible")

      // When
      cy.getAIIconInLine(1, "active").click()
      cy.getByDataHook("ai-chat-window").should("not.exist")
      cy.getAIIconInLine(1, "active").click()

      // Then
      cy.getByDataHook("chat-message-user")
        .contains(/^Explain first query$/)
        .should("be.visible")

      // When
      cy.getAIIconInLine(3, "active").click()

      // Then
      cy.getByDataHook("chat-message-user")
        .contains(/^Explain second query$/)
        .should("be.visible")
    })

    it("should navigate to query tab when clicking context badge from different tab", () => {
      // Given
      const firstQuery = "SELECT 'tab1_query';"
      const secondQuery = "SELECT 'tab2_query';"
      loadConsoleWithChats(
        [
          createQueryChat({
            bufferId: 1,
            query: firstQuery,
            name: "Tab 1 Chat",
            userMessage: "Message for tab 1",
          }),
          createQueryChat({
            bufferId: 2,
            query: secondQuery,
            name: "Tab 2 Chat",
            userMessage: "Message for tab 2",
          }),
        ],
        {
          buffers: [{ value: firstQuery }, { value: secondQuery }],
          activeBufferId: 2,
        },
      )
      cy.getEditorTabs().should("have.length", 2)
      cy.getAIIconInLine(1, "active").click()
      cy.getByDataHook("chat-message-user").should(
        "contain",
        "Message for tab 2",
      )
      cy.getByDataHook("chat-window-history").click()
      cy.getByDataHook("chat-history-item").should("have.length", 2)

      // When - Navigate to Tab 1 Chat via history
      cy.getByDataHook("chat-history-item")
        .contains("Tab 1 Chat")
        .should("not.be.disabled")
        .click()

      // Then - Should automatically switch to Tab 1 and show context badge
      cy.getByDataHook("chat-input-textarea").should("be.visible") // Wait for chat to load
      cy.getByDataHook("chat-context-badge").should("contain", "tab1_query")

      // When - Click context badge
      cy.getByDataHook("chat-context-badge").click()

      // Then - Query should be highlighted in the editor
      cy.get(".aiQueryHighlight").should("exist")
      cy.get(".chrome-tab[active] .chrome-tab-title").should("have.text", "SQL")
      cy.getEditorContent().should("have.value", firstQuery)

      // When the query moves, its glyph still opens the same chat
      cy.getByDataHook("chat-window-close").click()
      cy.getEditorHitbox().click()
      cy.getEditorContent().type("{moveToStart}{enter}")
      cy.getAIIconInLine(2, "active").should("be.visible")
      cy.getEditorContent().type("{moveToStart}{enter}")
      cy.get(".glyph-widget-1 .glyph-ai-icon").should("not.exist")
      cy.getAIIconInLine(3, "active").click()

      // Then
      cy.getByDataHook("chat-message-user").should(
        "have.text",
        "Message for tab 1",
      )
      cy.getByDataHook("chat-context-badge").should("contain", "tab1_query")

      // When - Navigate to Tab 2 Chat via history
      cy.getByDataHook("chat-window-history").click()
      cy.getByDataHook("chat-history-list").should("be.visible") // Wait for history to load
      cy.getByDataHook("chat-history-item")
        .contains("Tab 2 Chat")
        .should("not.be.disabled")
        .click()

      // Then - Should automatically switch to Tab 2 and show context badge
      cy.getByDataHook("chat-input-textarea").should("be.visible") // Wait for chat to load
      cy.getByDataHook("chat-context-badge").should("contain", "tab2_query")

      // When - Click context badge
      cy.getByDataHook("chat-context-badge").click()

      // Then - Query should be highlighted in the editor
      cy.get(".aiQueryHighlight").should("exist")
      cy.get(".chrome-tab[active] .chrome-tab-title").should(
        "have.text",
        "SQL 1",
      )
      cy.getEditorContent().should("have.value", secondQuery)
    })
  })

  describe("explain schema", () => {
    before(() => {
      cy.createTable("test_trades")
    })
    after(() => {
      cy.dropTable("test_trades")
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
    })

    it("should show processing status and display valid schema explanation", () => {
      // Given - Set up intercept with valid schema response
      const schemaExplanation =
        "The test_trades table stores trading data with symbol identification, price values, and timestamps."
      const responseData = createFinalResponseData("openai", schemaExplanation)
      interceptAIRequestWithResponse("openai", responseData, "explainSchema")

      cy.refreshSchema()
      // When - Right-click on table and select explain schema
      cy.getByDataHook("schema-table-title")
        .contains("test_trades")
        .rightclick()
      cy.getByDataHook("table-context-menu-explain-schema").click()

      // Then - Chat window should open with processing status
      cy.getByDataHook("ai-chat-window").should("be.visible")
      cy.getByDataHook("assistant-modes-container").should("be.visible")

      // When - Wait for response
      cy.wait("@explainSchema").then(({ request }) => {
        const context = JSON.stringify(request.body.input)
        expect(context).to.contain("test_trades")
        expect(context).to.contain("CREATE TABLE")
        expect(context).to.contain("symbol SYMBOL")
        expect(context).to.contain("ts TIMESTAMP")
      })

      // Then - Should display the schema explanation content
      cy.getByDataHook("chat-message-assistant").should("be.visible")

      // Verify explanation content and processing status in collapsed mode
      cy.getByDataHook("assistant-mode-processing-collapsed").click()
      cy.getByDataHook("assistant-mode-processing-request").should("exist")

      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        "The test_trades table stores trading data",
      )
    })
  })

  describe("tool calls", () => {
    const testTables = ["btc_trades", "ecommerce_stats"]

    before(() => {
      testTables.forEach((table) => {
        cy.createTable(table)
      })
    })

    after(() => {
      testTables.forEach((table) => {
        cy.dropTableIfExists(table)
      })
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
    })

    it("should handle sequential tool calls (get_tables then get_table_schema)", () => {
      const assistantResponse =
        "The ecommerce_stats table tracks sales data by country and category, including visits, unique visitors, sales amount, and number of products."
      const flow = createToolCallFlow({
        provider: "openai",
        streaming: true,
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
                "ts TIMESTAMP",
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

      cy.getByDataHook("assistant-mode-processing-collapsed").click()
      cy.getByDataHook("assistant-mode-processing-request").should("exist")
      cy.getByDataHook("assistant-mode-reviewing-tables").should("exist")
      cy.getByDataHook("assistant-mode-investigating-table").should(
        "be.visible",
      )

      cy.getByDataHook("chat-message-assistant").should(
        "contain",
        assistantResponse,
      )
    })

    it("should detect invalid SQL syntax using validate_query tool", () => {
      const assistantResponse =
        "The query has syntax errors. 'SELEC' should be 'SELECT' and 'FORM' should be 'FROM'."
      const flow = createToolCallFlow({
        provider: "openai",
        streaming: true,
        question: "Is this query valid: SELEC * FORM btc_trades",
        steps: [
          {
            toolCall: {
              name: "validate_query",
              args: { query: "SELEC * FORM btc_trades" },
            },
          },
          {
            toolCall: {
              name: "validate_query",
              args: { query: "SELECT * FROM btc_trades" },
            },
            expectToolResult: {
              includes: ['"valid": false', '"error":', '"position":'],
            },
          },
          {
            finalResponse: {
              explanation: assistantResponse,
              sql: "SELECT * FROM btc_trades;",
            },
            expectToolResult: { includes: ['"valid": true'] },
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
      cy.getByDataHook("assistant-mode-processing-collapsed").click()
      cy.getByDataHook("assistant-mode-processing-request").should("exist")
      cy.getByDataHook("assistant-mode-validating-query").should("exist")

      // Verify final response text
      cy.getByDataHook("chat-message-assistant")
        .should("be.visible")
        .should("contain", assistantResponse)

      // Hover on assistant header to reveal token display
      cy.getByDataHook("assistant-header").realHover()

      // Then both validations and the suggestion contribute to token usage
      cy.get(".token-display")
        .should("be.visible")
        .should("contain", "500")
        .should("contain", "250")
        .should("contain", "input")
        .should("contain", "output")
    })
  })

  describe("tool calls (Anthropic)", () => {
    const testTables = ["btc_trades", "ecommerce_stats"]

    before(() => {
      testTables.forEach((table) => {
        cy.createTable(table)
      })
    })

    after(() => {
      testTables.forEach((table) => {
        cy.dropTableIfExists(table)
      })
    })

    beforeEach(() => {
      cy.loadConsoleWithAuth(false, getAnthropicConfiguredSettings())
    })

    it("should handle sequential tool calls with Anthropic", () => {
      const assistantResponse =
        "The ecommerce_stats table tracks sales data with country, category, and sales metrics."
      const flow = createToolCallFlow({
        provider: "anthropic",
        streaming: true,
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
              sql: "SELECT * FROM ecommerce_stats LIMIT 10;",
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
        .should("contain", assistantResponse)

      // When
      cy.getByDataHook("message-action-accept").click()

      // Then
      cy.getByDataHook("diff-status-accepted").should("contain", "Accepted")
      cy.getByDataHook("chat-context-badge").should(
        "contain",
        "SELECT * FROM ecommerce_stats",
      )
      cy.getEditorContent().should(
        "have.value",
        "SELECT *\nFROM ecommerce_stats\nLIMIT 10;",
      )
    })
  })

  describe("accept and reject suggestions", () => {
    it("rejects a suggestion, then applies it to a new query tab", () => {
      // Given
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
      const sql = "SELECT price FROM btc_trades LIMIT 1;"
      const flow = createToolCallFlow({
        provider: "openai",
        streaming: true,
        question: "Get latest price",
        steps: [
          {
            finalResponse: {
              explanation: "Here is the latest price query.",
              sql,
            },
          },
        ],
      })
      flow.intercept()
      let originalTabId
      cy.getEditorTabs()
        .should("have.length", 1)
        .first()
        .invoke("attr", "data-tab-id")
        .then((id) => {
          originalTabId = id
        })
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").type(flow.question)
      cy.getByDataHook("chat-send-button").click()
      flow.waitForCompletion()

      // When
      cy.getByDataHook("message-action-reject").click()

      // Then
      cy.getByDataHook("diff-status-rejected").should("contain", "Rejected")
      cy.getByDataHook("message-action-accept").should("not.exist")
      cy.getByDataHook("message-action-reject").should("not.exist")
      cy.getByDataHook("chat-context-badge").should("not.exist")
      cy.getEditorTabs().should("have.length", 1)

      // When
      cy.getByDataHook("message-action-apply").click()
      cy.getByDataHook("chat-context-badge").click()

      // Then
      cy.getEditorTabs().should("have.length", 2)
      cy.getEditorTabs()
        .filter("[active]")
        .should(($tab) => {
          expect($tab.attr("data-tab-id")).not.to.equal(originalTabId)
        })
      cy.getEditorContent().should(($editor) => {
        expect($editor.val().replace(/\s+/g, " ").trim()).to.equal(sql)
      })
      cy.getByDataHook("chat-context-badge").should(
        "contain",
        "SELECT price FROM btc_trades",
      )
      cy.get(".aiQueryHighlight").should("exist")
    })

    it("previews old and current suggestions but allows decisions only for the current one", () => {
      // Given
      loadConsoleWithChats([
        {
          conversationName: "Preview suggestions",
          currentSQL: "SELECT 2;",
          messages: [
            { role: "user", content: "First query" },
            {
              role: "assistant",
              content: "First simple query.",
              sql: "SELECT 1;",
              previousSQL: "",
            },
            { role: "user", content: "Second query" },
            {
              role: "assistant",
              content: "Second simple query.",
              sql: "SELECT 2;",
              previousSQL: "",
            },
          ],
        },
      ])
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-window-title").should(
        "contain",
        "Preview suggestions",
      )
      cy.getByDataHook("chat-message-assistant").should("have.length", 2)
      cy.getByDataHook("message-action-accept").should("have.length", 1)

      // When
      cy.getByDataHook("inline-diff-container")
        .first()
        .find('[data-hook="diff-expand-button"]')
        .click()
      cy.getByDataHook("inline-diff-container")
        .first()
        .find(".monaco-editor .view-lines")
        .should(($lines) => {
          expect($lines.text().replace(/\s+/g, " ")).to.contain("SELECT 1")
        })
      cy.getByDataHook("inline-diff-container")
        .first()
        .realHover()
        .find('[data-hook="ai-open-in-editor-button"]')
        .should("be.visible")
        .click()

      // Then
      cy.getByDataHook("diff-editor-container").should("be.visible")
      cy.window().then((win) => {
        cy.getByDataHook("diff-editor-container").should(($container) => {
          const preview = win.monaco.editor
            .getDiffEditors()
            .find((editor) =>
              $container[0].contains(editor.getContainerDomNode()),
            )
          expect(Boolean(preview), "query tab diff editor exists").to.equal(
            true,
          )
          expect(preview.getModel().original.getValue().trim()).to.equal("")
          expect(
            preview
              .getModel()
              .modified.getValue()
              .replace(/\s+/g, " ")
              .trim()
              .replace(/;$/, ""),
          ).to.equal("SELECT 1")
        })
      })
      cy.getByDataHook("diff-reject-button").should("not.exist")
      cy.getByDataHook("diff-accept-button").should("not.exist")

      // When
      cy.getByDataHook("inline-diff-container")
        .eq(1)
        .realHover()
        .find('[data-hook="ai-open-in-editor-button"]')
        .should("be.visible")
        .click()

      // Then
      cy.window().then((win) => {
        cy.getByDataHook("diff-editor-container").should(($container) => {
          const preview = win.monaco.editor
            .getDiffEditors()
            .find((editor) =>
              $container[0].contains(editor.getContainerDomNode()),
            )
          expect(Boolean(preview), "query tab diff editor exists").to.equal(
            true,
          )
          expect(preview.getModel().original.getValue().trim()).to.equal("")
          expect(
            preview
              .getModel()
              .modified.getValue()
              .replace(/\s+/g, " ")
              .trim()
              .replace(/;$/, ""),
          ).to.equal("SELECT 2")
        })
      })
      cy.getByDataHook("diff-reject-button").should("be.visible")
      cy.getByDataHook("diff-accept-button").should("be.visible")
    })
  })

  describe("retry functionality", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
    })

    it("should retry request when retry button is clicked (OpenAI)", () => {
      cy.intercept("POST", PROVIDERS.openai.endpoint, (req) => {
        if (isTitleRequest("openai", req.body)) {
          req.reply(createChatTitleResponse("openai", "Test Chat"))
          return
        }
        req.reply({
          statusCode: 401,
          body: {
            error: {
              type: "authentication_error",
              message: "Invalid API key",
            },
          },
        })
      }).as("errorRequest")

      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type("Test retry message")
      cy.getByDataHook("chat-send-button").click()

      cy.wait("@errorRequest")
      cy.getByDataHook("chat-message-error").should("be.visible")
      cy.getByDataHook("retry-button").should("be.visible")

      cy.intercept("POST", PROVIDERS.openai.endpoint, (req) => {
        if (isTitleRequest("openai", req.body)) {
          req.reply(createChatTitleResponse("openai", "Test Chat"))
          return
        }
        req.reply(
          createResponse(
            "openai",
            createFinalResponseData("openai", "Successful response"),
            { streaming: true },
          ),
        )
      }).as("successRequest")

      cy.getByDataHook("retry-button").click()

      cy.wait("@successRequest").then(({ request }) => {
        expect(JSON.stringify(request.body.input)).to.contain(
          "Test retry message",
        )
      })
      cy.waitForStreamingComplete()
      cy.getByDataHook("chat-message-error").should("not.exist")
      cy.getByDataHook("chat-message-assistant")
        .should("have.length", 1)
        .and("contain", "Successful response")
      cy.getByDataHook("chat-message-user")
        .should("have.length", 1)
        .and("contain", "Test retry message")
    })
  })

  describe("run query from chat", () => {
    const testTables = ["btc_trades"]

    before(() => {
      testTables.forEach((table) => {
        cy.createTable(table)
      })
    })

    after(() => {
      testTables.forEach((table) => {
        cy.dropTableIfExists(table)
      })
    })

    it("should accept suggestion to new tab when no prior buffer exists", () => {
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
      const sql = "SELECT count() FROM btc_trades;"
      const flow = createToolCallFlow({
        provider: "openai",
        streaming: true,
        question: "Count btc trades",
        steps: [
          {
            finalResponse: {
              explanation: "Here is a count query.",
              sql,
            },
          },
        ],
      })

      flow.intercept()
      let tabCount
      cy.getEditorTabs().then(($tabs) => {
        tabCount = $tabs.length
      })

      // Open chat from the chat button (no query context, no buffer association)
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea").should("be.visible")
      cy.getByDataHook("chat-input-textarea").type(flow.question)
      cy.getByDataHook("chat-send-button").click()

      flow.waitForCompletion()

      // Run the query from chat first
      cy.getByDataHook("message-action-run-sql").should("be.visible").click()
      cy.getByDataHook("success-notification")
        .should("be.visible")
        .and(($notification) => {
          expect($notification.text().replace(/\s+/g, " ")).to.contain(
            "SELECT count() FROM btc_trades",
          )
        })

      // Accept the suggestion — should create a new tab since chat has no buffer
      cy.getByDataHook("message-action-accept").should("be.visible").click()
      cy.getByDataHook("diff-status-accepted").should("contain", "Accepted")

      // Context badge should show the query
      cy.getByDataHook("chat-context-badge").should(
        "contain",
        "SELECT count() FROM btc_trades",
      )

      // Click context badge to navigate to the new tab
      cy.getByDataHook("chat-context-badge").click()
      cy.get(".aiQueryHighlight").should("exist")
      cy.getEditorContent().should(($editor) => {
        expect($editor.val().replace(/\s+/g, " ").trim()).to.equal(sql)
      })
      cy.getEditorTabs().should(($tabs) => {
        expect($tabs).to.have.length(tabCount + 1)
      })

      // Notification should still be visible (moved to new buffer namespace)
      cy.getByDataHook("success-notification")
        .should("be.visible")
        .and(($notification) => {
          expect($notification.text().replace(/\s+/g, " ")).to.contain(
            "SELECT count() FROM btc_trades",
          )
        })
    })

    it("should accept suggestion to new tab when previous buffer is archived", () => {
      // Given
      const query = "SELECT 1;"
      const secondSQL = "SELECT price FROM btc_trades;"
      loadConsoleWithChats(
        [
          createQueryChat({
            bufferId: 1,
            query,
            userMessage: "Show symbols",
            sql: "SELECT symbol FROM btc_trades;",
          }),
        ],
        { buffers: [{ value: query }] },
      )
      cy.getAIIconInLine(1, "active").click()

      // When
      cy.getByDataHook("message-action-accept").should("be.visible").click()
      cy.getByDataHook("diff-status-accepted").should("contain", "Accepted")
      cy.getByDataHook("chat-context-badge").should("contain", "SELECT symbol")

      // Close the tab that the suggestion was applied to (archive the buffer)
      // First, create another tab so we can close the current one
      cy.addEditorTab()
      cy.getEditorTabs().should("have.length", 2)

      let archivedTabId
      cy.getEditorTabs()
        .eq(0)
        .invoke("attr", "data-tab-id")
        .then((id) => {
          archivedTabId = id
        })
      // Close the first tab (the one with the accepted query)
      cy.getEditorTabs().eq(0).find(".chrome-tab-close").click()
      cy.getEditorTabs().should("have.length", 1)

      // Now send a follow-up that produces a new suggestion
      const secondFlow = createMultiTurnFlow({
        provider: "openai",
        streaming: true,
        turns: [
          {
            explanation: "Query for prices.",
            sql: secondSQL,
          },
        ],
      })

      secondFlow.intercept()

      cy.getByDataHook("chat-input-textarea").type("Show prices instead", {
        force: true,
      })
      cy.getByDataHook("chat-send-button").click()

      secondFlow.waitForTurn(0)

      // Accept the new suggestion — buffer was archived, should create new tab
      cy.getByDataHook("chat-message-assistant")
        .last()
        .getByDataHook("message-action-accept")
        .should("be.visible")
        .click()

      // Should show accepted status
      cy.getByDataHook("chat-message-assistant")
        .last()
        .find('[data-hook="diff-status-accepted"]')
        .should("contain", "Accepted")

      // Context badge should show the new query
      cy.getByDataHook("chat-context-badge").should("contain", "SELECT price")

      // Click context badge to navigate to the new tab
      cy.getByDataHook("chat-context-badge").click()
      cy.get(".aiQueryHighlight").should("exist")
      cy.getEditorContent().should(($editor) => {
        expect($editor.val().replace(/\s+/g, " ").trim()).to.equal(secondSQL)
      })
      cy.getEditorTabs()
        .should("have.length", 2)
        .each(($tab) => {
          expect($tab.attr("data-tab-id")).not.to.equal(archivedTabId)
        })
    })

    it("should show abort dialog when running chat query while editor query is in flight", () => {
      // Given
      loadConsoleWithChats(
        [createChat({ sql: "SELECT * FROM btc_trades LIMIT 10;" })],
        {
          buffers: [{ value: "select 1;" }],
        },
      )
      openSavedChat()

      cy.getByDataHook("message-action-run-sql").should("be.visible")
      const superseded = createResponseGate()
      cy.intercept("/exec*", (req) => {
        if (req.query.query?.trim().replace(/;$/, "") === "select 1") {
          req.continue(async () => {
            await superseded.promise
          })
        }
      })

      // When
      cy.clickRunIconInLine(1)

      // Then
      cy.getCancelIconInLine(1).should("be.visible")

      // When
      cy.getByDataHook("message-action-run-sql").click()

      // Then
      cy.getByDataHook("abort-confirmation-dialog").should("be.visible")

      // When
      cy.getByDataHook("abort-confirmation-dialog-dismiss").click()

      // Then
      cy.getByDataHook("abort-confirmation-dialog").should("not.exist")
      cy.getCancelIconInLine(1).should("be.visible")

      // When
      cy.getByDataHook("message-action-run-sql").click()

      // Then
      cy.getByDataHook("abort-confirmation-dialog").should("be.visible")

      // When
      cy.getByDataHook("abort-confirmation-dialog-confirm").click()
      cy.then(superseded.release)

      // Then
      cy.getByDataHook("success-notification")
        .should("be.visible")
        .and("contain", "SELECT * FROM btc_trades LIMIT 10")

      // When the notifications log is expanded
      cy.expandNotifications()

      // Then the superseded editor query is recorded as cancelled, without the
      // editor having to steal focus to surface it
      cy.getExpandedNotifications()
        .find('[data-hook="error-notification"]')
        .should("contain", "Cancelled by user")
        .and("contain", "select 1")
    })

    it("should show abort dialog when running editor query while chat query is in flight", () => {
      // Given
      loadConsoleWithChats(
        [createChat({ sql: "SELECT * FROM btc_trades LIMIT 10;" })],
        {
          buffers: [{ value: "select 1;" }],
        },
      )
      openSavedChat()

      cy.getByDataHook("message-action-run-sql").should("be.visible")
      const superseded = createResponseGate()
      cy.intercept("/exec*", (req) => {
        if (
          req.query.query?.trim().replace(/;$/, "") ===
          "SELECT * FROM btc_trades LIMIT 10"
        ) {
          req.continue(async () => {
            await superseded.promise
          })
        }
      })

      // When
      cy.getByDataHook("message-action-run-sql").click()

      // Then
      cy.getByDataHook("loading-notification").should("be.visible")

      // When
      cy.clickRunIconInLine(1)

      // Then
      cy.getByDataHook("abort-confirmation-dialog").should("be.visible")

      // When
      cy.getByDataHook("abort-confirmation-dialog-dismiss").click()

      // Then
      cy.getByDataHook("abort-confirmation-dialog").should("not.exist")
      cy.getByDataHook("loading-notification").should("be.visible")

      // When
      cy.clickRunIconInLine(1)

      // Then
      cy.getByDataHook("abort-confirmation-dialog").should("be.visible")

      // When
      cy.getByDataHook("abort-confirmation-dialog-confirm").click()
      cy.then(superseded.release)
      cy.clickLine(1)

      // Then
      cy.getByDataHook("success-notification").should("contain", "select 1")
      cy.expandNotifications()
      cy.getExpandedNotifications()
        .find('[data-hook="error-notification"]')
        .should("contain", "Cancelled by user")
        .and("contain", "SELECT * FROM btc_trades LIMIT 10")
    })
  })
})

describe("custom providers", () => {
  after(() => {
    cy.dropTableIfExists("custom_provider_trades")
  })

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
  })

  it("configures a custom provider, accepts its SQL, and restores the chat after reload", () => {
    // Given
    const customEndpoint = getCustomProviderEndpoint(
      CUSTOM_PROVIDER_DEFAULTS.baseURL,
      "openai-chat-completions",
    )
    const sql = "SELECT * FROM custom_provider_trades LIMIT 10;"
    const assistantResponse = "Here is a query for custom_provider_trades."
    const flow = createToolCallFlow({
      provider: "openai-chat-completions",
      streaming: true,
      question: "What tables are in the database?",
      endpoint: customEndpoint,
      steps: [
        { toolCall: { name: "get_tables", args: {} } },
        {
          finalResponse: { explanation: assistantResponse, sql },
          expectToolResult: { includes: ["custom_provider_trades"] },
        },
      ],
    })
    cy.dropTableIfExists("custom_provider_trades")
    cy.execAdminQuery("CREATE TABLE custom_provider_trades (price DOUBLE)")
    cy.loadConsoleWithAuth(false, {}, { buffers: [{ value: "" }] })
    cy.intercept("GET", `${CUSTOM_PROVIDER_DEFAULTS.baseURL}/models*`, {
      statusCode: 200,
      body: {
        object: "list",
        data: [{ id: "llama3", object: "model" }],
      },
    }).as("modelListRequest")
    flow.intercept()

    // When
    cy.getByDataHook("ai-assistant-settings-button").click()
    cy.getByDataHook("ai-promo-continue").click()
    cy.getByDataHook("ai-settings-provider-custom").click()
    cy.getByDataHook("custom-provider-name-input").type("Ollama")
    cy.getByDataHook("custom-provider-type-select").should(
      "contain",
      "OpenAI Chat Completions API",
    )
    cy.getByDataHook("custom-provider-base-url-input").type(
      CUSTOM_PROVIDER_DEFAULTS.baseURL,
    )
    cy.getByDataHook("multi-step-modal-next-button").click()
    cy.wait("@modelListRequest")
    cy.getByDataHook("custom-provider-model-row").contains("llama3").click()
    cy.getByDataHook("permissions-trigger").click()
    cy.getByDataHook("permission-level-schema").click()
    cy.getByDataHook("multi-step-modal-next-button").click()

    // Then
    cy.contains("AI Assistant activated successfully").should("be.visible")
    cy.window().then((win) => {
      const settings = JSON.parse(
        win.localStorage.getItem("ai.assistant.settings"),
      )
      const [id] = Object.keys(settings.customProviders)
      expect(settings.customProviders[id]).to.include({
        name: "Ollama",
        type: "openai-chat-completions",
        baseURL: CUSTOM_PROVIDER_DEFAULTS.baseURL,
        grantSchemaAccess: true,
      })
      expect(settings.providers[id].enabledModels).to.deep.equal([
        `${id}:llama3`,
      ])
      cy.wrap(settings).as("savedCustomSettings")
    })

    // When
    cy.getByDataHook("ai-chat-button").click()
    cy.getByDataHook("chat-input-textarea").type(flow.question)
    cy.getByDataHook("chat-send-button").click()
    flow.waitForCompletion()

    // Then
    cy.getByDataHook("chat-message-assistant").should(
      "contain",
      assistantResponse,
    )
    cy.getByDataHook("assistant-mode-processing-collapsed").click()
    cy.getByDataHook("assistant-mode-reviewing-tables").should("exist")
    cy.getByDataHook("message-action-accept").click()
    cy.getByDataHook("diff-status-accepted").should("contain", "Accepted")
    cy.getByDataHook("chat-context-badge").should(
      "contain",
      "SELECT * FROM custom_",
    )
    cy.getEditorContent().should(($editor) => {
      expect($editor.val().replace(/\s+/g, " ")).to.equal(sql)
    })

    // When
    cy.reload()
    cy.getEditor().should("be.visible")
    cy.getByDataHook("ai-chat-button").click()
    cy.getByDataHook("chat-window-history").click()
    cy.getByDataHook("chat-history-item").should("have.length", 1).click()

    // Then
    cy.get("@savedCustomSettings").then((expected) => {
      cy.window().then((win) => {
        expect(
          JSON.parse(win.localStorage.getItem("ai.assistant.settings")),
        ).to.deep.equal(expected)
      })
    })
    cy.getByDataHook("chat-message-user").should("have.text", flow.question)
    cy.getByDataHook("chat-message-assistant").should(
      "contain",
      assistantResponse,
    )
    cy.getEditorContent().should(($editor) => {
      expect($editor.val().replace(/\s+/g, " ")).to.equal(sql)
    })
    cy.intercept("POST", customEndpoint, (req) => {
      if (isTitleRequest("openai-chat-completions", req.body)) {
        req.reply(createChatTitleResponse("openai-chat-completions"))
        return
      }
      expect(req.body.model).to.equal("llama3")
      expect(JSON.stringify(req.body.messages)).to.include(flow.question)
      req.alias = "restoredCustomChat"
      req.reply(
        createResponse(
          "openai-chat-completions",
          createFinalResponseData(
            "openai-chat-completions",
            "Working after reload",
          ),
          { streaming: true },
        ),
      )
    })

    // When
    cy.getByDataHook("chat-input-textarea")
      .focus()
      .type("Continue this conversation")
    cy.getByDataHook("chat-send-button").click()
    cy.wait("@restoredCustomChat")
    cy.waitForStreamingComplete()

    // Then
    cy.getByDataHook("chat-message-user").should("have.length", 2)
    cy.getByDataHook("chat-message-assistant")
      .last()
      .should("contain", "Working after reload")
  })

  it("replaces a custom provider and sends a chat through the surviving provider", () => {
    // Given
    cy.loadConsoleWithAuth(
      false,
      getCustomProviderConfiguredSettings({
        providerId: "ollama",
        name: "Ollama",
        models: ["llama3", "mistral", "codellama"],
      }),
    )
    cy.intercept("GET", "https://openrouter.ai/api/v1/models", {
      statusCode: 200,
      body: { object: "list", data: [{ id: "gpt-4o", object: "model" }] },
    }).as("replacementModels")
    cy.intercept(
      "POST",
      "https://openrouter.ai/api/v1/chat/completions",
      (req) => {
        if (isTitleRequest("openai-chat-completions", req.body)) {
          req.reply(
            createChatTitleResponse(
              "openai-chat-completions",
              "Replacement Chat",
            ),
          )
          return
        }
        expect(req.body.model).to.equal("gpt-4o")
        req.alias = "survivingProviderChat"
        req.reply(
          createResponse(
            "openai-chat-completions",
            createFinalResponseData(
              "openai-chat-completions",
              "Response from the replacement provider",
            ),
            { streaming: true },
          ),
        )
      },
    )
    cy.intercept(
      "POST",
      getCustomProviderEndpoint(
        CUSTOM_PROVIDER_DEFAULTS.baseURL,
        "openai-chat-completions",
      ),
      () => {
        throw new Error("Chat used the removed provider")
      },
    )

    // When
    cy.getByDataHook("ai-assistant-settings-button").click()
    cy.getByDataHook("ai-settings-add-custom-provider").click()
    cy.getByDataHook("custom-provider-name-input").type("OpenRouter")
    cy.getByDataHook("custom-provider-base-url-input").type(
      "https://openrouter.ai/api/v1",
    )
    cy.getByDataHook("multi-step-modal-next-button").click()
    cy.wait("@replacementModels")
    cy.getByDataHook("custom-provider-model-row").contains("gpt-4o").click()
    cy.getByDataHook("multi-step-modal-next-button").click()
    cy.getByDataHook("ai-settings-provider-ollama").should("be.visible")
    cy.contains("[data-hook^='ai-settings-provider-']", "OpenRouter").should(
      "be.visible",
    )
    cy.getByDataHook("ai-settings-save").click()

    // Then
    cy.getByDataHook("ai-settings-model-dropdown").click()
    cy.getByDataHook("ai-settings-model-item").should("have.length", 4)
    cy.get("body").type("{esc}")

    // When
    cy.getByDataHook("ai-assistant-settings-button").click()
    cy.getByDataHook("ai-settings-provider-ollama").click()
    cy.getByDataHook("ai-settings-remove-provider").click()
    cy.getByDataHook("ai-settings-provider-ollama").should("not.exist")
    cy.contains("[data-hook^='ai-settings-provider-']", "OpenRouter").should(
      "be.visible",
    )
    cy.getByDataHook("ai-settings-save").click()

    // Then
    cy.getByDataHook("ai-settings-model-dropdown").click()
    cy.getByDataHook("ai-settings-model-item")
      .should("have.length", 1)
      .should("contain", "gpt-4o")
    cy.get("body").type("{esc}")
    cy.window().then((win) => {
      const settings = JSON.parse(
        win.localStorage.getItem("ai.assistant.settings"),
      )
      expect(settings.customProviders).not.to.have.property("ollama")
      expect(settings.providers).not.to.have.property("ollama")
      const [survivor] = Object.keys(settings.customProviders)
      expect(settings.selectedModel).to.equal(`${survivor}:gpt-4o`)
    })

    // When
    cy.getByDataHook("ai-chat-button").click()
    cy.getByDataHook("chat-input-textarea").type("Use the replacement provider")
    cy.getByDataHook("chat-send-button").click()
    cy.wait("@survivingProviderChat")
    cy.waitForStreamingComplete()

    // Then
    cy.getByDataHook("chat-message-assistant").should(
      "contain",
      "Response from the replacement provider",
    )
  })

  it("should route requests to correct endpoint when switching between built-in and custom models", () => {
    const customBaseURL = CUSTOM_PROVIDER_DEFAULTS.baseURL
    const customEndpoint = getCustomProviderEndpoint(
      customBaseURL,
      "openai-chat-completions",
    )

    const openaiSettings = getOpenAIConfiguredSettings()
    cy.loadConsoleWithAuth(
      false,
      getCustomProviderConfiguredSettings(
        {
          providerId: "ollama",
          name: "Ollama",
          models: ["llama3"],
        },
        openaiSettings,
      ),
    )

    cy.intercept("POST", customEndpoint, (req) => {
      if (isTitleRequest("openai-chat-completions", req.body)) {
        req.reply(
          createChatTitleResponse("openai-chat-completions", "Ollama Chat"),
        )
        return
      }
      expect(req.body.model).to.equal("llama3")
      req.alias = "customModelChat"
      req.reply(
        createResponse(
          "openai-chat-completions",
          createFinalResponseData(
            "openai-chat-completions",
            "Response from Ollama",
          ),
          { streaming: true },
        ),
      )
    }).as("ollamaRequest")

    cy.intercept("POST", PROVIDERS.openai.endpoint, (req) => {
      if (isTitleRequest("openai", req.body)) {
        req.reply(createChatTitleResponse("openai", "OpenAI Chat"))
        return
      }
      expect(req.body.model).to.equal("gpt-5-mini")
      req.alias = "builtinModelChat"
      req.reply(
        createResponse(
          "openai",
          createFinalResponseData("openai", "Response from OpenAI"),
          { streaming: true },
        ),
      )
    }).as("openaiRequest")

    cy.getByDataHook("ai-chat-button").click()
    cy.getByDataHook("chat-input-textarea").should("be.visible")
    cy.getByDataHook("chat-input-textarea").type("Test with Ollama")
    cy.getByDataHook("chat-send-button").click()

    cy.wait("@customModelChat")
    cy.waitForStreamingComplete()
    cy.getByDataHook("chat-message-assistant")
      .should("be.visible")
      .should("contain", "Response from Ollama")

    cy.getByDataHook("ai-settings-model-dropdown").click()
    cy.getByDataHook("ai-settings-model-item-label")
      .contains("GPT 5 Mini")
      .click()

    cy.getByDataHook("chat-window-new").click()
    cy.getByDataHook("chat-input-textarea").should("be.visible")
    cy.getByDataHook("chat-input-textarea").type("Test with OpenAI")
    cy.getByDataHook("chat-send-button").click()

    cy.wait("@builtinModelChat")
    cy.waitForStreamingComplete()
    cy.getByDataHook("chat-message-assistant")
      .should("be.visible")
      .should("contain", "Response from OpenAI")

    cy.getByDataHook("ai-assistant-settings-button").click()
    cy.getByDataHook("ai-settings-provider-openai").should("be.visible")
    cy.getByDataHook("ai-settings-provider-ollama").should("be.visible")
    cy.getByDataHook("ai-settings-cancel").click()
  })
})
