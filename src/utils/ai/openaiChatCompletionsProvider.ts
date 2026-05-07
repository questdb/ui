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
  safeJsonParse,
  executeTool,
  CRITICAL_TOKEN_USAGE_MESSAGE,
  MAX_TOOL_CALL_ROUNDS,
  TOOL_CALL_LIMIT_MESSAGE,
  getMessageTextLength,
  type ToolExecutionContext,
} from "./shared"
import {
  classifyOpenAIError,
  countTokensFromNativePayload,
  isOpenAINonRetryableError,
} from "./openaiShared"
import {
  createHeaderFilteredFetch,
  OPENAI_ALLOWED_HEADERS,
} from "./fetchWithFilteredHeaders"

function toNativeMessages(messages: Message[]): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = []
  // Buffer user messages that appear between assistant(tool_calls) and tool results
  // so tool messages stay adjacent to their parent assistant
  const deferredUserMessages: ChatCompletionMessageParam[] = []

  for (const msg of messages) {
    if (msg.role === "user") {
      if (msg.content) {
        const userMsg: ChatCompletionMessageParam = {
          role: "user",
          content: msg.content,
        }
        const last = result[result.length - 1]
        if (
          last &&
          "role" in last &&
          last.role === "assistant" &&
          "tool_calls" in last &&
          last.tool_calls?.length
        ) {
          // Defer: this user message sits between assistant(tool_calls) and pending tool results
          deferredUserMessages.push(userMsg)
        } else {
          result.push(userMsg)
        }
      }
      continue
    }

    if (msg.role === "tool") {
      result.push({
        role: "tool",
        tool_call_id: msg.tool_call_id!,
        content: msg.content ?? "",
      })
      continue
    }

    // Flush deferred user messages before adding a new assistant message
    if (deferredUserMessages.length > 0) {
      result.push(...deferredUserMessages)
      deferredUserMessages.length = 0
    }

    if (msg.content || msg.tool_calls?.length) {
      result.push({
        role: "assistant",
        content: msg.content ?? null,
        ...(msg.tool_calls?.length
          ? {
              tool_calls: msg.tool_calls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: tc.arguments },
              })),
            }
          : {}),
      })
    }
  }

  // Flush any remaining deferred user messages
  if (deferredUserMessages.length > 0) {
    result.push(...deferredUserMessages)
  }

  return result
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
  toolCalls: { id: string; name: string; arguments: string }[]
  promptTokens: number
  completionTokens: number
  assistantMessage: ChatCompletionMessageParam
  reasoning: string | null
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
  reasoning: string | null
}> {
  let accumulatedText = ""
  let accumulatedRefusal = ""
  let accumulatedReasoning = ""
  let finishReason: string | null = null
  const toolCallAccumulator: Map<
    number,
    { id: string; name: string; arguments: string }
  > = new Map()
  let usage: { prompt_tokens: number; completion_tokens: number } | null = null

  try {
    const stream = await openai.chat.completions.create(
      {
        ...params,
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: abortSignal },
    )

    for await (const chunk of stream) {
      if (abortSignal?.aborted) {
        throw new StreamingError("Operation aborted", "interrupted")
      }

      const choice = chunk.choices?.[0]

      const deltaAny = choice?.delta as
        | {
            reasoning_content?: string
            reasoning?: string
          }
        | undefined
      const reasoningContent =
        deltaAny?.reasoning_content || deltaAny?.reasoning
      if (reasoningContent) {
        accumulatedReasoning += reasoningContent
        streamCallback.onThinkingChunk?.(reasoningContent)
      }

      if (choice?.delta?.content) {
        accumulatedText += choice.delta.content
        streamCallback.onTextChunk(choice.delta.content)
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
    if (error instanceof OpenAI.APIError) {
      throw error
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
    reasoning: accumulatedReasoning || null,
  }
}

function extractToolCalls(
  toolCalls: ChatCompletionMessageToolCall[],
): { id: string; name: string; arguments: string }[] {
  return toolCalls
    .filter((tc) => tc.type === "function")
    .map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
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
      toolCalls: extractToolCalls(accumulated.toolCalls),
      promptTokens: accumulated.usage?.prompt_tokens ?? 0,
      completionTokens: accumulated.usage?.completion_tokens ?? 0,
      assistantMessage: buildAssistantMessage(
        accumulated.content || null,
        accumulated.toolCalls,
      ),
      reasoning: accumulated.reasoning,
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
  const reasoning =
    (message as { reasoning_content?: string } | undefined)
      ?.reasoning_content || null

  return {
    content: message?.content ?? "",
    toolCalls: extractToolCalls(rawToolCalls),
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
    assistantMessage: buildAssistantMessage(
      message?.content ?? null,
      rawToolCalls.filter(
        (tc): tc is Extract<typeof tc, { type: "function" }> =>
          tc.type === "function",
      ),
    ),
    reasoning,
  }
}

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
  options?: { baseURL?: string; contextWindow?: number; isCustom?: boolean },
): AIProvider {
  const isCustom = options?.isCustom ?? false
  const openai = new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
    ...(options?.baseURL ? { baseURL: options.baseURL } : {}),
    ...(isCustom
      ? {
          fetch: createHeaderFilteredFetch(OPENAI_ALLOWED_HEADERS),
        }
      : {}),
  })

  const contextWindow = options?.contextWindow ?? 400_000

  return {
    id: providerId,
    contextWindow,

    toNativeMessages(messages: Message[]): ChatCompletionMessageParam[] {
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
      const systemContent = config.systemInstructions

      const chatMessages: ChatCompletionMessageParam[] = [
        { role: "system", content: systemContent },
      ]

      if (config.conversationHistory && config.conversationHistory.length > 0) {
        chatMessages.push(...toNativeMessages(config.conversationHistory))
      }

      chatMessages.push({ role: "user", content: config.initialUserContent })

      const openaiTools = toOpenAITools(tools)
      let totalInputTokens = 0
      let totalOutputTokens = 0
      let lastPromptTokens = 0
      const toolContext: ToolExecutionContext = {}

      const baseParams = {
        ...toChatCompletionsAPIProps(model),
        tools: openaiTools,
      }

      let result = await executeRequest(
        openai,
        {
          ...baseParams,
          messages: chatMessages,
        } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
        streaming,
        abortSignal,
      )
      totalInputTokens += result.promptTokens
      totalOutputTokens += result.completionTokens
      lastPromptTokens = result.promptTokens
      chatMessages.push(result.assistantMessage)

      for (const tc of result.toolCalls) {
        streaming?.onToolCall?.({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        })
      }

      let toolCallRound = 0
      while (true) {
        if (abortSignal?.aborted) {
          return {
            type: "aborted",
            message: "Operation was cancelled",
          } as AiAssistantAPIError
        }

        if (!result.toolCalls.length) break
        toolCallRound++

        for (const tc of result.toolCalls) {
          const exec = await executeTool(
            tc.name,
            safeJsonParse(tc.arguments),
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
            tool_call_id: tc.id,
            name: tc.name,
            content: exec.content,
          })

          chatMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: exec.content,
          })
        }

        if (
          lastPromptTokens >= contextWindow - 50_000 &&
          result.toolCalls.length > 0
        ) {
          chatMessages.push({
            role: "user" as const,
            content: CRITICAL_TOKEN_USAGE_MESSAGE,
          })
        }

        const isLastRound = toolCallRound >= MAX_TOOL_CALL_ROUNDS
        if (isLastRound) {
          chatMessages.push({
            role: "user" as const,
            content: TOOL_CALL_LIMIT_MESSAGE as string,
          })
        }

        if (abortSignal?.aborted) {
          return {
            type: "aborted",
            message: "Operation was cancelled",
          } as AiAssistantAPIError
        }
        streaming?.onResponseStart?.()

        result = await executeRequest(
          openai,
          {
            ...baseParams,
            ...(isLastRound ? { tools: undefined } : {}),
            messages: chatMessages,
          } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
          streaming,
          abortSignal,
        )
        totalInputTokens += result.promptTokens
        totalOutputTokens += result.completionTokens
        lastPromptTokens = result.promptTokens
        chatMessages.push(result.assistantMessage)

        for (const tc of result.toolCalls) {
          streaming?.onToolCall?.({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
          })
        }
      }

      if (abortSignal?.aborted) {
        return {
          type: "aborted",
          message: "Operation was cancelled",
        } as AiAssistantAPIError
      }

      const tokenUsage: TokenUsage = {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      }

      setStatus(null)
      return {
        explanation: result.content,
        sql: toolContext.suggestedSQL ?? null,
        tokenUsage,
      }
    },

    async generateTitle({ model, prompt }) {
      try {
        const response = await openai.chat.completions.create({
          model: toChatCompletionsAPIProps(model).model,
          messages: [{ role: "user", content: prompt }],
          ...(isCustom ? {} : { max_completion_tokens: 100 }),
        })
        return response.choices[0]?.message?.content || null
      } catch {
        return null
      }
    },

    async generateSummary({
      model,
      systemPrompt,
      userMessage,
      abortSignal,
    }: {
      model: string
      systemPrompt: string
      userMessage: string
      abortSignal?: AbortSignal
    }) {
      let text = ""
      const stream = await openai.chat.completions.create(
        {
          ...toChatCompletionsAPIProps(model),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          stream: true,
        },
        ...(abortSignal ? [{ signal: abortSignal }] : ([] as const)),
      )
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          text += delta
        }
      }
      return text
    },

    async testConnection({ apiKey: testApiKey, model }) {
      try {
        const testClient = new OpenAI({
          apiKey: testApiKey,
          dangerouslyAllowBrowser: true,
          ...(options?.baseURL ? { baseURL: options.baseURL } : {}),
          ...(isCustom
            ? {
                fetch: createHeaderFilteredFetch(OPENAI_ALLOWED_HEADERS),
              }
            : {}),
        })
        await testClient.chat.completions.create({
          model: getModelProps(model).model,
          messages: [{ role: "user", content: "ping" }],
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
      if (options?.baseURL) {
        const totalChars =
          systemPrompt.length +
          messages.reduce((sum, m) => sum + getMessageTextLength(m), 0)
        return Math.ceil(totalChars / 3.5)
      }

      const nativeMessages = toNativeMessages(messages)
      return countTokensFromNativePayload(systemPrompt, nativeMessages)
    },

    async listModels(): Promise<string[]> {
      const models: string[] = []
      for await (const model of openai.models.list()) {
        models.push(model.id)
      }
      return models.sort((a, b) => a.localeCompare(b))
    },

    classifyError(
      error: unknown,
      setStatus: StatusCallback,
    ): AiAssistantAPIError {
      return classifyOpenAIError(error, setStatus)
    },

    isNonRetryableError(error: unknown): boolean {
      return isOpenAINonRetryableError(error)
    },
  }
}
