import React, { useMemo, useRef, useContext, useCallback } from "react"
import styled from "styled-components"
import { Button } from "../../../components"
import { Box } from "../../../components"
import { useEditor } from "../../../providers"
import { useAIConversation } from "../../../providers/AIConversationProvider"
import {
  isBlockingAIStatus,
  useAIStatus,
} from "../../../providers/AIStatusProvider"
import { normalizeQueryText, createQueryKey } from "../Monaco/utils"
import type { QueryKey } from "../Monaco/utils"
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

const SparkleIcon = styled.img`
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
`

const HeaderTitle = styled.div`
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  font-size: 1.6rem;
`

const CloseButton = styled(Button).attrs({ skin: "transparent" })`
  color: ${color("offWhite")};
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
    addBuffer,
    showDiffBuffer,
    closeDiffBufferForQuery,
    applyAISQLChange,
  } = useEditor()
  const {
    chatWindowState,
    closeChatWindow,
    getConversation,
    addMessage,
    updateConversationSQL,
    addMessageAndUpdateSQL,
    updateConversationQueryKey,
    updateConversationBufferId,
    updateConversationName,
    updateConversationOffsets,
    acceptConversationChanges,
    rejectLatestChange,
    markLatestAsRejectedWithFollowUp,
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

  const conversation = chatWindowState.activeQueryKey
    ? getConversation(chatWindowState.activeQueryKey)
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
    const sql = conversation?.currentSQL || ""
    // Remove trailing semicolon for display in diff editor
    let trimmed = sql.trim()
    if (trimmed.endsWith(";")) {
      trimmed = trimmed.slice(0, -1).trim()
    }
    // Ensure we always have valid content for Monaco diff editor
    // Empty string causes issues, so use at least a newline
    return trimmed + "\n"
  }, [conversation])

  const currentExplanation = useMemo(() => {
    return conversation?.currentExplanation || ""
  }, [conversation])

  const messages = useMemo(() => {
    return conversation?.messages || []
  }, [conversation])

  // Check if there's a pending diff that needs action
  const hasPendingDiff = useMemo(() => {
    return conversation?.hasPendingDiff ?? false
  }, [conversation])

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
        case "generate_request":
          return "Generate query"
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

  const handleSendMessage = (
    userMessage: string,
    hasUnactionedDiff: boolean = false,
  ) => {
    if (!canUse || !chatWindowState.activeQueryKey || !conversation) {
      return
    }

    const queryKey = chatWindowState.activeQueryKey

    // If there's a pending diff and user is sending a follow-up, mark it as rejected with follow-up
    if (hasUnactionedDiff) {
      markLatestAsRejectedWithFollowUp(queryKey)
      void closeDiffBufferForQuery(queryKey)
    }

    // Determine if this is the first message (no assistant messages yet)
    const hasAssistantMessages = conversation.messages.some(
      (msg) => msg.role === "assistant",
    )

    // Build the user message content with context if needed
    let userMessageContent = userMessage
    let displayType: "ask_request" | undefined = undefined
    let displaySQL: string | undefined = undefined
    let displayUserMessage: string | undefined = undefined

    if (!hasAssistantMessages && currentSQL && currentSQL.trim() !== "\n") {
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
    addMessage(queryKey, userMessageEntry)

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
            updateConversationName(queryKey, title)
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
        originalQuery: conversation.originalQuery,
        settings,
        modelToolsClient: createModelToolsClient(
          quest,
          hasSchemaAccess ? tables : undefined,
        ),
        setStatus,
        abortSignal: abortController?.signal,
        queryKey,
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

      // Update conversation SQL and explanation
      // If SQL is provided and not empty, update it; otherwise keep current SQL
      const updatedSQL =
        result.sql !== undefined &&
        result.sql !== null &&
        result.sql.trim() !== ""
          ? result.sql
          : currentSQL

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

      const messageToAdd = {
        role: "assistant" as const,
        content: assistantContent,
        timestamp: Date.now(),
        ...(hasSQLInResult && { sql: result.sql }),
        explanation: result.explanation,
        tokenUsage: result.tokenUsage,
      }

      addMessageAndUpdateSQL(
        queryKey,
        messageToAdd,
        updatedSQL,
        result.explanation || "",
      )
    }

    void processResponse()
  }

  // Handle expand button click from chat messages
  const handleExpandDiff = useCallback(
    (original: string, modified: string, queryKey: QueryKey) => {
      void showDiffBuffer({
        original,
        modified,
        explanation: currentExplanation,
        queryKey,
      })
    },
    [showDiffBuffer, currentExplanation],
  )

  const handleAccept = async (
    normalizedSQL: string,
    messageIndex?: number,
  ): Promise<QueryKey | undefined> => {
    if (!conversation) return undefined

    try {
      let finalQueryKey: QueryKey | undefined

      // Scenario 1: Active tab - apply changes directly
      if (bufferStatus.type === "active") {
        finalQueryKey = applyChangesToActiveTab(normalizedSQL, { messageIndex })
        // Clear AI suggestion request AFTER applying changes (so updateNotificationKey can use it)
        dispatch(actions.query.setAISuggestionRequest(null))
        return finalQueryKey
      }

      // Scenario 2: Deleted/Archived tab - create new tab
      if (bufferStatus.type === "deleted" || bufferStatus.type === "archived") {
        finalQueryKey = await applyChangesToNewTab(normalizedSQL, {
          messageIndex,
        })
        dispatch(actions.query.setAISuggestionRequest(null))
        return finalQueryKey
      }

      // Scenario 3: Inactive tab - activate it first, then apply
      if (bufferStatus.type === "inactive" && bufferStatus.buffer) {
        await setActiveBuffer(bufferStatus.buffer)
        // Wait for tab to be fully activated
        await new Promise((resolve) => setTimeout(resolve, 100))
        finalQueryKey = applyChangesToActiveTab(normalizedSQL, { messageIndex })
        // Clear AI suggestion request AFTER applying changes (so updateNotificationKey can use it)
        dispatch(actions.query.setAISuggestionRequest(null))
        return finalQueryKey
      }
    } catch (error) {
      console.error("Error applying changes:", error)
      toast.error("Failed to apply changes")
    }
    return undefined
  }

  const applyChangesToActiveTab = (
    normalizedSQL: string,
    options?: { messageIndex?: number; skipAcceptState?: boolean },
  ): QueryKey | undefined => {
    if (!conversation) return undefined

    const result = applyAISQLChange({
      newSQL: normalizedSQL,
      queryStartOffset: conversation.queryStartOffset,
      queryEndOffset: conversation.queryEndOffset,
      originalQuery: conversation.originalQuery || conversation.initialSQL,
      queryKey: chatWindowState.activeQueryKey ?? undefined,
    })

    if (!result.success) {
      return undefined
    }

    // If there was an AI suggestion query that was run, update its notification key
    // to match the final query key (since formatSql may have changed the text)
    if (
      aiSuggestionRequest &&
      conversation.bufferId !== undefined &&
      result.finalQueryKey
    ) {
      const oldAIQueryKey = createQueryKey(
        normalizeQueryText(aiSuggestionRequest.query),
        aiSuggestionRequest.startOffset,
      )
      if (oldAIQueryKey !== result.finalQueryKey) {
        dispatch(
          actions.query.updateNotificationKey(
            oldAIQueryKey,
            result.finalQueryKey,
            conversation.bufferId as number,
          ),
        )
      }
    }

    // Update conversation state
    if (
      chatWindowState.activeQueryKey &&
      result.finalQueryKey &&
      result.finalQueryKey !== chatWindowState.activeQueryKey
    ) {
      updateConversationQueryKey(
        chatWindowState.activeQueryKey,
        result.finalQueryKey,
      )
      updateConversationSQL(
        result.finalQueryKey,
        normalizedSQL,
        currentExplanation,
      )
      // Update query offsets from the apply result
      if (result.queryStartOffset !== undefined) {
        const normalizedQuery = normalizeQueryText(normalizedSQL)
        const queryEndOffset = result.queryStartOffset + normalizedQuery.length
        updateConversationOffsets(
          result.finalQueryKey,
          result.queryStartOffset,
          queryEndOffset,
        )
      }
      if (!options?.skipAcceptState) {
        acceptConversationChanges(result.finalQueryKey, options?.messageIndex)
      }
      return result.finalQueryKey
    } else if (chatWindowState.activeQueryKey) {
      updateConversationSQL(
        chatWindowState.activeQueryKey,
        normalizedSQL,
        currentExplanation,
      )
      // Update query offsets from the apply result
      if (result.queryStartOffset !== undefined) {
        const normalizedQuery = normalizeQueryText(normalizedSQL)
        const queryEndOffset = result.queryStartOffset + normalizedQuery.length
        updateConversationOffsets(
          chatWindowState.activeQueryKey,
          result.queryStartOffset,
          queryEndOffset,
        )
      }
      if (!options?.skipAcceptState) {
        acceptConversationChanges(
          chatWindowState.activeQueryKey,
          options?.messageIndex,
        )
      }
      return chatWindowState.activeQueryKey
    }
    return undefined
  }

  const applyChangesToNewTab = async (
    normalizedSQL: string,
    options?: { messageIndex?: number; skipAcceptState?: boolean },
  ): Promise<QueryKey | undefined> => {
    // Create a new tab with proper semicolon handling
    // normalizeSql ensures: removes trailing semicolon, formats, then adds single semicolon
    const sqlWithSemicolon = normalizeSql(normalizedSQL)
    const newBuffer = await addBuffer({
      value: sqlWithSemicolon,
    })

    // Wait for the tab to be mounted and editor to be ready
    await new Promise((resolve) => setTimeout(resolve, 200))

    if (!editorRef.current) return undefined

    const model = editorRef.current.getModel()
    if (!model) return undefined

    // The query is at the start of the new buffer
    const queryStartOffset = 0
    const normalizedQuery = normalizeQueryText(normalizedSQL)
    const queryEndOffset = normalizedQuery.length

    const startPosition = model.getPositionAt(queryStartOffset)
    const endPosition = model.getPositionAt(queryEndOffset)

    // Apply highlighting decoration
    const highlightRange = {
      startLineNumber: startPosition.lineNumber,
      startColumn: startPosition.column,
      endLineNumber: endPosition.lineNumber,
      endColumn: endPosition.column,
    }

    const decorationId = model.deltaDecorations(
      [],
      [
        {
          range: highlightRange,
          options: {
            isWholeLine: false,
            className: "aiQueryHighlight",
          },
        },
      ],
    )

    // Reveal the query
    editorRef.current.revealPositionNearTop(startPosition)

    // Remove decoration after 2 seconds
    setTimeout(() => {
      model.deltaDecorations(decorationId, [])
    }, 2000)

    // Update conversation to point to new buffer and queryKey
    const finalQueryKey = createQueryKey(normalizedQuery, queryStartOffset)
    if (chatWindowState.activeQueryKey) {
      updateConversationQueryKey(chatWindowState.activeQueryKey, finalQueryKey)
      updateConversationBufferId(finalQueryKey, newBuffer.id)
      updateConversationSQL(finalQueryKey, normalizedSQL, currentExplanation)
      // Update query offsets for context badge navigation
      updateConversationOffsets(finalQueryKey, queryStartOffset, queryEndOffset)
      if (!options?.skipAcceptState) {
        acceptConversationChanges(finalQueryKey, options?.messageIndex)
      }
      return finalQueryKey
    }
    return undefined
  }

  const handleAcceptChange = async (messageIndex: number) => {
    if (!conversation || !chatWindowState.activeQueryKey) return

    // Get the SQL from the message at this index
    const targetMessage = conversation.messages[messageIndex]
    if (!targetMessage || !targetMessage.sql) return

    const normalizedSQL = normalizeSql(targetMessage.sql, false)

    await closeDiffBufferForQuery(chatWindowState.activeQueryKey)

    const finalQueryKey = await handleAccept(normalizedSQL, messageIndex)

    // Add a hidden message to inform the model about the acceptance
    // Use the final query key returned by handleAccept
    const targetQueryKey = finalQueryKey ?? chatWindowState.activeQueryKey
    addMessage(targetQueryKey, {
      role: "user" as const,
      content: `User accepted your latest SQL change. Now the query is:\n\n\`\`\`sql\n${normalizedSQL}\n\`\`\``,
      timestamp: Date.now(),
      hideFromUI: true,
    })
  }

  const handleRejectChange = () => {
    if (!chatWindowState.activeQueryKey) return
    rejectLatestChange(chatWindowState.activeQueryKey)
    void closeDiffBufferForQuery(chatWindowState.activeQueryKey)

    // Focus the chat input so user can type corrections
    setTimeout(() => {
      chatInputRef.current?.focus()
    }, 100)
  }

  const handleRunQuery = (sql: string) => {
    // Get the original query's start offset from the conversation
    // This allows the queryKey to match the original query position in the editor
    const startOffset = conversation?.queryStartOffset ?? 0

    // Normalize the SQL (remove trailing semicolon if present)
    const normalizedSQL = sql.trim().endsWith(";")
      ? sql.trim().slice(0, -1)
      : sql.trim()

    // Set the AI suggestion request with query and original position
    dispatch(
      actions.query.setAISuggestionRequest({
        query: normalizedSQL,
        startOffset,
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
    if (!conversation || !editorRef.current) return

    const queryStartOffset = conversation.queryStartOffset
    const queryEndOffset = conversation.queryEndOffset

    if (queryStartOffset === undefined || queryEndOffset === undefined) return

    // Navigate to the buffer first
    const success = await navigateToBuffer()
    if (!success) return

    try {
      const model = editorRef.current.getModel()
      if (!model) return

      // Get positions for revealing and highlighting
      const startPosition = model.getPositionAt(queryStartOffset)
      const endPosition = model.getPositionAt(queryEndOffset)

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
  }, [conversation, editorRef, navigateToBuffer])

  const handleApplyToEditor = useCallback(
    async (sql: string) => {
      if (!conversation || !chatWindowState.activeQueryKey) return

      const normalizedSQL = normalizeSql(sql, false)

      try {
        // Reuse the same logic as accept, but skip updating accepted state
        // The apply functions return the final query key (which may differ from activeQueryKey)
        let finalQueryKey: QueryKey | undefined

        if (bufferStatus.type === "active") {
          finalQueryKey = applyChangesToActiveTab(normalizedSQL, {
            skipAcceptState: true,
          })
        } else if (
          bufferStatus.type === "deleted" ||
          bufferStatus.type === "archived"
        ) {
          finalQueryKey = await applyChangesToNewTab(normalizedSQL, {
            skipAcceptState: true,
          })
        } else if (bufferStatus.type === "inactive" && bufferStatus.buffer) {
          await navigateToBuffer()
          finalQueryKey = applyChangesToActiveTab(normalizedSQL, {
            skipAcceptState: true,
          })
        }

        // Add a hidden message to inform the model for the next round
        // Use the final query key (after potential key change from apply)
        const targetQueryKey = finalQueryKey ?? chatWindowState.activeQueryKey
        addMessage(targetQueryKey, {
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
      chatWindowState.activeQueryKey,
      bufferStatus,
      navigateToBuffer,
      addMessage,
    ],
  )

  if (!chatWindowState.isOpen || !conversation) {
    return null
  }

  return (
    <Container>
      <Header>
        <HeaderLeft>
          <SparkleIcon src="/assets/ai-sparkle.svg" alt="" />
          <HeaderTitle>{headerTitle}</HeaderTitle>
        </HeaderLeft>
        <CloseButton onClick={closeChatWindow} title="Close">
          ✕
        </CloseButton>
      </Header>
      <ChatWindowContent>
        <ChatPanel>
          {shouldShowMessages ? (
            <ChatMessages
              messages={messages}
              hasPendingDiff={hasPendingDiff}
              onAcceptChange={handleAcceptChange}
              onRejectChange={handleRejectChange}
              onRunQuery={handleRunQuery}
              onExpandDiff={handleExpandDiff}
              onApplyToEditor={handleApplyToEditor}
              running={running}
              aiSuggestionRequest={aiSuggestionRequest}
              queryNotifications={queryNotifications}
              queryStartOffset={conversation?.queryStartOffset ?? 0}
              conversationQueryKey={chatWindowState.activeQueryKey ?? undefined}
              isOperationInProgress={isBlockingAIStatus(aiStatus)}
              editorSQL={conversation?.acceptedSQL}
            />
          ) : currentSQL && currentSQL.trim() !== "\n" ? (
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
            </InitialQueryContainer>
          ) : null}
          <ChatInput
            ref={chatInputRef}
            onSend={(message) => handleSendMessage(message, hasPendingDiff)}
            disabled={!canUse || isBlockingAIStatus(aiStatus)}
            placeholder={
              !shouldShowMessages
                ? "Ask a question about this query..."
                : undefined
            }
            queryKey={chatWindowState.activeQueryKey ?? undefined}
            contextSQL={conversation?.acceptedSQL}
            contextSchemaData={conversation?.schemaData}
            onContextClick={handleContextClick}
          />
        </ChatPanel>
      </ChatWindowContent>
    </Container>
  )
}
