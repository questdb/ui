import { useContext } from "react"
import { useSelector } from "react-redux"
import { toast } from "../components"
import { QuestContext } from "../providers"
import { useAIConversationActions } from "../providers/AIConversationProvider"
import { LOCAL_AGENT_MODEL } from "../utils/localAgent/localAgentModel"
import { useLocalAgentChannel } from "../utils/localAgent/LocalAgentContext"
import { isCurrentLocalAgentChannel } from "../utils/localAgent/localAgentChannel"
import { useAIStatus } from "../providers/AIStatusProvider"
import {
  executeAIFlow,
  createSchemaExplainFlowConfig,
  createHealthIssueFlowConfig,
} from "../utils/ai/executeAIFlow"
import { getDocsSectionByUrl } from "../utils/questdbDocsRetrieval"
import { ISSUE_DOCS_URLS } from "../scenes/Schema/TableDetailsDrawer/healthCheck"
import type {
  HealthIssue,
  TimestampedSample,
} from "../scenes/Schema/TableDetailsDrawer/healthCheck"
import * as QuestDB from "../utils/questdb"
import { selectors } from "../store"
import { getTableKindLabel } from "../utils/questdb/types"
import type {
  LiveView,
  MaterializedView,
  PartitionBy,
  QueryResult,
  Table,
  TableKind,
} from "../utils/questdb/types"

type HealthIssueDiagnosticContext = {
  source: "materialized_views()" | "live_views()"
  data: MaterializedView | LiveView
  guidance?: string
}

type SchemaDisplayData = {
  tableName: string
  kind: TableKind
  partitionBy?: PartitionBy
  walEnabled?: boolean
  designatedTimestamp?: string
}

export const useAIQuickActions = () => {
  const { quest } = useContext(QuestContext)
  const tables = useSelector(selectors.query.getTables)
  const localAgentChannel = useLocalAgentChannel()
  const {
    setStatus,
    abortController,
    canUse,
    hasSchemaAccess,
    currentModel,
    apiKey,
    isOperationBlocking,
    aiAssistantSettings,
  } = useAIStatus()

  const {
    findConversationByTableId,
    createConversation,
    openChatWindow,
    getChatDispatchState,
    addMessage,
    removeMessages,
    updateMessage,
    updateConversationName,
    persistMessages,
    setIsStreaming,
    getLastRoundMessages,
    setScrollToMessageId,
  } = useAIConversationActions()

  // Bind to the selected channel before preparation; never look up a new
  // destination after waiting for schema, docs, or the conversation store.
  const abortSignal = abortController?.signal
  const canContinue = () =>
    !isOperationBlocking() &&
    !abortSignal?.aborted &&
    (currentModel !== LOCAL_AGENT_MODEL ||
      isCurrentLocalAgentChannel(localAgentChannel))

  const captureDispatch = (id: string) => {
    const active = getChatDispatchState(id)
    return () => {
      const current = getChatDispatchState(id)
      return (
        active !== null &&
        current?.owner === active.owner &&
        current.messages === active.messages &&
        canContinue()
      )
    }
  }

  const getTableSchema = async (
    tableName: string,
    kind: TableKind,
  ): Promise<string | null> => {
    try {
      const response = await quest.showDDL(tableName, kind)

      if (response?.type === QuestDB.Type.DQL && response.data?.[0]?.ddl) {
        return response.data[0].ddl
      }
    } catch (_error) {
      toast.error(
        `Cannot fetch schema for ${getTableKindLabel(kind).toLowerCase()} '${tableName}'`,
      )
    }
    return null
  }

  const handleExplainSchema = async (
    id: number,
    name: string,
    kind: TableKind,
    schemaDisplayData?: Omit<SchemaDisplayData, "tableName" | "kind">,
  ) => {
    if (!canContinue()) {
      return
    }
    if (!canUse) {
      toast.error(
        "AI Assistant is not enabled. Please configure your API key in settings.",
      )
      return
    }
    if (!hasSchemaAccess) {
      toast.error("Schema access is not granted to this model.")
      return
    }

    const schema = await getTableSchema(name, kind)
    if (!schema || !canContinue()) {
      return
    }

    const existingConversation = findConversationByTableId(id)

    if (existingConversation) {
      await openChatWindow(existingConversation.id)
      const canDispatch = captureDispatch(existingConversation.id)
      if (!canDispatch()) return

      const result = await executeAIFlow(
        createSchemaExplainFlowConfig({
          conversationId: existingConversation.id,
          tableName: name,
          schema,
          kindLabel: getTableKindLabel(kind),
          schemaDisplayData: {
            tableName: name,
            kind,
            ...schemaDisplayData,
          },
          settings: { model: currentModel, apiKey },
          aiAssistantSettings,
          localAgentChannel,
          canDispatch,
          questClient: quest,
          tables,
          hasSchemaAccess,
          abortSignal,
          useLastMessage: true,
        }),
        {
          addMessage,
          removeMessages,
          updateMessage,
          setStatus,
          setIsStreaming,
          persistMessages,
          getLastRoundMessages,
        },
      )

      if (result.cached && result.cachedMessageId) {
        setScrollToMessageId(result.cachedMessageId)
      }
      return
    }

    const conversation = await createConversation({
      tableId: id,
    })
    if (!canContinue()) return

    void updateConversationName(conversation.id, `${name} schema explanation`)
    await openChatWindow(conversation.id)
    const canDispatch = captureDispatch(conversation.id)
    if (!canDispatch()) return

    void executeAIFlow(
      createSchemaExplainFlowConfig({
        conversationId: conversation.id,
        tableName: name,
        schema,
        kindLabel: getTableKindLabel(kind),
        schemaDisplayData: {
          tableName: name,
          kind,
          ...schemaDisplayData,
        },
        settings: { model: currentModel, apiKey },
        aiAssistantSettings,
        localAgentChannel,
        canDispatch,
        questClient: quest,
        tables,
        hasSchemaAccess,
        abortSignal,
      }),
      {
        addMessage,
        removeMessages,
        updateMessage,
        setStatus,
        setIsStreaming,
        persistMessages,
      },
    )
  }

  const handleAskAIForHealthIssue = async (
    tableId: number,
    tableName: string,
    issue: HealthIssue,
    trendSamples?: TimestampedSample[],
    diagnosticContext?: HealthIssueDiagnosticContext,
  ) => {
    if (!canContinue()) {
      return
    }
    if (!canUse) {
      toast.error(
        "AI Assistant is not enabled. Please configure your API key in settings.",
      )
      return
    }
    if (!hasSchemaAccess) {
      toast.error("Schema access is not granted to this model.")
      return
    }

    let tableDetailsResponse: QueryResult<Table> | undefined
    try {
      tableDetailsResponse = await quest.getTableDetails(tableName)
    } catch (_error) {
      console.error(`Cannot fetch details for table '${tableName}'`)
    }
    if (
      !tableDetailsResponse ||
      tableDetailsResponse.type !== QuestDB.Type.DQL ||
      !tableDetailsResponse.data[0]
    ) {
      toast.error(`Cannot fetch details for table '${tableName}'`)
      return
    }
    if (!canContinue()) return
    const tableDetails = QuestDB.stringifyWithBigInts(
      tableDetailsResponse.data[0],
      2,
    )
    const diagnosticDetails = diagnosticContext
      ? {
          source: diagnosticContext.source,
          data: QuestDB.stringifyWithBigInts(diagnosticContext.data, 2),
        }
      : undefined

    let monitoringDocs: string
    try {
      const docsUrl = ISSUE_DOCS_URLS[issue.id]
      monitoringDocs = docsUrl
        ? await getDocsSectionByUrl(docsUrl)
        : "Documentation unavailable"
    } catch (_error) {
      monitoringDocs = "Documentation unavailable"
    }

    if (!canContinue()) return
    const existingConversation = findConversationByTableId(tableId)

    if (existingConversation) {
      await openChatWindow(existingConversation.id)
      const canDispatch = captureDispatch(existingConversation.id)
      if (!canDispatch()) return

      const result = await executeAIFlow(
        createHealthIssueFlowConfig({
          conversationId: existingConversation.id,
          tableName,
          issue: {
            id: issue.id,
            field: issue.field,
            message: issue.message,
            currentValue: issue.promptValue ?? issue.currentValue,
            severity: issue.severity as "critical" | "warning",
          },
          tableDetails,
          diagnosticDetails,
          issueGuidance: diagnosticContext?.guidance,
          monitoringDocs,
          trendSamples,
          settings: { model: currentModel, apiKey },
          aiAssistantSettings,
          localAgentChannel,
          canDispatch,
          questClient: quest,
          tables,
          hasSchemaAccess,
          abortSignal,
          useLastMessage: true,
        }),
        {
          addMessage,
          removeMessages,
          updateMessage,
          setStatus,
          setIsStreaming,
          persistMessages,
          getLastRoundMessages,
        },
      )

      if (result.cached && result.cachedMessageId) {
        setScrollToMessageId(result.cachedMessageId)
      }
      return
    }

    const conversation = await createConversation({
      tableId,
    })
    if (!canContinue()) return

    void updateConversationName(
      conversation.id,
      `${tableName}: ${issue.message}`,
    )
    await openChatWindow(conversation.id)
    const canDispatch = captureDispatch(conversation.id)
    if (!canDispatch()) return

    void executeAIFlow(
      createHealthIssueFlowConfig({
        conversationId: conversation.id,
        tableName,
        issue: {
          id: issue.id,
          field: issue.field,
          message: issue.message,
          currentValue: issue.promptValue ?? issue.currentValue,
          severity: issue.severity as "critical" | "warning",
        },
        tableDetails,
        diagnosticDetails,
        issueGuidance: diagnosticContext?.guidance,
        monitoringDocs,
        trendSamples,
        settings: { model: currentModel, apiKey },
        aiAssistantSettings,
        localAgentChannel,
        canDispatch,
        questClient: quest,
        tables,
        hasSchemaAccess,
        abortSignal,
      }),
      {
        addMessage,
        removeMessages,
        updateMessage,
        setStatus,
        setIsStreaming,
        persistMessages,
      },
    )
  }

  return {
    handleExplainSchema,
    handleAskAIForHealthIssue,
    canUse,
  }
}
