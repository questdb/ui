import OpenAI from "openai"
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions"
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
  safeJsonParse,
  extractPartialExplanation,
  executeTool,
} from "./shared"
import type { Tiktoken, TiktokenBPE } from "js-tiktoken/lite"

function toResponseFormat(format: ResponseFormatSchema) {
  return {
    type: "json_schema" as const,
    json_schema: {
      name: format.name,
      schema: format.schema,
      strict: format.strict,
    },
  }
}

function toOpenAITools(
  tools: ToolDefinition[],
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: { ...t.inputSchema, additionalProperties: false },
      strict: true,
    },
  }))
}

interface RequestResult {
  content: string
  toolCalls: { id: string; name: string; arguments: unknown }[]
  promptTokens: number
  completionTokens: number
  assistantMessage: ChatCompletionMessageParam
}

async function createChatCompletionStreaming(
  openai: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  streamCallback: StreamingCallback,
  abortSignal?: AbortSignal,
): Promise<{
  content: string
  refusal: string | null
  finishReason: string | null
  toolCalls: ChatCompletionMessageToolCall[]
  usage: { prompt_tokens: number; completion_tokens: number } | null
}> {
  let accumulatedText = ""
  let accumulatedRefusal = ""
  let lastExplanation = ""
  let finishReason: string | null = null
  const toolCallAccumulator: Map<
    number,
    { id: string; name: string; arguments: string }
  > = new Map()
  let usage: { prompt_tokens: number; completion_tokens: number } | null = null

  try {
    const stream = await openai.chat.completions.create({
      ...params,
      stream: true,
      stream_options: { include_usage: true },
    })

    for await (const chunk of stream) {
      if (abortSignal?.aborted) {
        throw new StreamingError("Operation aborted", "interrupted")
      }

      const choice = chunk.choices?.[0]

      if (choice?.delta?.content) {
        accumulatedText += choice.delta.content
        const explanation = extractPartialExplanation(accumulatedText)
        if (explanation !== lastExplanation) {
          const delta = explanation.slice(lastExplanation.length)
          lastExplanation = explanation
          streamCallback.onTextChunk(delta, explanation)
        }
      }

      if (choice?.delta?.refusal) {
        accumulatedRefusal += choice.delta.refusal
      }

      if (choice?.finish_reason) {
        finishReason = choice.finish_reason
      }

      if (choice?.delta?.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const existing = toolCallAccumulator.get(tc.index)
          if (existing) {
            if (tc.id) existing.id = tc.id
            if (tc.function?.name) existing.name = tc.function.name
            existing.arguments += tc.function?.arguments ?? ""
          } else {
            toolCallAccumulator.set(tc.index, {
              id: tc.id ?? "",
              name: tc.function?.name ?? "",
              arguments: tc.function?.arguments ?? "",
            })
          }
        }
      }

      if (chunk.usage) {
        usage = {
          prompt_tokens: chunk.usage.prompt_tokens,
          completion_tokens: chunk.usage.completion_tokens,
        }
      }
    }
  } catch (error) {
    if (error instanceof StreamingError) {
      throw error
    }
    if (abortSignal?.aborted || error instanceof OpenAI.APIUserAbortError) {
      throw new StreamingError("Operation aborted", "interrupted")
    }
    throw new StreamingError(
      error instanceof Error ? error.message : "Stream interrupted",
      "network",
      error,
    )
  }

  const toolCalls: ChatCompletionMessageToolCall[] = Array.from(
    toolCallAccumulator.values(),
  ).map((tc) => ({
    id: tc.id,
    type: "function" as const,
    function: { name: tc.name, arguments: tc.arguments },
  }))

  return {
    content: accumulatedText,
    refusal: accumulatedRefusal || null,
    finishReason,
    toolCalls,
    usage,
  }
}

function extractToolCallsFromMessage(
  toolCalls: ChatCompletionMessageToolCall[],
): { id: string; name: string; arguments: unknown }[] {
  return toolCalls
    .filter((tc) => tc.type === "function")
    .map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: safeJsonParse(tc.function.arguments),
    }))
}

function buildAssistantMessage(
  content: string | null,
  toolCalls: ChatCompletionMessageToolCall[],
): ChatCompletionMessageParam {
  return {
    role: "assistant" as const,
    content,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  }
}

async function executeRequest(
  openai: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  streaming?: StreamingCallback,
  abortSignal?: AbortSignal,
): Promise<RequestResult> {
  if (streaming) {
    const accumulated = await createChatCompletionStreaming(
      openai,
      params,
      streaming,
      abortSignal,
    )

    if (accumulated.refusal) {
      throw new RefusalError(accumulated.refusal)
    }
    if (accumulated.finishReason === "length") {
      throw new MaxTokensError(
        "Response truncated: the model ran out of tokens.",
      )
    }

    return {
      content: accumulated.content,
      toolCalls: extractToolCallsFromMessage(accumulated.toolCalls),
      promptTokens: accumulated.usage?.prompt_tokens ?? 0,
      completionTokens: accumulated.usage?.completion_tokens ?? 0,
      assistantMessage: buildAssistantMessage(
        accumulated.content || null,
        accumulated.toolCalls,
      ),
    }
  }

  const response = await openai.chat.completions.create(params)
  const message = response.choices[0]?.message

  if (message?.refusal) {
    throw new RefusalError(message.refusal)
  }
  if (response.choices[0]?.finish_reason === "length") {
    throw new MaxTokensError("Response truncated: the model ran out of tokens.")
  }

  const rawToolCalls = message?.tool_calls ?? []

  return {
    content: message?.content ?? "",
    toolCalls: extractToolCallsFromMessage(rawToolCalls),
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
    assistantMessage: buildAssistantMessage(
      message?.content ?? null,
      rawToolCalls.filter(
        (tc): tc is Extract<typeof tc, { type: "function" }> =>
          tc.type === "function",
      ),
    ),
  }
}

let tiktokenEncoder: Tiktoken | null = null

function toChatCompletionsAPIProps(model: string): {
  model: string
  reasoning_effort?: OpenAI.ReasoningEffort
} {
  const props = getModelProps(model)
  return {
    model: props.model,
    ...(props.reasoningEffort
      ? { reasoning_effort: props.reasoningEffort as OpenAI.ReasoningEffort }
      : {}),
  }
}

export function createOpenAIChatCompletionsProvider(
  apiKey: string,
  providerId: ProviderId = "openai",
  options?: { baseURL?: string; contextWindow?: number },
): AIProvider {
  const openai = new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
    ...(options?.baseURL ? { baseURL: options.baseURL } : {}),
  })

  const contextWindow = options?.contextWindow ?? 400_000

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
      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: config.systemInstructions },
      ]

      if (config.conversationHistory && config.conversationHistory.length > 0) {
        const validMessages = config.conversationHistory.filter(
          (msg) => msg.content && msg.content.trim() !== "",
        )
        for (const msg of validMessages) {
          messages.push({ role: msg.role, content: msg.content })
        }
      }

      messages.push({ role: "user", content: config.initialUserContent })

      const openaiTools = toOpenAITools(tools)
      let totalInputTokens = 0
      let totalOutputTokens = 0
      let lastPromptTokens = 0

      const baseParams = {
        ...toChatCompletionsAPIProps(model),
        tools: openaiTools,
        response_format: toResponseFormat(config.responseFormat),
      }

      let result = await executeRequest(
        openai,
        {
          ...baseParams,
          messages,
        } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
        streaming,
        abortSignal,
      )
      totalInputTokens += result.promptTokens
      totalOutputTokens += result.completionTokens
      lastPromptTokens = result.promptTokens
      messages.push(result.assistantMessage)

      while (true) {
        if (abortSignal?.aborted) {
          return {
            type: "aborted",
            message: "Operation was cancelled",
          } as AiAssistantAPIError
        }

        if (!result.toolCalls.length) break

        for (const tc of result.toolCalls) {
          const exec = await executeTool(
            tc.name,
            tc.arguments,
            modelToolsClient,
            setStatus,
          )
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: exec.content,
          })
        }

        if (
          lastPromptTokens >= contextWindow - 50_000 &&
          result.toolCalls.length > 0
        ) {
          messages.push({
            role: "user" as const,
            content:
              "**CRITICAL TOKEN USAGE: The conversation is getting too long to fit the context window. If you are planning to use more tools, summarize your findings to the user first, and wait for user confirmation to continue working on the task.**",
          })
        }

        result = await executeRequest(
          openai,
          {
            ...baseParams,
            messages,
          } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
          streaming,
          abortSignal,
        )
        totalInputTokens += result.promptTokens
        totalOutputTokens += result.completionTokens
        lastPromptTokens = result.promptTokens
        messages.push(result.assistantMessage)
      }

      if (abortSignal?.aborted) {
        return {
          type: "aborted",
          message: "Operation was cancelled",
        } as AiAssistantAPIError
      }

      try {
        const json = JSON.parse(result.content) as T
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
        const response = await openai.chat.completions.create({
          ...toChatCompletionsAPIProps(model),
          messages: [{ role: "user", content: prompt }],
          response_format: toResponseFormat(responseFormat),
          max_completion_tokens: 100,
        })
        const content = response.choices[0]?.message?.content || ""
        const parsed = JSON.parse(content) as { title: string }
        return parsed.title || null
      } catch {
        return null
      }
    },

    async generateSummary({ model, systemPrompt, userMessage }) {
      const response = await openai.chat.completions.create({
        ...toChatCompletionsAPIProps(model),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      })
      return response.choices[0]?.message?.content || ""
    },

    async testConnection({ apiKey: testApiKey, model }) {
      try {
        const testClient = new OpenAI({
          apiKey: testApiKey,
          dangerouslyAllowBrowser: true,
          ...(options?.baseURL ? { baseURL: options.baseURL } : {}),
        })
        await testClient.chat.completions.create({
          model: getModelProps(model).model,
          messages: [{ role: "user", content: "ping" }],
          max_completion_tokens: 16,
        })
        return { valid: true }
      } catch (error: unknown) {
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

    async countTokens({ messages, systemPrompt }) {
      // Custom providers (non-default baseURL) use chars/3.5 estimation
      // because the actual tokenizer is unknown and tiktoken underestimates
      // Claude tokens by 15-25% (dangerous for compaction).
      if (options?.baseURL) {
        const totalChars =
          systemPrompt.length +
          messages.reduce((sum, m) => sum + m.content.length, 0)
        return Math.ceil(totalChars / 3.5)
      }

      if (!tiktokenEncoder) {
        const { Tiktoken } = await import("js-tiktoken/lite")
        const o200k_base = await import("js-tiktoken/ranks/o200k_base").then(
          (module: { default: TiktokenBPE }) => module.default,
        )
        tiktokenEncoder = new Tiktoken(o200k_base)
      }

      let totalTokens = 0
      totalTokens += tiktokenEncoder.encode(systemPrompt).length
      totalTokens += 4 // system message formatting overhead

      for (const message of messages) {
        totalTokens += 4 // role markers overhead
        totalTokens += tiktokenEncoder.encode(message.content).length
      }

      totalTokens += 2 // assistant reply priming
      return totalTokens
    },

    classifyError(
      error: unknown,
      setStatus: StatusCallback,
    ): AiAssistantAPIError {
      if (
        error instanceof OpenAI.APIUserAbortError ||
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

      if (error instanceof OpenAI.APIError) {
        return {
          type: "unknown",
          message: `OpenAI API error: ${error.message}`,
        }
      }

      return {
        type: "unknown",
        message: "An unexpected error occurred. Please try again.",
        details: error as string,
      }
    },

    isNonRetryableError(error: unknown): boolean {
      if (error instanceof StreamingError) {
        return error.errorType === "interrupted" || error.errorType === "failed"
      }
      return (
        error instanceof RefusalError ||
        error instanceof MaxTokensError ||
        error instanceof OpenAI.AuthenticationError ||
        (error != null &&
          typeof error === "object" &&
          "status" in error &&
          error.status === 429) ||
        error instanceof OpenAI.APIUserAbortError
      )
    },
  }
}
