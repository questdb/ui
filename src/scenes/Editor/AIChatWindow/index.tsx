import type { CommandNoteEntry } from "./CommandNote"
import { isCurrentLocalAgentChannel } from "../../../utils/localAgent/localAgentChannel"
import { LOCAL_AGENT_MODEL } from "../../../utils/localAgent/localAgentModel"
import { useLocalAgentChannel } from "../../../utils/localAgent/LocalAgentContext"
import React, {
  useMemo,
  useState,
  useRef,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
} from "react"
import type { MutableRefObject } from "react"
import styled from "styled-components"
import { Button, Box, Drawer, Text } from "../../../components"
import { AISparkle } from "../../../components/AISparkle"
import { ExplainQueryButton } from "../../../components/ExplainQueryButton"
import { FixQueryButton } from "../../../components/FixQueryButton"
import {
  PlusIcon,
  XIcon,
  ClockCounterClockwiseIcon,
} from "@phosphor-icons/react"
import { useEditor } from "../../../providers"
import {
  useAIConversation,
  useActiveConversationMessages,
} from "../../../providers/AIConversationProvider"
import { extractErrorByQueryKey } from "../utils"
import {
  createDetachedQueryKey,
  getQueryInfoFromKey,
  normalizeQueryText,
} from "../Monaco/utils"
import type { ExecutionRefs } from "../index"
import { trimSemicolonForDisplay } from "../../../providers/AIConversationProvider/utils"
import {
  isBlockingAIStatus,
  useAIStatus,
} from "../../../providers/AIStatusProvider"
import { toast } from "../../../components/Toast"
import { color } from "../../../utils"
import { LiteEditor } from "../../../components/LiteEditor"
import { ChatMessages } from "./ChatMessages"
import {
  ChatInput,
  canDeliverQueued,
  queuedAgentModel,
  type QueuedEntry,
  type ChatInputHandle,
  type ChatQueue,
} from "./ChatInput"
import {
  latestContextUsage,
  totalTokenUsage,
} from "../../../utils/ai/tokenCount"
import { ChatHistoryView } from "./ChatHistoryView"
import { normalizeSql } from "../../../utils/formatSql"
import {
  executeAIFlow,
  createChatFlowConfig,
  createExplainFlowConfig,
  createFixFlowConfig,
  createSchemaExplainFlowConfig,
} from "../../../utils/ai/executeAIFlow"
import { getTableKind, getTableKindLabel } from "../../../utils/questdb/types"
import * as QuestDB from "../../../utils/questdb"
import { QuestContext } from "../../../providers/QuestProvider"
import { useDispatch, useSelector } from "react-redux"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"
import { actions, selectors } from "../../../store"
import { NotificationType } from "../../../store/Query/types"
import type { QueryKey } from "../../../store/Query/types"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"
import { Stop } from "../../../components/icons"
import { CircleNotchSpinner } from "../Monaco/icons"
import { getBufferActionSeq } from "../../../utils/notebooks/notebookAIBridge"
import { buildSnapshot } from "../../../utils/ai/notebookSnapshot"
import type {
  AIFlowConfig,
  NotebookFlowContext,
  WorkspaceInfo,
} from "../../../utils/ai/executeAIFlow"
import { QueryInNotification } from "../Monaco/query-in-notification"
import { useQueryExecutionState } from "../../../hooks/useQueryExecutionState"
import { getLastTurnWithUnactionedDiff } from "../../../utils/ai/turnView"
import { runDetachedQuery } from "../../../utils/runDetachedQuery"

const CancelButton = styled(Button)`
  padding: 1.2rem 0.6rem;
`

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
  min-width: 0;
  overflow: hidden;
`

const HeaderTitle = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 1.6rem;
`

const HeaderButton = styled(Button).attrs({ variant: "ghost" })`
  padding: 0.6rem;
`

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
`

const ChatWindowContent = styled.div`
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: ${({ theme }) => theme.color.surfaceRaised};
`

const InitialQueryContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
`

const InitialQueryBox = styled.div`
  display: flex;
  flex-direction: column;
  align-self: flex-end;
  flex-shrink: 0;
  overflow: hidden;
  width: 100%;
`

const InitialQueryEditor = styled.div`
  width: 100%;
  overflow: hidden;
`

const ButtonContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 1rem;
  width: 100%;
  margin-top: 0.5rem;
`

const BlankChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 1.2rem;
  padding: 1.8rem;
  flex: 1 1 auto;
  min-height: 0;
  max-width: 40rem;
  text-align: center;
  margin: 0 auto;
`

const BlankChatHeading = styled.h2`
  font-size: 2rem;
  font-weight: 600;
  text-align: left;
  color: ${color("contentPrimary")};
  margin: 0;
`

const BlankChatSubheading = styled.p`
  font-size: 1.4rem;
  font-weight: 400;
  color: ${color("contentSecondary")};
  text-align: left;
  margin: 0;
  line-height: 1.5;
`

const ChatPanel = styled(Box)`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  height: 100%;
  width: 100%;
  gap: 0;
  background: ${({ theme }) => theme.color.surfaceRaised};
`

const AIChatWindow: React.FC = () => {
  const dispatch = useDispatch()
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)
  const { quest, questExecution } = useContext(QuestContext)
  const {
    editorRef,
    showPreviewBuffer,
    closePreviewBuffer,
    addBuffer,
    executionRefs,
    highlightQuery,
    buffers,
    activeBuffer,
    setActiveBuffer,
  } = useEditor()
  const activeConversationMessages = useActiveConversationMessages()
  const {
    conversationMetas,
    chatWindowState,
    isLoadingMessages,
    getChatDispatchState,
    setHasPendingSubmission,
    isStreaming,
    setIsStreaming,
    scrollToMessageId,
    setScrollToMessageId,
    closeChatWindow,
    openBlankChatWindow,
    openHistoryView,
    closeHistoryView,
    getConversationMeta,
    addMessage,
    removeMessages,
    updateMessage,
    updateMessagesWithCompaction,
    updateConversationName,
    acceptSuggestion,
    rejectSuggestion,
    persistMessages,
    bindConversationToNotebook,
    readUserActionDigest,
    rotateUserActionDigest,
  } = useAIConversation()
  const {
    status: aiStatus,
    isOperationBlocking,
    setStatus,
    abortController,
    canUse,
    hasSchemaAccess,
    currentModel,
    apiKey,
    aiAssistantSettings,
  } = useAIStatus()
  const localAgentChannel = useLocalAgentChannel()
  const tables = useSelector(selectors.query.getTables)
  const { active: activeExecution } = useQueryExecutionState()
  const runningQueryKey = activeExecution?.queryKey ?? null

  const conversationMeta = chatWindowState.activeConversationId
    ? getConversationMeta(chatWindowState.activeConversationId)
    : null

  const conversation = useMemo(() => {
    if (!conversationMeta) return null
    return { ...conversationMeta, messages: activeConversationMessages }
  }, [conversationMeta, activeConversationMessages])

  const notificationNamespaceKey = useMemo(() => {
    if (!conversation) return -1
    if (conversation.bufferId !== undefined) {
      return conversation.bufferId
    }
    return conversation.id
  }, [conversation?.bufferId, conversation?.id])

  const queryNotifications = useSelector(
    selectors.query.getQueryNotificationsForBuffer(notificationNamespaceKey),
  )

  // Ref for ChatInput to programmatically focus
  const chatInputRef = useRef<ChatInputHandle>(null)
  // Keep submitted follow-ups when closing the drawer unmounts the composer.
  const [chatQueue, setChatQueueState] = useState<ChatQueue>({})
  const chatQueueRef = useRef(chatQueue)
  const setChatQueue = useCallback(
    (update: (current: ChatQueue) => ChatQueue) => {
      const previous = chatQueueRef.current
      const next = update(previous)
      if (next === previous) return false
      chatQueueRef.current = next
      // Publish synchronously; close/switch can run before the queue renders.
      for (const id of Object.keys(previous)) {
        if (!next[id]) setHasPendingSubmission(id, false)
      }
      for (const id of Object.keys(next)) {
        if (!previous[id]) setHasPendingSubmission(id, true)
      }
      setChatQueueState(next)
      return true
    },
    [setHasPendingSubmission],
  )
  const hasAutoFocusedRef = useRef(false)
  const notificationTimeoutRef = useRef<number | null>(null)

  const currentSQL = useMemo(() => {
    return trimSemicolonForDisplay(conversation?.currentSQL)
  }, [conversation?.currentSQL])

  const queryInfo = useMemo(() => {
    return getQueryInfoFromKey(conversation?.queryKey)
  }, [conversation?.queryKey])

  const messages = activeConversationMessages
  const contextUsage = useMemo(() => latestContextUsage(messages), [messages])
  const chatTokens = useMemo(() => totalTokenUsage(messages), [messages])

  const hasUnactionedDiff = useMemo(() => {
    return getLastTurnWithUnactionedDiff(messages) !== null
  }, [messages])

  // What the console commands the user ran did, per chat. They are for the
  // user only, kept for the session, and never sent to a model.
  const [commandNotes, setCommandNotes] = useState<
    Record<string, CommandNoteEntry[]>
  >({})
  const activeCommandNotes = chatWindowState.activeConversationId
    ? (commandNotes[chatWindowState.activeConversationId] ?? [])
    : []
  const addCommandNote = (note: {
    command: string
    text: string
    error: boolean
  }) => {
    const conversationId = chatWindowState.activeConversationId
    if (!conversationId) return
    setCommandNotes((current) => ({
      ...current,
      [conversationId]: [
        ...(current[conversationId] ?? []),
        {
          ...note,
          id: crypto.randomUUID(),
          afterMessageId: messages[messages.length - 1]?.id ?? null,
        },
      ],
    }))
  }

  const shouldShowMessages = useMemo(() => {
    return (
      (messages.length > 0 || activeCommandNotes.length > 0) &&
      !isLoadingMessages
    )
  }, [messages, activeCommandNotes.length, isLoadingMessages])

  const shouldShowExplainButton = useMemo(() => {
    return (
      messages.length === 0 &&
      currentSQL &&
      currentSQL.trim() !== "\n" &&
      canUse &&
      !isBlockingAIStatus(aiStatus)
    )
  }, [messages.length, currentSQL, canUse, aiStatus])

  const hasErrorForCurrentQuery = useMemo(() => {
    if (
      !shouldShowExplainButton ||
      !conversation ||
      !conversation.queryKey ||
      !conversation.bufferId ||
      !editorRef.current
    ) {
      return false
    }

    const errorInfo = extractErrorByQueryKey(
      conversation.queryKey,
      conversation.bufferId,
      executionRefs as MutableRefObject<ExecutionRefs> | undefined,
      editorRef,
    )
    return errorInfo !== null
  }, [shouldShowExplainButton, conversation, editorRef, executionRefs])

  const shouldShowFixButton =
    shouldShowExplainButton &&
    hasErrorForCurrentQuery &&
    canUse &&
    !isBlockingAIStatus(aiStatus)

  const isHistoryOpen = chatWindowState.isHistoryOpen ?? false
  const hasConversations = conversationMetas.size > 0

  const addButtonDisabled = useMemo(() => {
    if (isBlockingAIStatus(aiStatus)) return true
    if (!conversation) return false
    return (
      conversation.messages.length === 0 &&
      !conversation.queryKey &&
      !conversation.tableId
    )
  }, [conversation, aiStatus])

  const headerTitle = useMemo(() => {
    if (isHistoryOpen) {
      return "Chat history"
    }

    if (!conversation) return ""

    if (conversation.conversationName) {
      return conversation.conversationName
    }

    // Otherwise, show a generic title based on the flow type
    // Check the first message's displayType to determine the flow
    const firstMessage = conversation.messages[0]
    if (firstMessage?.displayType) {
      switch (firstMessage.displayType) {
        case "fix_request":
          return "Fix query"
        case "explain_request":
          return "Explain query"
        case "ask_request":
          return "Ask AI"
        case "health_issue_request":
          return "Health issue analysis"
        default:
          return "AI Assistant"
      }
    }

    return "AI Assistant"
  }, [conversation, isHistoryOpen])

  const handleHistoryToggle = useCallback(() => {
    if (isHistoryOpen) {
      void closeHistoryView()
    } else {
      openHistoryView()
    }
  }, [isHistoryOpen, closeHistoryView, openHistoryView])

  const getPlaceholder = () => {
    if (messages.length > 0) {
      return "Ask a follow up question or request refinement..."
    }
    if (conversation?.tableId != null || currentSQL?.trim()) {
      return "Ask a question or request an edit..."
    }
    return "Ask AI about your tables, or generate a query..."
  }

  // <workspace> always emits when tabs exist so unbound chats can resolve user-said labels to buffer_ids.
  const buildNotebookFlowContext = useCallback(
    async (
      conversationId: string,
    ): Promise<NotebookFlowContext | undefined> => {
      const meta = getConversationMeta(conversationId)
      const bufferId = meta?.notebookBufferId
      const readSeq =
        typeof bufferId === "number" ? getBufferActionSeq(bufferId) : undefined
      const snapshot = bufferId
        ? await buildSnapshot(bufferId).catch((err) => {
            console.warn(
              "Notebook snapshot unavailable, sending without it",
              err,
            )
            return null
          })
        : null
      const digest = readUserActionDigest(conversationId)
      const notebookBuffers = buffers.filter(
        (b) => !!b.notebookViewState && typeof b.id === "number",
      )
      const workspace: WorkspaceInfo | undefined =
        notebookBuffers.length > 0 || typeof activeBuffer.id === "number"
          ? {
              notebooks: notebookBuffers.map((b) => ({
                buffer_id: b.id as number,
                label: b.label,
                archived: !!b.archived,
                ...(b.id === bufferId ? { bound_to_this_chat: true } : {}),
              })),
              active:
                typeof activeBuffer.id === "number"
                  ? {
                      buffer_id: activeBuffer.id,
                      label: activeBuffer.label,
                      kind: activeBuffer.notebookViewState
                        ? "notebook"
                        : activeBuffer.metricsViewState
                          ? "metrics"
                          : activeBuffer.editorViewState
                            ? "sql"
                            : "other",
                    }
                  : undefined,
            }
          : undefined
      if (!snapshot && !digest && !workspace) return undefined
      return { snapshot, digest, workspace, readSeq }
    },
    [getConversationMeta, readUserActionDigest, buffers, activeBuffer],
  )

  const conversationId = chatWindowState.activeConversationId
  const queued = conversationId ? chatQueue[conversationId] : undefined
  const canDispatchQueued = (entry: QueuedEntry) => {
    const agent = localAgentChannel?.getSnapshot() ?? null
    return (
      canUse &&
      !isLoadingMessages &&
      !isOperationBlocking() &&
      !abortController?.signal.aborted &&
      (currentModel !== LOCAL_AGENT_MODEL ||
        isCurrentLocalAgentChannel(localAgentChannel)) &&
      canDeliverQueued(
        entry,
        currentModel,
        localAgentChannel,
        currentModel === LOCAL_AGENT_MODEL && agent?.acceptsImages === true,
        queuedAgentModel(agent, aiAssistantSettings),
      )
    )
  }
  const preparingQueued = useRef(new Set<string>())
  const [, setQueuePreparation] = useState(0)
  const dispatchQueuedRef = useRef<
    | ((
        id: string,
        owner: symbol,
        entry: QueuedEntry,
        notebookContext: NotebookFlowContext | undefined,
      ) => void)
    | null
  >(null)

  // Only the committed conversation and target may use the active transcript.
  useLayoutEffect(() => {
    dispatchQueuedRef.current = (id, owner, entry, notebookContext) => {
      const active = getChatDispatchState(id)
      if (
        conversationId !== id ||
        !conversation ||
        !canUse ||
        active?.owner !== owner ||
        active.messages !== conversation.messages ||
        chatQueueRef.current[id] !== entry ||
        !canDispatchQueued(entry)
      )
        return

      void trackEvent(ConsoleEvent.AI_CHAT_SEND)
      if (hasUnactionedDiff) void closePreviewBuffer()

      void executeAIFlow(
        createChatFlowConfig({
          conversationId: id,
          userMessage: entry.text,
          ...(entry.images.length > 0 && { images: entry.images }),
          ...(entry.agentCommand && { agentCommand: true }),
          currentSQL,
          conversationHistory: conversation.messages,
          isFirstMessage: !conversation.messages.some(
            (msg) => msg.role === "assistant",
          ),
          settings: { model: currentModel, apiKey },
          localAgentChannel: entry.channel,
          aiAssistantSettings,
          questClient: quest,
          tables,
          hasSchemaAccess,
          abortSignal: abortController?.signal,
          notebookContext,
        }),
        {
          addMessage,
          removeMessages,
          updateMessage,
          setStatus,
          setIsStreaming,
          persistMessages,
          updateConversationName,
          bindConversationToNotebook,
          rotateUserActionDigest,
          updateMessagesWithCompaction,
        },
      )
      // The flow has synchronously added the first message before releasing
      // protection from empty-chat cleanup.
      setChatQueue((current) => {
        if (current[id] !== entry) return current
        const { [id]: _sent, ...rest } = current
        return rest
      })
    }
    return () => {
      dispatchQueuedRef.current = null
    }
  })

  useEffect(() => {
    if (
      !conversationId ||
      preparingQueued.current.has(conversationId) ||
      !conversation ||
      !queued ||
      !canDispatchQueued(queued)
    )
      return
    const active = getChatDispatchState(conversationId)
    if (!active || active.messages !== conversation.messages) return
    preparingQueued.current.add(conversationId)
    void buildNotebookFlowContext(conversationId)
      .then((context) => {
        preparingQueued.current.delete(conversationId)
        dispatchQueuedRef.current?.(
          conversationId,
          active.owner,
          queued,
          context,
        )
        // If the entry or owner changed while waiting, reconsider the queue.
        if (dispatchQueuedRef.current) setQueuePreparation((count) => count + 1)
      })
      .catch((error) => {
        preparingQueued.current.delete(conversationId)
        console.error("Could not prepare chat context", error)
        toast.error("Could not prepare the message. It is still queued.")
      })
  })

  const handleAcceptChange = useCallback(
    async (messageId: string) => {
      if (!chatWindowState.activeConversationId) return

      void trackEvent(ConsoleEvent.AI_CHAT_ACCEPT)
      await acceptSuggestion({
        conversationId: chatWindowState.activeConversationId,
        messageId,
      })
    },
    [chatWindowState.activeConversationId, acceptSuggestion],
  )

  const handleRejectChange = useCallback(
    async (messageId: string) => {
      if (!chatWindowState.activeConversationId) return

      void trackEvent(ConsoleEvent.AI_CHAT_REJECT)
      await rejectSuggestion(chatWindowState.activeConversationId, messageId)

      setTimeout(() => {
        chatInputRef.current?.focus()
      }, 100)
    },
    [chatWindowState.activeConversationId, rejectSuggestion],
  )

  const handleRunQuery = useCallback(
    (sql: string) => {
      if (!conversation) return

      const normalizedSQL = normalizeQueryText(sql)
      const queryKey = createDetachedQueryKey(normalizedSQL)
      let queryId: QuestDB.QueryId | null = null

      questExecution.requestExecution({
        abort: () => {
          if (queryId !== null) {
            quest.abort(queryId)
          }
        },
        bufferId: notificationNamespaceKey,
        queryKey,
        execute: () => {
          const timeoutId = window.setTimeout(() => {
            dispatch(
              actions.query.addNotification(
                {
                  query: queryKey,
                  type: NotificationType.LOADING,
                  content: (
                    <Box gap="1rem" align="center">
                      <Text color="contentPrimary">Running...</Text>
                      <CancelButton
                        variant="dangerGhost"
                        onClick={() => {
                          questExecution.cancelActive()
                        }}
                      >
                        <Stop size="18px" />
                      </CancelButton>
                    </Box>
                  ),
                  sideContent: <QueryInNotification query={normalizedSQL} />,
                },
                notificationNamespaceKey,
              ),
            )
            notificationTimeoutRef.current = null
          }, 1000)
          notificationTimeoutRef.current = timeoutId

          void runDetachedQuery({
            normalizedSQL,
            queryKey,
            namespaceKey: notificationNamespaceKey,
            quest,
            dispatch,
            executionRefs,
            releaseExecution: questExecution.releaseExecution,
            onQueryStarted: (nextQueryId) => {
              queryId = nextQueryId
            },
            onSettled: () => {
              if (notificationTimeoutRef.current === timeoutId) {
                window.clearTimeout(timeoutId)
                notificationTimeoutRef.current = null
              }
            },
          })
        },
      })
    },
    [
      conversation,
      executionRefs,
      notificationNamespaceKey,
      quest,
      questExecution,
    ],
  )

  const handleCancelQuery = useCallback(
    (queryKey: QueryKey) => {
      if (questExecution.getActive()?.queryKey !== queryKey) return
      if (notificationTimeoutRef.current !== null) {
        window.clearTimeout(notificationTimeoutRef.current)
        notificationTimeoutRef.current = null
      }
      questExecution.cancelActive()
    },
    [questExecution],
  )

  const handleContextClick = useCallback(async () => {
    void trackEvent(ConsoleEvent.AI_CONTEXT_BADGE_CLICK, {
      type: conversation?.tableId ? "table" : "query",
    })
    if (conversation?.queryKey && conversation?.bufferId) {
      return await highlightQuery(conversation.queryKey, conversation.bufferId)
    }
    if (conversation?.tableId) {
      const table = tables.find((t) => t.id === conversation.tableId)
      if (table) {
        dispatch(
          actions.console.pushSidebarHistory({
            type: "tableDetails",
            payload: {
              tableName: table.table_name,
              kind: getTableKind(table),
            },
          }),
        )
        return true
      }
    }
    return false
  }, [
    conversation?.queryKey,
    conversation?.bufferId,
    conversation?.tableId,
    highlightQuery,
    tables,
  ])

  const handleScrollToMessageComplete = useCallback(() => {
    setScrollToMessageId(null)
  }, [setScrollToMessageId])

  const handleOpenInEditor = useCallback(
    async (
      content:
        | { type: "diff"; original: string; modified: string }
        | { type: "code"; value: string },
      existingQuery: boolean = false,
    ) => {
      if (existingQuery) {
        const highlighted = await handleContextClick()
        if (highlighted) {
          return
        }
      }

      if (content.type === "diff") {
        if (!chatWindowState.activeConversationId) return
        void showPreviewBuffer({
          type: "diff",
          original: content.original,
          modified: content.modified,
          conversationId: chatWindowState.activeConversationId,
        })
      } else {
        void addBuffer({ value: content.value })
      }
    },
    [
      showPreviewBuffer,
      addBuffer,
      chatWindowState.activeConversationId,
      handleContextClick,
    ],
  )

  const handleApplyToEditor = useCallback(
    async (messageId: string, sql: string) => {
      if (!chatWindowState.activeConversationId) return

      const normalizedSQL = normalizeSql(sql, false)

      try {
        await acceptSuggestion({
          conversationId: chatWindowState.activeConversationId,
          messageId,
          skipDefaultMessage: true,
        })

        addMessage({
          role: "user" as const,
          content: `User replaced query with one of your previous suggestions. Now the query is:\n\n\`\`\`sql\n${normalizedSQL.replaceAll(/\s+/g, " ").trim()}\n\`\`\``,
          timestamp: Date.now(),
          hideFromUI: true,
        })

        await persistMessages(chatWindowState.activeConversationId)
      } catch (error) {
        console.error("Error applying SQL to editor:", error)
        toast.error("Failed to apply changes to editor")
      }
    },
    [
      chatWindowState.activeConversationId,
      acceptSuggestion,
      addMessage,
      persistMessages,
    ],
  )

  const latestRetry = useRef<symbol | null>(null)
  const retrySelection = useRef<{
    model: string
    apiKey: string
    hasSchemaAccess: boolean
    channel: typeof localAgentChannel
    settings: typeof aiAssistantSettings
  } | null>(null)
  useLayoutEffect(() => {
    retrySelection.current = canUse
      ? {
          model: currentModel,
          apiKey,
          hasSchemaAccess,
          channel: localAgentChannel,
          settings: aiAssistantSettings,
        }
      : null
    return () => {
      retrySelection.current = null
    }
  })

  const handleRetry = async (userMessageId: string) => {
    if (!conversationId || isOperationBlocking()) return
    const active = getChatDispatchState(conversationId)
    if (!active || active.messages !== messages) return
    const userMessageIndex = messages.findIndex((m) => m.id === userMessageId)
    if (userMessageIndex < 0) return
    const userMessage = messages[userMessageIndex]
    const usesLocalAgent = currentModel === LOCAL_AGENT_MODEL
    if (userMessage.agentCommand && !usesLocalAgent) {
      toast.error("Select the local agent before retrying this command.")
      return
    }
    if (!canUse) return
    const channel = usesLocalAgent ? localAgentChannel : null
    if (usesLocalAgent && !isCurrentLocalAgentChannel(channel)) return
    const agent = channel?.getSnapshot() ?? null
    const agentModel = queuedAgentModel(agent, aiAssistantSettings)
    if (userMessage.images?.length && !agent?.acceptsImages) {
      toast.error("Select a local agent that reads images before retrying.")
      return
    }
    if (
      userMessage.displayType === "schema_explain_request" &&
      !hasSchemaAccess
    ) {
      toast.error("Enable schema access before retrying.")
      return
    }

    const attempt = Symbol()
    latestRetry.current = attempt
    const abortSignal = abortController?.signal
    const stillOwnsRetry = () => {
      const chat = getChatDispatchState(conversationId)
      const selection = retrySelection.current
      const currentAgent = channel?.getSnapshot() ?? null
      return (
        latestRetry.current === attempt &&
        chat?.owner === active.owner &&
        chat.messages === messages &&
        !isOperationBlocking() &&
        !abortSignal?.aborted &&
        selection?.model === currentModel &&
        selection.apiKey === apiKey &&
        selection.hasSchemaAccess === hasSchemaAccess &&
        (!usesLocalAgent ||
          (selection.channel === channel &&
            isCurrentLocalAgentChannel(channel) &&
            queuedAgentModel(currentAgent, selection.settings) === agentModel &&
            (!userMessage.images?.length || currentAgent?.acceptsImages)))
      )
    }

    try {
      const notebookContext = await buildNotebookFlowContext(conversationId)
      if (!stillOwnsRetry()) return
      const commonConfig = {
        conversationId,
        settings: { model: currentModel, apiKey },
        localAgentChannel: channel,
        aiAssistantSettings,
        questClient: quest,
        tables,
        hasSchemaAccess,
        abortSignal,
        notebookContext,
      }
      const historyUpToFailed = messages.slice(0, userMessageIndex)
      let config: AIFlowConfig
      switch (userMessage.displayType) {
        case "explain_request":
          if (!userMessage.sql) return
          config = createExplainFlowConfig({
            ...commonConfig,
            queryText: userMessage.sql,
          })
          break
        case "fix_request":
          if (!userMessage.sql) return
          config = createFixFlowConfig({
            ...commonConfig,
            queryText: userMessage.sql,
          })
          break
        case "schema_explain_request": {
          const schemaData = userMessage.displaySchemaData
          if (!schemaData) return
          const ddlResult = await quest.showDDL(
            schemaData.tableName,
            schemaData.kind,
          )
          if (!stillOwnsRetry()) return
          const ddl =
            ddlResult?.type === QuestDB.Type.DQL
              ? (ddlResult.data?.[0] as { ddl?: string } | undefined)?.ddl
              : undefined
          if (!ddl) {
            toast.error("Failed to fetch table schema for retry")
            return
          }
          config = createSchemaExplainFlowConfig({
            ...commonConfig,
            tableName: schemaData.tableName,
            schema: ddl,
            kindLabel: getTableKindLabel(schemaData.kind),
            schemaDisplayData: schemaData,
          })
          break
        }
        default:
          config = createChatFlowConfig({
            ...commonConfig,
            userMessage:
              userMessage.displayUserMessage ?? userMessage.content ?? "",
            ...(userMessage.images?.length && { images: userMessage.images }),
            ...(userMessage.agentCommand && { agentCommand: true }),
            currentSQL: userMessage.sql || currentSQL,
            conversationHistory: historyUpToFailed,
            isFirstMessage: !historyUpToFailed.some(
              (msg) => msg.role === "assistant",
            ),
          })
      }
      // Only consume the failed turn once the retry is ready to start.
      removeMessages(
        messages.slice(userMessageIndex).map((message) => message.id),
      )
      void executeAIFlow(config, {
        addMessage,
        updateMessage,
        removeMessages,
        setStatus,
        setIsStreaming,
        persistMessages,
        updateConversationName,
        updateMessagesWithCompaction,
        bindConversationToNotebook,
        rotateUserActionDigest,
      })
    } catch (error) {
      if (!stillOwnsRetry()) return
      console.error("Could not prepare retry:", error)
      toast.error("Could not prepare the retry. The failed message was kept.")
    }
  }

  const explainButtonRef = useRef<HTMLDivElement | null>(null)

  const handleExplainQuery = useCallback(() => {
    const button = explainButtonRef.current?.querySelector(
      'button[data-hook="button-explain-query"]',
    ) as HTMLButtonElement
    button?.click()
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!shouldShowExplainButton) return
      if (!((e.metaKey || e.ctrlKey) && (e.key === "e" || e.key === "E"))) {
        return
      }
      e.preventDefault()
      handleExplainQuery()
    },
    [shouldShowExplainButton],
  )

  useEffect(() => {
    if (shouldShowExplainButton) {
      eventBus.subscribe(EventType.EXPLAIN_QUERY_EXEC, handleExplainQuery)

      document.addEventListener("keydown", handleKeyDown)
      return () => {
        document.removeEventListener("keydown", handleKeyDown)
        eventBus.unsubscribe(EventType.EXPLAIN_QUERY_EXEC, handleExplainQuery)
      }
    }
  }, [shouldShowExplainButton, handleKeyDown, handleExplainQuery])

  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current !== null) {
        window.clearTimeout(notificationTimeoutRef.current)
        notificationTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (activeSidebar?.type !== "aiChat") {
      hasAutoFocusedRef.current = false
      return
    }
    if (hasAutoFocusedRef.current || isHistoryOpen || isLoadingMessages) return
    if (!chatInputRef.current) return
    chatInputRef.current.focus()
    hasAutoFocusedRef.current = true
  }, [activeSidebar?.type, isHistoryOpen, isLoadingMessages, conversationId])

  const handleNewChat = useCallback(async () => {
    hasAutoFocusedRef.current = false
    await openBlankChatWindow()
    chatInputRef.current?.focus()
  }, [openBlankChatWindow])

  if (activeSidebar?.type !== "aiChat" || (!conversation && !isHistoryOpen)) {
    return null
  }

  const notebookContext = (() => {
    const boundId = conversation?.notebookBufferId
    if (typeof boundId !== "number") return undefined
    const buf = buffers.find((b) => b.id === boundId)
    const isMissing = !buf
    const isArchived = !!buf?.archived
    const label = buf?.label ?? `#${boundId}`
    const warn: "archived" | "deleted" | null = isMissing
      ? "deleted"
      : isArchived
        ? "archived"
        : null
    const onClick = async () => {
      if (warn) return
      if (buf) await setActiveBuffer(buf)
    }
    return { label, warn, onClick }
  })()

  const queryActions = (shouldShowExplainButton || shouldShowFixButton) && (
    <ButtonContainer ref={explainButtonRef}>
      {shouldShowExplainButton && (
        <ExplainQueryButton
          conversationId={conversation!.id}
          queryText={currentSQL.trim()}
        />
      )}
      {shouldShowFixButton && <FixQueryButton />}
    </ButtonContainer>
  )

  return (
    <>
      <Drawer
        mode="side"
        data-hook="ai-chat-window"
        open={activeSidebar?.type === "aiChat"}
        onOpenChange={(open) => {
          if (!open) closeChatWindow()
        }}
        onDismiss={closeChatWindow}
        trigger={<span />}
        title={
          <HeaderLeft>
            <AISparkle size={20} variant="filled" />
            <HeaderTitle data-hook="chat-window-title">
              {headerTitle}
            </HeaderTitle>
          </HeaderLeft>
        }
        afterTitle={
          <HeaderRight>
            <HeaderButton
              onClick={handleNewChat}
              title="New chat"
              aria-label="New chat"
              disabled={addButtonDisabled}
              data-hook="chat-window-new"
            >
              <PlusIcon size={16} weight="bold" />
            </HeaderButton>
            <HeaderButton
              onClick={handleHistoryToggle}
              title={isHistoryOpen ? "Back to chat" : "Chat history"}
              aria-label={isHistoryOpen ? "Back to chat" : "Chat history"}
              aria-pressed={isHistoryOpen}
              disabled={!hasConversations || isBlockingAIStatus(aiStatus)}
              data-hook="chat-window-history"
            >
              <ClockCounterClockwiseIcon size={16} weight="bold" />
            </HeaderButton>
            <HeaderButton
              onClick={closeChatWindow}
              title="Close"
              aria-label="Close AI chat"
              data-hook="chat-window-close"
            >
              <XIcon size={16} weight="bold" />
            </HeaderButton>
          </HeaderRight>
        }
      >
        <ChatWindowContent>
          {isLoadingMessages ? (
            <ChatPanel>
              <CircleNotchSpinner size={20} style={{ margin: "auto" }} />
            </ChatPanel>
          ) : isHistoryOpen ? (
            <ChatHistoryView
              currentConversationId={
                chatWindowState.previousConversationId ?? null
              }
            />
          ) : (
            <ChatPanel>
              {shouldShowMessages && queryActions}
              {shouldShowMessages ? (
                <ChatMessages
                  messages={messages}
                  commandNotes={activeCommandNotes}
                  onAcceptChange={handleAcceptChange}
                  onRejectChange={handleRejectChange}
                  onRunQuery={handleRunQuery}
                  onOpenInEditor={handleOpenInEditor}
                  onApplyToEditor={handleApplyToEditor}
                  onRetry={handleRetry}
                  onCancelQuery={handleCancelQuery}
                  runningQueryKey={runningQueryKey}
                  queryNotifications={queryNotifications}
                  isOperationInProgress={isBlockingAIStatus(aiStatus)}
                  editorSQL={queryInfo.queryText}
                  isStreaming={isStreaming}
                  isLoadingMessages={isLoadingMessages}
                  scrollToMessageId={scrollToMessageId}
                  onScrollToMessageComplete={handleScrollToMessageComplete}
                />
              ) : currentSQL && currentSQL.trim() ? (
                <InitialQueryContainer>
                  <InitialQueryBox data-hook="chat-initial-query-box">
                    <InitialQueryEditor data-hook="chat-lite-editor">
                      <LiteEditor
                        value={currentSQL.trim()}
                        maxHeight={216}
                        onOpenInEditor={() =>
                          handleOpenInEditor(
                            { type: "code", value: currentSQL.trim() },
                            true,
                          )
                        }
                      />
                    </InitialQueryEditor>
                  </InitialQueryBox>
                  {queryActions}
                </InitialQueryContainer>
              ) : (
                <BlankChatContainer data-hook="chat-blank-state">
                  <BlankChatHeading>
                    Leverage AI directly in your database
                  </BlankChatHeading>
                  <BlankChatSubheading>
                    Our AI Assistant is a specialized programming and support
                    agent that makes you more effective and helps you solve
                    problems as you interface with your QuestDB database. Start
                    a conversation.
                  </BlankChatSubheading>
                </BlankChatContainer>
              )}
              <ChatInput
                ref={chatInputRef}
                queue={chatQueue}
                setQueue={setChatQueue}
                conversationId={chatWindowState.activeConversationId}
                contextUsage={contextUsage}
                chatTokens={chatTokens}
                onCommandNote={addCommandNote}
                disabled={!canUse}
                placeholder={getPlaceholder()}
                contextSQL={queryInfo.queryText}
                contextTableId={conversation?.tableId}
                contextNotebook={notebookContext}
                onContextClick={handleContextClick}
              />
            </ChatPanel>
          )}
        </ChatWindowContent>
      </Drawer>
    </>
  )
}

export default AIChatWindow
