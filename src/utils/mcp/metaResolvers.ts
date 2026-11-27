import type { WorkspaceInfo } from "../ai/executeAIFlow"
import {
  buildSnapshot,
  formatDigest,
  formatSnapshot,
  formatWorkspace,
} from "../ai/notebookSnapshot"
import type { ToolContent } from "./types"
import type { UserActionDigest } from "../../providers/AIConversationProvider/types"

export type MetaToolContext = {
  getActiveBufferId: () => number | null
  getWorkspace: () => WorkspaceInfo | null
  getDigest: () => UserActionDigest | null
  // The actions one tool result reports. The caller marks them as told only
  // once it sends that result, so they are not repeated in the next one.
  consumeDigest?: () => UserActionDigest | null
}

const noNotebookOpenPayload = (ws: WorkspaceInfo | null): ToolContent[] => {
  const hasNotebooks = !!ws && ws.notebooks.length > 0
  const status = JSON.stringify({
    status: "no_notebook_open",
    hint: hasNotebooks
      ? "The active tab is not a notebook. Target any notebook listed in " +
        "<workspace> by its buffer_id (e.g. call get_notebook_state with that " +
        "buffer_id), or call create_notebook to start a new one."
      : "Call create_notebook to start a new notebook, or ask the user to " +
        "open an existing one.",
  })
  const parts = hasNotebooks ? [formatWorkspace(ws), status] : [status]
  return [{ type: "text", text: parts.join("\n") }]
}

const emptyDigestText =
  '<user_events since_last_turn="true">\n  (no recent actions)\n</user_events>'

export const resolveGetWorkspaceState = async (
  args: { include_user_events?: boolean } | undefined,
  ctx: MetaToolContext,
): Promise<ToolContent[]> => {
  const ws = ctx.getWorkspace()
  const bufferId = ctx.getActiveBufferId()
  if (bufferId === null) return noNotebookOpenPayload(ws)

  const snapshot = await buildSnapshot(bufferId)

  const parts: string[] = []
  if (ws) parts.push(formatWorkspace(ws))
  if (snapshot) parts.push(formatSnapshot(snapshot))
  if (args?.include_user_events) {
    const digest = ctx.getDigest()
    const digestText = digest ? formatDigest(digest) : ""
    parts.push(digestText || emptyDigestText)
  }

  if (parts.length === 0) return noNotebookOpenPayload(ws)
  return [{ type: "text", text: parts.join("\n") }]
}

export const resolveGetRecentUserActions = (
  ctx: MetaToolContext,
): ToolContent[] => {
  const digest = ctx.getDigest()
  const text = digest ? formatDigest(digest) : ""
  return [{ type: "text", text: text || emptyDigestText }]
}
