import { AIOperationStatus } from "../../providers/AIStatusProvider"
import { ownValue } from "../ownValue"

// The status each tool shows while it runs; dispatchTool sets the same ones
// with the call's details. Shown as soon as the model starts a call, before
// its arguments have streamed.
// Built on first use: this module is part of an import cycle with the
// status provider, whose enum is not ready while the cycle loads.
let toolStatuses: Record<string, AIOperationStatus> | null = null

const buildToolStatuses = (): Record<string, AIOperationStatus> => ({
  get_tables: AIOperationStatus.RetrievingTables,
  get_table_schema: AIOperationStatus.InvestigatingTable,
  get_table_details: AIOperationStatus.InvestigatingTable,
  validate_query: AIOperationStatus.ValidatingQuery,
  run_query: AIOperationStatus.RunningQuery,
  get_questdb_toc: AIOperationStatus.RetrievingDocumentation,
  get_questdb_documentation: AIOperationStatus.InvestigatingDocs,
  create_notebook: AIOperationStatus.BuildingNotebook,
  apply_notebook_state: AIOperationStatus.BuildingNotebook,
  activate_notebook: AIOperationStatus.InspectingNotebook,
  list_cells: AIOperationStatus.InspectingNotebook,
  get_cell: AIOperationStatus.InspectingNotebook,
  get_notebook_state: AIOperationStatus.InspectingNotebook,
  duplicate_notebook: AIOperationStatus.DuplicatingNotebook,
  delete_notebook: AIOperationStatus.DeletingNotebook,
  add_cell: AIOperationStatus.AddingCell,
  duplicate_cell: AIOperationStatus.AddingCell,
  update_cell: AIOperationStatus.UpdatingCell,
  set_cell_name: AIOperationStatus.UpdatingCell,
  delete_cell: AIOperationStatus.DeletingCell,
  run_cell: AIOperationStatus.RunningCell,
  move_cell_up: AIOperationStatus.ConfiguringLayout,
  move_cell_down: AIOperationStatus.ConfiguringLayout,
  set_cell_dimensions: AIOperationStatus.ConfiguringLayout,
  set_cell_layout: AIOperationStatus.ConfiguringLayout,
  set_cell_maximized: AIOperationStatus.ConfiguringLayout,
  set_cell_mode: AIOperationStatus.ConfiguringLayout,
  set_layout_mode: AIOperationStatus.ConfiguringLayout,
  set_cell_autorefresh: AIOperationStatus.ConfiguringAutoRefresh,
  set_notebook_autorefresh: AIOperationStatus.ConfiguringAutoRefresh,
  set_cell_chart_config: AIOperationStatus.ConfiguringChart,
  set_cell_highlight_config: AIOperationStatus.ConfiguringHighlight,
})

export const toolStatusOf = (toolName: string): AIOperationStatus | null => {
  toolStatuses ??= buildToolStatuses()
  return ownValue(toolStatuses, toolName) ?? null
}

const ERROR_DETAIL_LIMIT = 300

// The short reason a failed tool result gives, for the user. Tools return
// either plain text or JSON with a message.
export const toolErrorDetail = (content: string): string => {
  let detail = content.trim()
  try {
    const parsed: unknown = JSON.parse(detail)
    if (parsed && typeof parsed === "object") {
      const { message, error, reason } = parsed as Record<string, unknown>
      const text = [message, error, reason].find(
        (value): value is string => typeof value === "string",
      )
      if (text) detail = text
    }
  } catch {
    // Plain text
  }
  return detail.length > ERROR_DETAIL_LIMIT
    ? `${detail.slice(0, ERROR_DETAIL_LIMIT - 1)}…`
    : detail
}
