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

const CUSTOM_PROVIDER_DEFAULTS = {
  providerId: "test-provider",
  name: "Test Provider",
  type: "openai-chat-completions",
  baseURL: "http://localhost:11434/v1",
  models: ["test-model-1"],
  contextWindow: 200000,
  grantSchemaAccess: true,
}

function getOpenAIConfiguredSettings(schemaAccess = true) {
  return {
    "ai.assistant.settings": JSON.stringify({
      selectedModel: "gpt-5-mini",
      providers: {
        openai: {
          apiKey: "test-openai-key",
          enabledModels: ["gpt-5-mini", "gpt-5"],
          grantSchemaAccess: schemaAccess,
        },
      },
    }),
  }
}

function getAnthropicConfiguredSettings(schemaAccess = true) {
  return {
    "ai.assistant.settings": JSON.stringify({
      selectedModel: "claude-sonnet-4-5",
      providers: {
        anthropic: {
          apiKey: "test-anthropic-key",
          enabledModels: ["claude-sonnet-4-5", "claude-opus-4-5"],
          grantSchemaAccess: schemaAccess,
        },
      },
    }),
  }
}

/**
 * Returns localStorage settings for a pre-configured custom provider.
 * Can optionally merge with existing settings (e.g., a built-in provider).
 */
function getCustomProviderConfiguredSettings(config = {}, mergeWith = null) {
  const {
    providerId = CUSTOM_PROVIDER_DEFAULTS.providerId,
    name = CUSTOM_PROVIDER_DEFAULTS.name,
    type = CUSTOM_PROVIDER_DEFAULTS.type,
    baseURL = CUSTOM_PROVIDER_DEFAULTS.baseURL,
    apiKey = "",
    models = CUSTOM_PROVIDER_DEFAULTS.models,
    contextWindow = CUSTOM_PROVIDER_DEFAULTS.contextWindow,
    grantSchemaAccess = CUSTOM_PROVIDER_DEFAULTS.grantSchemaAccess,
  } = config

  const enabledModels = models.map((m) => `${providerId}:${m}`)

  const baseSettings = mergeWith
    ? JSON.parse(mergeWith["ai.assistant.settings"])
    : {}

  const settings = {
    ...baseSettings,
    selectedModel: enabledModels[0],
    customProviders: {
      ...(baseSettings.customProviders || {}),
      [providerId]: {
        type,
        name,
        baseURL,
        ...(apiKey ? { apiKey } : {}),
        contextWindow,
        models,
        grantSchemaAccess,
      },
    },
    providers: {
      ...(baseSettings.providers || {}),
      [providerId]: {
        apiKey: apiKey || "",
        enabledModels,
        grantSchemaAccess,
      },
    },
  }

  return {
    "ai.assistant.settings": JSON.stringify(settings),
  }
}

/**
 * Returns the API endpoint for a custom provider based on its type.
 */
function getCustomProviderEndpoint(baseURL, type) {
  if (type === "openai-chat-completions") {
    return `${baseURL}/chat/completions`
  }
  if (type === "openai") {
    return `${baseURL}/responses`
  }
  // anthropic - SDK appends /v1/messages to baseURL
  return `${baseURL}/v1/messages`
}

// =============================================================================
// RESPONSE DATA BUILDERS
// =============================================================================

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

  if (provider === "openai-chat-completions") {
    return {
      id: "chatcmpl-mock-final",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "test-model-1",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: JSON.stringify(responseContent),
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
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

  if (provider === "openai-chat-completions") {
    return {
      id: `chatcmpl-mock-tool-${toolName}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "test-model-1",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: callId,
                type: "function",
                function: {
                  name: toolName,
                  arguments: JSON.stringify(toolArguments),
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
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

  if (provider === "openai-chat-completions") {
    return {
      id: "chatcmpl-mock-title",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "test-model-1",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: content },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
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

// =============================================================================
// SSE RESPONSE BUILDERS
// =============================================================================

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

function createChatCompletionsSSEResponse(responseData, delay = 0) {
  const events = []
  const choice = responseData.choices?.[0]
  const content = choice?.message?.content || ""
  const toolCalls = choice?.message?.tool_calls || []

  // Stream content deltas
  if (content) {
    const chunkSize = 20
    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.slice(i, i + chunkSize)
      events.push(
        `data: ${JSON.stringify({
          id: responseData.id,
          object: "chat.completion.chunk",
          choices: [
            {
              index: 0,
              delta: { content: chunk },
              finish_reason: null,
            },
          ],
        })}\n\n`,
      )
    }
  }

  // Stream tool call deltas
  if (toolCalls.length > 0) {
    for (const tc of toolCalls) {
      // First chunk: tool call start
      events.push(
        `data: ${JSON.stringify({
          id: responseData.id,
          object: "chat.completion.chunk",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: tc.id,
                    type: "function",
                    function: { name: tc.function.name, arguments: "" },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        })}\n\n`,
      )
      // Second chunk: tool call arguments
      events.push(
        `data: ${JSON.stringify({
          id: responseData.id,
          object: "chat.completion.chunk",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { arguments: tc.function.arguments },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        })}\n\n`,
      )
    }
  }

  // Final chunk with finish_reason and usage
  events.push(
    `data: ${JSON.stringify({
      id: responseData.id,
      object: "chat.completion.chunk",
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: choice?.finish_reason || "stop",
        },
      ],
      usage: responseData.usage,
    })}\n\n`,
  )

  // [DONE] marker
  events.push("data: [DONE]\n\n")

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

// =============================================================================
// RESPONSE WRAPPERS
// =============================================================================

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

  if (provider === "openai-chat-completions") {
    return createChatCompletionsSSEResponse(responseData, delay)
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
  return createResponse(provider, responseData, {
    streaming: false,
    delay: 1000,
  })
}

// =============================================================================
// REQUEST INSPECTION HELPERS
// =============================================================================

function isTitleRequest(provider, body) {
  if (provider === "openai") {
    return (
      body.input?.[0]?.content?.includes?.("Generate a concise chat title") ||
      false
    )
  }
  // Both openai-chat-completions and anthropic use messages array
  return (
    body.messages?.[0]?.content?.includes?.("Generate a concise chat title") ||
    false
  )
}

function requestMatchesQuestion(provider, body, question) {
  if (provider === "openai") {
    return body.input?.[0]?.content === question
  }
  // Both openai-chat-completions and anthropic use messages array
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

  if (provider === "openai-chat-completions") {
    // Chat Completions: tool results are in messages with role "tool"
    const toolMessages = body.messages?.filter((msg) => msg.role === "tool")
    const latestToolMessage = toolMessages?.[toolMessages.length - 1]
    return latestToolMessage?.content || null
  }

  // Anthropic - tool results are in user messages with content array containing tool_result objects
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
  return latestToolResult?.content || null
}

function extractAllInputContent(provider, body) {
  if (provider === "openai") {
    return body.input?.map((item) => item.content || "").join("\n") || ""
  }
  // Both openai-chat-completions and anthropic use messages
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
 * Creates a multi-turn tool call flow with automatic intercept handling.
 * Supports built-in providers (openai, anthropic) and custom providers.
 *
 * @param {Object} config
 * @param {"openai" | "anthropic" | "openai-chat-completions"} [config.provider="openai"]
 * @param {boolean} [config.streaming=true]
 * @param {string} config.question
 * @param {Array} config.steps
 * @param {string} [config.endpoint] - Custom endpoint URL (overrides PROVIDERS lookup)
 */
function createToolCallFlow(config) {
  const { provider = "openai", streaming = true, question, steps } = config

  let requestCount = 0
  const totalRequests = steps.length
  const endpoint = config.endpoint || PROVIDERS[provider]?.endpoint
  const responseOptions = { streaming }

  return {
    question,
    provider,
    streaming,

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

    waitForCompletion() {
      for (let i = 0; i < totalRequests; i++) {
        cy.wait("@toolCallRequest")
      }
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
 * Creates a multi-turn conversation flow.
 * Supports built-in providers and custom providers.
 *
 * @param {Object} config
 * @param {"openai" | "anthropic" | "openai-chat-completions"} [config.provider="openai"]
 * @param {boolean} [config.streaming=true]
 * @param {Array} config.turns
 * @param {string} [config.endpoint] - Custom endpoint URL
 */
function createMultiTurnFlow(config) {
  const { provider = "openai", streaming = true, turns } = config

  let requestCount = 0
  const requestBodies = []
  const endpoint = config.endpoint || PROVIDERS[provider]?.endpoint
  const responseOptions = { streaming }

  return {
    provider,
    streaming,

    intercept() {
      // Intercept for chat title generation
      cy.intercept("POST", endpoint, (req) => {
        if (isTitleRequest(provider, req.body)) {
          req.reply(createChatTitleResponse(provider))
        }
      }).as("chatTitleRequest")

      // Intercept for conversation turns
      cy.intercept("POST", endpoint, (req) => {
        if (isTitleRequest(provider, req.body)) {
          return
        }

        const turn = turns[requestCount]
        if (turn) {
          requestBodies[requestCount] = req.body

          if (turn.expectSystemMessage) {
            const allInputContent = extractAllInputContent(provider, req.body)

            if (turn.expectSystemMessage.includes) {
              for (const expected of turn.expectSystemMessage.includes) {
                expect(allInputContent).to.include(
                  expected,
                  `Turn ${requestCount}: Expected system message to include "${expected}"`,
                )
              }
            }

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

    getRequestBody(turnIndex) {
      return requestBodies[turnIndex]
    },

    getAllRequestBodies() {
      return requestBodies
    },
  }
}

module.exports = {
  PROVIDERS,
  CUSTOM_PROVIDER_DEFAULTS,
  getOpenAIConfiguredSettings,
  getAnthropicConfiguredSettings,
  getCustomProviderConfiguredSettings,
  getCustomProviderEndpoint,
  createFinalResponseData,
  createResponse,
  createFinalResponse,
  createToolCallResponse,
  createChatTitleResponse,
  createToolCallFlow,
  createMultiTurnFlow,
  isTitleRequest,
}
