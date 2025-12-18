import React, {
  useMemo,
  useRef,
  useContext,
  useCallback,
  useEffect,
} from "react"
import type { MutableRefObject } from "react"
import styled from "styled-components"
import { Button, Box } from "../../../components"
import { AISparkle } from "../../../components/AISparkle"
import { ExplainQueryButton } from "../../../components/ExplainQueryButton"
import { FixQueryButton } from "../../../components/FixQueryButton"
import { PlusIcon, XIcon } from "@phosphor-icons/react"
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
import {
  continueConversation,
  isAiAssistantError,
  normalizeSql,
  generateChatTitle,
  type GeneratedSQL,
  type ActiveProviderSettings,
  type TokenUsage,
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
`

const HeaderTitle = styled.div`
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  font-size: 1.6rem;
`

const HeaderButton = styled(Button).attrs({ skin: "transparent" })`
  color: ${color("foreground")};
  padding: 0.6rem;
`

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
    chatWindowState,
    closeChatWindow,
    openBlankChatWindow,
    getConversation,
    addMessage,
    addMessageAndUpdateSQL,
    updateConversationName,
    markLatestAsRejectedWithFollowUp,
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

  // Build header title
  const headerTitle = useMemo(() => {
    if (!conversation) return ""

    // If we have a generated conversation name, use it
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

    // Fallback for conversations without displayType
    return "AI Assistant"
  }, [conversation])

  const getPlaceholder = () => {
    if (messages.length > 0) {
      return "Ask a follow up question or request refinement..."
    }
    if (conversation?.schemaData || currentSQL?.trim()) {
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
      markLatestAsRejectedWithFollowUp(conversationId)
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

    // Add user message immediately so it appears in the UI right away
    addMessage(conversationId, userMessageEntry)

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

    // Build conversation history including the user message we just added
    // Since addMessage updates state asynchronously, we manually include the new message
    const conversationHistory = [
      ...conversation.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user" as const, content: userMessageContent },
    ]

    const processResponse = async () => {
      const response = await continueConversation({
        // Pass the enriched message content so continueConversation doesn't double-add context
        userMessage: userMessageContent,
        conversationHistory,
        currentSQL: currentSQL || undefined,
        settings,
        modelToolsClient: createModelToolsClient(
          quest,
          hasSchemaAccess ? tables : undefined,
        ),
        setStatus,
        abortSignal: abortController?.signal,
        conversationId: conversation.id,
      })

      if (isAiAssistantError(response)) {
        const error = response
        if (error.type !== "aborted") {
          toast.error(error.message, { autoClose: 10000 })
        }
        return
      }

      // Handle different response types
      const result = response as
        | GeneratedSQL
        | { explanation: string; sql?: string; tokenUsage?: TokenUsage }

      // Build complete assistant response content (SQL + explanation)
      let assistantContent = result.explanation || "Response received"
      if (result.sql) {
        assistantContent = `SQL Query:\n\`\`\`sql\n${result.sql}\n\`\`\`\n\nExplanation:\n${result.explanation || ""}`
      }

      // Add assistant response after API call completes
      // Only include sql field if there's an actual SQL change (not null/undefined/empty)
      const hasSQLInResult =
        result.sql !== undefined &&
        result.sql !== null &&
        result.sql.trim() !== ""

      addMessageAndUpdateSQL(conversationId, {
        role: "assistant" as const,
        content: assistantContent,
        timestamp: Date.now(),
        ...(hasSQLInResult && { sql: result.sql }),
        explanation: result.explanation,
        tokenUsage: result.tokenUsage,
      })
    }

    void processResponse()
  }

  // Handle expand button click from chat messages
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

    // Get the SQL from the message by index
    const targetMessage = conversation.messages[messageIndex]
    if (!targetMessage || !targetMessage.sql) return

    // Use unified acceptSuggestion from provider
    await acceptSuggestion({
      conversationId: chatWindowState.activeConversationId,
      sql: targetMessage.sql,
      messageIndex,
    })

    // Clear AI suggestion request after applying changes
    dispatch(actions.query.setAISuggestionRequest(null))
  }

  const handleRejectChange = async () => {
    if (!chatWindowState.activeConversationId) return

    // Use unified rejectSuggestion from provider
    await rejectSuggestion(chatWindowState.activeConversationId)

    // Focus the chat input so user can type corrections
    setTimeout(() => {
      chatInputRef.current?.focus()
    }, 100)
  }

  const handleRunQuery = (sql: string) => {
    // Normalize the SQL (remove trailing semicolon if present)
    const normalizedSQL = sql.trim().endsWith(";")
      ? sql.trim().slice(0, -1)
      : sql.trim()

    // Set the AI suggestion request with query and original position
    dispatch(
      actions.query.setAISuggestionRequest({
        query: normalizedSQL,
        startOffset: queryInfo.startOffset,
      }),
    )
    // Trigger execution with AI_SUGGESTION type
    dispatch(actions.query.toggleRunning(RunningType.AI_SUGGESTION))
  }

  // Handle applying SQL to editor without changing accepted/rejected state
  // This is used for already-accepted/rejected suggestions that user wants to re-apply
  // Navigate to inactive buffer - returns true if successful
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
          <HeaderButton onClick={openBlankChatWindow} title="New chat">
            <PlusIcon size={16} weight="bold" />
          </HeaderButton>
          <HeaderButton onClick={closeChatWindow} title="Close">
            <XIcon size={16} weight="bold" />
          </HeaderButton>
        </HeaderRight>
      </Header>
      <ChatWindowContent>
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
            // Show initial SQL as a user message bubble when no messages exist
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
                Our AI Assistant is a specialized programming and support agent
                that makes you more effective and helps you solve problems as
                you interface with your QuestDB database. Start a conversation.
              </BlankChatSubheading>
            </BlankChatContainer>
          )}
          <ChatInput
            ref={chatInputRef}
            onSend={(message) => handleSendMessage(message, hasUnactionedDiff)}
            disabled={!canUse || isBlockingAIStatus(aiStatus)}
            placeholder={getPlaceholder()}
            conversationId={conversation?.id}
            contextSQL={queryInfo.queryText}
            contextSchemaData={conversation?.schemaData}
            onContextClick={handleContextClick}
          />
        </ChatPanel>
      </ChatWindowContent>
    </Container>
  )
}
