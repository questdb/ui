import React, { useContext } from "react"
import styled from "styled-components"
import { Button, Box, Key } from "../../components"
import { color, platform } from "../../utils"
import { useSelector } from "react-redux"
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
import { AISparkle } from "../AISparkle"
import { QuestContext } from "../../providers"
import { selectors } from "../../store"
import {
  useAIStatus,
  type OperationHistory,
  type AIOperationStatus,
  type StatusArgs,
} from "../../providers/AIStatusProvider"
import { useAIConversation } from "../../providers/AIConversationProvider"
import type { ConversationId } from "../../providers/AIConversationProvider/types"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"

const KeyBinding = styled(Box).attrs({ alignItems: "center", gap: "0" })`
  color: ${({ theme }) => theme.color.pinkPrimary};
`

const ctrlCmd = platform.isMacintosh || platform.isIOS ? "⌘" : "Ctrl"

const shortcutTitle =
  platform.isMacintosh || platform.isIOS ? "Cmd+E" : "Ctrl+E"

const ExplainButton = styled(Button)`
  gap: 1rem;
`

type ExplainQueryButtonProps = {
  conversationId: ConversationId
  queryText: string
}

export const ExplainQueryButton = ({
  conversationId,
  queryText,
}: ExplainQueryButtonProps) => {
  const { quest } = useContext(QuestContext)
  const tables = useSelector(selectors.query.getTables)
  const {
    setStatus,
    abortController,
    hasSchemaAccess,
    currentModel: currentModelValue,
    apiKey: apiKeyValue,
  } = useAIStatus()
  const { addMessage, updateMessage, updateConversationName, persistMessages } =
    useAIConversation()

  const handleExplainQuery = () => {
    const currentModel = currentModelValue!
    const apiKey = apiKeyValue!
    void (async () => {
      const fullApiMessage = `Using your tools when necessary, explain this SQL query in detail.:\n\n\`\`\`sql\n${queryText}\n\`\`\``

      addMessage({
        role: "user",
        content: fullApiMessage,
        timestamp: Date.now(),
        displayType: "explain_request",
        sql: queryText,
      })

      const assistantMessageId = crypto.randomUUID()
      addMessage({
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        operationHistory: [],
      })

      eventBus.publish(EventType.AI_QUERY_HIGHLIGHT, conversationId)

      const provider = providerForModel(currentModel)
      const settings: ActiveProviderSettings = {
        model: currentModel,
        provider,
        apiKey,
      }

      const testModel = MODEL_OPTIONS.find(
        (m) => m.isTestModel && m.provider === provider,
      )
      if (testModel) {
        void generateChatTitle({
          firstUserMessage: fullApiMessage,
          settings: { model: testModel.value, provider, apiKey },
        }).then((title) => {
          if (title) {
            void updateConversationName(conversationId, title)
          }
        })
      }

      const handleStatusUpdate = (history: OperationHistory) => {
        updateMessage(conversationId, assistantMessageId, {
          operationHistory: [...history],
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
        setStatus: (status: AIOperationStatus | null, args?: StatusArgs) =>
          setStatus(
            status,
            { ...(args ?? {}), conversationId },
            handleStatusUpdate,
          ),
        abortSignal: abortController?.signal,
        operation: "explain",
      })

      if (isAiAssistantError(response)) {
        const error = response
        updateMessage(conversationId, assistantMessageId, {
          error:
            error.type !== "aborted"
              ? error.message
              : "Operation has been cancelled",
        })
        await persistMessages(conversationId)
        return
      }

      const result = response
      if (!result.explanation) {
        updateMessage(conversationId, assistantMessageId, {
          error: "No explanation received from AI Assistant",
        })
        await persistMessages(conversationId)
        return
      }

      updateMessage(conversationId, assistantMessageId, {
        content: result.explanation,
        explanation: result.explanation,
        tokenUsage: result.tokenUsage,
      })

      await persistMessages(conversationId)
    })()
  }

  return (
    <ExplainButton
      skin="gradient"
      gradientWeight="thin"
      onClick={handleExplainQuery}
      title={`Explain query with AI Assistant (${shortcutTitle})`}
      data-hook="button-explain-query"
    >
      <AISparkle size={12} variant="hollow" />
      Explain query
      <KeyBinding>
        <Key
          keyString={ctrlCmd}
          color={color("pinkPrimary")}
          hoverColor={color("pinkPrimary")}
        />
        <Key
          keyString="E"
          color={color("pinkPrimary")}
          hoverColor={color("pinkPrimary")}
        />
      </KeyBinding>
    </ExplainButton>
  )
}
