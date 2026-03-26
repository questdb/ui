import { useContext } from "react"
import { useSelector } from "react-redux"
import { toast } from "../components"
import { QuestContext } from "../providers"
import { useAIConversation } from "../providers/AIConversationProvider"
import { isBlockingAIStatus, useAIStatus } from "../providers/AIStatusProvider"
import {
  executeAIFlow,
  createSchemaExplainFlowConfig,
  createHealthIssueFlowConfig,
} from "../utils/executeAIFlow"
import { getDocsSectionByUrl } from "../utils/questdbDocsRetrieval"
import { ISSUE_DOCS_URLS } from "../scenes/Schema/TableDetailsDrawer/healthCheck"
import type {
  HealthIssue,
  TimestampedSample,
} from "../scenes/Schema/TableDetailsDrawer/healthCheck"
import * as QuestDB from "../utils/questdb"
import { selectors } from "../store"
import type { PartitionBy, QueryResult, Table } from "../utils/questdb/types"

type SchemaDisplayData = {
  tableName: string
  kind: "table" | "matview" | "view"
  partitionBy?: PartitionBy
  walEnabled?: boolean
  designatedTimestamp?: string
}

const getTableKindLabel = (kind: "table" | "matview" | "view") => {
  switch (kind) {
    case "table":
      return "Table"
    case "matview":
      return "Materialized view"
    case "view":
      return "View"
    default:
      return ""
  }
}

export const useAIQuickActions = () => {
  const { quest } = useContext(QuestContext)
  const tables = useSelector(selectors.query.getTables)
  const {
    setStatus,
    abortController,
    canUse,
    hasSchemaAccess,
    currentModel,
    apiKey,
    status,
  } = useAIStatus()

  const {
    findConversationByTableId,
    createConversation,
    openChatWindow,
    addMessage,
    updateMessage,
    updateConversationName,
    persistMessages,
    setIsStreaming,
    getLastRoundMessages,
    setScrollToMessageId,
  } = useAIConversation()

  const getTableSchema = async (
    tableName: string,
    kind: "table" | "matview" | "view",
  ): Promise<string | null> => {
    try {
      const response =
        kind === "matview"
          ? await quest.showMatViewDDL(tableName)
          : kind === "view"
            ? await quest.showViewDDL(tableName)
            : await quest.showTableDDL(tableName)

      if (response?.type === QuestDB.Type.DQL && response.data?.[0]?.ddl) {
        return response.data[0].ddl
      }
    } catch (_error) {
      const kindLabel =
        kind === "matview"
          ? "materialized view"
          : kind === "view"
            ? "view"
            : "table"
      toast.error(`Cannot fetch schema for ${kindLabel} '${tableName}'`)
    }
    return null
  }

  const handleExplainSchema = async (
    id: number,
    name: string,
    kind: "table" | "matview" | "view",
    schemaDisplayData?: Omit<SchemaDisplayData, "tableName" | "kind">,
  ) => {
    if (isBlockingAIStatus(status)) {
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
    if (!schema) {
      return
    }

    const existingConversation = findConversationByTableId(id)

    if (existingConversation) {
      await openChatWindow(existingConversation.id)

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
          questClient: quest,
          tables,
          hasSchemaAccess,
          abortSignal: abortController?.signal,
          useLastMessage: true,
        }),
        {
          addMessage,
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

    void updateConversationName(conversation.id, `${name} schema explanation`)
    await openChatWindow(conversation.id)

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
      },
    )
  }

  const handleAskAIForHealthIssue = async (
    tableId: number,
    tableName: string,
    issue: HealthIssue,
    trendSamples?: TimestampedSample[],
  ) => {
    if (isBlockingAIStatus(status)) {
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
    const tableDetails = JSON.stringify(tableDetailsResponse.data[0], null, 2)

    let monitoringDocs: string
    try {
      const docsUrl = ISSUE_DOCS_URLS[issue.id]
      monitoringDocs = docsUrl
        ? await getDocsSectionByUrl(docsUrl)
        : "Documentation unavailable"
    } catch (_error) {
      monitoringDocs = "Documentation unavailable"
    }

    const existingConversation = findConversationByTableId(tableId)

    if (existingConversation) {
      await openChatWindow(existingConversation.id)

      const result = await executeAIFlow(
        createHealthIssueFlowConfig({
          conversationId: existingConversation.id,
          tableName,
          issue: {
            id: issue.id,
            field: issue.field,
            message: issue.message,
            currentValue: issue.currentValue,
            severity: issue.severity as "critical" | "warning",
          },
          tableDetails,
          monitoringDocs,
          trendSamples,
          settings: { model: currentModel, apiKey },
          questClient: quest,
          tables,
          hasSchemaAccess,
          abortSignal: abortController?.signal,
          useLastMessage: true,
        }),
        {
          addMessage,
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

    void updateConversationName(
      conversation.id,
      `${tableName}: ${issue.message}`,
    )
    await openChatWindow(conversation.id)

    void executeAIFlow(
      createHealthIssueFlowConfig({
        conversationId: conversation.id,
        tableName,
        issue: {
          id: issue.id,
          field: issue.field,
          message: issue.message,
          currentValue: issue.currentValue,
          severity: issue.severity as "critical" | "warning",
        },
        tableDetails,
        monitoringDocs,
        trendSamples,
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
      },
    )
  }

  return {
    handleExplainSchema,
    handleAskAIForHealthIssue,
    canUse,
  }
}
