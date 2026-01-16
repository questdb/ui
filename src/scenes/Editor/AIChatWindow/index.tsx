import React, {
  useMemo,
  useRef,
  useContext,
  useCallback,
  useEffect,
} from "react"
import type { MutableRefObject } from "react"
import styled, { css } from "styled-components"
import { Button, Box } from "../../../components"
import { AISparkle } from "../../../components/AISparkle"
import { ExplainQueryButton } from "../../../components/ExplainQueryButton"
import { FixQueryButton } from "../../../components/FixQueryButton"
import {
  PlusIcon,
  XIcon,
  ClockCounterClockwiseIcon,
} from "@phosphor-icons/react"
import { useEditor } from "../../../providers"
import { useAIConversation } from "../../../providers/AIConversationProvider"
import { extractErrorByQueryKey } from "../utils"
import { getQueryInfoFromKey } from "../Monaco/utils"
import type { ExecutionRefs } from "../index"
import {
  trimSemicolonForDisplay,
  hasUnactionedDiff as checkHasUnactionedDiff,
} from "../../../providers/AIConversationProvider/utils"
import {
  isBlockingAIStatus,
  useAIStatus,
} from "../../../providers/AIStatusProvider"
import { toast } from "../../../components/Toast"
import { color } from "../../../utils"
import { LiteEditor } from "../../../components/LiteEditor"
import { ChatMessages } from "./ChatMessages"
import { ChatInput, type ChatInputHandle } from "./ChatInput"
import { ChatHistoryView } from "./ChatHistoryView"
import { normalizeSql } from "../../../utils/aiAssistant"
import {
  executeAIFlow,
  createChatFlowConfig,
  createExplainFlowConfig,
  createFixFlowConfig,
  createSchemaExplainFlowConfig,
} from "../../../utils/executeAIFlow"
import { getTableKindLabel } from "../../Schema/VirtualTables"
import * as QuestDB from "../../../utils/questdb"
import { QuestContext } from "../../../providers"
import { useDispatch, useSelector } from "react-redux"
import { actions, selectors } from "../../../store"
import { RunningType } from "../../../store/Query/types"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"
import { CircleNotchSpinner } from "../Monaco/icons"

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: ${color("chatBackground")};
  border-left: 0.2rem ${color("backgroundDarker")} solid;
`

const Header = styled.div`
  height: 46px;
  padding: 0 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: ${color("backgroundLighter")};
  flex-shrink: 0;
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

const HeaderButton = styled(Button).attrs(
  ({ $active }: { $active: boolean }) => ({
    skin: "transparent",
    $active,
  }),
)`
  color: ${color("foreground")};
  padding: 0.6rem;

  ${({ $active }) =>
    $active &&
    css`
      background: ${color("selection")};
    `}
`

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
`

const ChatWindowContent = styled.div`
  display: flex;
  height: calc(100% - 46px);
  width: 100%;
  overflow: hidden;
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
  color: ${color("foreground")};
  margin: 0;
`

const BlankChatSubheading = styled.p`
  font-size: 1.4rem;
  font-weight: 400;
  color: ${color("gray2")};
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
`

const AIChatWindow: React.FC = () => {
  const dispatch = useDispatch()
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)
  const { quest } = useContext(QuestContext)
  const {
    editorRef,
    showPreviewBuffer,
    closePreviewBuffer,
    executionRefs,
    highlightQuery,
  } = useEditor()
  const {
    conversationMetas,
    activeConversationMessages,
    chatWindowState,
    isLoadingMessages,
    isStreaming,
    setIsStreaming,
    closeChatWindow,
    openBlankChatWindow,
    openHistoryView,
    closeHistoryView,
    getConversationMeta,
    addMessage,
    updateMessage,
    replaceConversationMessages,
    updateConversationName,
    acceptSuggestion,
    rejectSuggestion,
    persistMessages,
    removeMessages,
  } = useAIConversation()
  const {
    status: aiStatus,
    setStatus,
    abortController,
    canUse,
    hasSchemaAccess,
    currentModel,
    apiKey,
  } = useAIStatus()
  const tables = useSelector(selectors.query.getTables)
  const running = useSelector(selectors.query.getRunning)
  const aiSuggestionRequest = useSelector(
    selectors.query.getAISuggestionRequest,
  )

  const conversationMeta = chatWindowState.activeConversationId
    ? getConversationMeta(chatWindowState.activeConversationId)
    : null

  const conversation = useMemo(() => {
    if (!conversationMeta) return null
    return { ...conversationMeta, messages: activeConversationMessages }
  }, [conversationMeta, activeConversationMessages])

  // Get query notifications for the conversation's buffer
  // Use the conversation's bufferId (original buffer, not diff buffer) for looking up notifications
  const conversationBufferId = conversation?.bufferId
  const queryNotifications = useSelector(
    selectors.query.getQueryNotificationsForBuffer(conversationBufferId ?? -1),
  )

  // Ref for ChatInput to programmatically focus
  const chatInputRef = useRef<ChatInputHandle>(null)

  const currentSQL = useMemo(() => {
    return trimSemicolonForDisplay(conversation?.currentSQL)
  }, [conversation])

  const queryInfo = useMemo(() => {
    return getQueryInfoFromKey(conversation?.queryKey)
  }, [conversation?.queryKey])

  const messages = activeConversationMessages

  const hasUnactionedDiff = useMemo(() => {
    return checkHasUnactionedDiff(messages)
  }, [messages])

  const shouldShowMessages = useMemo(() => {
    return messages.length > 0 && !isLoadingMessages
  }, [messages, isLoadingMessages])

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

  const handleSendMessage = (
    userMessage: string,
    hasUnactionedDiffParam: boolean = false,
  ) => {
    if (!canUse || !chatWindowState.activeConversationId || !conversation) {
      return
    }

    const conversationId = chatWindowState.activeConversationId

    if (hasUnactionedDiffParam) {
      void closePreviewBuffer()
    }

    const hasAssistantMessages = conversation.messages.some(
      (msg) => msg.role === "assistant",
    )

    void executeAIFlow(
      createChatFlowConfig({
        conversationId,
        userMessage,
        currentSQL,
        conversationHistory: conversation.messages,
        isFirstMessage: !hasAssistantMessages,
        settings: { model: currentModel, apiKey },
        questClient: quest,
        tables,
        hasSchemaAccess,
        abortSignal: abortController?.signal,
      }),
      {
        addMessage,
        updateMessage,
        setStatus,
        setIsStreaming,
        persistMessages,
        updateConversationName,
        replaceConversationMessages,
      },
    )
  }

  const handleAcceptChange = useCallback(
    async (messageId: string) => {
      if (!chatWindowState.activeConversationId) return

      await acceptSuggestion({
        conversationId: chatWindowState.activeConversationId,
        messageId,
      })

      dispatch(actions.query.setAISuggestionRequest(null))
    },
    [chatWindowState.activeConversationId, acceptSuggestion],
  )

  const handleRejectChange = useCallback(
    async (messageId: string) => {
      if (!chatWindowState.activeConversationId) return

      await rejectSuggestion(chatWindowState.activeConversationId, messageId)

      setTimeout(() => {
        chatInputRef.current?.focus()
      }, 100)
    },
    [chatWindowState.activeConversationId, rejectSuggestion],
  )

  const handleRunQuery = useCallback(
    (sql: string) => {
      const normalizedSQL = sql.trim().endsWith(";")
        ? sql.trim().slice(0, -1)
        : sql.trim()

      dispatch(
        actions.query.setAISuggestionRequest({
          query: normalizedSQL,
          startOffset: queryInfo.startOffset,
        }),
      )
      dispatch(actions.query.toggleRunning(RunningType.AI_SUGGESTION))
    },
    [queryInfo.startOffset],
  )

  const handleContextClick = useCallback(async () => {
    if (!conversation?.queryKey || !conversation?.bufferId) {
      return false
    }
    return await highlightQuery(conversation.queryKey, conversation.bufferId)
  }, [conversation?.queryKey, conversation?.bufferId, highlightQuery])

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
        void showPreviewBuffer({
          type: "code",
          value: content.value,
        })
      }
    },
    [
      showPreviewBuffer,
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

  const handleRetry = async (
    userMessageId: string,
    assistantMessageId: string,
  ) => {
    if (!chatWindowState.activeConversationId || !canUse) return

    const conversationId = chatWindowState.activeConversationId
    const userMessage = messages.find((m) => m.id === userMessageId)
    if (!userMessage) return

    await removeMessages(conversationId, [userMessageId, assistantMessageId])

    const settings = { model: currentModel, apiKey }
    const commonConfig = {
      settings,
      questClient: quest,
      tables,
      hasSchemaAccess,
      abortSignal: abortController?.signal,
    }

    const callbacks = {
      addMessage,
      updateMessage,
      setStatus,
      setIsStreaming,
      persistMessages,
      updateConversationName,
      replaceConversationMessages,
    }

    switch (userMessage.displayType) {
      case "explain_request": {
        if (!userMessage.sql) return
        void executeAIFlow(
          createExplainFlowConfig({
            conversationId,
            queryText: userMessage.sql,
            ...commonConfig,
          }),
          callbacks,
        )
        break
      }

      case "fix_request": {
        if (!userMessage.sql) return

        void executeAIFlow(
          createFixFlowConfig({
            conversationId,
            queryText: userMessage.sql,
            ...commonConfig,
          }),
          callbacks,
        )
        break
      }

      case "schema_explain_request": {
        if (!userMessage.displaySchemaData) return
        const schemaData = userMessage.displaySchemaData

        try {
          const ddlResult =
            schemaData.kind === "matview"
              ? await quest.showMatViewDDL(schemaData.tableName)
              : schemaData.kind === "view"
                ? await quest.showViewDDL(schemaData.tableName)
                : await quest.showTableDDL(schemaData.tableName)

          if (
            ddlResult?.type !== QuestDB.Type.DQL ||
            !ddlResult.data ||
            ddlResult.data.length === 0
          ) {
            toast.error("Failed to fetch table schema for retry")
            return
          }

          const ddlRow = ddlResult.data[0] as { ddl?: string }
          if (!ddlRow.ddl) {
            toast.error("Failed to fetch table schema for retry")
            return
          }

          void executeAIFlow(
            createSchemaExplainFlowConfig({
              conversationId,
              tableName: schemaData.tableName,
              schema: ddlRow.ddl,
              kindLabel: getTableKindLabel(schemaData.kind),
              schemaDisplayData: schemaData,
              ...commonConfig,
            }),
            callbacks,
          )
        } catch (error) {
          console.error("Error fetching DDL for retry:", error)
          toast.error("Failed to fetch table schema for retry")
        }
        break
      }

      case "ask_request":
      default: {
        const userText = userMessage.displayUserMessage || userMessage.content

        const historyUpToFailed = messages.filter(
          (m) => m.id !== userMessageId && m.id !== assistantMessageId,
        )

        const hasAssistantMessages = historyUpToFailed.some(
          (msg) => msg.role === "assistant",
        )

        void executeAIFlow(
          createChatFlowConfig({
            conversationId,
            userMessage: userText,
            currentSQL: userMessage.sql || currentSQL,
            conversationHistory: historyUpToFailed,
            isFirstMessage: !hasAssistantMessages,
            ...commonConfig,
          }),
          callbacks,
        )
        break
      }
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

  if (activeSidebar !== "aiChat" || (!conversation && !isHistoryOpen)) {
    return null
  }

  return (
    <Container data-hook="ai-chat-window">
      <Header>
        <HeaderLeft>
          <AISparkle size={20} variant="filled" />
          <HeaderTitle data-hook="chat-window-title">{headerTitle}</HeaderTitle>
        </HeaderLeft>
        <HeaderRight>
          <HeaderButton
            onClick={openBlankChatWindow}
            title="New chat"
            disabled={addButtonDisabled}
            data-hook="chat-window-new"
          >
            <PlusIcon size={16} weight="bold" />
          </HeaderButton>
          <HeaderButton
            $active={isHistoryOpen}
            onClick={handleHistoryToggle}
            title={isHistoryOpen ? "Back to chat" : "Chat history"}
            disabled={!hasConversations || isBlockingAIStatus(aiStatus)}
            data-hook="chat-window-history"
          >
            <ClockCounterClockwiseIcon size={16} weight="bold" />
          </HeaderButton>
          <HeaderButton
            onClick={closeChatWindow}
            title="Close"
            data-hook="chat-window-close"
          >
            <XIcon size={16} weight="bold" />
          </HeaderButton>
        </HeaderRight>
      </Header>
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
            {shouldShowMessages ? (
              <ChatMessages
                messages={messages}
                onAcceptChange={handleAcceptChange}
                onRejectChange={handleRejectChange}
                onRunQuery={handleRunQuery}
                onOpenInEditor={handleOpenInEditor}
                onApplyToEditor={handleApplyToEditor}
                onRetry={handleRetry}
                running={running}
                aiSuggestionRequest={aiSuggestionRequest}
                queryNotifications={queryNotifications}
                queryStartOffset={queryInfo.startOffset}
                isOperationInProgress={isBlockingAIStatus(aiStatus)}
                editorSQL={queryInfo.queryText}
                isStreaming={isStreaming}
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
                {(shouldShowExplainButton || shouldShowFixButton) && (
                  <ButtonContainer ref={explainButtonRef}>
                    {shouldShowExplainButton && (
                      <ExplainQueryButton
                        conversationId={conversation!.id}
                        queryText={currentSQL.trim()}
                      />
                    )}
                    {shouldShowFixButton && <FixQueryButton />}
                  </ButtonContainer>
                )}
              </InitialQueryContainer>
            ) : (
              <BlankChatContainer data-hook="chat-blank-state">
                <BlankChatHeading>
                  Leverage AI directly in your database
                </BlankChatHeading>
                <BlankChatSubheading>
                  Our AI Assistant is a specialized programming and support
                  agent that makes you more effective and helps you solve
                  problems as you interface with your QuestDB database. Start a
                  conversation.
                </BlankChatSubheading>
              </BlankChatContainer>
            )}
            <ChatInput
              ref={chatInputRef}
              onSend={(message) =>
                handleSendMessage(message, hasUnactionedDiff)
              }
              disabled={!canUse || isBlockingAIStatus(aiStatus)}
              placeholder={getPlaceholder()}
              contextSQL={queryInfo.queryText}
              contextTableId={conversation?.tableId}
              onContextClick={handleContextClick}
            />
          </ChatPanel>
        )}
      </ChatWindowContent>
    </Container>
  )
}

export default AIChatWindow
