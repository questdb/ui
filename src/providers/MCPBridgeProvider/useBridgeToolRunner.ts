import { useContext, useMemo } from "react"
import { useSelector } from "react-redux"
import { selectors } from "../../store"
import { QuestContext } from "../QuestProvider"
import { createModelToolsClient } from "../../utils/ai/aiAssistant"
import { useEditor } from "../EditorProvider"
import type { MetaToolContext } from "../../utils/mcp/metaResolvers"
import {
  buildWorkspaceInfo,
  type WorkspaceInfo,
} from "../../utils/ai/workspaceInfo"
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

  const workspace: WorkspaceInfo | null = useMemo(
    () => buildWorkspaceInfo(buffers, activeBuffer) ?? null,
    [buffers, activeBuffer],
  )

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
