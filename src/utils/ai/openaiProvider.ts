import OpenAI from "openai"
import type { ResponseOutputItem } from "openai/resources/responses/responses"
import type {
  AiAssistantAPIError,
  ModelToolsClient,
  StatusCallback,
  StreamingCallback,
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
  safeJsonParse,
  executeTool,
  CRITICAL_TOKEN_USAGE_MESSAGE,
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

/**
 * Convert our flat Message[] to OpenAI Responses API ResponseInput.
 * - user messages → { role: "user", content: string }
 * - assistant text → { type: "message", role: "assistant", content: [{ type: "output_text", text }] }
 * - assistant tool_calls → { type: "function_call", call_id, name, arguments } per call
 * - tool messages → { type: "function_call_output", call_id, output }
 */
function toNativeMessages(messages: Message[]): OpenAI.Responses.ResponseInput {
  const input: OpenAI.Responses.ResponseInput = []
  // Buffer user messages that appear between function_call and function_call_output
  // so tool outputs stay adjacent to their parent function calls
  const deferredUserItems: OpenAI.Responses.ResponseInput = []

  for (const msg of messages) {
    if (msg.role === "user") {
      if (msg.content) {
        const userItem = { role: "user" as const, content: msg.content }
        const last = input[input.length - 1]
        if (last && "type" in last && last.type === "function_call") {
          deferredUserItems.push(userItem)
        } else {
          input.push(userItem)
        }
      }
      continue
    }

    if (msg.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: msg.tool_call_id!,
        output: msg.content ?? "",
      } as OpenAI.Responses.ResponseInputItem.FunctionCallOutput)
      continue
    }

    // Flush deferred user items before adding new assistant content
    if (deferredUserItems.length > 0) {
      input.push(...deferredUserItems)
      deferredUserItems.length = 0
    }

    if (msg.content) {
      input.push({
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: msg.content }],
      } as unknown as OpenAI.Responses.ResponseInputItem)
    }
    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        input.push({
          type: "function_call",
          call_id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        } as unknown as OpenAI.Responses.ResponseInputItem)
      }
    }
  }

  if (deferredUserItems.length > 0) {
    input.push(...deferredUserItems)
  }

  return input
}

function toOpenAIFunctions(tools: ToolDefinition[]): OpenAI.Responses.Tool[] {
  return tools.map((t) => ({
    type: "function" as const,
    name: t.name,
    description: t.description,
    parameters: { ...t.inputSchema, additionalProperties: false },
    strict: true,
  })) as OpenAI.Responses.Tool[]
}

async function createOpenAIResponseStreaming(
  openai: OpenAI,
  params: OpenAI.Responses.ResponseCreateParamsNonStreaming,
  streamCallback: StreamingCallback,
  abortSignal?: AbortSignal,
): Promise<{
  response: OpenAI.Responses.Response
}> {
  let finalResponse: OpenAI.Responses.Response | null = null

  try {
    const stream = await openai.responses.create({
      ...params,
      stream: true,
      store: false,
      include: ["reasoning.encrypted_content"],
    } as OpenAI.Responses.ResponseCreateParamsStreaming)

    for await (const event of stream) {
      if (abortSignal?.aborted) {
        throw new StreamingError("Operation aborted", "interrupted")
      }

      if (event.type === "error") {
        const errorEvent = event as { error?: { message?: string } }
        throw new StreamingError(
          errorEvent.error?.message || "Stream error occurred",
          "failed",
          event,
        )
      }

      if (event.type === "response.failed") {
        const failedEvent = event as {
          response?: { error?: { message?: string } }
        }
        throw new StreamingError(
          failedEvent.response?.error?.message ||
            "Provider failed to return a response",
          "failed",
          event,
        )
      }

      if (
        (event as { type: string }).type ===
          "response.reasoning_summary_text.delta" ||
        (event as { type: string }).type ===
          "response.reasoning_summary_part.delta"
      ) {
        const delta = (event as { delta?: string }).delta
        if (delta) {
          streamCallback.onThinkingChunk?.(delta)
        }
      }

      if (event.type === "response.output_text.delta") {
        streamCallback.onTextChunk(event.delta)
      }

      if (event.type === "response.completed") {
        finalResponse = event.response
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

  if (!finalResponse) {
    throw new StreamingError("Provider failed to return a response", "failed")
  }

  return { response: finalResponse }
}

function extractOpenAIToolCalls(
  response: OpenAI.Responses.Response,
): { name: string; arguments: string; call_id: string }[] {
  const calls = []
  for (const item of response.output) {
    if (item?.type === "function_call") {
      calls.push({
        name: item.name,
        arguments:
          typeof item.arguments === "string"
            ? item.arguments
            : JSON.stringify(item.arguments),
        call_id: item.call_id,
      })
    }
  }
  return calls
}

function getOpenAIText(response: OpenAI.Responses.Response): {
  type: "refusal" | "text"
  message: string
} {
  const out = response.output || []
  if (
    out.find(
      (item: ResponseOutputItem) =>
        item.type === "message" &&
        item.content.some((c) => c.type === "refusal"),
    )
  ) {
    return {
      type: "refusal",
      message: "The model refused to generate a response for this request.",
    }
  }

  for (const item of out) {
    if (item.type === "message" && item.content) {
      for (const content of item.content) {
        if (content.type === "output_text" && "text" in content) {
          return { type: "text", message: content.text }
        }
      }
    }
  }

  return { type: "text", message: "" }
}

function toResponsesAPIProps(model: string): {
  model: string
  reasoning?: OpenAI.Reasoning
} {
  const props = getModelProps(model)
  return {
    model: props.model,
    ...(props.reasoningEffort
      ? {
          reasoning: {
            effort: props.reasoningEffort as OpenAI.ReasoningEffort,
            summary: "auto",
          },
        }
      : {}),
  }
}

export function createOpenAIProvider(
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

    toNativeMessages(messages: Message[]): OpenAI.Responses.ResponseInput {
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
      let input: OpenAI.Responses.ResponseInput = []
      if (config.conversationHistory && config.conversationHistory.length > 0) {
        input.push(...toNativeMessages(config.conversationHistory))
      }

      input.push({
        role: "user",
        content: config.initialUserContent,
      })

      const openaiTools = toOpenAIFunctions(tools)

      let totalInputTokens = 0
      let totalOutputTokens = 0
      const toolContext: ToolExecutionContext = {}

      const requestParams = {
        ...toResponsesAPIProps(model),
        instructions: config.systemInstructions,
        input,
        tools: openaiTools,
        store: false,
        include: ["reasoning.encrypted_content"],
      } as OpenAI.Responses.ResponseCreateParamsNonStreaming

      const streamResult = streaming
        ? await createOpenAIResponseStreaming(
            openai,
            requestParams,
            streaming,
            abortSignal,
          )
        : {
            response: await openai.responses.create(requestParams),
          }
      let lastResponse = streamResult.response
      input = [...input, ...lastResponse.output]

      totalInputTokens += lastResponse.usage?.input_tokens ?? 0
      totalOutputTokens += lastResponse.usage?.output_tokens ?? 0

      // Emit tool calls from initial response
      const initialToolCalls = extractOpenAIToolCalls(lastResponse)
      for (const tc of initialToolCalls) {
        streaming?.onToolCall?.({
          id: tc.call_id,
          name: tc.name,
          arguments: tc.arguments,
        })
      }

      while (true) {
        if (abortSignal?.aborted) {
          return {
            type: "aborted",
            message: "Operation was cancelled",
          } as AiAssistantAPIError
        }

        const toolCalls = extractOpenAIToolCalls(lastResponse)
        if (!toolCalls.length) break
        const tool_outputs: OpenAI.Responses.ResponseFunctionToolCallOutputItem[] =
          []
        for (const tc of toolCalls) {
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
            tool_call_id: tc.call_id,
            name: tc.name,
            content: exec.content,
          })

          tool_outputs.push({
            type: "function_call_output",
            call_id: tc.call_id,
            output: exec.content,
          } as OpenAI.Responses.ResponseFunctionToolCallOutputItem)
        }
        input = [...input, ...tool_outputs]

        if (
          (lastResponse.usage?.input_tokens ?? 0) >= contextWindow - 50_000 &&
          tool_outputs.length > 0
        ) {
          input.push({
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
        // Signal start of follow-up response
        streaming?.onResponseStart?.()

        const loopRequestParams = {
          ...toResponsesAPIProps(model),
          instructions: config.systemInstructions,
          input,
          tools: openaiTools,
          store: false,
          include: ["reasoning.encrypted_content"],
        } as OpenAI.Responses.ResponseCreateParamsNonStreaming

        const loopResult = streaming
          ? await createOpenAIResponseStreaming(
              openai,
              loopRequestParams,
              streaming,
              abortSignal,
            )
          : {
              response: await openai.responses.create(loopRequestParams),
            }
        lastResponse = loopResult.response
        input = [...input, ...lastResponse.output]

        totalInputTokens += lastResponse.usage?.input_tokens ?? 0
        totalOutputTokens += lastResponse.usage?.output_tokens ?? 0

        const loopToolCalls = extractOpenAIToolCalls(lastResponse)
        for (const tc of loopToolCalls) {
          streaming?.onToolCall?.({
            id: tc.call_id,
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

      const tokenUsage = {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      }

      const text = getOpenAIText(lastResponse)
      if (text.type === "refusal") {
        return {
          type: "unknown",
          message: text.message,
        } as AiAssistantAPIError
      }

      setStatus(null)
      return {
        explanation: text.message,
        sql: toolContext.suggestedSQL ?? null,
        tokenUsage,
      }
    },

    async generateTitle({ model, prompt }) {
      try {
        const response = await openai.responses.create({
          model: toResponsesAPIProps(model).model,
          input: [{ role: "user", content: prompt }],
          max_output_tokens: 100,
        })
        return response.output_text || null
      } catch {
        return null
      }
    },

    async generateSummary({ model, systemPrompt, userMessage }) {
      let text = ""
      const stream = await openai.responses.create({
        ...toResponsesAPIProps(model),
        instructions: systemPrompt,
        input: userMessage,
        stream: true,
      })
      for await (const event of stream) {
        if (event.type === "response.output_text.delta" && "delta" in event) {
          text += event.delta
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
        await testClient.responses.create({
          model: getModelProps(model).model,
          input: [{ role: "user", content: "ping" }],
          max_output_tokens: 16,
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

      const nativeInput = toNativeMessages(messages)
      return countTokensFromNativePayload(systemPrompt, nativeInput)
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
