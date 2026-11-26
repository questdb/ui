import { useCallback, useContext, useMemo } from "react"
import { useSelector } from "react-redux"
import { selectors } from "../../store"
import { QuestContext } from "../QuestProvider"
import { createModelToolsClient } from "../../utils/ai/aiAssistant"
import { useEditor } from "../EditorProvider"
import { useAIConversationActions } from "../AIConversationProvider"
import type { MetaToolContext } from "../../utils/mcp/metaResolvers"
import type { WorkspaceInfo } from "../../utils/ai/executeAIFlow"
import type {
  ConversationId,
  UserActionDigest,
} from "../AIConversationProvider/types"

export const useBridgeToolRunner = (
  getDigest: () => UserActionDigest | null,
) => {
  const { quest } = useContext(QuestContext)
  const tables = useSelector(selectors.query.getTables)
  const { activeBuffer, buffers } = useEditor()
  const { bindConversationToNotebook } = useAIConversationActions()

  // A chat agent's call names its chat, and a notebook it creates binds that
  // chat, as an API model's does. An MCP mode call names no chat.
  const modelToolsClientFor = useCallback(
    (conversationId: ConversationId | undefined) =>
      createModelToolsClient(quest, tables, {
        conversationId,
        bindNotebook: bindConversationToNotebook,
      }),
    [quest, tables, bindConversationToNotebook],
  )

  const workspace: WorkspaceInfo | null = useMemo(() => {
    const notebooks = buffers
      .filter((b) => !!b.notebookViewState && typeof b.id === "number")
      .map((b) => ({
        buffer_id: b.id as number,
        label: b.label,
        archived: !!b.archived,
      }))
    if (notebooks.length === 0 && typeof activeBuffer.id !== "number") {
      return null
    }
    return {
      notebooks,
      ...(typeof activeBuffer.id === "number"
        ? {
            active: {
              buffer_id: activeBuffer.id,
              label: activeBuffer.label,
              kind: activeBuffer.notebookViewState
                ? ("notebook" as const)
                : activeBuffer.metricsViewState
                  ? ("metrics" as const)
                  : activeBuffer.editorViewState
                    ? ("sql" as const)
                    : ("other" as const),
              archived: !!activeBuffer.archived,
            },
          }
        : {}),
    }
  }, [buffers, activeBuffer])

  const activeNotebookBufferId = useMemo<number | null>(
    () =>
      activeBuffer.notebookViewState && typeof activeBuffer.id === "number"
        ? activeBuffer.id
        : null,
    [activeBuffer],
  )

  const metaToolContext: MetaToolContext = useMemo(
    () => ({
      getActiveBufferId: () => activeNotebookBufferId,
      getWorkspace: () => workspace,
      getDigest,
    }),
    [activeNotebookBufferId, workspace, getDigest],
  )

  return { modelToolsClientFor, metaToolContext }
}
