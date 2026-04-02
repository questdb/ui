import Anthropic from "@anthropic-ai/sdk"
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages"
import type { Tool as AnthropicTool } from "@anthropic-ai/sdk/resources/messages"
import type {
  AiAssistantAPIError,
  ModelToolsClient,
  StatusCallback,
  StreamingCallback,
  TokenUsage,
} from "../aiAssistant"
import { getModelProps } from "./settings"
import type { ProviderId } from "./settings"
import {
  type AIProvider,
  type FlowConfig,
  type FlowResult,
  type ToolDefinition,
  type Message,
} from "./types"
import {
  StreamingError,
  RefusalError,
  MaxTokensError,
  executeTool,
  safeJsonParse,
  CRITICAL_TOKEN_USAGE_MESSAGE,
  getMessageTextLength,
  type ToolExecutionContext,
} from "./shared"
import {
  createHeaderFilteredFetch,
  ANTHROPIC_ALLOWED_HEADERS,
} from "./fetchWithFilteredHeaders"

function toNativeMessages(messages: Message[]): MessageParam[] {
  const result: MessageParam[] = []

  type UserBlock =
    | Anthropic.Messages.ToolResultBlockParam
    | Anthropic.Messages.TextBlockParam
  type AssistantBlock = Anthropic.Messages.ContentBlockParam

  const toUserBlocks = (v: string | UserBlock[]): UserBlock[] =>
    typeof v === "string" ? [{ type: "text" as const, text: v }] : v

  const orderUserBlocks = (blocks: UserBlock[]): UserBlock[] => {
    const toolResults = blocks.filter((b) => b.type === "tool_result")
    const rest = blocks.filter((b) => b.type !== "tool_result")
    return [...toolResults, ...rest]
  }

  const pushUser = (content: string | UserBlock[]) => {
    const last = result[result.length - 1]
    if (last?.role === "user") {
      // Merge into existing user message to maintain alternation
      const prev = toUserBlocks(last.content as string | UserBlock[])
      const next = toUserBlocks(content)
      last.content = orderUserBlocks([
        ...prev,
        ...next,
      ]) as MessageParam["content"]
    } else {
      result.push({ role: "user", content } as MessageParam)
    }
  }

  const pushAssistant = (blocks: AssistantBlock[]) => {
    const last = result[result.length - 1]
    if (last?.role === "assistant" && Array.isArray(last.content)) {
      last.content = [...last.content, ...blocks] as MessageParam["content"]
    } else {
      result.push({ role: "assistant", content: blocks } as MessageParam)
    }
  }

  for (const msg of messages) {
    if (msg.role === "user") {
      if (msg.content) {
        pushUser(msg.content)
      }
      continue
    }

    if (msg.role === "tool") {
      const toolResult = {
        type: "tool_result" as const,
        tool_use_id: msg.tool_call_id!,
        content: msg.content ?? "",
      }
      pushUser([toolResult])
      continue
    }

    const blocks: Anthropic.Messages.ContentBlockParam[] = []
    if (msg.content) {
      blocks.push({ type: "text" as const, text: msg.content })
    }
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        blocks.push({
          type: "tool_use" as const,
          id: tc.id,
          name: tc.name,
          input: safeJsonParse(tc.arguments),
        })
      }
    }
    if (blocks.length > 0) {
      pushAssistant(blocks)
    }
  }

  return result
}

function toAnthropicTools(tools: ToolDefinition[]): AnthropicTool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: "object" as const,
      properties: t.inputSchema.properties,
      ...(t.inputSchema.required ? { required: t.inputSchema.required } : {}),
    },
  }))
}

function toAnthropicModel(model: string): string {
  return getModelProps(model).model
}

async function createAnthropicMessage(
  anthropic: Anthropic,
  params: Omit<Anthropic.MessageCreateParams, "max_tokens"> & {
    max_tokens?: number
  },
  signal?: AbortSignal,
): Promise<Anthropic.Messages.Message> {
  const message = await anthropic.messages.create(
    {
      ...params,
      stream: false,
      max_tokens: params.max_tokens ?? 64_000,
    },
    {
      signal,
    },
  )

  if (message.stop_reason === "refusal") {
    throw new RefusalError(
      "The model refused to generate a response for this request.",
    )
  }
  if (message.stop_reason === "max_tokens") {
    throw new MaxTokensError(
      "The response exceeded the maximum token limit. Please try again with a different prompt or model.",
    )
  }

  return message
}

async function createAnthropicMessageStreaming(
  anthropic: Anthropic,
  params: Omit<Anthropic.MessageCreateParams, "max_tokens"> & {
    max_tokens?: number
  },
  streamCallback: StreamingCallback,
  abortSignal?: AbortSignal,
): Promise<Anthropic.Messages.Message> {
  const stream = anthropic.messages.stream(
    {
      ...params,
      max_tokens: params.max_tokens ?? 64_000,
    },
    {
      signal: abortSignal,
    },
  )

  try {
    for await (const event of stream) {
      if (abortSignal?.aborted) {
        throw new StreamingError("Operation aborted", "interrupted")
      }

      const eventWithType = event as { type: string }
      if (eventWithType.type === "error") {
        const errorEvent = event as {
          error?: { type?: string; message?: string }
        }
        const errorType = errorEvent.error?.type
        const errorMessage = errorEvent.error?.message || "Stream error"

        if (errorType === "overloaded_error") {
          throw new StreamingError(
            "Service is temporarily overloaded. Please try again.",
            "network",
            event,
          )
        }
        throw new StreamingError(errorMessage, "failed", event)
      }

      if (event.type === "content_block_delta") {
        if (event.delta.type === "thinking_delta") {
          streamCallback.onThinkingChunk?.(
            (event.delta as { thinking: string }).thinking,
          )
        } else if (event.delta.type === "text_delta") {
          streamCallback.onTextChunk(event.delta.text)
        }
      }
    }
  } catch (error) {
    if (error instanceof StreamingError) {
      throw error
    }
    if (abortSignal?.aborted) {
      throw new StreamingError("Operation aborted", "interrupted")
    }
    if (error instanceof Anthropic.APIError) {
      throw error
    }
    throw new StreamingError(
      error instanceof Error ? error.message : "Stream interrupted",
      "network",
      error,
    )
  }

  let finalMessage: Anthropic.Messages.Message
  try {
    finalMessage = await stream.finalMessage()
  } catch (error) {
    if (abortSignal?.aborted || error instanceof Anthropic.APIUserAbortError) {
      throw new StreamingError("Operation aborted", "interrupted")
    }
    if (error instanceof Anthropic.APIError) {
      throw error
    }
    throw new StreamingError(
      "Failed to get final message from the provider",
      "network",
      error,
    )
  }

  if (finalMessage.stop_reason === "refusal") {
    throw new RefusalError(
      "The model refused to generate a response for this request.",
    )
  }
  if (finalMessage.stop_reason === "max_tokens") {
    throw new MaxTokensError(
      "The response exceeded the maximum token limit. Please try again with a different prompt or model.",
    )
  }

  return finalMessage
}

function emitToolCallsFromResponse(
  message: Anthropic.Messages.Message,
  streaming?: StreamingCallback,
) {
  for (const block of message.content) {
    if (block.type === "tool_use") {
      streaming?.onToolCall?.({
        id: block.id,
        name: block.name,
        arguments: JSON.stringify(block.input),
      })
    }
  }
}

interface AnthropicToolCallResult {
  message: Anthropic.Messages.Message
  accumulatedTokens: TokenUsage
}

async function handleToolCalls(
  message: Anthropic.Messages.Message,
  anthropic: Anthropic,
  modelToolsClient: ModelToolsClient,
  conversationHistory: Array<MessageParam>,
  model: string,
  systemPrompt: string,
  setStatus: StatusCallback,
  tools: AnthropicTool[],
  contextWindow: number,
  abortSignal?: AbortSignal,
  accumulatedTokens: TokenUsage = { inputTokens: 0, outputTokens: 0 },
  streaming?: StreamingCallback,
  toolContext?: ToolExecutionContext,
): Promise<AnthropicToolCallResult | AiAssistantAPIError> {
  const toolUseBlocks = message.content.filter(
    (block) => block.type === "tool_use",
  )

  if (abortSignal?.aborted) {
    return {
      type: "aborted",
      message: "Operation was cancelled",
    } as AiAssistantAPIError
  }

  const toolResults = []

  for (const toolUse of toolUseBlocks) {
    if ("name" in toolUse) {
      const exec = await executeTool(
        toolUse.name,
        toolUse.input,
        modelToolsClient,
        setStatus,
        toolContext,
      )

      if (abortSignal?.aborted) {
        return {
          type: "aborted",
          message: "Operation was cancelled",
        } as AiAssistantAPIError
      }
      streaming?.onToolResult?.({
        tool_call_id: toolUse.id,
        name: toolUse.name,
        content:
          typeof exec.content === "string"
            ? exec.content
            : JSON.stringify(exec.content),
      })

      toolResults.push({
        type: "tool_result" as const,
        tool_use_id: toolUse.id,
        content: exec.content,
        is_error: exec.is_error,
      })
    }
  }

  const updatedHistory = [
    ...conversationHistory,
    {
      role: "assistant" as const,
      content: message.content,
    },
    {
      role: "user" as const,
      content: toolResults,
    },
  ]

  const criticalTokenUsage =
    message.usage.input_tokens >= contextWindow - 50_000 &&
    toolResults.length > 0
  if (criticalTokenUsage) {
    updatedHistory.push({
      role: "user" as const,
      content: CRITICAL_TOKEN_USAGE_MESSAGE,
    })
  }

  if (abortSignal?.aborted) {
    return {
      type: "aborted",
      message: "Operation was cancelled",
    } as AiAssistantAPIError
  }
  // Signal start of follow-up response before making the API call
  streaming?.onResponseStart?.()

  const followUpParams: Parameters<typeof createAnthropicMessage>[1] = {
    model,
    system: systemPrompt,
    tools,
    messages: updatedHistory,
    temperature: 0.3,
  }

  const followUpMessage = streaming
    ? await createAnthropicMessageStreaming(
        anthropic,
        followUpParams,
        streaming,
        abortSignal,
      )
    : await createAnthropicMessage(anthropic, followUpParams, abortSignal)

  const newAccumulatedTokens: TokenUsage = {
    inputTokens:
      accumulatedTokens.inputTokens +
      (followUpMessage.usage?.input_tokens || 0),
    outputTokens:
      accumulatedTokens.outputTokens +
      (followUpMessage.usage?.output_tokens || 0),
  }

  if (followUpMessage.stop_reason === "tool_use") {
    emitToolCallsFromResponse(followUpMessage, streaming)
    return handleToolCalls(
      followUpMessage,
      anthropic,
      modelToolsClient,
      updatedHistory,
      model,
      systemPrompt,
      setStatus,
      tools,
      contextWindow,
      abortSignal,
      newAccumulatedTokens,
      streaming,
      toolContext,
    )
  }

  return {
    message: followUpMessage,
    accumulatedTokens: newAccumulatedTokens,
  }
}

export function createAnthropicProvider(
  apiKey: string,
  providerId: ProviderId = "anthropic",
  options?: { baseURL?: string; contextWindow?: number; isCustom?: boolean },
): AIProvider {
  const isCustom = options?.isCustom ?? false
  const anthropic = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    ...(options?.baseURL ? { baseURL: options.baseURL } : {}),
    ...(isCustom
      ? {
          fetch: createHeaderFilteredFetch(ANTHROPIC_ALLOWED_HEADERS),
        }
      : {}),
  })

  const contextWindow = options?.contextWindow ?? 200_000

  return {
    id: providerId,
    contextWindow,

    toNativeMessages(messages: Message[]): MessageParam[] {
      return toNativeMessages(messages)
    },

    async executeFlow({
      model,
      config,
      modelToolsClient,
      tools,
      setStatus,
      abortSignal,
      streaming,
    }: {
      model: string
      config: FlowConfig
      modelToolsClient: ModelToolsClient
      tools: ToolDefinition[]
      setStatus: StatusCallback
      abortSignal?: AbortSignal
      streaming?: StreamingCallback
    }): Promise<FlowResult | AiAssistantAPIError> {
      const initialMessages: MessageParam[] = []
      if (config.conversationHistory && config.conversationHistory.length > 0) {
        initialMessages.push(...toNativeMessages(config.conversationHistory))
      }

      initialMessages.push({
        role: "user" as const,
        content: config.initialUserContent,
      })

      const anthropicTools = toAnthropicTools(tools)
      const systemPrompt = config.systemInstructions

      const toolContext: ToolExecutionContext = {}

      const resolvedModel = toAnthropicModel(model)

      const messageParams: Parameters<typeof createAnthropicMessage>[1] = {
        model: resolvedModel,
        system: systemPrompt,
        tools: anthropicTools,
        messages: initialMessages,
        temperature: 0.3,
      }

      const message = streaming
        ? await createAnthropicMessageStreaming(
            anthropic,
            messageParams,
            streaming,
            abortSignal,
          )
        : await createAnthropicMessage(anthropic, messageParams, abortSignal)

      let totalInputTokens = message.usage?.input_tokens || 0
      let totalOutputTokens = message.usage?.output_tokens || 0

      let responseMessage: Anthropic.Messages.Message

      if (message.stop_reason === "tool_use") {
        emitToolCallsFromResponse(message, streaming)
        const toolCallResult = await handleToolCalls(
          message,
          anthropic,
          modelToolsClient,
          initialMessages,
          resolvedModel,
          systemPrompt,
          setStatus,
          anthropicTools,
          contextWindow,
          abortSignal,
          { inputTokens: 0, outputTokens: 0 },
          streaming,
          toolContext,
        )

        if ("type" in toolCallResult && "message" in toolCallResult) {
          return toolCallResult
        }

        const result = toolCallResult
        responseMessage = result.message
        totalInputTokens += result.accumulatedTokens.inputTokens
        totalOutputTokens += result.accumulatedTokens.outputTokens
      } else {
        responseMessage = message
      }

      if (abortSignal?.aborted) {
        return {
          type: "aborted",
          message: "Operation was cancelled",
        } as AiAssistantAPIError
      }

      const textBlock = responseMessage.content.find(
        (block) => block.type === "text",
      )

      const tokenUsage = {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      }

      setStatus(null)
      const explanation = textBlock && "text" in textBlock ? textBlock.text : ""
      return {
        explanation,
        sql: toolContext.suggestedSQL ?? null,
        tokenUsage,
      }
    },

    async generateTitle({ model, prompt }) {
      try {
        const message = await createAnthropicMessage(anthropic, {
          model: toAnthropicModel(model),
          messages: [{ role: "user", content: prompt }],
          max_tokens: 100,
          temperature: 0.3,
        })

        const textBlock = message.content.find((block) => block.type === "text")
        return textBlock && "text" in textBlock ? textBlock.text : null
      } catch {
        return null
      }
    },

    async generateSummary({ model, systemPrompt, userMessage }) {
      let text = ""
      const stream = anthropic.messages.stream({
        ...getModelProps(model),
        max_tokens: 64_000,
        messages: [{ role: "user", content: userMessage }],
        system: systemPrompt,
      })
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          text += event.delta.text
        }
      }
      return text
    },

    async testConnection({ apiKey: testApiKey, model }) {
      try {
        const testClient = new Anthropic({
          apiKey: testApiKey,
          dangerouslyAllowBrowser: true,
          ...(options?.baseURL ? { baseURL: options.baseURL } : {}),
          ...(isCustom
            ? {
                fetch: createHeaderFilteredFetch(ANTHROPIC_ALLOWED_HEADERS),
              }
            : {}),
        })

        await createAnthropicMessage(testClient, {
          model: toAnthropicModel(model),
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 16,
        })
        return { valid: true }
      } catch (error: unknown) {
        if (error instanceof Anthropic.AuthenticationError) {
          return { valid: false, error: "Invalid API key" }
        }
        if (error instanceof Anthropic.RateLimitError) {
          return { valid: true }
        }
        const status =
          (error as { status?: number })?.status ||
          (error as { error?: { status?: number } })?.error?.status
        if (status === 401) {
          return { valid: false, error: "Invalid API key" }
        }
        if (status === 429) {
          return { valid: true }
        }
        return {
          valid: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to validate API key",
        }
      }
    },

    async countTokens({ messages, systemPrompt, model }) {
      // Custom providers (non-default baseURL) use chars/3.5 estimation
      // because the actual tokenizer is unknown and most custom endpoints
      // don't implement the countTokens API.
      if (options?.baseURL) {
        const totalChars =
          systemPrompt.length +
          messages.reduce((sum, m) => sum + getMessageTextLength(m), 0)
        return Math.ceil(totalChars / 3.5)
      }

      const nativeMessages = toNativeMessages(messages)
      const response = await anthropic.messages.countTokens({
        model: toAnthropicModel(model),
        system: systemPrompt,
        messages: nativeMessages,
      })
      return response.input_tokens
    },

    async listModels(): Promise<string[]> {
      const models: string[] = []
      for await (const model of anthropic.models.list()) {
        models.push(model.id)
      }
      return models.sort((a, b) => a.localeCompare(b))
    },

    classifyError(
      error: unknown,
      setStatus: StatusCallback,
    ): AiAssistantAPIError {
      if (
        error instanceof Anthropic.APIUserAbortError ||
        (error instanceof StreamingError && error.errorType === "interrupted")
      ) {
        return { type: "aborted", message: "Operation was cancelled" }
      }
      setStatus(null)

      if (error instanceof RefusalError) {
        return {
          type: "unknown",
          message: "The model refused to generate a response for this request.",
          details: error.message,
        }
      }

      if (error instanceof MaxTokensError) {
        return {
          type: "unknown",
          message:
            "The response exceeded the maximum token limit for the selected model. Please try again with a different prompt or model.",
          details: error.message,
        }
      }

      if (error instanceof StreamingError) {
        switch (error.errorType) {
          case "network":
            return {
              type: "network",
              message:
                "Network error during streaming. Please check your connection.",
              details: error.message,
            }
          case "failed":
          default:
            return {
              type: "unknown",
              message: error.message || "Stream failed unexpectedly.",
              details:
                error.originalError instanceof Error
                  ? error.originalError.message
                  : undefined,
            }
        }
      }

      if (error instanceof Anthropic.AuthenticationError) {
        return {
          type: "invalid_key",
          message: "Invalid API key. Please check your Anthropic API key.",
          details: error.message,
        }
      }

      if (error instanceof Anthropic.RateLimitError) {
        return {
          type: "rate_limit",
          message: "Rate limit exceeded. Please try again later.",
          details: error.message,
        }
      }

      if (error instanceof Anthropic.APIConnectionError) {
        return {
          type: "network",
          message: "Network error. Please check your connection.",
          details: error.message,
        }
      }

      if (error instanceof Anthropic.APIError) {
        return {
          type: "unknown",
          message: error.message,
          details: `Status ${error.status}`,
        }
      }

      return {
        type: "unknown",
        message: "An unexpected error occurred. Please try again.",
        details: error instanceof Error ? error.message : String(error),
      }
    },

    isNonRetryableError(error: unknown): boolean {
      if (error instanceof StreamingError) {
        return error.errorType === "interrupted" || error.errorType === "failed"
      }
      if (
        error instanceof Anthropic.APIError &&
        error.status != null &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      ) {
        return true
      }
      return (
        error instanceof RefusalError ||
        error instanceof MaxTokensError ||
        error instanceof Anthropic.APIUserAbortError
      )
    },
  }
}
