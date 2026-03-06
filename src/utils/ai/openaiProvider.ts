import OpenAI from "openai"
import type {
  ResponseOutputItem,
  ResponseTextConfig,
} from "openai/resources/responses/responses"
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

function toResponseTextConfig(
  format: ResponseFormatSchema,
): ResponseTextConfig {
  return {
    format: {
      type: "json_schema" as const,
      name: format.name,
      schema: format.schema,
      strict: format.strict,
    },
  }
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
): Promise<OpenAI.Responses.Response> {
  let accumulatedText = ""
  let lastExplanation = ""
  let finalResponse: OpenAI.Responses.Response | null = null

  try {
    const stream = await openai.responses.create({
      ...params,
      stream: true,
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

      if (event.type === "response.output_text.delta") {
        accumulatedText += event.delta
        const explanation = extractPartialExplanation(accumulatedText)
        if (explanation !== lastExplanation) {
          const chunk = explanation.slice(lastExplanation.length)
          lastExplanation = explanation
          streamCallback.onTextChunk(chunk, explanation)
        }
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
    throw new StreamingError(
      error instanceof Error ? error.message : "Stream interrupted",
      "network",
      error,
    )
  }

  if (!finalResponse) {
    throw new StreamingError("Provider failed to return a response", "failed")
  }

  return finalResponse
}

function extractOpenAIToolCalls(
  response: OpenAI.Responses.Response,
): { id?: string; name: string; arguments: unknown; call_id: string }[] {
  const calls = []
  for (const item of response.output) {
    if (item?.type === "function_call") {
      const args =
        typeof item.arguments === "string"
          ? safeJsonParse(item.arguments)
          : item.arguments || {}
      calls.push({
        id: item.id,
        name: item.name,
        arguments: args,
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

let tiktokenEncoder: Tiktoken | null = null

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
          },
        }
      : {}),
  }
}

export function createOpenAIProvider(
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
      let input: OpenAI.Responses.ResponseInput = []
      if (config.conversationHistory && config.conversationHistory.length > 0) {
        const validMessages = config.conversationHistory.filter(
          (msg) => msg.content && msg.content.trim() !== "",
        )
        for (const msg of validMessages) {
          input.push({
            role: msg.role,
            content: msg.content,
          })
        }
      }

      input.push({
        role: "user",
        content: config.initialUserContent,
      })

      const openaiTools = toOpenAIFunctions(tools)

      let totalInputTokens = 0
      let totalOutputTokens = 0

      const requestParams = {
        ...toResponsesAPIProps(model),
        instructions: config.systemInstructions,
        input,
        tools: openaiTools,
        text: toResponseTextConfig(config.responseFormat),
      } as OpenAI.Responses.ResponseCreateParamsNonStreaming

      let lastResponse = streaming
        ? await createOpenAIResponseStreaming(
            openai,
            requestParams,
            streaming,
            abortSignal,
          )
        : await openai.responses.create(requestParams)
      input = [...input, ...lastResponse.output]

      totalInputTokens += lastResponse.usage?.input_tokens ?? 0
      totalOutputTokens += lastResponse.usage?.output_tokens ?? 0

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
            tc.arguments,
            modelToolsClient,
            setStatus,
          )
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
            content:
              "**CRITICAL TOKEN USAGE: The conversation is getting too long to fit the context window. If you are planning to use more tools, summarize your findings to the user first, and wait for user confirmation to continue working on the task.**",
          })
        }
        const loopRequestParams = {
          ...toResponsesAPIProps(model),
          instructions: config.systemInstructions,
          input,
          tools: openaiTools,
          text: toResponseTextConfig(config.responseFormat),
        } as OpenAI.Responses.ResponseCreateParamsNonStreaming

        lastResponse = streaming
          ? await createOpenAIResponseStreaming(
              openai,
              loopRequestParams,
              streaming,
              abortSignal,
            )
          : await openai.responses.create(loopRequestParams)
        input = [...input, ...lastResponse.output]

        totalInputTokens += lastResponse.usage?.input_tokens ?? 0
        totalOutputTokens += lastResponse.usage?.output_tokens ?? 0
      }

      if (abortSignal?.aborted) {
        return {
          type: "aborted",
          message: "Operation was cancelled",
        } as AiAssistantAPIError
      }

      const text = getOpenAIText(lastResponse)
      if (text.type === "refusal") {
        return {
          type: "unknown",
          message: text.message,
        } as AiAssistantAPIError
      }

      const rawOutput = text.message

      try {
        const json = JSON.parse(rawOutput) as T
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
        const response = await openai.responses.create({
          ...toResponsesAPIProps(model),
          input: [{ role: "user", content: prompt }],
          text: toResponseTextConfig(responseFormat),
          max_output_tokens: 100,
        })
        const parsed = JSON.parse(response.output_text) as { title: string }
        return parsed.title || null
      } catch {
        return null
      }
    },

    async generateSummary({ model, systemPrompt, userMessage }) {
      const response = await openai.responses.create({
        ...toResponsesAPIProps(model),
        instructions: systemPrompt,
        input: userMessage,
      })
      return response.output_text || ""
    },

    async testConnection({ apiKey: testApiKey, model }) {
      try {
        const testClient = new OpenAI({
          apiKey: testApiKey,
          dangerouslyAllowBrowser: true,
        })
        await testClient.responses.create({
          model: getModelProps(model).model, // testConnection only needs model name
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
