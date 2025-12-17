import React, { useContext } from "react"
import type { MutableRefObject } from "react"
import styled from "styled-components"
import { Button } from ".."
import { AISparkle } from "../AISparkle"
import { useSelector } from "react-redux"
import { useEditor } from "../../providers/EditorProvider"
import type { GeneratedSQL } from "../../utils/aiAssistant"
import {
  isAiAssistantError,
  createModelToolsClient,
  continueConversation,
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
import { useAIStatus } from "../../providers/AIStatusProvider"
import { useAIConversation } from "../../providers/AIConversationProvider"
import { extractErrorByQueryKey } from "../../scenes/Editor/utils"
import type { ExecutionRefs } from "../../scenes/Editor/index"

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
    getConversation,
    addMessage,
    addMessageAndUpdateSQL,
    updateConversationName,
  } = useAIConversation()

  const handleFixQuery = async () => {
    const conversationId = chatWindowState.activeConversationId!
    const conversation = getConversation(conversationId)!

    const errorInfo = extractErrorByQueryKey(
      conversation.queryKey!,
      conversation.bufferId!,
      executionRefs as MutableRefObject<ExecutionRefs> | undefined,
      editorRef,
    )!

    const { errorMessage, queryText, word } = errorInfo

    const fullApiMessage = `Fix this SQL query that has an error:\n\n\`\`\`sql\n${queryText}\n\`\`\`\n\nError: ${errorMessage}${word ? `\n\nError near: "${word}"` : ""}`

    addMessage(conversation.id, {
      role: "user",
      content: fullApiMessage,
      timestamp: Date.now(),
      displayType: "fix_request",
      displaySQL: queryText,
    })

    const provider = providerForModel(currentModel!)
    const settings: ActiveProviderSettings = {
      model: currentModel!,
      provider,
      apiKey: apiKey!,
    }

    const testModel = MODEL_OPTIONS.find(
      (m) => m.isTestModel && m.provider === provider,
    )
    if (testModel) {
      void generateChatTitle({
        firstUserMessage: fullApiMessage,
        settings: { model: testModel.value, provider, apiKey: apiKey! },
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
      operation: "fix",
      conversationId: conversation.id,
    })

    if (isAiAssistantError(response)) {
      const error = response
      if (error.type !== "aborted") {
        toast.error(error.message, { autoClose: 10000 })
      }
      return
    }

    const result = response as GeneratedSQL

    if (!result.sql && result.explanation) {
      addMessageAndUpdateSQL(conversation.id, {
        role: "assistant",
        content: result.explanation,
        timestamp: Date.now(),
        explanation: result.explanation,
        tokenUsage: result.tokenUsage,
      })
      return
    }

    if (!result.sql) {
      toast.error("No fixed query or explanation received from AI Assistant", {
        autoClose: 10000,
      })
      return
    }

    const assistantContent = result.explanation
      ? `SQL Query:\n\`\`\`sql\n${result.sql}\n\`\`\`\n\nExplanation:\n${result.explanation}`
      : `SQL Query:\n\`\`\`sql\n${result.sql}\n\`\`\``

    addMessageAndUpdateSQL(conversation.id, {
      role: "assistant",
      content: assistantContent,
      timestamp: Date.now(),
      sql: result.sql,
      explanation: result.explanation,
      tokenUsage: result.tokenUsage,
    })
  }

  return (
    <FixButton
      skin="gradient"
      gradientWeight="thin"
      onClick={handleFixQuery}
      title="Fix query with AI Assistant"
      data-hook="button-inline-fix-query"
    >
      <AISparkle size={12} variant="hollow" />
      Fix query
    </FixButton>
  )
}
