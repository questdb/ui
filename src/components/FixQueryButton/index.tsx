import React, { useContext } from "react"
import styled from "styled-components"
import { Button, toast } from ".."
import { AISparkle } from "../AISparkle"
import { useSelector } from "react-redux"
import { useEditor } from "../../providers/EditorProvider"
import { QuestContext } from "../../providers"
import { selectors } from "../../store"
import { useLocalAgentChannel } from "../../utils/localAgent/LocalAgentContext"
import { useAIStatus } from "../../providers/AIStatusProvider"
import { useAIConversationActions } from "../../providers/AIConversationProvider"
import type { ConversationId } from "../../providers/AIConversationProvider/types"
import { extractErrorByQueryKey } from "../../scenes/Editor/utils"
import {
  executeAIFlow,
  createFixFlowConfig,
  localAgentDispatchError,
} from "../../utils/ai/executeAIFlow"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"

const FixButton = styled(Button)`
  gap: 1rem;
`

export const FixQueryButton = ({
  conversationId,
}: {
  conversationId: ConversationId
}) => {
  const { quest } = useContext(QuestContext)
  const { activeBuffer, editorRef, executionRefs } = useEditor()
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
    getChatDispatchState,
    getConversationMeta,
    addMessage,
    updateMessage,
    updateConversationName,
    persistMessages,
    setIsStreaming,
  } = useAIConversationActions()

  const handleFixQuery = () => {
    if (
      !canUse ||
      isOperationBlocking() ||
      !getChatDispatchState(conversationId)
    )
      return
    const unavailable = localAgentDispatchError(currentModel, localAgentChannel)
    if (unavailable) {
      toast.error(unavailable)
      return
    }
    const conversation = getConversationMeta(conversationId)
    if (
      !conversation?.queryKey ||
      conversation.bufferId == null ||
      conversation.bufferId !== activeBuffer.id
    )
      return
    const errorInfo = extractErrorByQueryKey(
      conversation.queryKey,
      conversation.bufferId,
      executionRefs,
      editorRef,
    )
    if (!errorInfo?.queryText.trim()) return
    void trackEvent(ConsoleEvent.AI_FIX_QUERY)

    const { errorMessage, queryText, word } = errorInfo

    void executeAIFlow(
      createFixFlowConfig({
        conversationId,
        queryText,
        errorMessage,
        errorWord: word ?? undefined,
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
    <FixButton
      variant="gradient"
      gradientWeight="thin"
      onClick={handleFixQuery}
      title="Fix query with AI Assistant"
      data-hook="button-fix-query"
    >
      <AISparkle size={12} variant="hollow" />
      Fix query
    </FixButton>
  )
}
