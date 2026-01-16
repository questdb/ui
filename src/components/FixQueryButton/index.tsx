import React, { useContext } from "react"
import type { MutableRefObject } from "react"
import styled from "styled-components"
import { Button } from ".."
import { AISparkle } from "../AISparkle"
import { useSelector } from "react-redux"
import { useEditor } from "../../providers/EditorProvider"
import { QuestContext } from "../../providers"
import { selectors } from "../../store"
import { useAIStatus } from "../../providers/AIStatusProvider"
import { useAIConversation } from "../../providers/AIConversationProvider"
import { extractErrorByQueryKey } from "../../scenes/Editor/utils"
import type { ExecutionRefs } from "../../scenes/Editor/index"
import { executeAIFlow, createFixFlowConfig } from "../../utils/executeAIFlow"

const FixButton = styled(Button)`
  gap: 1rem;
`

export const FixQueryButton = () => {
  const { quest } = useContext(QuestContext)
  const { editorRef, executionRefs } = useEditor()
  const tables = useSelector(selectors.query.getTables)
  const { setStatus, abortController, hasSchemaAccess, currentModel, apiKey } =
    useAIStatus()
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
    const conversationId = chatWindowState.activeConversationId!
    const conversation = getConversationMeta(conversationId)!

    const errorInfo = extractErrorByQueryKey(
      conversation.queryKey!,
      conversation.bufferId!,
      executionRefs as MutableRefObject<ExecutionRefs> | undefined,
      editorRef,
    )!

    const { errorMessage, queryText, word } = errorInfo

    void executeAIFlow(
      createFixFlowConfig({
        conversationId,
        queryText,
        errorMessage,
        errorWord: word ?? undefined,
        settings: { model: currentModel!, apiKey: apiKey! },
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
    <FixButton
      skin="gradient"
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
