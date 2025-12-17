import React, { useContext, useEffect, useCallback } from "react"
import styled, { css } from "styled-components"
import { Button, Box, Key } from "../../components"
import { color, platform } from "../../utils"
import { useSelector } from "react-redux"
import { useEditor } from "../../providers/EditorProvider"
import {
  continueConversation,
  createModelToolsClient,
  isAiAssistantError,
  generateChatTitle,
  type ActiveProviderSettings,
} from "../../utils/aiAssistant"
import {
  providerForModel,
  MODEL_OPTIONS,
} from "../../utils/aiAssistantSettings"
import { toast } from "../Toast"
import { QuestContext } from "../../providers"
import { selectors } from "../../store"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { RunningType } from "../../store/Query/types"
import {
  useAIStatus,
  isBlockingAIStatus,
} from "../../providers/AIStatusProvider"
import { useAIConversation } from "../../providers/AIConversationProvider"
import { createQueryKeyFromRequest } from "../../scenes/Editor/Monaco/utils"

const KeyBinding = styled(Box).attrs({ alignItems: "center", gap: "0" })<{
  $disabled: boolean
}>`
  margin-left: 1rem;
  color: ${({ theme }) => theme.color.pinkPrimary};
  ${({ $disabled, theme }) =>
    $disabled &&
    css`
      color: ${theme.color.gray1};
    `}
`

const ctrlCmd = platform.isMacintosh || platform.isIOS ? "⌘" : "Ctrl"

const shortcutTitle =
  platform.isMacintosh || platform.isIOS ? "Cmd+E" : "Ctrl+E"

export const ExplainQueryButton = () => {
  const { quest } = useContext(QuestContext)
  const { editorRef, activeBuffer } = useEditor()
  const tables = useSelector(selectors.query.getTables)
  const running = useSelector(selectors.query.getRunning)
  const queriesToRun = useSelector(selectors.query.getQueriesToRun)
  const {
    status: aiStatus,
    setStatus,
    abortController,
    canUse,
    hasSchemaAccess,
    currentModel,
    apiKey,
  } = useAIStatus()
  const {
    getOrCreateConversationForQuery,
    openChatWindow,
    addMessage,
    addMessageAndUpdateSQL,
    updateConversationName,
  } = useAIConversation()
  const disabled =
    running !== RunningType.NONE ||
    queriesToRun.length !== 1 ||
    isBlockingAIStatus(aiStatus)
  const isSelection = queriesToRun.length === 1 && queriesToRun[0].selection

  const handleExplainQuery = useCallback(() => {
    const editorInstance = editorRef.current
    if (!editorInstance || disabled) return

    void (async () => {
      const editorModel = editorInstance.getModel()
      if (!editorModel) return
      if (!canUse) {
        toast.error("No model selected for AI Assistant")
        return
      }

      const query = queriesToRun[0]
      const queryText = query.selection
        ? query.selection.queryText
        : query.query
      const queryKey = createQueryKeyFromRequest(editorInstance, query)

      // Calculate query offsets for position tracking
      const queryStartOffset = query.selection ? query.selection.startOffset : 0
      const queryEndOffset = queryStartOffset + queryText.length

      // Get or create conversation for this queryKey with position info
      const conversation = getOrCreateConversationForQuery({
        queryKey,
        bufferId: activeBuffer.id!,
        queryText,
        queryStartOffset,
        queryEndOffset,
      })

      const queryToExplain = queriesToRun[0]

      // Build the full API message (sent to the model)
      const fullApiMessage = queryToExplain.selection
        ? `Explain this portion of the query:\n\n\`\`\`sql\n${queryToExplain.selection.queryText}\n\`\`\` within this query:\n\n\`\`\`sql\n${queryToExplain.query}\n\`\`\` with 2-4 sentences`
        : `Explain this SQL query with 2-4 sentences:\n\n\`\`\`sql\n${queryToExplain.query}\n\`\`\``

      // Add the initial user message with display info for cleaner UI
      addMessage(conversation.id, {
        role: "user",
        content: fullApiMessage,
        timestamp: Date.now(),
        displayType: "explain_request",
        displaySQL: queryText,
      })

      // Open chat window immediately
      openChatWindow(conversation.id)

      // Now explain query in the background
      const provider = providerForModel(currentModel)
      const settings: ActiveProviderSettings = {
        model: currentModel,
        provider,
        apiKey,
      }

      // Generate chat title in parallel using test model
      const testModel = MODEL_OPTIONS.find(
        (m) => m.isTestModel && m.provider === provider,
      )
      if (testModel) {
        void generateChatTitle({
          firstUserMessage: fullApiMessage,
          settings: { model: testModel.value, provider, apiKey },
        }).then((title) => {
          if (title) {
            updateConversationName(conversation.id, title)
          }
        })
      }

      const response = await continueConversation({
        userMessage: fullApiMessage,
        conversationHistory: [],
        currentSQL: queryText,
        settings,
        modelToolsClient: createModelToolsClient(
          quest,
          hasSchemaAccess ? tables : undefined,
        ),
        setStatus,
        abortSignal: abortController?.signal,
        operation: "explain",
        conversationId: conversation.id,
      })

      if (isAiAssistantError(response)) {
        const error = response
        if (error.type !== "aborted") {
          toast.error(error.message, { autoClose: 10000 })
        }
        return
      }

      const result = response
      if (!result.explanation) {
        toast.error("No explanation received from AI Assistant", {
          autoClose: 10000,
        })
        return
      }

      // Build complete assistant response content (explanation only for explain flow)
      // Note: The user message was already added before the API call for immediate UI feedback
      const assistantContent = result.explanation

      addMessageAndUpdateSQL(conversation.id, {
        role: "assistant",
        content: assistantContent,
        timestamp: Date.now(),
        explanation: result.explanation,
        tokenUsage: result.tokenUsage,
      })
    })()
  }, [
    disabled,
    queriesToRun,
    tables,
    quest,
    setStatus,
    abortController,
    canUse,
    hasSchemaAccess,
    currentModel,
    apiKey,
    getOrCreateConversationForQuery,
    openChatWindow,
    addMessage,
    addMessageAndUpdateSQL,
    updateConversationName,
    editorRef,
  ])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && (e.key === "e" || e.key === "E"))) {
        return
      }
      e.preventDefault()
      void handleExplainQuery()
    },
    [handleExplainQuery],
  )

  useEffect(() => {
    eventBus.subscribe(EventType.EXPLAIN_QUERY_EXEC, handleExplainQuery)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      eventBus.unsubscribe(EventType.EXPLAIN_QUERY_EXEC, handleExplainQuery)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleExplainQuery])

  if (!canUse) {
    return null
  }

  return (
    <Button
      skin="gradient"
      gradientWeight="thin"
      onClick={handleExplainQuery}
      disabled={disabled}
      title={`Explain query with AI Assistant (${shortcutTitle})`}
      data-hook="button-explain-query"
    >
      {isSelection ? "Explain selected query" : "Explain query"}
      <KeyBinding $disabled={disabled}>
        <Key
          keyString={ctrlCmd}
          color={disabled ? color("gray1") : color("pinkPrimary")}
          hoverColor={disabled ? color("gray1") : color("pinkPrimary")}
        />
        <Key
          keyString="E"
          color={disabled ? color("gray1") : color("pinkPrimary")}
          hoverColor={disabled ? color("gray1") : color("pinkPrimary")}
        />
      </KeyBinding>
    </Button>
  )
}
