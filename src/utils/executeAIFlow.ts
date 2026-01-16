import type { Client } from "./questdb/client"
import type {
  ConversationId,
  ConversationMessage,
  UserMessageDisplayType,
  SchemaDisplayData,
} from "../providers/AIConversationProvider/types"
import type {
  OperationHistory,
  StatusArgs,
} from "../providers/AIStatusProvider"
import { AIOperationStatus } from "../providers/AIStatusProvider"
import {
  continueConversation,
  explainTableSchema,
  createModelToolsClient,
  createStreamingCallback,
  isAiAssistantError,
  generateChatTitle,
  schemaExplanationToMarkdown,
  getExplainSchemaPrompt,
  type ActiveProviderSettings,
  type GeneratedSQL,
  type AiAssistantExplanation,
  type AiAssistantAPIError,
  type TableSchemaExplanation,
  type AIOperation,
} from "./aiAssistant"
import { providerForModel, MODEL_OPTIONS } from "./aiAssistantSettings"
import { eventBus } from "../modules/EventBus"
import { EventType } from "../modules/EventBus/types"

type BaseFlowConfig = {
  conversationId: ConversationId
  settings: {
    model: string
    apiKey: string
  }
  questClient: Client
  tables?: Array<{ table_name: string; matView?: boolean }>
  hasSchemaAccess: boolean
  abortSignal?: AbortSignal
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

export type AIFlowConfig =
  | ChatFlowConfig
  | ExplainFlowConfig
  | FixFlowConfig
  | SchemaExplainFlowConfig

type AIFlowUserMessage = {
  content: string
  displayType?: UserMessageDisplayType
  sql?: string
  displayUserMessage?: string
  displaySchemaData?: SchemaDisplayData
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
  ) => Promise<void>
  replaceConversationMessages?: (
    conversationId: string,
    messages: ConversationMessage[],
  ) => void
}

export type AIFlowResult = {
  success: boolean
  error?: string
  sql?: string
  explanation?: string
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
  }
}

function formatErrorMessage(error: AiAssistantAPIError): string {
  switch (error.type) {
    case "aborted":
      return "Operation has been cancelled"
    case "network":
      return "Connection interrupted. Please check your network and try again."
    case "rate_limit":
      return "Rate limit reached. Please wait a moment and try again."
    default:
      return error.message || "An unexpected error occurred"
  }
}

type ProcessResultConfig = {
  type: AIFlowConfig["type"]
  response:
    | GeneratedSQL
    | AiAssistantExplanation
    | TableSchemaExplanation
    | AiAssistantAPIError
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
    callbacks.replaceConversationMessages(conversationId, compactedHistory)
  }

  switch (type) {
    case "chat":
    case "fix": {
      const result = response as GeneratedSQL
      return processSQLResult(
        result,
        conversationId,
        assistantMessageId,
        callbacks,
        type,
      )
    }

    case "explain": {
      const result = response as AiAssistantExplanation
      if (!result.explanation) {
        callbacks.updateMessage(conversationId, assistantMessageId, {
          error: "No explanation received from AI Assistant",
        })
        return { success: false, error: "No explanation received" }
      }

      callbacks.updateMessage(conversationId, assistantMessageId, {
        content: result.explanation,
        explanation: result.explanation,
        tokenUsage: result.tokenUsage,
      })
      return { success: true, explanation: result.explanation }
    }

    case "schema_explain": {
      const result = response as TableSchemaExplanation
      if (!result.explanation) {
        callbacks.updateMessage(conversationId, assistantMessageId, {
          error: "No explanation received from AI Assistant",
        })
        return { success: false, error: "No explanation received" }
      }

      const markdownContent = schemaExplanationToMarkdown(result)
      callbacks.updateMessage(conversationId, assistantMessageId, {
        content: markdownContent,
        explanation: markdownContent,
        tokenUsage: result.tokenUsage,
      })
      return { success: true, explanation: markdownContent }
    }
  }
}

function processSQLResult(
  result: GeneratedSQL,
  conversationId: string,
  assistantMessageId: string,
  callbacks: AIFlowCallbacks,
  type: "chat" | "fix",
): AIFlowResult {
  const hasSQLInResult = result.sql && result.sql.trim() !== ""

  if (type === "fix" && !hasSQLInResult && result.explanation) {
    callbacks.updateMessage(conversationId, assistantMessageId, {
      content: result.explanation,
      explanation: result.explanation,
      tokenUsage: result.tokenUsage,
    })
    return { success: true, explanation: result.explanation }
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

  let assistantContent = result.explanation || "Response received"
  if (hasSQLInResult) {
    assistantContent = `SQL Query:\n\`\`\`sql\n${result.sql}\n\`\`\`\n\nExplanation:\n${result.explanation || ""}`
  }

  callbacks.updateMessage(conversationId, assistantMessageId, {
    content: assistantContent,
    ...(hasSQLInResult && { sql: result.sql as string }),
    explanation: result.explanation,
    tokenUsage: result.tokenUsage,
  })

  return {
    success: true,
    sql: hasSQLInResult ? result.sql! : undefined,
    explanation: result.explanation,
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

  const provider = providerForModel(config.settings.model)
  const testModel = MODEL_OPTIONS.find(
    (m) => m.isTestModel && m.provider === provider,
  )

  if (!testModel) return

  try {
    const title = await generateChatTitle({
      firstUserMessage: userMessageContent,
      settings: {
        model: testModel.value,
        provider,
        apiKey: config.settings.apiKey,
      },
    })

    if (title) {
      await callbacks.updateConversationName(config.conversationId, title)
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
  } = config

  const userMsg = buildUserMessage(config)

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
  })

  const assistantMessageId = crypto.randomUUID()
  callbacks.addMessage({
    id: assistantMessageId,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    operationHistory: [],
  })

  if (config.type !== "schema_explain") {
    eventBus.publish(EventType.AI_QUERY_HIGHLIGHT, conversationId)
  }

  const provider = providerForModel(settings.model)
  const providerSettings: ActiveProviderSettings = {
    model: settings.model,
    provider,
    apiKey: settings.apiKey,
  }

  const modelToolsClient = createModelToolsClient(
    questClient,
    hasSchemaAccess ? tables : undefined,
  )

  const handleStatusUpdate = (history: OperationHistory) => {
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

  try {
    let response:
      | GeneratedSQL
      | AiAssistantExplanation
      | TableSchemaExplanation
      | AiAssistantAPIError
    let compactedHistory: ConversationMessage[] | undefined

    if (config.type === "schema_explain") {
      response = await explainTableSchema({
        tableName: config.tableName,
        schema: config.schema,
        kindLabel: config.kindLabel,
        settings: providerSettings,
        setStatus: setStatusWithHistory,
        abortSignal,
      })
    } else {
      const streamingCallback = createStreamingCallback({
        conversationId,
        assistantMessageId,
        updateMessage: callbacks.updateMessage,
        setIsStreaming: callbacks.setIsStreaming,
      })

      const operation: AIOperation =
        config.type === "chat" ? "followup" : config.type
      const conversationHistory =
        config.type === "chat" ? config.conversationHistory : []
      const currentSQL =
        config.type === "chat" ? config.currentSQL : config.queryText

      const result = await continueConversation({
        userMessage: userMsg.content,
        conversationHistory: conversationHistory.filter((m) => !m.isCompacted),
        currentSQL,
        settings: providerSettings,
        modelToolsClient,
        setStatus: setStatusWithHistory,
        abortSignal,
        operation,
        streaming: streamingCallback,
      })

      response = result
      compactedHistory = result.compactedConversationHistory
    }

    return processResult({
      type: config.type,
      response,
      conversationId,
      assistantMessageId,
      callbacks,
      compactedHistory,
    })
  } finally {
    callbacks.setIsStreaming(false)
    await callbacks.persistMessages(conversationId)
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
