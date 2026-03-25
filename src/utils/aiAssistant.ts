import { Client } from "./questdb/client"
import { Type, Table } from "./questdb/types"
import type { ProviderId } from "./ai"
import type { AiAssistantSettings } from "../providers/LocalStorageProvider/types"
import { formatSql } from "./formatSql"
import { AIOperationStatus, StatusArgs } from "../providers/AIStatusProvider"
import type {
  ConversationId,
  ConversationMessage,
} from "../providers/AIConversationProvider/types"
import { compactConversationIfNeeded } from "./contextCompaction"
import {
  createProvider,
  ExplainFormat,
  FixSQLFormat,
  ConversationResponseFormat,
  ChatTitleFormat,
  ALL_TOOLS,
  REFERENCE_TOOLS,
  getUnifiedPrompt,
  BUILTIN_PROVIDERS,
} from "./ai"
import type { AIProvider } from "./ai"

export type ActiveProviderSettings = {
  model: string
  provider: ProviderId
  apiKey: string
  aiAssistantSettings?: AiAssistantSettings
}

export interface AiAssistantAPIError {
  type: "rate_limit" | "invalid_key" | "network" | "unknown" | "aborted"
  message: string
  details?: string
}

export interface AiAssistantExplanation {
  explanation: string
  tokenUsage?: TokenUsage
}

export type AiAssistantValidateQueryResult =
  | { valid: true }
  | { valid: false; error: string; position: number }

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface GeneratedSQL {
  sql: string | null
  explanation?: string
  tokenUsage?: TokenUsage
}

export interface ModelToolsClient {
  validateQuery: (query: string) => Promise<AiAssistantValidateQueryResult>
  getTables?: () => Promise<Array<{ name: string; type: "table" | "matview" }>>
  getTableSchema?: (tableName: string) => Promise<string | null>
  getTableDetails?: (tableName: string) => Promise<Table | null>
}

export type StatusCallback = (
  status: AIOperationStatus | null,
  args?: StatusArgs,
) => void

export type StreamingCallback = {
  onTextChunk: (chunk: string, accumulated: string) => void
  cleanup?: () => void
}

export const normalizeSql = (sql: string, insertSemicolon: boolean = true) => {
  if (!sql) return ""
  let result = sql.trim()
  if (result.endsWith(";")) {
    result = result.slice(0, -1)
  }
  return formatSql(result) + (insertSemicolon ? ";" : "")
}

export function isAiAssistantError(
  response:
    | AiAssistantAPIError
    | AiAssistantExplanation
    | GeneratedSQL
    | Partial<GeneratedSQL>,
): response is AiAssistantAPIError {
  if ("type" in response && "message" in response) {
    return true
  }
  return false
}

export function createModelToolsClient(
  questClient: Client,
  tables?: Array<Table>,
): ModelToolsClient {
  return {
    async validateQuery(
      query: string,
    ): Promise<AiAssistantValidateQueryResult> {
      try {
        const response = await questClient.validateQuery(query)
        if ("error" in response) {
          const errorResponse = response as {
            error: string
            position: number
            query: string
          }
          return {
            valid: false,
            error: String(errorResponse.error),
            position: Number(errorResponse.position),
          }
        }
        return {
          valid: true,
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to validate query. Something went wrong with the server."
        return {
          valid: false,
          error: errorMessage,
          position: -1,
        }
      }
    },
    ...(tables
      ? {
          getTables(): Promise<
            Array<{ name: string; type: "table" | "matview" }>
          > {
            return Promise.resolve(
              tables.map((table) => ({
                name: table.table_name,
                type: table.matView ? "matview" : ("table" as const),
              })),
            )
          },

          async getTableSchema(tableName: string): Promise<string | null> {
            try {
              const table = tables.find((t) => t.table_name === tableName)
              if (!table) {
                return null
              }

              const ddlResponse = table.matView
                ? await questClient.showMatViewDDL(tableName)
                : await questClient.showTableDDL(tableName)

              if (
                ddlResponse?.type === Type.DQL &&
                ddlResponse.data?.[0]?.ddl
              ) {
                return ddlResponse.data[0].ddl
              }

              return null
            } catch (error) {
              console.error(
                `Failed to fetch schema for table ${tableName}:`,
                error,
              )
              return null
            }
          },
          getTableDetails: async (tableName: string): Promise<Table | null> => {
            try {
              const result = await questClient.getTableDetails(tableName)
              if (result.type === Type.DQL && result.data.length > 0) {
                return result.data[0]
              }
              return null
            } catch (error) {
              console.error(
                `Failed to fetch details for table ${tableName}:`,
                error,
              )
              return null
            }
          },
        }
      : {}),
  }
}

type CreateStreamingCallbackParams = {
  conversationId: string
  assistantMessageId: string
  updateMessage: (
    id: string,
    msgId: string,
    updates: Partial<ConversationMessage>,
  ) => void
  setIsStreaming: (streaming: boolean) => void
}

export const createStreamingCallback = (
  params: CreateStreamingCallbackParams,
): StreamingCallback => {
  const { conversationId, assistantMessageId, updateMessage, setIsStreaming } =
    params
  let streamingStarted = false
  let pendingUpdate: string | null = null
  let updateScheduled = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let cleaned = false

  return {
    onTextChunk: (_chunk: string, accumulated: string) => {
      if (cleaned) return
      if (!streamingStarted) {
        streamingStarted = true
        setIsStreaming(true)
      }
      pendingUpdate = accumulated
      if (!updateScheduled) {
        updateScheduled = true
        timeoutId = setTimeout(() => {
          timeoutId = null
          updateScheduled = false
          if (pendingUpdate !== null && !cleaned) {
            updateMessage(conversationId, assistantMessageId, {
              content: pendingUpdate,
              explanation: pendingUpdate,
            })
          }
        })
      }
    },
    cleanup: () => {
      cleaned = true
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      pendingUpdate = null
    },
  }
}

const MAX_RETRIES = 2
const RETRY_DELAY = 1000

let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 2000

const handleRateLimit = async () => {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest),
    )
  }
  lastRequestTime = Date.now()
}

const tryWithRetries = async <T>(
  fn: () => Promise<T>,
  provider: AIProvider,
  setStatus: StatusCallback,
  abortSignal?: AbortSignal,
): Promise<T | AiAssistantAPIError> => {
  let retries = 0
  while (retries <= MAX_RETRIES) {
    try {
      if (abortSignal?.aborted) {
        return {
          type: "aborted",
          message: "Operation was cancelled",
        } as AiAssistantAPIError
      }

      return await fn()
    } catch (error) {
      console.error(
        "AI Assistant error:",
        error instanceof Error ? error.message : String(error),
        provider.isNonRetryableError(error)
          ? "Non-retryable error."
          : "Remaining retries: " + (MAX_RETRIES - retries) + ".",
      )
      retries++
      if (retries > MAX_RETRIES || provider.isNonRetryableError(error)) {
        return provider.classifyError(error, setStatus)
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * retries))
    }
  }

  setStatus(null)
  return {
    type: "unknown",
    message: `Failed to get response after ${retries} retries`,
  }
}

export const testApiKey = async (
  apiKey: string,
  model: string,
  providerId: ProviderId,
  settings?: AiAssistantSettings,
): Promise<{ valid: boolean; error?: string }> => {
  const provider = createProvider(providerId, apiKey, settings)
  return provider.testConnection({ apiKey, model })
}

export const generateChatTitle = async ({
  firstUserMessage,
  settings,
}: {
  firstUserMessage: string
  settings: ActiveProviderSettings
}): Promise<string | null> => {
  const isCustom = !BUILTIN_PROVIDERS[settings.provider]
  if ((!isCustom && !settings.apiKey) || !settings.model) {
    return null
  }

  try {
    const provider = createProvider(
      settings.provider,
      settings.apiKey,
      settings.aiAssistantSettings,
    )

    const prompt = `Generate a concise chat title (max 30 characters) for this conversation with QuestDB AI Assistant. The title should capture the main topic or intent.

User's message:
${firstUserMessage}

Return a JSON object with the following structure: { "title": "Your title here" }`

    return await provider.generateTitle({
      model: settings.model,
      prompt,
      responseFormat: ChatTitleFormat,
    })
  } catch (error) {
    console.warn("Failed to generate chat title:", error)
    return null
  }
}

export type AIOperation =
  | "explain"
  | "fix"
  | "followup"
  | "schema_explain"
  | "health_issue"

export const continueConversation = async ({
  userMessage,
  conversationHistory,
  settings,
  modelToolsClient,
  setStatus,
  abortSignal,
  operation = "followup",
  streaming,
}: {
  userMessage: string
  conversationHistory: Array<ConversationMessage>
  settings: ActiveProviderSettings
  modelToolsClient: ModelToolsClient
  setStatus: StatusCallback
  abortSignal?: AbortSignal
  operation?: AIOperation
  conversationId?: ConversationId
  streaming?: StreamingCallback
}): Promise<
  (GeneratedSQL | AiAssistantExplanation | AiAssistantAPIError) & {
    compactedConversationHistory?: Array<ConversationMessage>
  }
> => {
  const isCustom = !BUILTIN_PROVIDERS[settings.provider]
  if ((!isCustom && !settings.apiKey) || !settings.model) {
    return {
      type: "invalid_key",
      message: "API key or model is missing",
    }
  }

  await handleRateLimit()
  if (abortSignal?.aborted) {
    return {
      type: "aborted",
      message: "Operation was cancelled",
    }
  }

  const responseFormat = {
    explain: ExplainFormat,
    fix: FixSQLFormat,
    followup: ConversationResponseFormat,
    schema_explain: ExplainFormat,
    health_issue: ConversationResponseFormat,
  }[operation]

  let provider: ReturnType<typeof createProvider>
  try {
    provider = createProvider(
      settings.provider,
      settings.apiKey,
      settings.aiAssistantSettings,
    )
  } catch (error) {
    return {
      type: "unknown",
      message:
        error instanceof Error
          ? error.message
          : "Failed to initialize provider",
    }
  }

  return tryWithRetries(
    async () => {
      const grantSchemaAccess = !!modelToolsClient.getTables
      const systemPrompt = getUnifiedPrompt(grantSchemaAccess)

      let workingConversationHistory = conversationHistory
      let isCompacted = false

      setStatus(AIOperationStatus.Processing)
      if (conversationHistory.length > 0) {
        const compactionResult = await compactConversationIfNeeded(
          conversationHistory,
          provider,
          systemPrompt,
          userMessage,
          () => setStatus(AIOperationStatus.Compacting),
          {
            model: settings.model,
            aiAssistantSettings: settings.aiAssistantSettings,
          },
        )

        if ("error" in compactionResult) {
          setStatus(null)
          console.error(
            "Failed to compact conversation:",
            compactionResult.error,
          )
          return {
            type: "unknown" as const,
            message: compactionResult.error,
          }
        }

        if (compactionResult.wasCompacted) {
          workingConversationHistory = [
            ...conversationHistory.map((m) => ({ ...m, isCompacted: true })),
            {
              id: crypto.randomUUID(),
              role: "assistant" as const,
              content: compactionResult.compactedMessage,
              hideFromUI: true,
              timestamp: Date.now(),
            },
          ]
          isCompacted = true
        }
      }
      setStatus(AIOperationStatus.Processing)

      const postProcess = (formatted: {
        sql?: string | null
        explanation: string
        tokenUsage?: TokenUsage
      }): GeneratedSQL => {
        const sql = normalizeSql(formatted?.sql ?? "") || null
        return {
          sql,
          explanation: formatted.explanation,
          tokenUsage: formatted.tokenUsage,
        }
      }

      const tools = grantSchemaAccess ? ALL_TOOLS : REFERENCE_TOOLS

      const result = await provider.executeFlow<{
        sql?: string | null
        explanation: string
        tokenUsage?: TokenUsage
      }>({
        model: settings.model,
        config: {
          systemInstructions: getUnifiedPrompt(grantSchemaAccess),
          initialUserContent: userMessage,
          conversationHistory: workingConversationHistory.filter(
            (m) => !m.isCompacted,
          ),
          responseFormat,
        },
        modelToolsClient,
        tools,
        setStatus,
        abortSignal,
        streaming,
      })

      if (isAiAssistantError(result)) {
        return result
      }
      return {
        ...postProcess(result),
        compactedConversationHistory: isCompacted
          ? workingConversationHistory
          : undefined,
      }
    },
    provider,
    setStatus,
    abortSignal,
  )
}
