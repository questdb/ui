import { useContext } from "react"
import { useSelector } from "react-redux"
import { toast } from "../components"
import { QuestContext } from "../providers"
import { useAIConversation } from "../providers/AIConversationProvider"
import { useAIStatus } from "../providers/AIStatusProvider"
import {
  executeAIFlow,
  createSchemaExplainFlowConfig,
} from "../utils/executeAIFlow"
import * as QuestDB from "../utils/questdb"
import { selectors } from "../store"
import type { PartitionBy } from "../utils/questdb/types"
import type { PreviousSidebar } from "../store/Console/types"

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
    previousSidebar?: PreviousSidebar,
  ) => {
    if (!canUse) {
      toast.error(
        "AI Assistant is not enabled. Please configure your API key in settings.",
      )
      return
    }

    const schema = await getTableSchema(name, kind)
    if (!schema) {
      return
    }

    const existingConversation = findConversationByTableId(id)

    if (existingConversation) {
      await openChatWindow(existingConversation.id, { previousSidebar })

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
    await openChatWindow(conversation.id, { previousSidebar })

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

  return {
    handleExplainSchema,
    canUse,
  }
}
