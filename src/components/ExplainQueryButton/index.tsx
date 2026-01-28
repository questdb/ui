import React, { useContext } from "react"
import styled from "styled-components"
import { Button, Box, Key } from "../../components"
import { color, platform } from "../../utils"
import { useSelector } from "react-redux"
import { AISparkle } from "../AISparkle"
import { QuestContext } from "../../providers"
import { selectors } from "../../store"
import { useAIStatus } from "../../providers/AIStatusProvider"
import { useAIConversation } from "../../providers/AIConversationProvider"
import type { ConversationId } from "../../providers/AIConversationProvider/types"
import {
  executeAIFlow,
  createExplainFlowConfig,
} from "../../utils/executeAIFlow"

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
  const {
    addMessage,
    updateMessage,
    updateConversationName,
    persistMessages,
    setIsStreaming,
  } = useAIConversation()

  const handleExplainQuery = () => {
    const currentModel = currentModelValue!
    const apiKey = apiKeyValue!

    void executeAIFlow(
      createExplainFlowConfig({
        conversationId,
        queryText,
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
      },
    )
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
