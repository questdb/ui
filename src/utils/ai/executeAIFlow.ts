import type { Client } from "../questdb/client"
import type { Table } from "../questdb/types"
import type {
  ConversationId,
  ConversationMessage,
  UserMessageDisplayType,
  SchemaDisplayData,
  HealthIssueDisplayData,
  UserActionDigest,
} from "../../providers/AIConversationProvider/types"
import {
  formatNotebookContextPrefix,
  type NotebookContextSnapshot,
} from "./notebookSnapshot"
import type {
  OperationHistory,
  StatusArgs,
} from "../../providers/AIStatusProvider"
import { AIOperationStatus } from "../../providers/AIStatusProvider"
import {
  createNotebookFreshness,
  type NotebookFreshness,
} from "../notebooks/notebookFreshness"
import type { ToolCall } from "./index"
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
import { getExplainSchemaPrompt, getHealthIssuePrompt } from "./index"
import { providerForModel, getTestModel, getAllModelOptions } from "./index"
import type { AiAssistantSettings } from "../../providers/LocalStorageProvider/types"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"

// Prepended onto every user turn. buffer_id is internal — the AI must never surface it to the user.
export type NotebookFlowContext = {
  snapshot: NotebookContextSnapshot | null
  digest?: UserActionDigest
  workspace?: WorkspaceInfo
  readSeq?: number
}

// Per-turn freshness tracker for the flow. Seeded with the bound notebook's
// action seq when the chat has an up-to-date snapshot; otherwise empty. Always
// a real tracker (never undefined) so a flow with no notebook context — a
// Fix/Explain quick action, or a chat before any notebook is open — can still
// record a read (get_notebook_state) and then mutate a notebook. An undefined
// tracker would strand the gate at STATE_NOT_FETCHED forever: recordRead would
// have nowhere to write, so the prescribed recovery could never take effect.
export const buildNotebookFreshness = (
  ctx: NotebookFlowContext | undefined,
): NotebookFreshness => {
  const seed =
    ctx?.snapshot?.status === "ok" && ctx.readSeq !== undefined
      ? [[ctx.snapshot.buffer_id, ctx.readSeq] as const]
      : undefined
  return createNotebookFreshness(seed)
}

export type WorkspaceInfo = {
  notebooks: Array<{
    buffer_id: number
    label: string
    archived: boolean
    bound_to_this_chat?: boolean
  }>
  active?: {
    buffer_id: number
    label: string
    kind: "notebook" | "sql" | "metrics" | "other"
  }
}

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
  // Set only when the conversation has a notebookBufferId; absent keeps non-notebook flows unchanged.
  notebookContext?: NotebookFlowContext
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
  removeMessages?: (messageIdsToRemove: string[]) => void
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
  updateMessagesWithCompaction?: (messages: ConversationMessage[]) => void
  getLastRoundMessages?: (conversationId: ConversationId) => Promise<{
    lastUserMessage?: ConversationMessage
    lastAssistantMessage?: ConversationMessage
  }>
  bindConversationToNotebook?: (
    conversationId: ConversationId,
    bufferId: number,
  ) => Promise<void>
  rotateUserActionDigest?: (conversationId: ConversationId) => void
}

export type AIFlowResult = {
  success: boolean
  cached?: boolean
  cachedMessageId?: string
  error?: string
  sql?: string
}

function cleanupOrphanedToolCallsForTurn(params: {
  conversationId: ConversationId
  callbacks: Pick<AIFlowCallbacks, "updateMessage" | "removeMessages">
  emittedToolCallsByMessage: Map<string, Map<string, ToolCall>>
  resolvedToolCallIds: Set<string>
  toolResultMessages: Array<{ messageId: string; toolCallId: string }>
}) {
  const {
    conversationId,
    callbacks,
    emittedToolCallsByMessage,
    resolvedToolCallIds,
    toolResultMessages,
  } = params

  const emittedToolCallIds = new Set<string>()
  for (const [messageId, callsById] of emittedToolCallsByMessage.entries()) {
    const allCalls = [...callsById.values()]
    for (const call of allCalls) emittedToolCallIds.add(call.id)
    const resolvedCalls = allCalls.filter((call) =>
      resolvedToolCallIds.has(call.id),
    )

    if (resolvedCalls.length !== allCalls.length) {
      callbacks.updateMessage(conversationId, messageId, {
        tool_calls: resolvedCalls.length > 0 ? resolvedCalls : undefined,
      })
    }
  }

  if (!callbacks.removeMessages) return

  const orphanedToolResultMessageIds = toolResultMessages
    .filter((result) => !emittedToolCallIds.has(result.toolCallId))
    .map((result) => result.messageId)

  if (orphanedToolResultMessageIds.length > 0) {
    callbacks.removeMessages(orphanedToolResultMessageIds)
  }
}

export function buildUserMessage(config: AIFlowConfig): AIFlowUserMessage {
  const prefix = formatNotebookContextPrefix(
    config.notebookContext?.snapshot ?? null,
    config.notebookContext?.digest,
    config.notebookContext?.workspace,
  )

  const msg = buildFlowSpecificUserMessage(config)
  if (!prefix) return msg
  return { ...msg, content: `${prefix}${msg.content}` }
}

function buildFlowSpecificUserMessage(config: AIFlowConfig): AIFlowUserMessage {
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

      // displayUserMessage preserves the raw user input so prefix tags don't leak into chat bubbles.
      return { content: userMessage, displayUserMessage: userMessage }
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
  anchorMessageId: string
  streamingAssistantMessageId: string
  callbacks: AIFlowCallbacks
  compactedHistory?: ConversationMessage[]
}

function processResult(config: ProcessResultConfig): AIFlowResult {
  const {
    type,
    response,
    conversationId,
    anchorMessageId,
    streamingAssistantMessageId,
    callbacks,
    compactedHistory,
  } = config

  if (isAiAssistantError(response)) {
    const errorMessage = formatErrorMessage(response)
    callbacks.updateMessage(conversationId, anchorMessageId, {
      error: errorMessage,
    })
    return { success: false, error: errorMessage }
  }

  if (compactedHistory && callbacks.updateMessagesWithCompaction) {
    callbacks.updateMessagesWithCompaction(compactedHistory)
  }

  const hasSQLInResult = response.sql && response.sql.trim() !== ""

  if (streamingAssistantMessageId !== anchorMessageId) {
    // Multi-message turn (tool calls): anchor holds metadata, last assistant holds content
    callbacks.updateMessage(conversationId, anchorMessageId, {
      ...(hasSQLInResult && { sql: response.sql as string }),
      tokenUsage: response.tokenUsage,
    })
    if (response.explanation) {
      callbacks.updateMessage(conversationId, streamingAssistantMessageId, {
        content: response.explanation,
      })
    }
  } else {
    // Single assistant message — anchor IS the current message
    callbacks.updateMessage(conversationId, anchorMessageId, {
      ...(response.explanation && { content: response.explanation }),
      ...(hasSQLInResult && { sql: response.sql as string }),
      tokenUsage: response.tokenUsage,
    })
  }

  if (type === "fix" && !hasSQLInResult && !response.explanation) {
    callbacks.updateMessage(conversationId, anchorMessageId, {
      error: "No fixed query or explanation received from AI Assistant",
    })
    return {
      success: false,
      error: "No fixed query or explanation received",
    }
  }

  return {
    success: true,
    sql: hasSQLInResult ? response.sql! : undefined,
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

  callbacks.rotateUserActionDigest?.(conversationId)

  if (useLastMessage && callbacks.getLastRoundMessages) {
    const { lastUserMessage, lastAssistantMessage } =
      await callbacks.getLastRoundMessages(conversationId)

    if (
      lastUserMessage &&
      typeof lastUserMessage.content === "string" &&
      lastUserMessage.content === userMsg.content &&
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

  // Create turn anchor — first assistant message of this turn
  const anchorMessageId = crypto.randomUUID()
  const modelLabel =
    getAllModelOptions(config.aiAssistantSettings).find(
      (m) => m.value === settings.model,
    )?.label ?? settings.model
  callbacks.addMessage({
    id: anchorMessageId,
    role: "assistant",
    content: null,
    timestamp: Date.now(),
    model: modelLabel,
  })

  if (config.type !== "schema_explain") {
    eventBus.publish(EventType.AI_QUERY_HIGHLIGHT, conversationId)
  }

  const provider = providerForModel(settings.model, config.aiAssistantSettings)
  if (!provider) {
    callbacks.updateMessage(conversationId, anchorMessageId, {
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

  // Threads conversationId + bind callback so an AI-initiated notebook auto-binds an unbound chat.
  // abortSignal lets a pending registration wait reject the moment the user presses Abort.
  const modelToolsClient = createModelToolsClient(
    questClient,
    hasSchemaAccess ? tables : undefined,
    {
      conversationId,
      bindNotebook: callbacks.bindConversationToNotebook,
      abortSignal,
    },
  )

  let latestOperationHistory: OperationHistory = []

  const handleStatusUpdate = (history: OperationHistory) => {
    latestOperationHistory = history
    callbacks.updateMessage(conversationId, anchorMessageId, {
      operationHistory: [...history],
    })
  }

  const setStatusWithHistory = (
    nextStatus: AIOperationStatus | null,
    args?: StatusArgs,
  ) => {
    callbacks.setStatus(nextStatus, args, handleStatusUpdate)
  }

  // Streaming state — mutable accumulators, flushed to React state via RAF
  let streamingAssistantMessageId = anchorMessageId
  let accumulatedReasoning = ""
  let reasoningTimestamp = 0
  let accumulatedToolCalls: ToolCall[] = []
  let accumulatedText = ""
  let contentTimestamp = 0

  let rafId = 0
  let hasPendingStreamingUpdate = false
  let hasPendingOperationHistoryUpdate = false
  const emittedToolCallsByMessage = new Map<string, Map<string, ToolCall>>()
  const resolvedToolCallIds = new Set<string>()
  const toolResultMessages: Array<{ messageId: string; toolCallId: string }> =
    []
  const streamingMessageIds: string[] = []

  const flushStreamingUpdate = () => {
    rafId = 0
    if (hasPendingStreamingUpdate) {
      hasPendingStreamingUpdate = false
      const updates: Partial<ConversationMessage> = {}
      if (accumulatedReasoning)
        updates.reasoning = {
          timestamp: reasoningTimestamp,
          content: accumulatedReasoning,
        }
      if (accumulatedToolCalls.length > 0)
        updates.tool_calls = [...accumulatedToolCalls]
      if (accumulatedText) {
        updates.content = accumulatedText
        if (contentTimestamp) updates.contentTimestamp = contentTimestamp
      }
      callbacks.updateMessage(
        conversationId,
        streamingAssistantMessageId,
        updates,
      )
    }
    if (hasPendingOperationHistoryUpdate) {
      hasPendingOperationHistoryUpdate = false
      callbacks.updateMessage(conversationId, anchorMessageId, {
        operationHistory: [...latestOperationHistory],
      })
    }
  }

  const scheduleUpdate = () => {
    if (!rafId) {
      rafId = requestAnimationFrame(flushStreamingUpdate)
    }
  }

  let thinkingStatusEmitted = false
  let generatingResponseEmitted = false

  const setStatusWithHistoryAndResetFlags = (
    nextStatus: AIOperationStatus | null,
    args?: StatusArgs,
  ) => {
    if (nextStatus !== null) {
      if (nextStatus !== AIOperationStatus.Thinking) {
        thinkingStatusEmitted = false
      }
      if (nextStatus !== AIOperationStatus.GeneratingResponse) {
        generatingResponseEmitted = false
      }
    }
    setStatusWithHistory(nextStatus, args)
  }

  const shouldGenerateTitle =
    (config.type === "chat" && config.isFirstMessage) ||
    config.type === "explain" ||
    config.type === "fix"

  if (shouldGenerateTitle) {
    void generateChatTitleIfNeeded(config, userMsg.content, callbacks)
  }

  const streamingCallback: StreamingCallback = {
    onBeforeStream: () => {
      // Cancel any pending RAF from a previous failed attempt
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = 0
      }
      hasPendingStreamingUpdate = false
      hasPendingOperationHistoryUpdate = false

      // Remove messages created during a previous failed streaming attempt
      if (streamingMessageIds.length > 0) {
        callbacks.removeMessages?.(streamingMessageIds)
        streamingMessageIds.length = 0
      }

      // Reset tracking state
      emittedToolCallsByMessage.clear()
      resolvedToolCallIds.clear()
      toolResultMessages.length = 0

      // Reset accumulators to initial state
      streamingAssistantMessageId = anchorMessageId
      accumulatedReasoning = ""
      reasoningTimestamp = 0
      accumulatedToolCalls = []
      accumulatedText = ""
      contentTimestamp = 0

      // Reset status flags
      thinkingStatusEmitted = false
      generatingResponseEmitted = false

      // Clear any partial content flushed to the anchor during the failed attempt
      callbacks.updateMessage(conversationId, anchorMessageId, {
        content: null,
        reasoning: undefined,
        tool_calls: undefined,
      })
    },
    onTextChunk: (chunk: string) => {
      if (contentTimestamp === 0) contentTimestamp = Date.now()
      if (!generatingResponseEmitted) {
        generatingResponseEmitted = true
        thinkingStatusEmitted = false
        setStatusWithHistory(AIOperationStatus.GeneratingResponse)
      }
      accumulatedText += chunk
      callbacks.setIsStreaming(true)
      hasPendingStreamingUpdate = true
      scheduleUpdate()
      const lastEntry =
        latestOperationHistory[latestOperationHistory.length - 1]
      if (
        lastEntry &&
        lastEntry.type === AIOperationStatus.GeneratingResponse
      ) {
        lastEntry.content = (lastEntry.content ?? "") + chunk
        hasPendingOperationHistoryUpdate = true
        scheduleUpdate()
      }
    },
    onThinkingChunk: (chunk: string) => {
      if (reasoningTimestamp === 0) reasoningTimestamp = Date.now()
      if (!thinkingStatusEmitted) {
        thinkingStatusEmitted = true
        generatingResponseEmitted = false
        setStatusWithHistory(AIOperationStatus.Thinking)
      }
      accumulatedReasoning += chunk
      callbacks.setIsStreaming(true)
      hasPendingStreamingUpdate = true
      scheduleUpdate()
      const lastEntry =
        latestOperationHistory[latestOperationHistory.length - 1]
      if (lastEntry && lastEntry.type === AIOperationStatus.Thinking) {
        lastEntry.content = (lastEntry.content ?? "") + chunk
        hasPendingOperationHistoryUpdate = true
        scheduleUpdate()
      }
    },
    onToolCall: (call) => {
      const toolCall: ToolCall = {
        id: call.id,
        name: call.name,
        arguments: call.arguments,
        timestamp: Date.now(),
      }
      accumulatedToolCalls.push(toolCall)
      let callsForMessage = emittedToolCallsByMessage.get(
        streamingAssistantMessageId,
      )
      if (!callsForMessage) {
        callsForMessage = new Map<string, ToolCall>()
        emittedToolCallsByMessage.set(
          streamingAssistantMessageId,
          callsForMessage,
        )
      }
      callsForMessage.set(toolCall.id, toolCall)
      hasPendingStreamingUpdate = true
      scheduleUpdate()
    },
    onToolResult: (result) => {
      resolvedToolCallIds.add(result.tool_call_id)
      const toolResultMessageId = crypto.randomUUID()
      toolResultMessages.push({
        messageId: toolResultMessageId,
        toolCallId: result.tool_call_id,
      })
      streamingMessageIds.push(toolResultMessageId)
      // Flush any pending updates for current assistant message before adding tool message
      if (hasPendingStreamingUpdate) {
        if (rafId) {
          cancelAnimationFrame(rafId)
          rafId = 0
        }
        flushStreamingUpdate()
      }
      callbacks.addMessage({
        id: toolResultMessageId,
        role: "tool",
        tool_call_id: result.tool_call_id,
        name: result.name,
        content: result.content,
        timestamp: Date.now(),
        hideFromUI: true,
      })
    },
    onResponseStart: () => {
      // Flush pending updates for current assistant before creating new one
      if (hasPendingStreamingUpdate) {
        if (rafId) {
          cancelAnimationFrame(rafId)
          rafId = 0
        }
        flushStreamingUpdate()
      }
      // Create new assistant message for the follow-up response
      const newId = crypto.randomUUID()
      callbacks.addMessage({
        id: newId,
        role: "assistant",
        content: null,
        timestamp: Date.now(),
      })
      streamingMessageIds.push(newId)
      // Reset accumulators
      streamingAssistantMessageId = newId
      accumulatedReasoning = ""
      reasoningTimestamp = 0
      accumulatedToolCalls = []
      accumulatedText = ""
      contentTimestamp = 0
    },
  }

  setStatusWithHistory(AIOperationStatus.Processing)

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
      notebookFreshness: buildNotebookFreshness(config.notebookContext),
    })

    const flowResult = processResult({
      type: config.type,
      response: result,
      conversationId,
      anchorMessageId,
      streamingAssistantMessageId,
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
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    flushStreamingUpdate()
    cleanupOrphanedToolCallsForTurn({
      conversationId,
      callbacks,
      emittedToolCallsByMessage,
      resolvedToolCallIds,
      toolResultMessages,
    })
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
