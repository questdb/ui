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
import {
  useAIStatus,
  type OperationHistory,
} from "../../providers/AIStatusProvider"
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
    updateMessage,
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

    const assistantMessageId = crypto.randomUUID()
    addMessage(conversation.id, {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      operationHistory: [],
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

    const handleStatusUpdate = (history: OperationHistory) => {
      updateMessage(conversation.id, assistantMessageId, {
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
        setStatus(
          status,
          { ...(args ?? {}), conversationId: conversation.id },
          handleStatusUpdate,
        ),
      abortSignal: abortController?.signal,
      operation: "fix",
    })

    if (isAiAssistantError(response)) {
      const error = response
      updateMessage(conversation.id, assistantMessageId, {
        error: error.type !== "aborted" ? error.message : "Operation cancelled",
      })
      if (error.type !== "aborted") {
        toast.error(error.message, { autoClose: 10000 })
      }
      return
    }

    const result = response as GeneratedSQL

    if (!result.sql && result.explanation) {
      updateMessage(conversation.id, assistantMessageId, {
        content: result.explanation,
        explanation: result.explanation,
        tokenUsage: result.tokenUsage,
      })
      return
    }

    if (!result.sql) {
      updateMessage(conversation.id, assistantMessageId, {
        error: "No fixed query or explanation received from AI Assistant",
      })
      toast.error("No fixed query or explanation received from AI Assistant", {
        autoClose: 10000,
      })
      return
    }

    const assistantContent = result.explanation
      ? `SQL Query:\n\`\`\`sql\n${result.sql}\n\`\`\`\n\nExplanation:\n${result.explanation}`
      : `SQL Query:\n\`\`\`sql\n${result.sql}\n\`\`\``

    updateMessage(conversation.id, assistantMessageId, {
      content: assistantContent,
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
