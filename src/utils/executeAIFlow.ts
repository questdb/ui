import type { Client } from "./questdb/client"
import type { Table } from "./questdb/types"
import type {
  ConversationId,
  ConversationMessage,
  UserMessageDisplayType,
  SchemaDisplayData,
  HealthIssueDisplayData,
} from "../providers/AIConversationProvider/types"
import type {
  OperationHistory,
  StatusArgs,
} from "../providers/AIStatusProvider"
import { AIOperationStatus } from "../providers/AIStatusProvider"
import {
  continueConversation,
  createModelToolsClient,
  isAiAssistantError,
  generateChatTitle,
  type ActiveProviderSettings,
  type GeneratedSQL,
  type AiAssistantAPIError,
  type StreamingCallback,
} from "./aiAssistant"
import { getExplainSchemaPrompt, getHealthIssuePrompt } from "./ai"
import { providerForModel, getTestModel, getAllModelOptions } from "./ai"
import type { AiAssistantSettings } from "../providers/LocalStorageProvider/types"
import { eventBus } from "../modules/EventBus"
import { EventType } from "../modules/EventBus/types"
import { trackEvent } from "../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../modules/ConsoleEventTracker/events"

type BaseFlowConfig = {
  conversationId: ConversationId
  settings: {
    model: string
    apiKey: string
  }
  aiAssistantSettings?: AiAssistantSettings
  questClient: Client
  tables?: Array<Table>
  hasSchemaAccess: boolean
  abortSignal?: AbortSignal
  useLastMessage?: boolean
}

type ChatFlowConfig = BaseFlowConfig & {
  type: "chat"
  userMessage: string
  currentSQL?: string
  conversationHistory: ConversationMessage[]
  isFirstMessage: boolean
}

type ExplainFlowConfig = BaseFlowConfig & {
  type: "explain"
  queryText: string
}

type FixFlowConfig = BaseFlowConfig & {
  type: "fix"
  queryText: string
  errorMessage?: string
  errorWord?: string
}

type SchemaExplainFlowConfig = BaseFlowConfig & {
  type: "schema_explain"
  tableName: string
  schema: string
  kindLabel: string
  schemaDisplayData: SchemaDisplayData
}

type HealthIssueFlowConfig = BaseFlowConfig & {
  type: "health_issue"
  tableName: string
  issue: {
    id: string
    field: string
    message: string
    currentValue?: string
    severity: "critical" | "warning"
  }
  tableDetails: string
  monitoringDocs: string
  trendSamples?: Array<{ value: number; timestamp: number }>
}

export type AIFlowConfig =
  | ChatFlowConfig
  | ExplainFlowConfig
  | FixFlowConfig
  | SchemaExplainFlowConfig
  | HealthIssueFlowConfig

type AIFlowUserMessage = {
  content: string
  displayType?: UserMessageDisplayType
  sql?: string
  displayUserMessage?: string
  displaySchemaData?: SchemaDisplayData
  displayHealthIssueData?: HealthIssueDisplayData
}

export type AIFlowCallbacks = {
  addMessage: (
    message: Omit<ConversationMessage, "id"> & { id?: string },
  ) => void
  updateMessage: (
    conversationId: string,
    messageId: string,
    updates: Partial<ConversationMessage>,
  ) => void
  setStatus: (
    status: AIOperationStatus | null,
    args?: StatusArgs,
    onUpdate?: (history: OperationHistory) => void,
  ) => void
  setIsStreaming: (streaming: boolean) => void
  persistMessages: (conversationId: string) => Promise<void>
  updateConversationName?: (
    conversationId: string,
    name: string,
    isGeneratedByAI?: boolean,
  ) => Promise<void>
  replaceConversationMessages?: (messages: ConversationMessage[]) => void
  getLastRoundMessages?: (conversationId: ConversationId) => Promise<{
    lastUserMessage?: ConversationMessage
    lastAssistantMessage?: ConversationMessage
  }>
}

export type AIFlowResult = {
  success: boolean
  cached?: boolean
  cachedMessageId?: string
  error?: string
  sql?: string
}

function buildUserMessage(config: AIFlowConfig): AIFlowUserMessage {
  switch (config.type) {
    case "chat": {
      const { userMessage, currentSQL, isFirstMessage } = config

      if (isFirstMessage && currentSQL && currentSQL.trim()) {
        return {
          content: `Current SQL query:\n\`\`\`sql\n${currentSQL}\n\`\`\`\n\nUser request: ${userMessage}`,
          displayType: "ask_request",
          sql: currentSQL.trim(),
          displayUserMessage: userMessage,
        }
      }

      return { content: userMessage }
    }

    case "explain":
      return {
        content: `Using your tools when necessary, explain this SQL query in detail.:\n\n\`\`\`sql\n${config.queryText}\n\`\`\``,
        displayType: "explain_request",
        sql: config.queryText,
      }

    case "fix": {
      const { queryText, errorMessage, errorWord } = config
      const hasErrorInfo = errorMessage || errorWord
      if (hasErrorInfo) {
        return {
          displayType: "fix_request",
          sql: queryText,
          content: `Fix this SQL query that has an error:\n\n\`\`\`sql\n${queryText}\n\`\`\`\n\nError: ${errorMessage}${errorWord ? `\n\nError near: "${errorWord}"` : ""}`,
        }
      }
      return {
        displayType: "fix_request",
        sql: queryText,
        content: `Fix this SQL query:\n\n\`\`\`sql\n${queryText}\n\`\`\`\n\n. Use validate_query tool for getting the error message and position.`,
      }
    }

    case "schema_explain":
      return {
        content: getExplainSchemaPrompt(
          config.tableName,
          config.schema,
          config.kindLabel,
        ),
        displayType: "schema_explain_request",
        displaySchemaData: config.schemaDisplayData,
      }

    case "health_issue":
      return {
        content: getHealthIssuePrompt({
          tableName: config.tableName,
          issue: config.issue,
          tableDetails: config.tableDetails,
          monitoringDocs: config.monitoringDocs,
          trendSamples: config.trendSamples,
        }),
        displayType: "health_issue_request",
        displayHealthIssueData: {
          tableName: config.tableName,
          issueMessage: config.issue.message,
          severity: config.issue.severity,
        },
      }
  }
}

function formatErrorMessage(error: AiAssistantAPIError): string {
  if (error.type === "aborted") {
    return "Operation has been cancelled"
  }
  return error.message || "An unexpected error occurred"
}

type ProcessResultConfig = {
  type: AIFlowConfig["type"]
  response: GeneratedSQL | AiAssistantAPIError
  conversationId: string
  assistantMessageId: string
  callbacks: AIFlowCallbacks
  compactedHistory?: ConversationMessage[]
}

function processResult(config: ProcessResultConfig): AIFlowResult {
  const {
    type,
    response,
    conversationId,
    assistantMessageId,
    callbacks,
    compactedHistory,
  } = config

  if (isAiAssistantError(response)) {
    const errorMessage = formatErrorMessage(response)
    callbacks.updateMessage(conversationId, assistantMessageId, {
      error: errorMessage,
    })
    return { success: false, error: errorMessage }
  }

  if (compactedHistory && callbacks.replaceConversationMessages) {
    callbacks.replaceConversationMessages(compactedHistory)
  }

  return processSQLResult(
    response,
    conversationId,
    assistantMessageId,
    callbacks,
    type,
  )
}

function processSQLResult(
  result: GeneratedSQL,
  conversationId: string,
  assistantMessageId: string,
  callbacks: AIFlowCallbacks,
  type: AIFlowConfig["type"],
): AIFlowResult {
  const hasSQLInResult = result.sql && result.sql.trim() !== ""

  if (type === "fix" && !hasSQLInResult && result.explanation) {
    callbacks.updateMessage(conversationId, assistantMessageId, {
      tokenUsage: result.tokenUsage,
    })
    return { success: true }
  }

  if (type === "fix" && !hasSQLInResult && !result.explanation) {
    callbacks.updateMessage(conversationId, assistantMessageId, {
      error: "No fixed query or explanation received from AI Assistant",
    })
    return {
      success: false,
      error: "No fixed query or explanation received",
    }
  }

  callbacks.updateMessage(conversationId, assistantMessageId, {
    ...(hasSQLInResult && { sql: result.sql as string }),
    tokenUsage: result.tokenUsage,
  })

  return {
    success: true,
    sql: hasSQLInResult ? result.sql! : undefined,
  }
}

async function generateChatTitleIfNeeded(
  config: AIFlowConfig,
  userMessageContent: string,
  callbacks: AIFlowCallbacks,
): Promise<void> {
  if (config.type === "schema_explain" || !callbacks.updateConversationName) {
    return
  }

  const provider = providerForModel(
    config.settings.model,
    config.aiAssistantSettings,
  )
  if (!provider) return

  const testModelValue = getTestModel(provider, config.aiAssistantSettings)
  if (!testModelValue) return

  try {
    const title = await generateChatTitle({
      firstUserMessage: userMessageContent,
      settings: {
        model: testModelValue,
        provider,
        apiKey: config.settings.apiKey,
        aiAssistantSettings: config.aiAssistantSettings,
      },
    })

    if (title) {
      await callbacks.updateConversationName(config.conversationId, title, true)
    }
  } catch (_error) {
    // Silently fail - title generation is not critical
  }
}

export async function executeAIFlow(
  config: AIFlowConfig,
  callbacks: AIFlowCallbacks,
): Promise<AIFlowResult> {
  const {
    conversationId,
    settings,
    questClient,
    tables,
    hasSchemaAccess,
    abortSignal,
    useLastMessage,
  } = config

  const userMsg = buildUserMessage(config)

  if (useLastMessage && callbacks.getLastRoundMessages) {
    const { lastUserMessage, lastAssistantMessage } =
      await callbacks.getLastRoundMessages(conversationId)

    if (
      lastUserMessage?.content === userMsg.content &&
      lastAssistantMessage &&
      !lastAssistantMessage.error
    ) {
      return {
        success: true,
        cached: true,
        cachedMessageId: lastUserMessage.id,
      }
    }
  }

  callbacks.addMessage({
    role: "user",
    content: userMsg.content,
    timestamp: Date.now(),
    ...(userMsg.displayType && { displayType: userMsg.displayType }),
    ...(userMsg.sql && { sql: userMsg.sql }),
    ...(userMsg.displayUserMessage && {
      displayUserMessage: userMsg.displayUserMessage,
    }),
    ...(userMsg.displaySchemaData && {
      displaySchemaData: userMsg.displaySchemaData,
    }),
    ...(userMsg.displayHealthIssueData && {
      displayHealthIssueData: userMsg.displayHealthIssueData,
    }),
  })

  const assistantMessageId = crypto.randomUUID()
  const modelLabel =
    getAllModelOptions(config.aiAssistantSettings).find(
      (m) => m.value === settings.model,
    )?.label ?? settings.model
  callbacks.addMessage({
    id: assistantMessageId,
    role: "assistant",
    timestamp: Date.now(),
    operationHistory: [],
    model: modelLabel,
  })

  if (config.type !== "schema_explain") {
    eventBus.publish(EventType.AI_QUERY_HIGHLIGHT, conversationId)
  }

  const provider = providerForModel(settings.model, config.aiAssistantSettings)
  if (!provider) {
    callbacks.updateMessage(conversationId, assistantMessageId, {
      error: `No provider found for model: ${settings.model}`,
    })
    return {
      success: false,
      error: `No provider found for model: ${settings.model}`,
    }
  }
  const providerSettings: ActiveProviderSettings = {
    model: settings.model,
    provider,
    apiKey: settings.apiKey,
    aiAssistantSettings: config.aiAssistantSettings,
  }

  const modelToolsClient = createModelToolsClient(
    questClient,
    hasSchemaAccess ? tables : undefined,
  )

  let latestOperationHistory: OperationHistory = []

  const handleStatusUpdate = (history: OperationHistory) => {
    latestOperationHistory = history
    callbacks.updateMessage(conversationId, assistantMessageId, {
      operationHistory: [...history],
    })
  }

  const setStatusWithHistory = (
    status: AIOperationStatus | null,
    args?: StatusArgs,
  ) => {
    callbacks.setStatus(
      status,
      { ...(args ?? {}), conversationId },
      handleStatusUpdate,
    )
  }

  const shouldGenerateTitle =
    (config.type === "chat" && config.isFirstMessage) ||
    config.type === "explain" ||
    config.type === "fix"

  if (shouldGenerateTitle) {
    void generateChatTitleIfNeeded(config, userMsg.content, callbacks)
  }

  let thinkingStatusEmitted = false
  let generatingResponseEmitted = false

  const setStatusWithHistoryAndResetFlags = (
    status: AIOperationStatus | null,
    args?: StatusArgs,
  ) => {
    if (status !== null) {
      if (status !== AIOperationStatus.Thinking) {
        thinkingStatusEmitted = false
      }
      if (status !== AIOperationStatus.GeneratingResponse) {
        generatingResponseEmitted = false
      }
    }
    setStatusWithHistory(status, args)
  }

  const streamingCallback: StreamingCallback = {
    onTextChunk: (chunk: string) => {
      if (!generatingResponseEmitted) {
        generatingResponseEmitted = true
        thinkingStatusEmitted = false
        setStatusWithHistory(AIOperationStatus.GeneratingResponse)
        callbacks.setIsStreaming(true)
      }

      const lastEntry =
        latestOperationHistory[latestOperationHistory.length - 1]
      if (
        lastEntry &&
        lastEntry.type === AIOperationStatus.GeneratingResponse
      ) {
        lastEntry.content = (lastEntry.content ?? "") + chunk
        callbacks.updateMessage(conversationId, assistantMessageId, {
          operationHistory: [...latestOperationHistory],
        })
      }
    },
    onThinkingChunk: (chunk: string) => {
      if (!thinkingStatusEmitted) {
        thinkingStatusEmitted = true
        generatingResponseEmitted = false
        setStatusWithHistory(AIOperationStatus.Thinking)
        callbacks.setIsStreaming(true)
      }
      const lastEntry =
        latestOperationHistory[latestOperationHistory.length - 1]
      if (lastEntry && lastEntry.type === AIOperationStatus.Thinking) {
        lastEntry.content = (lastEntry.content ?? "") + chunk
        callbacks.updateMessage(conversationId, assistantMessageId, {
          operationHistory: [...latestOperationHistory],
        })
      }
    },
  }

  try {
    const conversationHistory =
      config.type === "chat" ? config.conversationHistory : []

    const result = await continueConversation({
      userMessage: userMsg.content,
      conversationHistory: conversationHistory.filter((m) => !m.isCompacted),
      settings: providerSettings,
      modelToolsClient,
      setStatus: setStatusWithHistoryAndResetFlags,
      abortSignal,
      streaming: streamingCallback,
    })

    const flowResult = processResult({
      type: config.type,
      response: result,
      conversationId,
      assistantMessageId,
      callbacks,
      compactedHistory: result.compactedConversationHistory,
    })

    void trackEvent(ConsoleEvent.AI_FLOW_COMPLETE, {
      type: config.type,
      success: flowResult.success,
      hasSchemaAccess,
    })

    return flowResult
  } finally {
    await callbacks.persistMessages(conversationId)
    callbacks.setIsStreaming(false)
  }
}

export function createChatFlowConfig(
  params: Omit<ChatFlowConfig, "type">,
): ChatFlowConfig {
  return { type: "chat", ...params }
}

export function createExplainFlowConfig(
  params: Omit<ExplainFlowConfig, "type">,
): ExplainFlowConfig {
  return { type: "explain", ...params }
}

export function createFixFlowConfig(
  params: Omit<FixFlowConfig, "type">,
): FixFlowConfig {
  return { type: "fix", ...params }
}

export function createSchemaExplainFlowConfig(
  params: Omit<SchemaExplainFlowConfig, "type">,
): SchemaExplainFlowConfig {
  return { type: "schema_explain", ...params }
}

export function createHealthIssueFlowConfig(
  params: Omit<HealthIssueFlowConfig, "type">,
): HealthIssueFlowConfig {
  return { type: "health_issue", ...params }
}
