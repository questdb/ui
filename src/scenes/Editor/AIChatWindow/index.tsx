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
  type OperationHistory,
} from "../../../providers/AIStatusProvider"
import { toast } from "../../../components/Toast"
import { color } from "../../../utils"
import { LiteEditor } from "../../../components/LiteEditor"
import { ChatMessages } from "./ChatMessages"
import { ChatInput, type ChatInputHandle } from "./ChatInput"
import { ChatHistoryView } from "./ChatHistoryView"
import {
  continueConversation,
  isAiAssistantError,
  normalizeSql,
  generateChatTitle,
  type ActiveProviderSettings,
} from "../../../utils/aiAssistant"
import {
  providerForModel,
  MODEL_OPTIONS,
} from "../../../utils/aiAssistantSettings"
import { createModelToolsClient } from "../../../utils/aiAssistant"
import { QuestContext } from "../../../providers"
import { useDispatch, useSelector } from "react-redux"
import { actions, selectors } from "../../../store"
import { RunningType } from "../../../store/Query/types"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: ${color("chatBackground")};
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

export const AIChatWindow: React.FC = () => {
  const dispatch = useDispatch()
  const { quest } = useContext(QuestContext)
  const {
    editorRef,
    buffers,
    activeBuffer,
    setActiveBuffer,
    showDiffBuffer,
    closeDiffBufferForConversation,
    executionRefs,
  } = useEditor()
  const {
    conversations,
    chatWindowState,
    closeChatWindow,
    openBlankChatWindow,
    openHistoryView,
    closeHistoryView,
    getConversation,
    addMessage,
    updateMessage,
    replaceConversationMessages,
    updateConversationName,
    acceptSuggestion,
    rejectSuggestion,
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

  const conversation = chatWindowState.activeConversationId
    ? getConversation(chatWindowState.activeConversationId)
    : null

  // Get query notifications for the conversation's buffer
  // Use the conversation's bufferId (original buffer, not diff buffer) for looking up notifications
  const conversationBufferId = conversation?.bufferId as number | undefined
  const queryNotifications = useSelector(
    selectors.query.getQueryNotificationsForBuffer(conversationBufferId ?? -1),
  )

  // Ref for ChatInput to programmatically focus
  const chatInputRef = useRef<ChatInputHandle>(null)

  const currentSQL = useMemo(() => {
    return trimSemicolonForDisplay(conversation?.currentSQL)
  }, [conversation])

  const queryInfo = useMemo(() => {
    return getQueryInfoFromKey(conversation?.queryKey ?? null)
  }, [conversation?.queryKey])

  const messages = useMemo(() => {
    return conversation?.messages || []
  }, [conversation])

  const hasUnactionedDiff = useMemo(() => {
    return checkHasUnactionedDiff(messages)
  }, [messages])

  // Determine the buffer/tab status for this conversation
  const bufferStatus = useMemo(() => {
    if (!conversation) return { type: "none" as const }

    const conversationBufferId = conversation.bufferId
    const buffer = buffers.find((b) => b.id === conversationBufferId)

    if (!buffer) {
      // Buffer doesn't exist (deleted)
      return { type: "deleted" as const }
    }

    if (buffer.archived) {
      // Buffer is archived
      return { type: "archived" as const, buffer }
    }

    if (buffer.id === activeBuffer.id) {
      // Buffer is the current active tab
      return { type: "active" as const, buffer }
    }

    // Buffer exists but is not active
    return { type: "inactive" as const, buffer }
  }, [conversation, buffers, activeBuffer])

  // Determine if we should show the messages panel
  // Show it when there are messages in the conversation
  const shouldShowMessages = useMemo(() => {
    return messages.length > 0
  }, [messages])

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
  const hasConversations = conversations.size > 0

  const addButtonDisabled = useMemo(() => {
    if (!conversation) return false
    return (
      conversation.messages.length === 0 &&
      !conversation.queryKey &&
      !conversation.tableId
    )
  }, [conversation])

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
      closeHistoryView()
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
      void closeDiffBufferForConversation(conversationId)
    }

    const hasAssistantMessages = conversation.messages.some(
      (msg) => msg.role === "assistant",
    )

    let userMessageContent = userMessage
    let displayType: "ask_request" | undefined = undefined
    let displaySQL: string | undefined = undefined
    let displayUserMessage: string | undefined = undefined

    if (!hasAssistantMessages && currentSQL && currentSQL.trim()) {
      // First message with SQL context (like "Ask AI" flow)
      // Store the enriched message so it's preserved in conversation history for API
      userMessageContent = `Current SQL query:\n\`\`\`sql\n${currentSQL}\n\`\`\`\n\nUser request: ${userMessage}`
      // Set display type for proper UI rendering (shows user message + SQL editor)
      displayType = "ask_request"
      displaySQL = currentSQL.trim()
      displayUserMessage = userMessage // Store the original user message for display
    }

    const userMessageEntry = {
      role: "user" as const,
      content: userMessageContent,
      timestamp: Date.now(),
      ...(displayType && { displayType }),
      ...(displaySQL && { displaySQL }),
      ...(displayUserMessage && { displayUserMessage }),
    }

    addMessage(conversationId, userMessageEntry)

    const assistantMessageId = crypto.randomUUID()
    addMessage(conversationId, {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      operationHistory: [],
    })

    const provider = providerForModel(currentModel)
    const settings: ActiveProviderSettings = {
      model: currentModel,
      provider,
      apiKey,
    }

    // Generate chat title in parallel using test model (only for first message)
    if (!hasAssistantMessages) {
      const testModel = MODEL_OPTIONS.find(
        (m) => m.isTestModel && m.provider === provider,
      )
      if (testModel) {
        void generateChatTitle({
          firstUserMessage: userMessageContent,
          settings: { model: testModel.value, provider, apiKey },
        }).then((title) => {
          if (title) {
            updateConversationName(conversationId, title)
          }
        })
      }
    }

    const handleStatusUpdate = (history: OperationHistory) => {
      updateMessage(conversationId, assistantMessageId, {
        operationHistory: [...history],
      })
    }

    const processResponse = async () => {
      const response = await continueConversation({
        userMessage: userMessageContent,
        conversationHistory: conversation.messages.filter(
          (m) => !m.isCompacted,
        ),
        currentSQL: currentSQL || undefined,
        settings,
        modelToolsClient: createModelToolsClient(
          quest,
          hasSchemaAccess ? tables : undefined,
        ),
        setStatus: (status, args) =>
          setStatus(
            status,
            { ...(args ?? {}), conversationId },
            handleStatusUpdate,
          ),
        abortSignal: abortController?.signal,
      })

      if (isAiAssistantError(response)) {
        const error = response
        updateMessage(conversationId, assistantMessageId, {
          error:
            error.type !== "aborted" ? error.message : "Operation cancelled",
        })
        if (error.type !== "aborted") {
          toast.error(error.message, { autoClose: 10000 })
        }
        return
      }

      const result = response
      let assistantContent = result.explanation || "Response received"
      const hasSQLInResult =
        "sql" in result && result.sql && result.sql.trim() !== ""
      if (hasSQLInResult) {
        assistantContent = `SQL Query:\n\`\`\`sql\n${result.sql}\n\`\`\`\n\nExplanation:\n${result.explanation || ""}`
      }

      if (result.compactedConversationHistory) {
        replaceConversationMessages(
          conversationId,
          result.compactedConversationHistory,
        )
      }

      updateMessage(conversationId, assistantMessageId, {
        content: assistantContent,
        ...(hasSQLInResult && { sql: result.sql }),
        explanation: result.explanation,
        tokenUsage: result.tokenUsage,
      })
    }

    void processResponse()
  }

  const handleExpandDiff = useCallback(
    (original: string, modified: string) => {
      if (!conversation?.id) return
      void showDiffBuffer({
        original,
        modified,
        conversationId: conversation.id,
      })
    },
    [showDiffBuffer, conversation?.id],
  )

  const handleAcceptChange = async (messageIndex: number) => {
    if (!conversation || !chatWindowState.activeConversationId) return

    const targetMessage = conversation.messages[messageIndex]
    if (!targetMessage || !targetMessage.sql) return

    await acceptSuggestion({
      conversationId: chatWindowState.activeConversationId,
      sql: targetMessage.sql,
      messageIndex,
    })

    dispatch(actions.query.setAISuggestionRequest(null))
  }

  const handleRejectChange = async () => {
    if (!chatWindowState.activeConversationId) return

    await rejectSuggestion(chatWindowState.activeConversationId)

    setTimeout(() => {
      chatInputRef.current?.focus()
    }, 100)
  }

  const handleRunQuery = (sql: string) => {
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
  }

  const navigateToBuffer = useCallback(async (): Promise<boolean> => {
    if (
      bufferStatus.type === "deleted" ||
      bufferStatus.type === "archived" ||
      bufferStatus.type === "none"
    ) {
      return false
    }

    try {
      // Switch to the buffer if it's inactive
      if (bufferStatus.type === "inactive" && bufferStatus.buffer) {
        await setActiveBuffer(bufferStatus.buffer)
        // Wait for the buffer to be set
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      return true
    } catch (error) {
      console.error("Error navigating to buffer:", error)
      return false
    }
  }, [bufferStatus, setActiveBuffer])

  // Handle context badge click - navigate to query and highlight it
  const handleContextClick = useCallback(async () => {
    if (!conversation || !editorRef.current || !conversation.queryKey) {
      return
    }

    // Navigate to the buffer first
    const success = await navigateToBuffer()
    if (!success) return

    try {
      const model = editorRef.current.getModel()
      if (!model) return

      const startPosition = model.getPositionAt(queryInfo.startOffset)
      const endPosition = model.getPositionAt(queryInfo.endOffset)

      // Reveal the position in the center of the viewport
      editorRef.current.revealPositionNearTop(startPosition)
      editorRef.current.setPosition(startPosition)

      // Apply highlighting decoration
      const decorationIds = model.deltaDecorations(
        [],
        [
          {
            range: {
              startLineNumber: startPosition.lineNumber,
              startColumn: startPosition.column,
              endLineNumber: endPosition.lineNumber,
              endColumn: endPosition.column,
            },
            options: {
              isWholeLine: false,
              className: "aiQueryHighlight",
            },
          },
        ],
      )

      editorRef.current.focus()

      // Remove highlighting after 2 seconds
      setTimeout(() => {
        model.deltaDecorations(decorationIds, [])
      }, 1000)
    } catch (error) {
      console.error("Error highlighting query:", error)
    }
  }, [conversation, editorRef, navigateToBuffer, queryInfo])

  const handleApplyToEditor = useCallback(
    async (sql: string, messageIndex: number) => {
      if (!conversation || !chatWindowState.activeConversationId) return

      const normalizedSQL = normalizeSql(sql, false)

      try {
        // Use unified acceptSuggestion with messageIndex to mark the correct message as accepted
        await acceptSuggestion({
          conversationId: chatWindowState.activeConversationId,
          sql,
          messageIndex, // Pass messageIndex to mark the specific message as accepted
          skipHiddenMessage: true, // We'll add our own custom message
        })

        // Add a custom hidden message to inform the model for the next round
        addMessage(chatWindowState.activeConversationId, {
          role: "user" as const,
          content: `User replaced query with one of your previous suggestions. Now the query is:\n\n\`\`\`sql\n${normalizedSQL}\n\`\`\``,
          timestamp: Date.now(),
          hideFromUI: true,
        })
      } catch (error) {
        console.error("Error applying SQL to editor:", error)
        toast.error("Failed to apply changes to editor")
      }
    },
    [
      conversation,
      chatWindowState.activeConversationId,
      acceptSuggestion,
      addMessage,
    ],
  )

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

  if (!chatWindowState.isOpen || !conversation) {
    return null
  }

  return (
    <Container>
      <Header>
        <HeaderLeft>
          <AISparkle size={20} variant="filled" />
          <HeaderTitle>{headerTitle}</HeaderTitle>
        </HeaderLeft>
        <HeaderRight>
          <HeaderButton
            onClick={openBlankChatWindow}
            title="New chat"
            disabled={addButtonDisabled}
          >
            <PlusIcon size={16} weight="bold" />
          </HeaderButton>
          <HeaderButton
            $active={isHistoryOpen}
            onClick={handleHistoryToggle}
            title={isHistoryOpen ? "Back to chat" : "Chat history"}
            disabled={!hasConversations}
          >
            <ClockCounterClockwiseIcon size={16} weight="bold" />
          </HeaderButton>
          <HeaderButton onClick={closeChatWindow} title="Close">
            <XIcon size={16} weight="bold" />
          </HeaderButton>
        </HeaderRight>
      </Header>
      <ChatWindowContent>
        {isHistoryOpen ? (
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
                onExpandDiff={handleExpandDiff}
                onApplyToEditor={handleApplyToEditor}
                running={running}
                aiSuggestionRequest={aiSuggestionRequest}
                queryNotifications={queryNotifications}
                queryStartOffset={queryInfo.startOffset}
                isOperationInProgress={isBlockingAIStatus(aiStatus)}
                editorSQL={queryInfo.queryText}
              />
            ) : currentSQL && currentSQL.trim() ? (
              <InitialQueryContainer>
                <InitialQueryBox>
                  <InitialQueryEditor
                    style={{
                      height: Math.min(
                        Math.max(currentSQL.split("\n").length * 20, 60),
                        200,
                      ),
                    }}
                  >
                    <LiteEditor value={currentSQL.trim()} />
                  </InitialQueryEditor>
                </InitialQueryBox>
                {(shouldShowExplainButton || shouldShowFixButton) && (
                  <ButtonContainer ref={explainButtonRef}>
                    {shouldShowExplainButton && (
                      <ExplainQueryButton
                        conversationId={conversation.id}
                        queryText={currentSQL.trim()}
                      />
                    )}
                    {shouldShowFixButton && <FixQueryButton />}
                  </ButtonContainer>
                )}
              </InitialQueryContainer>
            ) : (
              <BlankChatContainer>
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
              conversationId={conversation?.id}
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
