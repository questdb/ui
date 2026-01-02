const ctrlOrCmd = Cypress.platform === "darwin" ? "{cmd}" : "{ctrl}"

const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Creates an OpenAI tool call response
 * @param {string} toolName - Name of the tool being called
 * @param {Object} toolArguments - Arguments for the tool call
 * @returns {Object} OpenAI response object with function_call
 */
function createOpenAIToolCallResponse(toolName, toolArguments = {}) {
  const callId = `call_${Math.random().toString(36).substring(7)}`
  return {
    id: `resp_mock_tool_${toolName}`,
    object: "response",
    created_at: Date.now(),
    status: "completed",
    output: [
      {
        type: "function_call",
        id: `fc_${Math.random().toString(36).substring(7)}`,
        name: toolName,
        arguments: JSON.stringify(toolArguments),
        call_id: callId,
      },
    ],
    output_text: "",
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

/**
 * Creates an OpenAI final response with explanation and optional SQL
 * @param {string} explanation - The explanation text
 * @param {string|null} sql - Optional SQL query
 * @returns {Object} OpenAI response object with message
 */
function createOpenAIFinalResponse(explanation, sql = null) {
  const responseContent = { explanation, sql }
  return {
    id: "resp_mock_final",
    object: "response",
    created_at: Date.now(),
    status: "completed",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [
          { type: "output_text", text: JSON.stringify(responseContent) },
        ],
      },
    ],
    output_text: JSON.stringify(responseContent),
    usage: { input_tokens: 200, output_tokens: 100 },
  }
}

/**
 * Creates a chat title response
 * @param {string} title - The chat title
 * @returns {Object} OpenAI response object with title
 */
function createChatTitleResponse(title = "Test Chat") {
  return {
    id: "resp_mock_title",
    object: "response",
    created_at: Date.now(),
    status: "completed",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: JSON.stringify({ title }) }],
      },
    ],
    output_text: JSON.stringify({ title }),
    usage: { input_tokens: 50, output_tokens: 20 },
  }
}

/**
 * Creates a multi-turn tool call flow with automatic intercept handling
 *
 * @param {Object} config - Flow configuration
 * @param {string} config.question - The user's question to match
 * @param {Array} config.steps - Array of step definitions
 * @param {Object} [config.steps[].toolCall] - Tool call definition { name, args }
 * @param {Object} [config.steps[].expectToolResult] - Expected result { includes: string[] }
 * @param {Object} [config.steps[].finalResponse] - Final response { explanation, sql }
 * @returns {Object} Flow controller with intercept() and waitForCompletion() methods
 *
 * @example
 * const flow = createToolCallFlow({
 *   question: "Describe the ecommerce_stats table",
 *   steps: [
 *     { toolCall: { name: "get_tables", args: {} } },
 *     {
 *       toolCall: { name: "get_table_schema", args: { table_name: "ecommerce_stats" } },
 *       expectToolResult: { includes: ["btc_trades", "ecommerce_stats"] }
 *     },
 *     {
 *       finalResponse: { explanation: "Table description...", sql: null },
 *       expectToolResult: { includes: ["CREATE TABLE", "ecommerce_stats"] }
 *     }
 *   ]
 * })
 *
 * // Usage:
 * flow.intercept()
 * cy.getByDataHook("chat-send-button").click()
 * flow.waitForCompletion()
 */
function createToolCallFlow(config) {
  const { question, steps } = config
  let requestCount = 0
  const totalRequests = steps.length

  return {
    question,

    /**
     * Sets up cy.intercept for both chat title and tool call flow
     */
    intercept() {
      // Handle chat title generation
      cy.intercept("POST", "https://api.openai.com/v1/responses", (req) => {
        if (
          req.body.input[0].content.includes("Generate a concise chat title")
        ) {
          req.reply({ statusCode: 200, body: createChatTitleResponse() })
        }
      })

      // Handle tool call flow
      cy.intercept("POST", "https://api.openai.com/v1/responses", (req) => {
        if (req.body.input[0].content !== question) {
          return
        }
        requestCount++

        const step = steps[requestCount - 1]
        if (!step) return

        // Verify previous tool result if expectToolResult is defined
        if (step.expectToolResult) {
          const functionOutputs = req.body.input.filter(
            (item) => item.type === "function_call_output",
          )
          const latestOutput = functionOutputs[functionOutputs.length - 1]
          expect(latestOutput).to.exist

          for (const expected of step.expectToolResult.includes || []) {
            expect(latestOutput.output).to.include(expected)
          }
        }

        // Send response
        if (step.toolCall) {
          req.reply({
            statusCode: 200,
            delay: 100,
            body: createOpenAIToolCallResponse(
              step.toolCall.name,
              step.toolCall.args || {},
            ),
          })
        } else if (step.finalResponse) {
          req.reply({
            statusCode: 200,
            delay: 100,
            body: createOpenAIFinalResponse(
              step.finalResponse.explanation,
              step.finalResponse.sql,
            ),
          })
        }
      }).as("openaiToolCall")
    },

    /**
     * Waits for all tool call requests to complete
     */
    waitForCompletion() {
      for (let i = 0; i < totalRequests; i++) {
        cy.wait("@openaiToolCall")
      }
    },
  }
}

/**
 * Creates a multi-turn conversation flow for testing multiple questions/responses
 * in the same chat session. Unlike createToolCallFlow which matches by question content,
 * this uses request counting to handle conversation history changes.
 *
 * Supports system message assertions to verify what context is sent to the AI.
 *
 * @param {Object} config - Flow configuration
 * @param {Array} config.turns - Array of turn definitions
 * @param {string} config.turns[].explanation - The AI's explanation text
 * @param {string|null} config.turns[].sql - Optional SQL query suggestion
 * @param {Object} [config.turns[].expectSystemMessage] - Expected content in system message
 * @param {string[]} [config.turns[].expectSystemMessage.includes] - Strings that must appear in system message
 * @param {string[]} [config.turns[].expectSystemMessage.excludes] - Strings that must NOT appear in system message
 * @returns {Object} Flow controller with intercept(), waitForTurn(), and getRequestBody() methods
 *
 * @example
 * const flow = createMultiTurnFlow({
 *   turns: [
 *     { explanation: "First query.", sql: "SELECT 1;" },
 *     {
 *       explanation: "Second query.",
 *       sql: "SELECT 2;",
 *       expectSystemMessage: {
 *         includes: ["User accepted the suggested SQL"],
 *         excludes: ["User rejected"]
 *       }
 *     },
 *   ]
 * })
 *
 * flow.intercept()
 * // ... send first message ...
 * flow.waitForTurn(0)
 * // ... accept suggestion, send second message ...
 * flow.waitForTurn(1) // Will assert system message content
 */
function createMultiTurnFlow(config) {
  const { turns } = config
  let requestCount = 0
  const requestBodies = []

  return {
    /**
     * Sets up cy.intercept for chat title and all conversation turns
     */
    intercept() {
      // Intercept for chat title generation - separate alias to not interfere with turn counting
      cy.intercept("POST", "https://api.openai.com/v1/responses", (req) => {
        if (
          req.body.input[0].content.includes("Generate a concise chat title")
        ) {
          req.reply({ statusCode: 200, body: createChatTitleResponse() })
        }
      }).as("chatTitleRequest")

      // Intercept for conversation turns only - uses routeMatcher to exclude title requests
      cy.intercept(
        {
          method: "POST",
          url: "https://api.openai.com/v1/responses",
        },
        (req) => {
          // Skip title requests - they're handled by the other intercept
          if (
            req.body.input[0].content.includes("Generate a concise chat title")
          ) {
            return
          }

          // Handle conversation turns
          const turn = turns[requestCount]
          if (turn) {
            // Store the request body for later assertions
            requestBodies[requestCount] = req.body

            // Verify system message expectations if defined
            if (turn.expectSystemMessage) {
              const allInputContent = req.body.input
                .map((item) => item.content || "")
                .join("\n")

              // Check includes
              if (turn.expectSystemMessage.includes) {
                for (const expected of turn.expectSystemMessage.includes) {
                  expect(allInputContent).to.include(
                    expected,
                    `Turn ${requestCount}: Expected system message to include "${expected}"`,
                  )
                }
              }

              // Check excludes
              if (turn.expectSystemMessage.excludes) {
                for (const excluded of turn.expectSystemMessage.excludes) {
                  expect(allInputContent).to.not.include(
                    excluded,
                    `Turn ${requestCount}: Expected system message NOT to include "${excluded}"`,
                  )
                }
              }
            }

            requestCount++
            req.reply({
              statusCode: 200,
              delay: 100,
              body: createOpenAIFinalResponse(turn.explanation, turn.sql),
            })
          }
        },
      ).as("multiTurnRequest")
    },

    /**
     * Waits for a specific turn to complete
     * @param {number} turnIndex - The turn index (0-based)
     * @returns {Cypress.Chainable} Chainable that resolves when the turn is complete
     *
     * @example
     * flow.waitForTurn(0).then(() => {
     *   const body = flow.getRequestBody(0)
     *   expect(body.input).to.have.length(1)
     * })
     */
    waitForTurn(turnIndex) {
      // Wait until requestBodies has data for this turn index
      // This avoids issues with alias matching title requests
      // We use cy.wrap with should() which retries until the condition is met
      return cy
        .wrap(null)
        .should(() => {
          expect(
            requestBodies[turnIndex],
            `Turn ${turnIndex} should be captured`,
          ).to.not.be.undefined
        })
        .then(() => requestBodies[turnIndex])
    },

    /**
     * Waits for all turns to complete
     * @returns {Cypress.Chainable} Chainable that yields all request bodies
     */
    waitForAllTurns() {
      // Wait for the last turn which means all turns are complete
      return cy
        .wrap(null)
        .should(() => {
          expect(
            requestBodies[turns.length - 1],
            `All ${turns.length} turns should be captured`,
          ).to.not.be.undefined
        })
        .then(() => requestBodies)
    },

    /**
     * Gets the captured request body for a specific turn.
     * Must be called inside cy.then() after waitForTurn()
     * @param {number} turnIndex - The turn index (0-based)
     * @returns {Object} The request body sent for that turn
     */
    getRequestBody(turnIndex) {
      return requestBodies[turnIndex]
    },

    /**
     * Gets all captured request bodies
     * Must be called inside cy.then() after waitForTurn()
     * @returns {Array} Array of request bodies
     */
    getAllRequestBodies() {
      return requestBodies
    },
  }
}

module.exports = {
  ctrlOrCmd,
  escapeRegExp,
  createToolCallFlow,
  createMultiTurnFlow,
}
