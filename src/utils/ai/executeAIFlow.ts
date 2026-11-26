import type { UserActionDigestCapture } from "../../providers/AIConversationProvider/userActionDigest"
import type { AgentPromptImage } from "../localAgent/protocol"
import { hasInlineImages, withoutInlineImages } from "./inlineImages"
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
import {
  AIOperationStatus,
  STEERED_ABORT_REASON,
  dropTransientTail,
} from "../../providers/AIStatusProvider"
import { toolStatusOf } from "../tools/toolStatus"
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
import { providerForModel, getUtilityModel, getAllModelOptions } from "./index"
import type { AiAssistantSettings } from "../../providers/LocalStorageProvider/types"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import {
  isCurrentLocalAgentChannel,
  type LocalAgentChannel,
  type NotebookRead,
} from "../localAgent/localAgentChannel"
import {
  isLocalAgentModel,
  localAgentDisplayName,
} from "../localAgent/localAgentModel"
import { runLocalAgentTurn } from "../localAgent/runLocalAgentTurn"
import { localAgentPreferencesOf } from "../localAgent/localAgentSettings"
import {
  priorConversationFor,
  titleFromMessage,
} from "../localAgent/priorConversation"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"

// Prepended onto every user turn. buffer_id is internal — the AI must never surface it to the user.
export type NotebookFlowContext = {
  snapshot: NotebookContextSnapshot | null
  digest?: UserActionDigest
  workspace?: WorkspaceInfo
  readSeq?: number
}

const notebookReadOf = (
  ctx: NotebookFlowContext | undefined,
): NotebookRead | null =>
  ctx?.snapshot?.status === "ok" && ctx.readSeq !== undefined
    ? { bufferId: ctx.snapshot.buffer_id, readSeq: ctx.readSeq }
    : null

const localAgentDisplayNameFor = (
  channel: LocalAgentChannel | null,
  settings: AiAssistantSettings | undefined,
): string => {
  const agent = channel?.getSnapshot() ?? null
  const preferredModel =
    agent && settings
      ? localAgentPreferencesOf(settings, agent.info.id).model
      : null
  return localAgentDisplayName(agent, preferredModel)
}

const withPriorConversation = (
  message: string,
  history: ConversationMessage[],
  sessionId: string | undefined,
  currentSQL: string | undefined,
): string => {
  const prior = sessionId
    ? priorConversationFor(history, sessionId, currentSQL)
    : null
  return prior ? `${prior}\n\n${message}` : message
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
  const read = notebookReadOf(ctx)
  return createNotebookFreshness(
    read ? [[read.bufferId, read.readSeq] as const] : undefined,
  )
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
    archived?: boolean
  }
}

type BaseFlowConfig = {
  conversationId: ConversationId
  settings: {
    model: string
    apiKey: string
  }
  aiAssistantSettings?: AiAssistantSettings
  localAgentChannel?: LocalAgentChannel | null
  // Quick actions can await the cached turn before taking the active transcript.
  canDispatch?: () => boolean
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
  // Images the user attached, for an agent that reads them.
  images?: AgentPromptImage[]
  // One of the agent's commands, like /review: it goes to the agent as the
  // user wrote it, since an agent reads a command only at the start.
  agentCommand?: boolean
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
  diagnosticDetails?: {
    source: "materialized_views()" | "live_views()"
    data: string
  }
  issueGuidance?: string
  monitoringDocs: string
  trendSamples?: Array<{ value: bigint; timestamp: number }>
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
  captureUserActionDigest?: (
    conversationId: ConversationId,
  ) => UserActionDigestCapture | undefined
}

export type AIFlowResult = {
  success: boolean
  cached?: boolean
  cachedMessageId?: string
  error?: string
  sql?: string
}

// What a model reads for a tool call its answer made before the user
// stopped it: every call needs a result before the next message goes out.
export const INTERRUPTED_TOOL_RESULT =
  "The user stopped this answer before the tool returned."

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

// A message the user typed as one of the local agent's own commands.
const isAgentCommandFlow = (
  config: AIFlowConfig,
): config is ChatFlowConfig & { agentCommand: true } =>
  config.type === "chat" && config.agentCommand === true

export function buildUserMessage(config: AIFlowConfig): AIFlowUserMessage {
  if (isAgentCommandFlow(config)) {
    return {
      content: config.userMessage,
      displayUserMessage: config.userMessage,
    }
  }
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
          diagnosticDetails: config.diagnosticDetails,
          issueGuidance: config.issueGuidance,
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
  // The user replaced this answer with a new message.
  steered?: boolean
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
    steered,
  } = config

  if (isAiAssistantError(response) && response.type === "aborted" && steered) {
    return { success: false, error: formatErrorMessage(response) }
  }
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
      ...(response.contextUsage && { contextUsage: response.contextUsage }),
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
      ...(response.contextUsage && { contextUsage: response.contextUsage }),
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

  const utilityModel = getUtilityModel(provider, config.aiAssistantSettings)
  if (!utilityModel) return

  try {
    const title = await generateChatTitle({
      firstUserMessage: userMessageContent,
      settings: {
        model: utilityModel,
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

// The status and the streaming state are global, and one answer runs at a
// time. A flow that was stopped can still wind down after the next one has
// started; only the latest flow may end them.
let latestFlow = 0

export const localAgentDispatchError = (
  model: string | null,
  channel: LocalAgentChannel | null,
): string | null => {
  if (model === null || !isLocalAgentModel(model)) return null
  if (!isCurrentLocalAgentChannel(channel)) {
    return "Your agent is no longer connected."
  }
  return channel.isTransportReady()
    ? null
    : `Waiting for ${channel.info.label}. Try again after it reconnects.`
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

  const usesLocalAgent = isLocalAgentModel(settings.model)
  const localAgentChannel = usesLocalAgent
    ? (config.localAgentChannel ?? null)
    : null
  if (isAgentCommandFlow(config) && !usesLocalAgent) {
    return {
      success: false,
      error: "This command only works when your agent is selected.",
    }
  }
  const dispatchError = () => {
    if (abortSignal?.aborted || config.canDispatch?.() === false)
      return "The request is no longer active."
    return localAgentDispatchError(settings.model, localAgentChannel)
  }
  const initialError = dispatchError()
  if (initialError) return { success: false, error: initialError }

  const isAgentCommand = isAgentCommandFlow(config)
  const capturedDigest = isAgentCommand
    ? undefined
    : callbacks.captureUserActionDigest?.(conversationId)
  const userMsg = buildUserMessage(
    capturedDigest
      ? {
          ...config,
          notebookContext: {
            snapshot: null,
            ...config.notebookContext,
            digest: capturedDigest.digest,
          },
        }
      : config,
  )

  if (useLastMessage && callbacks.getLastRoundMessages) {
    const { lastUserMessage, lastAssistantMessage } =
      await callbacks.getLastRoundMessages(conversationId)

    const preparedError = dispatchError()
    if (preparedError) {
      capturedDigest?.finish(false)
      return { success: false, error: preparedError }
    }

    if (
      lastUserMessage &&
      typeof lastUserMessage.content === "string" &&
      lastUserMessage.content === userMsg.content &&
      lastAssistantMessage &&
      !lastAssistantMessage.error
    ) {
      capturedDigest?.finish(false)
      return {
        success: true,
        cached: true,
        cachedMessageId: lastUserMessage.id,
      }
    }
  }

  const flow = ++latestFlow
  const ownsLiveFlow = () => flow === latestFlow && !abortSignal?.aborted
  callbacks.addMessage({
    role: "user",
    content: userMsg.content,
    timestamp: Date.now(),
    ...(config.type === "chat" &&
      config.images?.length && { images: config.images }),
    ...(isAgentCommand && { agentCommand: true }),
    ...(userMsg.displayType && { displayType: userMsg.displayType }),
    ...(userMsg.sql && { sql: userMsg.sql }),
    ...(userMsg.displayUserMessage !== undefined && {
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
  const modelLabel = usesLocalAgent
    ? localAgentDisplayNameFor(localAgentChannel, config.aiAssistantSettings)
    : (getAllModelOptions(config.aiAssistantSettings).find(
        (m) => m.value === settings.model,
      )?.label ?? settings.model)
  const localAgentSessionId = localAgentChannel?.sessionId
  const turnStartedAt = performance.now()
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

  const provider = usesLocalAgent
    ? null
    : providerForModel(settings.model, config.aiAssistantSettings)
  if (!usesLocalAgent && !provider) {
    capturedDigest?.finish(false)
    callbacks.updateMessage(conversationId, anchorMessageId, {
      error: `No provider found for model: ${settings.model}`,
    })
    return {
      success: false,
      error: `No provider found for model: ${settings.model}`,
    }
  }
  const providerSettings: ActiveProviderSettings | null = provider
    ? {
        model: settings.model,
        provider,
        apiKey: settings.apiKey,
        aiAssistantSettings: config.aiAssistantSettings,
      }
    : null

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
  let stepsBeforeFirstAttempt: number | null = null

  // Records and notices decorate this turn's saved timeline, not the shared status or
  // the reply Markdown. If the same step keeps streaming, render its full
  // Markdown before the notice instead of splitting an open fence.
  const transcriptBlocks: Array<{
    after: number
    entry: OperationHistory[number]
  }> = []
  const publishHistory = () => {
    const history = [...latestOperationHistory]
    for (let i = transcriptBlocks.length - 1; i >= 0; i--) {
      const { after, entry } = transcriptBlocks[i]
      history.splice(after, 0, entry)
    }
    callbacks.updateMessage(conversationId, anchorMessageId, {
      operationHistory: history,
    })
  }
  const handleStatusUpdate = (history: OperationHistory) => {
    latestOperationHistory = history
    publishHistory()
  }

  // The status belongs to the running answer. A stopped flow may still wind
  // down after the next one started; it must not touch that one's status.
  const setStatusWithHistory = (
    nextStatus: AIOperationStatus | null,
    args?: StatusArgs,
  ) => {
    // A provider can clear its own status before the turn is finished. Keep
    // ownership until this flow settles; only the latest flow can release it.
    if (nextStatus === null || !ownsLiveFlow()) return
    callbacks.setStatus(nextStatus, args, handleStatusUpdate)
  }

  // Streaming state — mutable accumulators, flushed to React state via RAF
  let streamingAssistantMessageId = anchorMessageId
  let accumulatedReasoning = ""
  let reasoningTimestamp = 0
  let accumulatedToolCalls: ToolCall[] = []
  let accumulatedText = ""
  let contentTimestamp = 0
  let getQuestionTranscript: (() => string) | undefined

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
      const content = getQuestionTranscript?.() ?? accumulatedText
      if (content) {
        updates.content = content
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
      publishHistory()
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
      // A transient status with the same type still interrupts the durable
      // text entry. Start or recover a durable entry before the next chunk.
      if (args?.transient || nextStatus !== AIOperationStatus.Thinking) {
        thinkingStatusEmitted = false
      }
      if (
        args?.transient ||
        nextStatus !== AIOperationStatus.GeneratingResponse
      ) {
        generatingResponseEmitted = false
      }
    }
    setStatusWithHistory(nextStatus, args)
  }

  const shouldGenerateTitle =
    (config.type === "chat" && config.isFirstMessage) ||
    config.type === "explain" ||
    config.type === "fix"

  if (shouldGenerateTitle && usesLocalAgent) {
    const title = titleFromMessage(userMsg.displayUserMessage ?? "")
    if (title) {
      void callbacks.updateConversationName?.(conversationId, title, true)
    }
  } else if (shouldGenerateTitle) {
    void generateChatTitleIfNeeded(config, userMsg.content, callbacks)
  }

  const appendTranscriptBlock = (
    transcriptBlock: NonNullable<OperationHistory[number]["transcriptBlock"]>,
  ) => {
    if (!ownsLiveFlow()) return
    transcriptBlocks.push({
      after: dropTransientTail(latestOperationHistory).length,
      entry: {
        type: AIOperationStatus.GeneratingResponse,
        transcriptBlock,
        timestamp: Date.now(),
      },
    })
    publishHistory()
  }

  const streamingCallback: StreamingCallback = {
    // The agent's context fills as it works; the composer shows it live.
    onContextUsage: (contextUsage) => {
      if (!ownsLiveFlow()) return
      callbacks.updateMessage(conversationId, anchorMessageId, { contextUsage })
    },
    onBeforeStream: () => {
      if (!ownsLiveFlow()) return
      // A retry starts over from the steps shown before the first attempt, so
      // the failed attempt's steps and text are not shown twice.
      if (stepsBeforeFirstAttempt === null) {
        stepsBeforeFirstAttempt = latestOperationHistory.length
      } else {
        setStatusWithHistory(AIOperationStatus.Processing, {
          truncateTo: stepsBeforeFirstAttempt,
        })
      }
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
    onNotice: (notice) => appendTranscriptBlock({ kind: "notice", notice }),
    onQuestionRecord: (record, getTranscript) => {
      if (!ownsLiveFlow()) return
      getQuestionTranscript = getTranscript
      appendTranscriptBlock({ kind: "question", record })
      hasPendingStreamingUpdate = true
      scheduleUpdate()
    },
    onTextChunk: (chunk, { startSection = false } = {}) => {
      if (!ownsLiveFlow()) return
      if (contentTimestamp === 0) contentTimestamp = Date.now()
      if (startSection || !generatingResponseEmitted) {
        generatingResponseEmitted = true
        thinkingStatusEmitted = false
        setStatusWithHistory(
          AIOperationStatus.GeneratingResponse,
          startSection
            ? { markdownBlockOffset: accumulatedText.length }
            : undefined,
        )
      }
      accumulatedText += chunk
      callbacks.setIsStreaming(true)
      hasPendingStreamingUpdate = true
      scheduleUpdate()
      const lastEntry =
        latestOperationHistory[latestOperationHistory.length - 1]
      if (
        lastEntry &&
        !lastEntry.args?.transient &&
        lastEntry.type === AIOperationStatus.GeneratingResponse
      ) {
        lastEntry.content = (lastEntry.content ?? "") + chunk
        hasPendingOperationHistoryUpdate = true
        scheduleUpdate()
      }
    },
    onThinkingChunk: (chunk: string) => {
      if (!ownsLiveFlow()) return
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
      if (
        lastEntry &&
        !lastEntry.args?.transient &&
        lastEntry.type === AIOperationStatus.Thinking
      ) {
        lastEntry.content = (lastEntry.content ?? "") + chunk
        hasPendingOperationHistoryUpdate = true
        scheduleUpdate()
      }
    },
    onToolCallStart: (name) => {
      if (!ownsLiveFlow()) return
      const status = toolStatusOf(name)
      // Replaced by the tool's own status once it runs.
      if (status) setStatusWithHistoryAndResetFlags(status, { transient: true })
    },
    onToolCall: (call) => {
      if (!ownsLiveFlow()) return
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
      if (!ownsLiveFlow()) return
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
      // The tool is done; until the model's next step, "Working" shows.
      setStatusWithHistoryAndResetFlags(AIOperationStatus.GeneratingResponse, {
        transient: true,
      })
    },
    onResponseStart: () => {
      if (!ownsLiveFlow()) return
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
      // The new round's text and thinking are new steps.
      thinkingStatusEmitted = false
      generatingResponseEmitted = false
    },
  }

  const finishTranscript = () => {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    const settledHistory = dropTransientTail(latestOperationHistory)
    if (settledHistory !== latestOperationHistory) {
      latestOperationHistory = settledHistory
      hasPendingOperationHistoryUpdate = true
    }
    flushStreamingUpdate()
    cleanupOrphanedToolCallsForTurn({
      conversationId,
      callbacks,
      emittedToolCallsByMessage,
      resolvedToolCallIds,
      toolResultMessages,
    })
    callbacks.updateMessage(conversationId, anchorMessageId, {
      turnDurationMs: Math.round(performance.now() - turnStartedAt),
    })
    return callbacks.persistMessages(conversationId)
  }

  // A model reads its own earlier tool calls, so a call left without a
  // result would make the provider reject the next message. A local agent
  // keeps its own history and ends the stopped turn itself.
  const closeOpenToolCalls = () => {
    if (usesLocalAgent) return
    for (const calls of emittedToolCallsByMessage.values()) {
      for (const call of calls.values()) {
        if (resolvedToolCallIds.has(call.id)) continue
        resolvedToolCallIds.add(call.id)
        const messageId = crypto.randomUUID()
        toolResultMessages.push({ messageId, toolCallId: call.id })
        callbacks.addMessage({
          id: messageId,
          role: "tool",
          tool_call_id: call.id,
          name: call.name,
          content: INTERRUPTED_TOOL_RESULT,
          timestamp: Date.now(),
          hideFromUI: true,
        })
      }
    }
  }

  let stoppedTranscript: Promise<void> | undefined
  let cancellationResult: AIFlowResult | undefined
  // Stop settles and saves the transcript at once, while this chat still owns
  // it: the next message can go out, or another chat open, while the stopped
  // provider call or bridge turn still winds down. Whatever that call still
  // reports is dropped (see ownsLiveFlow above).
  const stopTranscript = () => {
    capturedDigest?.finish(false)
    cancellationResult = processResult({
      type: config.type,
      response: { type: "aborted", message: "" },
      conversationId,
      anchorMessageId,
      streamingAssistantMessageId,
      callbacks,
      steered: abortSignal?.reason === STEERED_ABORT_REASON,
    })
    closeOpenToolCalls()
    stoppedTranscript = finishTranscript()
    if (flow === latestFlow) callbacks.setIsStreaming(false)
  }

  setStatusWithHistory(AIOperationStatus.Processing)

  try {
    if (abortSignal?.aborted) stopTranscript()
    else abortSignal?.addEventListener("abort", stopTranscript, { once: true })
    if (!usesLocalAgent) capturedDigest?.finish(true)
    const conversationHistory =
      config.type === "chat" ? config.conversationHistory : []

    // Only a regular chat turn carries the earlier transcript. Quick
    // actions and commands must not mark those earlier turns as seen.
    const marksHistorySeen =
      localAgentSessionId !== undefined &&
      config.type === "chat" &&
      !isAgentCommand
    const result: Awaited<ReturnType<typeof continueConversation>> =
      providerSettings
        ? await continueConversation({
            userMessage: userMsg.content,
            // An agent's images stay in the chat, not in what the model reads.
            conversationHistory: conversationHistory
              .filter((m) => !m.isCompacted)
              .map((m) =>
                m.role === "assistant" &&
                typeof m.content === "string" &&
                hasInlineImages(m.content)
                  ? { ...m, content: withoutInlineImages(m.content) }
                  : m,
              ),
            settings: providerSettings,
            modelToolsClient,
            setStatus: setStatusWithHistoryAndResetFlags,
            abortSignal,
            streaming: streamingCallback,
            notebookFreshness: buildNotebookFreshness(config.notebookContext),
          })
        : await runLocalAgentTurn({
            channel: localAgentChannel,
            conversationId,
            userMessage: isAgentCommand
              ? userMsg.content
              : withPriorConversation(
                  userMsg.content,
                  conversationHistory,
                  localAgentSessionId,
                  config.type === "chat" && !config.isFirstMessage
                    ? config.currentSQL
                    : undefined,
                ),
            images: config.type === "chat" ? config.images : undefined,
            notebookRead: isAgentCommand
              ? null
              : notebookReadOf(config.notebookContext),
            setStatus: setStatusWithHistoryAndResetFlags,
            streaming: streamingCallback,
            onPromptAccepted: () => {
              capturedDigest?.finish(true)
              // The agent has read this turn's history once the bridge runs
              // the prompt, even if the turn is then stopped or fails. The
              // bridge refuses a prompt while a stopped turn still runs.
              if (marksHistorySeen) {
                callbacks.updateMessage(conversationId, anchorMessageId, {
                  localAgentSessionId,
                })
              }
            },
            abortSignal,
          })

    const originalContent = new Map(
      conversationHistory.map((message) => [message.id, message.content]),
    )
    const compactedHistory = result.compactedConversationHistory?.map(
      (message) =>
        originalContent.has(message.id)
          ? { ...message, content: originalContent.get(message.id)! }
          : message,
    )
    const flowResult =
      cancellationResult ??
      processResult({
        type: config.type,
        response: result,
        conversationId,
        anchorMessageId,
        streamingAssistantMessageId,
        callbacks,
        compactedHistory,
        steered: abortSignal?.reason === STEERED_ABORT_REASON,
      })

    void trackEvent(ConsoleEvent.AI_FLOW_COMPLETE, {
      type: config.type,
      success: flowResult.success,
      hasSchemaAccess,
    })

    return flowResult
  } finally {
    abortSignal?.removeEventListener("abort", stopTranscript)
    capturedDigest?.finish(false)
    try {
      if (stoppedTranscript !== undefined) await stoppedTranscript
      else await finishTranscript()
    } finally {
      if (stoppedTranscript === undefined && flow === latestFlow) {
        callbacks.setIsStreaming(false)
        // A stopped flow leaves status and cancellation ownership to Stop.
        if (!abortSignal?.aborted) callbacks.setStatus(null)
      }
    }
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
