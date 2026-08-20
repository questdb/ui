import React, { useContext } from "react"
import styled from "styled-components"
import { Button, Box, Key } from "../../components"
import { color } from "../../utils"
import { ctrlCmd } from "../../utils/platform"
import { useSelector } from "react-redux"
import { AISparkle } from "../AISparkle"
import { QuestContext } from "../../providers"
import { selectors } from "../../store"
import { useAIStatus } from "../../providers/AIStatusProvider"
import { useAIConversationActions } from "../../providers/AIConversationProvider"
import type { ConversationId } from "../../providers/AIConversationProvider/types"
import {
  executeAIFlow,
  createExplainFlowConfig,
} from "../../utils/ai/executeAIFlow"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"

const KeyBinding = styled(Box).attrs({ alignItems: "center", gap: "0" })`
  color: ${({ theme }) => theme.color.contentAccentStrong};
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
  const {
    setStatus,
    abortController,
    hasSchemaAccess,
    currentModel: currentModelValue,
    apiKey: apiKeyValue,
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
    void trackEvent(ConsoleEvent.AI_EXPLAIN_QUERY)
    const currentModel = currentModelValue!
    const apiKey = apiKeyValue!

    void executeAIFlow(
      createExplainFlowConfig({
        conversationId,
        queryText,
        settings: { model: currentModel, apiKey },
        aiAssistantSettings,
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
        <Key keyString={ctrlCmd} color={color("contentAccentStrong")} />
        <Key keyString="E" color={color("contentAccentStrong")} />
      </KeyBinding>
    </ExplainButton>
  )
}
