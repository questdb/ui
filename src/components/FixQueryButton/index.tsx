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
import { useAIConversation } from "../../providers/AIConversationProvider"
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

export const FixQueryButton = () => {
  const { quest } = useContext(QuestContext)
  const { editorRef, executionRefs } = useEditor()
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
    chatWindowState,
    getConversationMeta,
    addMessage,
    updateMessage,
    updateConversationName,
    persistMessages,
    setIsStreaming,
  } = useAIConversation()

  const handleFixQuery = () => {
    if (!canUse || isOperationBlocking()) return
    const unavailable = localAgentDispatchError(currentModel, localAgentChannel)
    if (unavailable) {
      toast.error(unavailable)
      return
    }
    const conversationId = chatWindowState.activeConversationId
    if (!conversationId) return
    const conversation = getConversationMeta(conversationId)
    if (!conversation?.queryKey || conversation.bufferId == null) return
    const errorInfo = extractErrorByQueryKey(
      conversation.queryKey,
      conversation.bufferId,
      executionRefs,
      editorRef,
    )
    if (!errorInfo) return
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
