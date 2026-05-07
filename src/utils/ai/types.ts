import type {
  AiAssistantAPIError,
  ModelToolsClient,
  StatusCallback,
  StreamingCallback,
  TokenUsage,
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

export type ToolCall = {
  id: string
  name: string
  arguments: string // JSON string, like OpenAI
  timestamp: number
}

/**
 * API-level message — OpenAI Chat Completions style.
 * Stored as-is in the conversation. Converted to provider-native
 * format only when sending to the API via `toNativeMessages()`.
 */
export type Message = {
  role: "user" | "assistant" | "tool"
  content: string | null
  tool_calls?: ToolCall[]
  reasoning?: { timestamp: number; content: string }
  tool_call_id?: string
  name?: string
}

export interface FlowConfig {
  systemInstructions: string
  initialUserContent: string
  conversationHistory?: Message[]
}

export interface FlowResult {
  explanation: string
  sql: string | null
  tokenUsage: TokenUsage
}

export interface AIProvider {
  readonly id: ProviderId
  readonly contextWindow: number

  toNativeMessages(messages: Message[]): unknown

  executeFlow(params: {
    model: string
    config: FlowConfig
    modelToolsClient: ModelToolsClient
    tools: ToolDefinition[]
    setStatus: StatusCallback
    abortSignal?: AbortSignal
    streaming?: StreamingCallback
  }): Promise<FlowResult | AiAssistantAPIError>

  generateTitle(params: {
    model: string
    prompt: string
  }): Promise<string | null>

  generateSummary(params: {
    model: string
    systemPrompt: string
    userMessage: string
    abortSignal?: AbortSignal
  }): Promise<string>

  testConnection(params: {
    apiKey: string
    model: string
  }): Promise<{ valid: boolean; error?: string }>

  countTokens(params: {
    messages: Message[]
    systemPrompt: string
    model: string
  }): Promise<number>

  listModels(): Promise<string[]>

  classifyError(error: unknown, setStatus: StatusCallback): AiAssistantAPIError
  isNonRetryableError(error: unknown): boolean
}
