import type { NotebookToolErrorCode } from "./notebookToolError"
import type { ToolExecutionContext } from "../ai/shared"

// Agent-facing recovery texts shared by the in-app dispatcher and the MCP
// gate — the deny message doubles as the instruction that unblocks the tool.

export const notebookErrorHint = (code: NotebookToolErrorCode): string => {
  switch (code) {
    case "archived":
      return "Notebook is archived. Offer create_notebook, or ask the user to unarchive."
    case "deleted":
      return "Notebook no longer exists. Call create_notebook to start fresh."
    case "unknown_buffer":
      return "The buffer id is unknown. Call create_notebook or confirm the id from <notebook_context>."
    case "not_a_notebook":
      return "The buffer is not a notebook. Use create_notebook to scaffold one."
    case "activation_failed":
      return "Could not switch to the notebook tab. Ask the user to reopen it."
    case "unknown_cell":
      return "The cell id is not in the notebook. Call list_cells to resync, then retry."
    case "workspace_unavailable":
      return "The notebook workspace is not ready yet. Retry in a moment."
    case "last_tab":
      return "This is the only open tab. Call create_notebook first, then delete this one."
    case "last_cell":
      return "A notebook must keep at least one cell. Use update_cell to clear or replace it instead of deleting the last cell."
    case "mounted_mid_edit":
      return "The user opened the notebook while this edit was in flight. Call get_notebook_state to re-sync, then retry."
    case "cell_limit":
      return "The notebook is at its cell limit. Delete a cell first, or restructure with apply_notebook_state."
    case "cell_too_large":
      return "The value exceeds the per-cell line limit. Split it across multiple cells."
    default:
      return "Notebook tool failed."
  }
}

const reSyncTool = (toolContext?: ToolExecutionContext): string =>
  toolContext?.notebookFreshness !== undefined
    ? "get_notebook_state"
    : "get_workspace_state"

const STALE_RETRY_GUIDANCE =
  "When retrying apply_notebook_state, set preserve_value:true for every cell " +
  "you are not changing; re-read cells you will rewrite with " +
  "get_cell (get_full_content: true) first so the user's edits survive."

type NotebookErrorResult = { content: string; is_error: true }

const errorResult = (
  error_code: string,
  message: string,
): NotebookErrorResult => ({
  content: JSON.stringify({ error_code, message }),
  is_error: true,
})

export const staleNotebookResult = (
  toolContext?: ToolExecutionContext,
): NotebookErrorResult =>
  errorResult(
    "stale",
    "STATE_STALE: The user changed the notebook. " +
      `Call ${reSyncTool(toolContext)} to re-sync, then retry. ` +
      STALE_RETRY_GUIDANCE,
  )

export const applyStaleNotebookResult = (
  toolContext?: ToolExecutionContext,
): NotebookErrorResult =>
  errorResult(
    "stale",
    "STATE_STALE: The user changed the notebook while applying. " +
      `Call ${reSyncTool(toolContext)} to re-sync, then retry. ` +
      STALE_RETRY_GUIDANCE,
  )

export const notFetchedNotebookResult = (): NotebookErrorResult =>
  errorResult(
    "state_not_fetched",
    "STATE_NOT_FETCHED: You have not read this notebook this turn. Call " +
      "get_notebook_state for this buffer_id first, then retry.",
  )

export const invalidBufferIdResult = (): NotebookErrorResult =>
  errorResult(
    "invalid_buffer_id",
    "buffer_id must be the numeric id of an existing notebook. Read " +
      "<workspace> or call get_workspace_state to find it, then retry.",
  )

export const STATE_NOT_FETCHED_MESSAGE =
  "STATE_NOT_FETCHED: Call get_notebook_state for this buffer_id first to " +
  "see its current cells and any user edits. Then retry this tool."

export const STATE_STALE_MESSAGE =
  "STATE_STALE: The user changed this notebook since your last fetch. Call " +
  "get_notebook_state for this buffer_id to re-sync, then retry this tool. " +
  STALE_RETRY_GUIDANCE

export const INVALID_BUFFER_ID_MESSAGE =
  "INVALID_BUFFER_ID: buffer_id must be the numeric id of an existing " +
  "notebook. Call get_workspace_state to find it, then retry this tool."
