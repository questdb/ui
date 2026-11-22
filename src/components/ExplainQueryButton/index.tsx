import React, { useContext } from "react"
import styled from "styled-components"
import { Button, Box, Key, toast } from ".."
import { color } from "../../utils"
import { ctrlCmd } from "../../utils/platform"
import { useSelector } from "react-redux"
import { AISparkle } from "../AISparkle"
import { QuestContext } from "../../providers"
import { selectors } from "../../store"
import { useLocalAgentChannel } from "../../utils/localAgent/LocalAgentContext"
import { useAIStatus } from "../../providers/AIStatusProvider"
import { useAIConversationActions } from "../../providers/AIConversationProvider"
import type { ConversationId } from "../../providers/AIConversationProvider/types"
import {
  executeAIFlow,
  createExplainFlowConfig,
  localAgentDispatchError,
} from "../../utils/ai/executeAIFlow"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"

const KeyBinding = styled(Box).attrs({ alignItems: "center", gap: "0" })`
  color: ${({ theme }) => theme.color.aiPinkStart};
`

const shortcutTitle = `${ctrlCmd}+E`

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
  const localAgentChannel = useLocalAgentChannel()
  const {
    canUse,
    setStatus,
    getOperationSignal,
    isOperationBlocking,
    hasSchemaAccess,
    currentModel,
    apiKey,
    aiAssistantSettings,
  } = useAIStatus()
  const {
    addMessage,
    updateMessage,
    updateConversationName,
    persistMessages,
    setIsStreaming,
  } = useAIConversationActions()

  const handleExplainQuery = () => {
    if (!canUse || isOperationBlocking()) return
    const unavailable = localAgentDispatchError(currentModel, localAgentChannel)
    if (unavailable) {
      toast.error(unavailable)
      return
    }
    void trackEvent(ConsoleEvent.AI_EXPLAIN_QUERY)

    void executeAIFlow(
      createExplainFlowConfig({
        conversationId,
        queryText,
        settings: { model: currentModel, apiKey },
        localAgentChannel,
        aiAssistantSettings,
        questClient: quest,
        tables,
        hasSchemaAccess,
        abortSignal: getOperationSignal(),
      }),
      {
        addMessage,
        updateMessage,
        setStatus,
        setIsStreaming,
        persistMessages,
        updateConversationName,
      },
    )
  }

  return (
    <ExplainButton
      variant="gradient"
      gradientWeight="thin"
      onClick={handleExplainQuery}
      title={`Explain query with AI Assistant (${shortcutTitle})`}
      data-hook="button-explain-query"
    >
      <AISparkle size={12} variant="hollow" />
      Explain query
      <KeyBinding>
        <Key keyString={ctrlCmd} color={color("aiPinkStart")} />
        <Key keyString="E" color={color("aiPinkStart")} />
      </KeyBinding>
    </ExplainButton>
  )
}
