import type {
  AiAssistantAPIError,
  ModelToolsClient,
  StatusCallback,
  StreamingCallback,
  TokenUsage,
} from "./aiAssistant"
import type { Permissions, ToolCategory } from "../tools/permissions"
import type { ValidateQueryResult } from "../questdb/types"
import type { ProviderId } from "./settings"
import type { ToolExecutionContext } from "./shared"

export type ToolSurface = "ai" | "mcp"

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
    // Required by OpenAI strict mode on every object schema.
    additionalProperties?: boolean
  }
  category: ToolCategory
  surfaces: ToolSurface[]
  mutatesNotebook: boolean
  // Produces a brand-new notebook whose bufferId is in the result
  createsNotebook: boolean
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

export type ExecuteFlowParams = {
  model: string
  config: FlowConfig
  modelToolsClient: ModelToolsClient
  tools: ToolDefinition[]
  setStatus: StatusCallback
  abortSignal?: AbortSignal
  streaming?: StreamingCallback
  perms?: Permissions | (() => Permissions)
  validateSql?: (sql: string) => Promise<ValidateQueryResult>
  toolContext?: ToolExecutionContext
}

export interface AIProvider {
  readonly id: ProviderId
  readonly contextWindow: number

  toNativeMessages(messages: Message[]): unknown

  executeFlow(
    params: ExecuteFlowParams,
  ): Promise<FlowResult | AiAssistantAPIError>

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
