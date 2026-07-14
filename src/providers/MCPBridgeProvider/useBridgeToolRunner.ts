import { useContext, useMemo } from "react"
import { useSelector } from "react-redux"
import { selectors } from "../../store"
import { QuestContext } from "../QuestProvider"
import { createModelToolsClient } from "../../utils/ai/aiAssistant"
import { useEditor } from "../EditorProvider"
import type { MetaToolContext } from "../../utils/mcp/metaResolvers"
import type { WorkspaceInfo } from "../../utils/ai/executeAIFlow"
import type { UserActionDigest } from "../AIConversationProvider/types"

export const useBridgeToolRunner = (
  getDigest: () => UserActionDigest | null,
  consumeDigest: () => UserActionDigest | null,
) => {
  const { quest } = useContext(QuestContext)
  const tables = useSelector(selectors.query.getTables)
  const { activeBuffer, buffers } = useEditor()

  const modelToolsClient = useMemo(
    () => createModelToolsClient(quest, tables),
    [quest, tables],
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
      consumeDigest,
    }),
    [activeNotebookBufferId, workspace, getDigest, consumeDigest],
  )

  return { modelToolsClient, metaToolContext }
}
