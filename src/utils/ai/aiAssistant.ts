import { Client } from "../questdb/client"
import {
  Type,
  Table,
  TableKind,
  ValidateQueryResult,
  getTableKind,
} from "../questdb/types"
import { mapQueryRawToResult, type RunQueryRawResult } from "../tools/runQuery"
import type { ProviderId } from "./index"
import type { AiAssistantSettings } from "../../providers/LocalStorageProvider/types"
import { normalizeSql } from "../formatSql"
import { AIOperationStatus, StatusArgs } from "../../providers/AIStatusProvider"
import type {
  ConversationId,
  ConversationMessage,
} from "../../providers/AIConversationProvider/types"
import { compactConversationIfNeeded, toApiMessages } from "./contextCompaction"
import {
  createProvider,
  toolsForPermission,
  getUnifiedPrompt,
  getAiPermissions,
  readLiveAiPermissions,
  BUILTIN_PROVIDERS,
} from "./index"
import type { AIProvider } from "./index"
import type { ToolExecutionContext } from "./shared"
import type { NotebookFreshness } from "../notebooks/notebookFreshness"
import { getWorkspace } from "../notebooks/notebookAIBridge"
import { NotebookToolError } from "../notebooks/notebookToolError"

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
  // The AI-flavored `validateQuery` above lacks queryType needed to classify DDL/DML.
  validateSqlRaw: (query: string) => Promise<ValidateQueryResult>
  runQueryRaw: (
    sql: string,
    requestedLimit: number,
    signal?: AbortSignal,
  ) => Promise<RunQueryRawResult>
  getTables?: () => Promise<Array<{ name: string; type: TableKind }>>
  getTableSchema?: (tableName: string) => Promise<string | null>
  getTableDetails?: (tableName: string) => Promise<Table | null>

  createNotebook: (
    label?: string,
    signal?: AbortSignal,
  ) => Promise<{ bufferId: number; label: string }>
  duplicateNotebook: (
    bufferId: number,
    signal?: AbortSignal,
  ) => Promise<{ bufferId: number; label: string }>
  deleteNotebook: (bufferId: number) => Promise<void>
  activateNotebook: (
    bufferId: number,
    cellToFocus: string | null | undefined,
  ) => Promise<boolean>
}

export type NotebookClientExtras = {
  conversationId?: ConversationId
  bindNotebook?: (
    conversationId: ConversationId,
    bufferId: number,
  ) => Promise<void>
  // Lets the Abort button cancel a pending waiter instead of blocking for the full waitForController timeout.
  abortSignal?: AbortSignal
}

export type StatusCallback = (
  status: AIOperationStatus | null,
  args?: StatusArgs,
) => void

export type StreamingCallback = {
  onTextChunk: (chunk: string) => void
  onThinkingChunk?: (chunk: string) => void
  onToolCall?: (call: { id: string; name: string; arguments: string }) => void
  onToolResult?: (result: {
    tool_call_id: string
    name: string
    content: string
  }) => void
  onResponseStart?: () => void
  onBeforeStream?: () => void
}

export function isAiAssistantError(
  response: AiAssistantAPIError | GeneratedSQL | Partial<GeneratedSQL>,
): response is AiAssistantAPIError {
  if ("type" in response && "message" in response) {
    return true
  }
  return false
}

export function createModelToolsClient(
  questClient: Client,
  tables?: Array<Table>,
  extras?: NotebookClientExtras,
): ModelToolsClient {
  const abortSignal = extras?.abortSignal
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
    validateSqlRaw(query: string): Promise<ValidateQueryResult> {
      return questClient.validateQuery(query)
    },
    runQueryRaw(
      sql: string,
      requestedLimit: number,
      signal?: AbortSignal,
    ): Promise<RunQueryRawResult> {
      return mapQueryRawToResult(questClient, sql, requestedLimit, signal)
    },
    ...(tables
      ? {
          getTables(): Promise<Array<{ name: string; type: TableKind }>> {
            return Promise.resolve(
              tables.map((table) => ({
                name: table.table_name,
                type: getTableKind(table),
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

    async createNotebook(label, signal) {
      const ws = getWorkspace()
      if (!ws) {
        throw new NotebookToolError(
          "workspace_unavailable",
          "Notebook workspace is not mounted.",
        )
      }
      // The agent never steals focus: always create in the background. The user
      // is notified of the new tab and opens it themselves.
      const res = await ws.createNotebook({
        label,
        signal: signal ?? abortSignal,
      })
      // First-binding-wins: bindNotebook no-ops on an already-bound conversation.
      if (extras?.bindNotebook && extras.conversationId) {
        await extras.bindNotebook(extras.conversationId, res.bufferId)
      }
      return res
    },

    async duplicateNotebook(bufferId, signal) {
      const ws = getWorkspace()
      if (!ws) {
        throw new NotebookToolError(
          "workspace_unavailable",
          "Notebook workspace is not mounted.",
        )
      }
      return ws.duplicateNotebook({
        bufferId,
        signal: signal ?? abortSignal,
      })
    },

    async activateNotebook(bufferId, cellToFocus) {
      const ws = getWorkspace()
      if (!ws) {
        throw new NotebookToolError(
          "workspace_unavailable",
          "Notebook workspace is not mounted.",
        )
      }
      return ws.activateNotebook(bufferId, cellToFocus)
    },

    async deleteNotebook(bufferId) {
      const ws = getWorkspace()
      if (!ws) {
        throw new NotebookToolError(
          "workspace_unavailable",
          "Notebook workspace is not mounted.",
        )
      }
      await ws.deleteNotebook(bufferId)
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
  isReplaySafe?: () => boolean,
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
      if (
        retries > MAX_RETRIES ||
        provider.isNonRetryableError(error) ||
        isReplaySafe?.() === false
      ) {
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

    const prompt = `Generate a concise chat title (max 30 characters) for this conversation. The title should capture the main topic or intent. Respond with ONLY the title text, nothing else.

User's message:
${firstUserMessage}`

    const raw = await provider.generateTitle({
      model: settings.model,
      prompt,
    })
    return (
      raw
        ?.trim()
        .replace(/^["']|["']$/g, "")
        .slice(0, 40) || null
    )
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
  streaming,
  notebookFreshness,
}: {
  userMessage: string
  conversationHistory: Array<ConversationMessage>
  settings: ActiveProviderSettings
  modelToolsClient: ModelToolsClient
  setStatus: StatusCallback
  abortSignal?: AbortSignal
  conversationId?: ConversationId
  streaming?: StreamingCallback
  notebookFreshness?: NotebookFreshness
}): Promise<
  (GeneratedSQL | AiAssistantAPIError) & {
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

  const flowToolContext: ToolExecutionContext = {
    notebookFreshness,
  }

  return tryWithRetries(
    async () => {
      const grantSchemaAccess = !!modelToolsClient.getTables
      const aiPerms = settings.aiAssistantSettings
        ? getAiPermissions(settings.aiAssistantSettings)
        : { grantSchemaAccess: false, read: false, write: false }
      const systemPrompt = getUnifiedPrompt(grantSchemaAccess, {
        read: aiPerms.read,
        write: aiPerms.write,
      })

      let workingConversationHistory = conversationHistory
      let isCompacted = false

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
          abortSignal,
        )

        if (abortSignal?.aborted) {
          return {
            type: "aborted" as const,
            message: "Operation was cancelled",
          }
        }

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
          const compactionTimestamp = Date.now()
          workingConversationHistory = [
            ...conversationHistory.map((m) => ({ ...m, isCompacted: true })),
            {
              id: crypto.randomUUID(),
              role: "user" as const,
              content: compactionResult.compactedMessage,
              hideFromUI: true,
              timestamp: compactionTimestamp,
            },
          ]
          isCompacted = true
          setStatus(AIOperationStatus.Processing)
        }
      }

      const tools = toolsForPermission(aiPerms, "ai")

      streaming?.onBeforeStream?.()

      const result = await provider.executeFlow({
        model: settings.model,
        config: {
          systemInstructions: systemPrompt,
          initialUserContent: userMessage,
          conversationHistory: toApiMessages(
            workingConversationHistory.filter((m) => !m.isCompacted),
          ),
        },
        modelToolsClient,
        tools,
        setStatus,
        abortSignal,
        streaming,
        perms: () => readLiveAiPermissions(aiPerms),
        validateSql: modelToolsClient.validateSqlRaw,
        toolContext: flowToolContext,
      })

      if (isAiAssistantError(result)) {
        return result
      }
      const sql = normalizeSql(result.sql ?? "") || null
      return {
        sql,
        explanation: result.explanation,
        tokenUsage: result.tokenUsage,
        compactedConversationHistory: isCompacted
          ? workingConversationHistory
          : undefined,
      }
    },
    provider,
    setStatus,
    abortSignal,
    () => !flowToolContext.notebookMutated && !flowToolContext.sqlWriteExecuted,
  )
}
