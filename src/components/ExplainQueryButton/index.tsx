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
import { toast } from "../Toast"
import { QuestContext } from "../../providers"
import { selectors } from "../../store"
import {
  useAIStatus,
  type OperationHistory,
} from "../../providers/AIStatusProvider"
import { useAIConversation } from "../../providers/AIConversationProvider"
import type { ConversationId } from "../../providers/AIConversationProvider/types"

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
  const { addMessage, updateMessage, updateConversationName } =
    useAIConversation()

  const handleExplainQuery = () => {
    const currentModel = currentModelValue!
    const apiKey = apiKeyValue!
    void (async () => {
      const fullApiMessage = `Explain this SQL query with 2-4 sentences:\n\n\`\`\`sql\n${queryText}\n\`\`\``

      addMessage(conversationId, {
        role: "user",
        content: fullApiMessage,
        timestamp: Date.now(),
        displayType: "explain_request",
        displaySQL: queryText,
      })

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

      const testModel = MODEL_OPTIONS.find(
        (m) => m.isTestModel && m.provider === provider,
      )
      if (testModel) {
        void generateChatTitle({
          firstUserMessage: fullApiMessage,
          settings: { model: testModel.value, provider, apiKey },
        }).then((title) => {
          if (title) {
            updateConversationName(conversationId, title)
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
        setStatus: (status, args) =>
          setStatus(status, args, handleStatusUpdate),
        abortSignal: abortController?.signal,
        operation: "explain",
        conversationId,
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
      if (!result.explanation) {
        updateMessage(conversationId, assistantMessageId, {
          error: "No explanation received from AI Assistant",
        })
        toast.error("No explanation received from AI Assistant", {
          autoClose: 10000,
        })
        return
      }

      updateMessage(conversationId, assistantMessageId, {
        content: result.explanation,
        explanation: result.explanation,
        tokenUsage: result.tokenUsage,
      })
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
