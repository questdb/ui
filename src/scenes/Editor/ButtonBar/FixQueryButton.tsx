import React, { useContext, MutableRefObject } from "react"
import { Button } from "../../../components"
import { useSelector } from "react-redux"
import { useEditor } from "../../../providers"
import type { GeneratedSQL } from "../../../utils/aiAssistant"
import {
  isAiAssistantError,
  createModelToolsClient,
  fixQuery,
  generateChatTitle,
  type ActiveProviderSettings,
} from "../../../utils/aiAssistant"
import {
  providerForModel,
  MODEL_OPTIONS,
} from "../../../utils/aiAssistantSettings"
import { toast } from "../../../components/Toast"
import { QuestContext } from "../../../providers"
import { selectors } from "../../../store"
import { RunningType } from "../../../store/Query/types"
import { createQueryKeyFromRequest } from "../../../scenes/Editor/Monaco/utils"
import type { ExecutionRefs } from "../../../scenes/Editor"
import type { Request } from "../../../scenes/Editor/Monaco/utils"
import type { editor } from "monaco-editor"
import {
  isBlockingAIStatus,
  useAIStatus,
} from "../../../providers/AIStatusProvider"
import { useAIConversation } from "../../../providers/AIConversationProvider"

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor

const extractError = (
  queryToFix: Request,
  executionRefs: React.MutableRefObject<ExecutionRefs> | undefined,
  activeBufferId: string | number | undefined,
  editorRef: MutableRefObject<IStandaloneCodeEditor | null>,
): {
  errorMessage: string
  fixStart: number
  fixEnd: number
  queryText: string
  word: string | null
} | null => {
  if (!executionRefs?.current || !activeBufferId || !editorRef.current) {
    return null
  }
  const model = editorRef.current.getModel()
  if (!model) {
    return null
  }

  const bufferExecutions = executionRefs.current[activeBufferId as number]
  if (!bufferExecutions) {
    return null
  }

  const queryKey = createQueryKeyFromRequest(editorRef.current, queryToFix)
  const execution = bufferExecutions[queryKey]

  if (!execution || !execution.error) {
    return null
  }
  const fixStart = execution.selection
    ? execution.selection.startOffset
    : execution.startOffset

  const fixEnd = execution.selection
    ? execution.selection.endOffset
    : execution.endOffset

  const startPosition = model.getPositionAt(fixStart)
  const errorWordPosition = model.getPositionAt(
    fixStart + execution.error.position,
  )
  const errorWord = model.getWordAtPosition(errorWordPosition)
  const endPosition = model.getPositionAt(
    execution.selection?.endOffset ?? execution.startOffset,
  )
  const queryText = execution.selection
    ? model.getValueInRange({
        startLineNumber: startPosition.lineNumber,
        startColumn: startPosition.column,
        endLineNumber: endPosition.lineNumber,
        endColumn: endPosition.column,
      })
    : queryToFix.query

  return {
    errorMessage: execution.error.error || "Query execution failed",
    word: errorWord ? errorWord.word : null,
    fixStart,
    fixEnd,
    queryText,
  }
}

type Props = {
  executionRefs?: React.MutableRefObject<ExecutionRefs>
}

export const FixQueryButton = ({ executionRefs }: Props) => {
  const { quest } = useContext(QuestContext)
  const { editorRef, activeBuffer } = useEditor()
  const tables = useSelector(selectors.query.getTables)
  const running = useSelector(selectors.query.getRunning)
  const queriesToRun = useSelector(selectors.query.getQueriesToRun)
  const {
    status: aiStatus,
    setStatus,
    abortController,
    canUse,
    hasSchemaAccess,
    currentModel,
    apiKey,
  } = useAIStatus()
  const {
    getOrCreateConversation,
    openChatWindow,
    addMessage,
    addMessageAndUpdateSQL,
    updateConversationName,
  } = useAIConversation()

  if (!canUse) {
    return null
  }

  const handleFixQuery = async () => {
    if (!editorRef.current || queriesToRun.length !== 1) return
    const editorModel = editorRef.current.getModel()
    if (!editorModel) return

    if (!canUse) {
      toast.error("AI Assistant is not configured", { autoClose: 10000 })
      return
    }

    const queryToFix = queriesToRun[0]
    const errorInfo = extractError(
      queryToFix,
      executionRefs,
      activeBuffer.id,
      editorRef,
    )
    if (!errorInfo) {
      toast.error("Unable to retrieve error information from the editor", {
        autoClose: 10000,
      })
      return
    }
    const { errorMessage, fixStart, fixEnd, queryText, word } = errorInfo

    // Create query key from the request
    const queryKey = createQueryKeyFromRequest(editorRef.current, queryToFix)

    // Get or create conversation for this queryKey with position info
    getOrCreateConversation({
      queryKey,
      bufferId: activeBuffer.id,
      originalQuery: queryText,
      initialSQL: queryText,
      initialExplanation: "",
      queryStartOffset: fixStart,
      queryEndOffset: fixEnd,
    })

    // Build the full API message (sent to the model)
    const fullApiMessage = `Fix this SQL query that has an error:\n\n\`\`\`sql\n${queryText}\n\`\`\`\n\nError: ${errorMessage}${word ? `\n\nError near: "${word}"` : ""}`

    // Add the initial user message with display info for cleaner UI
    addMessage(queryKey, {
      role: "user",
      content: fullApiMessage,
      timestamp: Date.now(),
      displayType: "fix_request",
      displaySQL: queryText,
    })

    // Open chat window immediately
    openChatWindow(queryKey)

    // Now fix query in the background
    const provider = providerForModel(currentModel)
    const settings: ActiveProviderSettings = {
      model: currentModel,
      provider,
      apiKey,
    }

    // Generate chat title in parallel using test model
    const testModel = MODEL_OPTIONS.find(
      (m) => m.isTestModel && m.provider === provider,
    )
    if (testModel) {
      void generateChatTitle({
        firstUserMessage: fullApiMessage,
        settings: { model: testModel.value, provider, apiKey },
      }).then((title) => {
        if (title) {
          updateConversationName(queryKey, title)
        }
      })
    }

    const response = await fixQuery({
      query: queryText,
      errorMessage,
      settings,
      modelToolsClient: createModelToolsClient(
        quest,
        hasSchemaAccess ? tables : undefined,
      ),
      setStatus,
      abortSignal: abortController?.signal,
      word,
    })

    if (isAiAssistantError(response)) {
      const error = response
      if (error.type !== "aborted") {
        toast.error(error.message, { autoClose: 10000 })
      }
      return
    }

    const result = response as GeneratedSQL

    // Handle case where no SQL fix was provided, only explanation
    if (!result.sql && result.explanation) {
      // Add assistant message with explanation only
      addMessageAndUpdateSQL(
        queryKey,
        {
          role: "assistant",
          content: result.explanation,
          timestamp: Date.now(),
          explanation: result.explanation,
          tokenUsage: result.tokenUsage,
        },
        queryText, // Keep original SQL since no fix was provided
        result.explanation,
      )
      return
    }

    if (!result.sql) {
      toast.error("No fixed query or explanation received from AI Assistant", {
        autoClose: 10000,
      })
      return
    }

    // Build complete assistant response content (SQL + explanation)
    const assistantContent = result.explanation
      ? `SQL Query:\n\`\`\`sql\n${result.sql}\n\`\`\`\n\nExplanation:\n${result.explanation}`
      : `SQL Query:\n\`\`\`sql\n${result.sql}\n\`\`\``

    // Add assistant response with the fixed SQL
    addMessageAndUpdateSQL(
      queryKey,
      {
        role: "assistant",
        content: assistantContent,
        timestamp: Date.now(),
        sql: result.sql,
        explanation: result.explanation,
        tokenUsage: result.tokenUsage,
      },
      result.sql,
      result.explanation || "",
    )
  }

  return (
    <Button
      skin="gradient"
      gradientWeight="thin"
      onClick={handleFixQuery}
      disabled={running !== RunningType.NONE || isBlockingAIStatus(aiStatus)}
      title="Fix query with AI Assistant"
      data-hook="button-fix-query"
    >
      Fix query with AI
    </Button>
  )
}
