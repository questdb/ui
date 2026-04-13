import type {
  AiAssistantAPIError,
  ModelToolsClient,
  StatusCallback,
  StreamingCallback,
} from "../aiAssistant"
import type { ProviderId } from "./settings"

export interface ToolDefinition {
  name: string
  description?: string
  inputSchema: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface ResponseFormatSchema {
  name: string
  schema: Record<string, unknown>
  strict: boolean
}

export interface FlowConfig {
  systemInstructions: string
  initialUserContent: string
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
  responseFormat: ResponseFormatSchema
}

export interface AIProvider {
  readonly id: ProviderId
  readonly contextWindow: number

  executeFlow<T>(params: {
    model: string
    config: FlowConfig
    modelToolsClient: ModelToolsClient
    tools: ToolDefinition[]
    setStatus: StatusCallback
    abortSignal?: AbortSignal
    streaming?: StreamingCallback
  }): Promise<T | AiAssistantAPIError>

  generateTitle(params: {
    model: string
    prompt: string
    responseFormat: ResponseFormatSchema
  }): Promise<string | null>

  generateSummary(params: {
    model: string
    systemPrompt: string
    userMessage: string
  }): Promise<string>

  testConnection(params: {
    apiKey: string
    model: string
  }): Promise<{ valid: boolean; error?: string }>

  countTokens(params: {
    messages: Array<{ role: "user" | "assistant"; content: string }>
    systemPrompt: string
    model: string
  }): Promise<number>

  listModels(): Promise<string[]>

  classifyError(error: unknown, setStatus: StatusCallback): AiAssistantAPIError
  isNonRetryableError(error: unknown): boolean
}
