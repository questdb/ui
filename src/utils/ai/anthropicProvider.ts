import Anthropic from "@anthropic-ai/sdk"
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages"
import type { OutputConfig } from "@anthropic-ai/sdk/resources/messages"
import type { Tool as AnthropicTool } from "@anthropic-ai/sdk/resources/messages"
import type {
  AiAssistantAPIError,
  ModelToolsClient,
  StatusCallback,
  StreamingCallback,
  TokenUsage,
} from "../aiAssistant"
import { AIOperationStatus } from "../../providers/AIStatusProvider"
import { getModelProps } from "./settings"
import type { ProviderId } from "./settings"
import type {
  AIProvider,
  FlowConfig,
  ResponseFormatSchema,
  ToolDefinition,
} from "./types"
import {
  StreamingError,
  RefusalError,
  MaxTokensError,
  extractPartialExplanation,
  executeTool,
  parseCustomProviderResponse,
  responseFormatToPromptInstruction,
} from "./shared"

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

function toAnthropicOutputConfig(format: ResponseFormatSchema): OutputConfig {
  return {
    format: {
      type: "json_schema",
      schema: format.schema,
    },
  }
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
      max_tokens: params.max_tokens ?? 8192,
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
  let accumulatedText = ""
  let lastExplanation = ""

  const stream = anthropic.messages.stream(
    {
      ...params,
      max_tokens: params.max_tokens ?? 8192,
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

      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        accumulatedText += event.delta.text
        const explanation = extractPartialExplanation(accumulatedText)
        if (explanation !== lastExplanation) {
          const chunk = explanation.slice(lastExplanation.length)
          lastExplanation = explanation
          streamCallback.onTextChunk(chunk, explanation)
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
  outputConfig: OutputConfig | undefined,
  tools: AnthropicTool[],
  contextWindow: number,
  abortSignal?: AbortSignal,
  accumulatedTokens: TokenUsage = { inputTokens: 0, outputTokens: 0 },
  streaming?: StreamingCallback,
): Promise<AnthropicToolCallResult | AiAssistantAPIError> {
  const toolUseBlocks = message.content.filter(
    (block) => block.type === "tool_use",
  )
  const toolResults = []

  if (abortSignal?.aborted) {
    return {
      type: "aborted",
      message: "Operation was cancelled",
    } as AiAssistantAPIError
  }

  for (const toolUse of toolUseBlocks) {
    if ("name" in toolUse) {
      const exec = await executeTool(
        toolUse.name,
        toolUse.input,
        modelToolsClient,
        setStatus,
      )
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
      content:
        "**CRITICAL TOKEN USAGE: The conversation is getting too long to fit the context window. If you are planning to use more tools, summarize your findings to the user first, and wait for user confirmation to continue working on the task.**",
    })
  }

  const followUpParams: Parameters<typeof createAnthropicMessage>[1] = {
    model,
    system: systemPrompt,
    tools,
    messages: updatedHistory,
    temperature: 0.3,
    ...(outputConfig ? { output_config: outputConfig } : {}),
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
    return handleToolCalls(
      followUpMessage,
      anthropic,
      modelToolsClient,
      updatedHistory,
      model,
      systemPrompt,
      setStatus,
      outputConfig,
      tools,
      contextWindow,
      abortSignal,
      newAccumulatedTokens,
      streaming,
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
  const anthropic = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    ...(options?.baseURL ? { baseURL: options.baseURL } : {}),
  })

  const contextWindow = options?.contextWindow ?? 200_000
  const isCustom = options?.isCustom ?? false

  return {
    id: providerId,
    contextWindow,

    async executeFlow<T>({
      model,
      config,
      modelToolsClient,
      tools,
      setStatus,
      abortSignal,
      streaming,
    }: {
      model: string
      config: FlowConfig<T>
      modelToolsClient: ModelToolsClient
      tools: ToolDefinition[]
      setStatus: StatusCallback
      abortSignal?: AbortSignal
      streaming?: StreamingCallback
    }): Promise<T | AiAssistantAPIError> {
      const initialMessages: MessageParam[] = []
      if (config.conversationHistory && config.conversationHistory.length > 0) {
        const validMessages = config.conversationHistory.filter(
          (msg) => msg.content && msg.content.trim() !== "",
        )
        for (const msg of validMessages) {
          initialMessages.push({
            role: msg.role,
            content: msg.content,
          })
        }
      }

      initialMessages.push({
        role: "user" as const,
        content: config.initialUserContent,
      })

      const anthropicTools = toAnthropicTools(tools)
      const outputConfig = isCustom
        ? undefined
        : toAnthropicOutputConfig(config.responseFormat)

      const systemPrompt = isCustom
        ? config.systemInstructions +
          responseFormatToPromptInstruction(config.responseFormat)
        : config.systemInstructions

      const resolvedModel = toAnthropicModel(model)

      const messageParams: Parameters<typeof createAnthropicMessage>[1] = {
        model: resolvedModel,
        system: systemPrompt,
        tools: anthropicTools,
        messages: initialMessages,
        temperature: 0.3,
        ...(outputConfig ? { output_config: outputConfig } : {}),
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
        const toolCallResult = await handleToolCalls(
          message,
          anthropic,
          modelToolsClient,
          initialMessages,
          resolvedModel,
          systemPrompt,
          setStatus,
          outputConfig,
          anthropicTools,
          contextWindow,
          abortSignal,
          { inputTokens: 0, outputTokens: 0 },
          streaming,
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
      if (!textBlock || !("text" in textBlock)) {
        setStatus(null)
        return {
          type: "unknown",
          message: "No text response received from assistant.",
        } as AiAssistantAPIError
      }

      if (isCustom) {
        const json = parseCustomProviderResponse<T>(
          textBlock.text,
          (config.responseFormat.schema.required as string[]) || [],
          (raw) => ({ explanation: raw }) as unknown as T,
        )
        setStatus(null)

        const tokenUsage = {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        }

        if (config.postProcess) {
          const processed = config.postProcess(json)
          return { ...processed, tokenUsage } as T & { tokenUsage: TokenUsage }
        }
        return { ...json, tokenUsage } as T & { tokenUsage: TokenUsage }
      }

      try {
        const json = JSON.parse(textBlock.text) as T
        setStatus(null)

        const resultWithTokens = {
          ...json,
          tokenUsage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
          },
        } as T & { tokenUsage: TokenUsage }

        if (config.postProcess) {
          const processed = config.postProcess(json)
          return {
            ...processed,
            tokenUsage: {
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
            },
          } as T & { tokenUsage: TokenUsage }
        }
        return resultWithTokens
      } catch {
        setStatus(null)
        return {
          type: "unknown",
          message: "Failed to parse assistant response.",
        } as AiAssistantAPIError
      }
    },

    async generateTitle({ model, prompt, responseFormat }) {
      try {
        const userContent = isCustom
          ? prompt + responseFormatToPromptInstruction(responseFormat)
          : prompt

        const titleOutputConfig = isCustom
          ? undefined
          : toAnthropicOutputConfig(responseFormat)

        const messageParams: Parameters<typeof createAnthropicMessage>[1] = {
          model: toAnthropicModel(model),
          messages: [{ role: "user", content: userContent }],
          max_tokens: 100,
          temperature: 0.3,
          ...(titleOutputConfig ? { output_config: titleOutputConfig } : {}),
        }
        const message = await createAnthropicMessage(anthropic, messageParams)

        const textBlock = message.content.find((block) => block.type === "text")
        if (textBlock && "text" in textBlock) {
          if (isCustom) {
            const parsed = parseCustomProviderResponse<{ title: string }>(
              textBlock.text,
              (responseFormat.schema.required as string[]) || [],
              (raw) => ({ title: raw.trim().slice(0, 40) }),
            )
            return parsed.title || null
          }

          const parsed = JSON.parse(textBlock.text) as { title: string }
          return parsed.title?.slice(0, 40) || null
        }
        return null
      } catch {
        return null
      }
    },

    async generateSummary({ model, systemPrompt, userMessage }) {
      const response = await anthropic.messages.create({
        ...getModelProps(model),
        max_tokens: 8192,
        messages: [{ role: "user", content: userMessage }],
        system: systemPrompt,
      })

      const textBlock = response.content.find((block) => block.type === "text")
      return textBlock?.type === "text" ? textBlock.text : ""
    },

    async testConnection({ apiKey: testApiKey, model }) {
      try {
        const testClient = new Anthropic({
          apiKey: testApiKey,
          dangerouslyAllowBrowser: true,
          ...(options?.baseURL ? { baseURL: options.baseURL } : {}),
        })

        await createAnthropicMessage(testClient, {
          model: toAnthropicModel(model),
          messages: [{ role: "user", content: "ping" }],
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
      const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const response = await anthropic.messages.countTokens({
        model: toAnthropicModel(model),
        system: systemPrompt,
        messages: anthropicMessages,
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
        setStatus(AIOperationStatus.Aborted)
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
          message: "Network error. Please check your internet connection.",
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
