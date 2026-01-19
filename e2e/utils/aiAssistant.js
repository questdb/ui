const PROVIDERS = {
  openai: {
    endpoint: "https://api.openai.com/v1/responses",
    defaultModel: "gpt-5-mini",
  },
  anthropic: {
    endpoint: "https://api.anthropic.com/v1/messages",
    defaultModel: "claude-sonnet-4-5",
  },
}

function createFinalResponseData(provider, explanation, sql = null) {
  const responseContent = { explanation, sql }

  if (provider === "openai") {
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

  // Anthropic
  return {
    id: "msg_mock_final",
    type: "message",
    role: "assistant",
    model: PROVIDERS.anthropic.defaultModel,
    content: [{ type: "text", text: JSON.stringify(responseContent) }],
    stop_reason: "end_turn",
    usage: { input_tokens: 200, output_tokens: 100 },
  }
}

function createToolCallResponseData(provider, toolName, toolArguments = {}) {
  const callId = `call_${Math.random().toString(36).substring(7)}`

  if (provider === "openai") {
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

  // Anthropic
  return {
    id: `msg_mock_tool_${toolName}`,
    type: "message",
    role: "assistant",
    model: PROVIDERS.anthropic.defaultModel,
    content: [
      {
        type: "tool_use",
        id: callId,
        name: toolName,
        input: toolArguments,
      },
    ],
    stop_reason: "tool_use",
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

function createChatTitleResponseData(provider, title = "Test Chat") {
  const content = JSON.stringify({ title })

  if (provider === "openai") {
    return {
      id: "resp_mock_title",
      object: "response",
      created_at: Date.now(),
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: content }],
        },
      ],
      output_text: content,
      usage: { input_tokens: 50, output_tokens: 20 },
    }
  }

  // Anthropic
  return {
    id: "msg_mock_title",
    type: "message",
    role: "assistant",
    model: PROVIDERS.anthropic.defaultModel,
    content: [{ type: "text", text: content }],
    stop_reason: "end_turn",
    usage: { input_tokens: 50, output_tokens: 20 },
  }
}

function createOpenAISSEResponse(responseData, delay = 0) {
  const events = []

  // Stream text delta events for the content
  const outputText = responseData.output_text || ""
  if (outputText) {
    const chunkSize = 20
    for (let i = 0; i < outputText.length; i += chunkSize) {
      const chunk = outputText.slice(i, i + chunkSize)
      events.push(
        `event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: chunk })}\n\n`,
      )
    }
  }

  // Add the final completion event
  events.push(
    `event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: responseData })}\n\n`,
  )

  // Add [DONE] marker
  const sseBody = events.join("") + "data: [DONE]\n\n"

  const response = {
    statusCode: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
    body: sseBody,
  }

  if (delay > 0) {
    response.delay = delay
  }

  return response
}

function createAnthropicSSEResponse(responseData, delay = 0) {
  const events = []

  // Extract text content from response
  const textContent =
    responseData.content?.find((c) => c.type === "text")?.text || ""
  const toolUseContent = responseData.content?.find(
    (c) => c.type === "tool_use",
  )

  // message_start event
  events.push(
    `event: message_start\ndata: ${JSON.stringify({
      type: "message_start",
      message: {
        id: responseData.id,
        type: "message",
        role: "assistant",
        model: responseData.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: responseData.usage?.input_tokens || 0,
          output_tokens: 1,
        },
      },
    })}\n\n`,
  )

  let contentIndex = 0

  // Handle text content
  if (textContent) {
    // content_block_start for text
    events.push(
      `event: content_block_start\ndata: ${JSON.stringify({
        type: "content_block_start",
        index: contentIndex,
        content_block: { type: "text", text: "" },
      })}\n\n`,
    )

    // Stream text in chunks
    const chunkSize = 20
    for (let i = 0; i < textContent.length; i += chunkSize) {
      const chunk = textContent.slice(i, i + chunkSize)
      events.push(
        `event: content_block_delta\ndata: ${JSON.stringify({
          type: "content_block_delta",
          index: contentIndex,
          delta: { type: "text_delta", text: chunk },
        })}\n\n`,
      )
    }

    // content_block_stop
    events.push(
      `event: content_block_stop\ndata: ${JSON.stringify({
        type: "content_block_stop",
        index: contentIndex,
      })}\n\n`,
    )

    contentIndex++
  }

  // Handle tool_use content
  if (toolUseContent) {
    // content_block_start for tool_use
    events.push(
      `event: content_block_start\ndata: ${JSON.stringify({
        type: "content_block_start",
        index: contentIndex,
        content_block: {
          type: "tool_use",
          id: toolUseContent.id,
          name: toolUseContent.name,
          input: {},
        },
      })}\n\n`,
    )

    // Stream tool input as JSON delta
    const inputJson = JSON.stringify(toolUseContent.input)
    events.push(
      `event: content_block_delta\ndata: ${JSON.stringify({
        type: "content_block_delta",
        index: contentIndex,
        delta: { type: "input_json_delta", partial_json: inputJson },
      })}\n\n`,
    )

    // content_block_stop
    events.push(
      `event: content_block_stop\ndata: ${JSON.stringify({
        type: "content_block_stop",
        index: contentIndex,
      })}\n\n`,
    )
  }

  // message_delta event
  events.push(
    `event: message_delta\ndata: ${JSON.stringify({
      type: "message_delta",
      delta: {
        stop_reason: responseData.stop_reason || "end_turn",
        stop_sequence: null,
      },
      usage: { output_tokens: responseData.usage?.output_tokens || 100 },
    })}\n\n`,
  )

  // message_stop event
  events.push(
    `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
  )

  const sseBody = events.join("")

  const response = {
    statusCode: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
    body: sseBody,
  }

  if (delay > 0) {
    response.delay = delay
  }

  return response
}

function createResponse(provider, responseData, options = {}) {
  const { streaming = true, delay = 0 } = options

  if (!streaming) {
    // Non-streaming: return plain JSON
    const response = {
      statusCode: 200,
      body: responseData,
    }
    if (delay > 0) {
      response.delay = delay
    }
    return response
  }

  // Streaming: return SSE format
  if (provider === "openai") {
    return createOpenAISSEResponse(responseData, delay)
  }

  return createAnthropicSSEResponse(responseData, delay)
}

function createFinalResponse(provider, explanation, sql = null, options = {}) {
  const responseData = createFinalResponseData(provider, explanation, sql)
  return createResponse(provider, responseData, options)
}

function createToolCallResponse(
  provider,
  toolName,
  toolArguments = {},
  options = {},
) {
  const responseData = createToolCallResponseData(
    provider,
    toolName,
    toolArguments,
  )
  return createResponse(provider, responseData, options)
}

function createChatTitleResponse(provider, title = "Test Chat") {
  const responseData = createChatTitleResponseData(provider, title)
  // Title generation is never streamed
  return createResponse(provider, responseData, { streaming: false })
}

function isTitleRequest(provider, body) {
  if (provider === "openai") {
    return (
      body.input?.[0]?.content?.includes?.("Generate a concise chat title") ||
      false
    )
  }
  // Anthropic
  return (
    body.messages?.[0]?.content?.includes?.("Generate a concise chat title") ||
    false
  )
}

function requestMatchesQuestion(provider, body, question) {
  if (provider === "openai") {
    return body.input?.[0]?.content === question
  }
  // Anthropic - find the first user message with string content (the original question)
  // Subsequent messages may be tool results or assistant responses
  const firstUserMessage = body.messages?.find(
    (msg) => msg.role === "user" && typeof msg.content === "string",
  )
  return firstUserMessage?.content === question
}

function extractToolOutputContent(provider, body) {
  if (provider === "openai") {
    const functionOutputs = body.input?.filter(
      (item) => item.type === "function_call_output",
    )
    const latestOutput = functionOutputs?.[functionOutputs.length - 1]
    return latestOutput?.output || null
  }

  // Anthropic - tool results are in user messages with content array containing tool_result objects
  // Format: { role: "user", content: [{ type: "tool_result", tool_use_id: "...", content: "..." }] }
  const toolResultMessages = body.messages?.filter(
    (msg) =>
      msg.role === "user" &&
      Array.isArray(msg.content) &&
      msg.content.some((c) => c.type === "tool_result"),
  )
  const latestMessage = toolResultMessages?.[toolResultMessages.length - 1]
  const latestToolResult = latestMessage?.content?.find(
    (c) => c.type === "tool_result",
  )
  // Anthropic tool result content can be a string directly
  return latestToolResult?.content || null
}

function extractAllInputContent(provider, body) {
  if (provider === "openai") {
    return body.input?.map((item) => item.content || "").join("\n") || ""
  }
  // Anthropic
  return (
    body.messages
      ?.map((msg) => {
        if (typeof msg.content === "string") return msg.content
        if (Array.isArray(msg.content)) {
          return msg.content.map((c) => c.text || c.content || "").join("\n")
        }
        return ""
      })
      .join("\n") || ""
  )
}

// =============================================================================
// TOOL CALL FLOW
// =============================================================================

/**
 * Creates a multi-turn tool call flow with automatic intercept handling
 *
 * @param {Object} config - Flow configuration
 * @param {"openai" | "anthropic"} [config.provider="openai"] - The AI provider
 * @param {boolean} [config.streaming=true] - Whether to use streaming responses
 * @param {string} config.question - The user's question to match
 * @param {Array} config.steps - Array of step definitions
 * @param {Object} [config.steps[].toolCall] - Tool call definition { name, args }
 * @param {Object} [config.steps[].expectToolResult] - Expected result { includes: string[] }
 * @param {Object} [config.steps[].finalResponse] - Final response { explanation, sql }
 * @returns {Object} Flow controller with intercept() and waitForCompletion() methods
 *
 * @example
 * // OpenAI with streaming (default)
 * const flow = createToolCallFlow({
 *   question: "Describe the ecommerce_stats table",
 *   steps: [
 *     { toolCall: { name: "get_tables", args: {} } },
 *     { finalResponse: { explanation: "Table description...", sql: null } }
 *   ]
 * })
 *
 * @example
 * // Anthropic with streaming
 * const flow = createToolCallFlow({
 *   provider: "anthropic",
 *   streaming: true,
 *   question: "What tables exist?",
 *   steps: [
 *     { toolCall: { name: "get_tables", args: {} } },
 *     { finalResponse: { explanation: "Found tables...", sql: null } }
 *   ]
 * })
 *
 * @example
 * // OpenAI without streaming
 * const flow = createToolCallFlow({
 *   provider: "openai",
 *   streaming: false,
 *   question: "Quick test",
 *   steps: [
 *     { finalResponse: { explanation: "Done", sql: null } }
 *   ]
 * })
 */
function createToolCallFlow(config) {
  const { provider = "openai", streaming = true, question, steps } = config

  let requestCount = 0
  const totalRequests = steps.length
  const endpoint = PROVIDERS[provider].endpoint
  const responseOptions = { streaming }

  return {
    question,
    provider,
    streaming,

    /**
     * Sets up cy.intercept for both chat title and tool call flow
     */
    intercept() {
      // Handle chat title generation (never streamed)
      cy.intercept("POST", endpoint, (req) => {
        const isTitle = isTitleRequest(provider, req.body)
        if (isTitle) {
          req.reply(createChatTitleResponse(provider))
        }
      })

      // Handle tool call flow
      cy.intercept("POST", endpoint, (req) => {
        if (isTitleRequest(provider, req.body)) {
          return
        }

        // Check if this request matches our question
        if (!requestMatchesQuestion(provider, req.body, question)) {
          return
        }

        requestCount++

        const step = steps[requestCount - 1]
        if (!step) return

        // Verify previous tool result if expectToolResult is defined
        if (step.expectToolResult) {
          const toolOutputContent = extractToolOutputContent(provider, req.body)
          expect(toolOutputContent).to.exist

          for (const expected of step.expectToolResult.includes || []) {
            expect(toolOutputContent).to.include(expected)
          }
        }

        // Send response
        if (step.toolCall) {
          req.reply(
            createToolCallResponse(
              provider,
              step.toolCall.name,
              step.toolCall.args || {},
              responseOptions,
            ),
          )
        } else if (step.finalResponse) {
          req.reply(
            createFinalResponse(
              provider,
              step.finalResponse.explanation,
              step.finalResponse.sql,
              responseOptions,
            ),
          )
        }
      }).as("toolCallRequest")
    },

    /**
     * Waits for all tool call requests to complete and streaming to finish
     */
    waitForCompletion() {
      for (let i = 0; i < totalRequests; i++) {
        cy.wait("@toolCallRequest")
      }
      // Wait for streaming to finish if streaming is enabled
      if (streaming) {
        cy.waitForStreamingComplete()
      }
    },
  }
}

// =============================================================================
// MULTI-TURN CONVERSATION FLOW
// =============================================================================

/**
 * Creates a multi-turn conversation flow for testing multiple questions/responses
 * in the same chat session.
 *
 * @param {Object} config - Flow configuration
 * @param {"openai" | "anthropic"} [config.provider="openai"] - The AI provider
 * @param {boolean} [config.streaming=true] - Whether to use streaming responses
 * @param {Array} config.turns - Array of turn definitions
 * @param {string} config.turns[].explanation - The AI's explanation text
 * @param {string|null} config.turns[].sql - Optional SQL query suggestion
 * @param {Object} [config.turns[].expectSystemMessage] - Expected content in system message
 * @param {string[]} [config.turns[].expectSystemMessage.includes] - Strings that must appear
 * @param {string[]} [config.turns[].expectSystemMessage.excludes] - Strings that must NOT appear
 * @returns {Object} Flow controller with intercept(), waitForTurn(), and getRequestBody() methods
 *
 * @example
 * // OpenAI streaming (default)
 * const flow = createMultiTurnFlow({
 *   turns: [
 *     { explanation: "First query.", sql: "SELECT 1;" },
 *     { explanation: "Second query.", sql: "SELECT 2;" }
 *   ]
 * })
 *
 * @example
 * // Anthropic streaming
 * const flow = createMultiTurnFlow({
 *   provider: "anthropic",
 *   turns: [
 *     { explanation: "First response.", sql: null },
 *     {
 *       explanation: "Second response.",
 *       sql: "SELECT * FROM users;",
 *       expectSystemMessage: {
 *         includes: ["User accepted the suggested SQL"],
 *         excludes: ["User rejected"]
 *       }
 *     }
 *   ]
 * })
 */
function createMultiTurnFlow(config) {
  const { provider = "openai", streaming = true, turns } = config

  let requestCount = 0
  const requestBodies = []
  const endpoint = PROVIDERS[provider].endpoint
  const responseOptions = { streaming }

  return {
    provider,
    streaming,

    /**
     * Sets up cy.intercept for chat title and all conversation turns
     */
    intercept() {
      // Intercept for chat title generation
      cy.intercept("POST", endpoint, (req) => {
        if (isTitleRequest(provider, req.body)) {
          req.reply(createChatTitleResponse(provider))
        }
      }).as("chatTitleRequest")

      // Intercept for conversation turns
      cy.intercept("POST", endpoint, (req) => {
        // Skip title requests
        if (isTitleRequest(provider, req.body)) {
          return
        }

        // Handle conversation turns
        const turn = turns[requestCount]
        if (turn) {
          // Store the request body for later assertions
          requestBodies[requestCount] = req.body

          // Verify system message expectations if defined
          if (turn.expectSystemMessage) {
            const allInputContent = extractAllInputContent(provider, req.body)

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
          req.reply(
            createFinalResponse(
              provider,
              turn.explanation,
              turn.sql,
              responseOptions,
            ),
          )
        }
      }).as("multiTurnRequest")
    },

    /**
     * Waits for a specific turn to complete and streaming to finish
     * @param {number} turnIndex - The turn index (0-based)
     * @returns {Cypress.Chainable} Chainable that resolves when the turn is complete
     */
    waitForTurn(turnIndex) {
      return cy
        .wrap(null)
        .should(() => {
          expect(
            requestBodies[turnIndex],
            `Turn ${turnIndex} should be captured`,
          ).to.not.be.undefined
        })
        .then(() => {
          if (streaming) {
            return cy
              .waitForStreamingComplete()
              .then(() => requestBodies[turnIndex])
          }
          return cy.wait(100).then(() => requestBodies[turnIndex])
        })
    },

    /**
     * Waits for all turns to complete
     * @returns {Cypress.Chainable} Chainable that yields all request bodies
     */
    waitForAllTurns() {
      return cy
        .wrap(null)
        .should(() => {
          expect(
            requestBodies[turns.length - 1],
            `All ${turns.length} turns should be captured`,
          ).to.not.be.undefined
        })
        .then(() => {
          if (streaming) {
            return cy.waitForStreamingComplete().then(() => requestBodies)
          }
          return cy.wait(100).then(() => requestBodies)
        })
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
     * @returns {Array} Array of request bodies
     */
    getAllRequestBodies() {
      return requestBodies
    },
  }
}

module.exports = {
  PROVIDERS,
  createFinalResponseData,
  createResponse,
  createFinalResponse,
  createChatTitleResponse,
  createToolCallFlow,
  createMultiTurnFlow,
  isTitleRequest,
}
