import type { ModelToolsClient, StatusCallback } from "../aiAssistant"
import { AIOperationStatus } from "../../providers/AIStatusProvider"
import {
  getQuestDBTableOfContents,
  getSpecificDocumentation,
  parseDocItems,
  DocCategory,
} from "../questdbDocsRetrieval"
import {
  NotebookToolError,
  type ApplyNotebookStateCellRequest,
  type ApplyNotebookStateRequest,
  type NotebookToolErrorCode,
} from "../notebookAIBridge"
import type { CellMode } from "../../store/notebook"
import type { NotebookVariable } from "../../store/notebook"
import type {
  ChartConfig,
  ChartType,
  QueryChart,
} from "../../scenes/Editor/Notebook/CellChart/chartTypes"
import {
  classifyAndCheckSqlForExecution,
  classifyAndCheckSqlForRunQuery,
  denyReasonUnresolvedSql,
  requireAllDQL,
  runPermissionGate,
  type Permissions,
} from "./permissions"
import { categoryFor } from "./tools"
import { getQueriesFromText } from "../../scenes/Editor/Monaco/utils"
import type { ValidateQueryResult } from "../questdb/types"
import { buildRunQueryPayload, RUN_QUERY_DEFAULT_LIMIT } from "./runQuery"
import {
  isValidVariableName,
  renderDeclareValidationQuery,
  validateVariableShape,
} from "../../scenes/Editor/Notebook/declareUtils"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import type { ToolExecutionContext } from "../ai/shared"
import { formatSql } from "../formatSql"

// Snake-case shapes the agent tools speak, and their mapping to the internal
// camelCase ChartConfig. Shared by set_cell_chart_config and apply_notebook_state.
type ToolQueryChart = {
  type: ChartType
  y_columns?: string[] | null
  ohlc?: { open: string; high: string; low: string; close: string } | null
  partition_by_column?: string | null
  axis?: "left" | "right" | null
  enabled?: boolean | null
  name?: string | null
}
type ToolRightAxis = {
  name?: string | null
  min?: number | null
  max?: number | null
}

const mapQueryChart = (q: ToolQueryChart): QueryChart => {
  const out: QueryChart = { type: q.type, yColumns: q.y_columns ?? [] }
  if (q.ohlc) out.ohlc = q.ohlc
  if (q.partition_by_column) out.partitionByColumn = q.partition_by_column
  if (q.axis) out.axis = q.axis
  if (q.enabled === false) out.enabled = false
  if (q.name) out.name = q.name
  return out
}

const mapRightAxis = (ra: ToolRightAxis): ChartConfig["rightAxis"] => {
  const out: NonNullable<ChartConfig["rightAxis"]> = {}
  if (ra.name) out.name = ra.name
  if (ra.min != null) out.min = ra.min
  if (ra.max != null) out.max = ra.max
  return out
}

const notebookErrorHint = (code: NotebookToolErrorCode): string => {
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
    default:
      return "Notebook tool failed."
  }
}

const routeNotebookTool = async <T>(
  op: () => Promise<T>,
): Promise<{ content: string; is_error?: boolean }> => {
  try {
    const result = await op()
    return { content: JSON.stringify(result ?? {}) }
  } catch (e) {
    if (e instanceof NotebookToolError) {
      return {
        is_error: true,
        content: JSON.stringify({
          error_code: e.code,
          message: e.message,
          hint: notebookErrorHint(e.code),
        }),
      }
    }
    const message = e instanceof Error ? e.message : String(e)
    return {
      is_error: true,
      content: `Tool execution error: ${message}`,
    }
  }
}

export const dispatchTool = async (
  toolName: string,
  input: unknown,
  modelToolsClient: ModelToolsClient,
  setStatus: StatusCallback,
  perms?: Permissions,
  validateSql?: (sql: string) => Promise<ValidateQueryResult>,
  signal?: AbortSignal,
  toolContext?: ToolExecutionContext,
): Promise<{ content: string; is_error?: boolean }> => {
  if (perms) {
    const decision = runPermissionGate(toolName, {
      permissions: perms,
      categoryFor,
    })
    if (!decision.granted) {
      return { content: decision.reason, is_error: true }
    }
  }
  try {
    switch (toolName) {
      case "suggest_query": {
        const query = (input as { query: string })?.query
        if (!query) {
          return {
            content: "Error: query parameter is required",
            is_error: true,
          }
        }
        if (toolContext) {
          toolContext.suggestedSQL = query
        }
        return {
          content:
            "Query suggestion registered. It will be shown to the user as a suggestion they can accept or reject.",
        }
      }
      case "get_tables": {
        setStatus(AIOperationStatus.RetrievingTables)
        if (!modelToolsClient.getTables) {
          return {
            content:
              "Error: Schema access is not granted. This tool is not available.",
            is_error: true,
          }
        }
        const result = await modelToolsClient.getTables()
        const MAX_TABLES = 1000
        if (result.length > MAX_TABLES) {
          const truncated = result.slice(0, MAX_TABLES)
          return {
            content: JSON.stringify(
              {
                tables: truncated,
                total_count: result.length,
                truncated: true,
                message: `Showing ${MAX_TABLES} of ${result.length} tables. Use get_table_schema with a specific table name to get details if you are interested in a specific table.`,
              },
              null,
              2,
            ),
          }
        }
        return { content: JSON.stringify(result, null, 2) }
      }
      case "get_table_schema": {
        const tableName = (input as { table_name: string })?.table_name
        if (!modelToolsClient.getTableSchema) {
          return {
            content:
              "Error: Schema access is not granted. This tool is not available.",
            is_error: true,
          }
        }
        if (!tableName) {
          return {
            content: "Error: table_name parameter is required",
            is_error: true,
          }
        }
        setStatus(AIOperationStatus.InvestigatingTable, {
          name: tableName,
          tableOpType: "schema",
        })
        const result = await modelToolsClient.getTableSchema(tableName)
        return {
          content:
            result || `Table '${tableName}' not found or schema unavailable`,
        }
      }
      case "get_table_details": {
        const tableName = (input as { table_name: string })?.table_name
        if (!modelToolsClient.getTableDetails) {
          return {
            content:
              "Error: Schema access is not granted. This tool is not available.",
            is_error: true,
          }
        }
        if (!tableName) {
          return {
            content: "Error: table_name parameter is required",
            is_error: true,
          }
        }
        setStatus(AIOperationStatus.InvestigatingTable, {
          name: tableName,
          tableOpType: "details",
        })
        const result = await modelToolsClient.getTableDetails(tableName)
        return {
          content: result
            ? JSON.stringify(result, null, 2)
            : "Table details not found",
          is_error: !result,
        }
      }
      case "validate_query": {
        setStatus(AIOperationStatus.ValidatingQuery)
        const query = (input as { query: string })?.query
        if (!query) {
          return {
            content: "Error: query parameter is required",
            is_error: true,
          }
        }
        const result = await modelToolsClient.validateQuery(query)
        const content = {
          valid: result.valid,
          error: result.valid ? undefined : result.error,
          position: result.valid ? undefined : result.position,
        }
        return { content: JSON.stringify(content, null, 2) }
      }
      case "get_questdb_toc": {
        setStatus(AIOperationStatus.RetrievingDocumentation)
        const tocContent = await getQuestDBTableOfContents()
        return { content: tocContent }
      }
      case "get_questdb_documentation": {
        const { category, items } =
          (input as { category: string; items: string[] }) || {}
        if (!category || !items || !Array.isArray(items)) {
          return {
            content: "Error: category and items parameters are required",
            is_error: true,
          }
        }
        const parsedItems = parseDocItems(items)

        if (parsedItems.length > 0) {
          setStatus(AIOperationStatus.InvestigatingDocs, { items: parsedItems })
        } else {
          setStatus(AIOperationStatus.InvestigatingDocs)
        }
        const documentation = await getSpecificDocumentation(
          category as DocCategory,
          items,
        )
        return { content: documentation }
      }

      case "create_notebook": {
        const { label } = (input as { label?: string }) || {}
        setStatus(AIOperationStatus.BuildingNotebook, { label })
        return routeNotebookTool(() => modelToolsClient.createNotebook(label))
      }
      case "list_cells": {
        const { buffer_id } = (input as { buffer_id: number }) || {}
        setStatus(AIOperationStatus.InspectingNotebook)
        return routeNotebookTool(async () => ({
          cells: await modelToolsClient.listCells(buffer_id),
        }))
      }
      case "get_cell": {
        const { buffer_id, cell_id } =
          (input as { buffer_id: number; cell_id: string }) || {}
        setStatus(AIOperationStatus.InspectingNotebook, { cellId: cell_id })
        return routeNotebookTool(() =>
          modelToolsClient.getCell(buffer_id, cell_id),
        )
      }
      case "get_notebook_state": {
        const { buffer_id } = (input as { buffer_id: number }) || {}
        setStatus(AIOperationStatus.InspectingNotebook)
        return routeNotebookTool(() =>
          modelToolsClient.getNotebookState(buffer_id),
        )
      }
      case "add_cell": {
        const { buffer_id, sql, after_cell_id, run } =
          (input as {
            buffer_id: number
            sql: string
            after_cell_id?: string | null
            run?: boolean | null
          }) || {}
        setStatus(AIOperationStatus.AddingCell)
        return routeNotebookTool(async () => {
          const { cellId } = await modelToolsClient.addCell(
            buffer_id,
            sql,
            after_cell_id ?? undefined,
          )
          if (run) {
            if (perms && validateSql) {
              const decision = await classifyAndCheckSqlForExecution(
                sql,
                perms,
                validateSql,
              )
              if (!decision.granted) {
                return {
                  cellId,
                  ran: false,
                  error: decision.reason,
                }
              }
            }
            setStatus(AIOperationStatus.RunningCell, { cellId })
            const r = await modelToolsClient.runCell(buffer_id, cellId, signal)
            return {
              cellId,
              ran: r.success,
              queryCount: r.queryCount,
              results: r.results,
            }
          }
          return { cellId }
        })
      }
      case "update_cell": {
        const { buffer_id, cell_id, value } =
          (input as {
            buffer_id: number
            cell_id: string
            value: string
          }) || {}
        setStatus(AIOperationStatus.UpdatingCell, { cellId: cell_id })
        if (validateSql) {
          const current = await modelToolsClient.getCell(buffer_id, cell_id)
          if (current.mode === "draw") {
            const decision = await requireAllDQL(value, validateSql)
            if (!decision.granted) {
              return { content: decision.reason, is_error: true }
            }
          }
        }
        return routeNotebookTool(() =>
          modelToolsClient.updateCell(buffer_id, cell_id, { value }),
        )
      }
      case "delete_cell": {
        const { buffer_id, cell_id } =
          (input as { buffer_id: number; cell_id: string }) || {}
        setStatus(AIOperationStatus.DeletingCell, { cellId: cell_id })
        return routeNotebookTool(() =>
          modelToolsClient.deleteCell(buffer_id, cell_id),
        )
      }
      case "move_cell_up": {
        const { buffer_id, cell_id } =
          (input as { buffer_id: number; cell_id: string }) || {}
        setStatus(AIOperationStatus.ConfiguringLayout, { cellId: cell_id })
        return routeNotebookTool(() =>
          modelToolsClient.moveCellUp(buffer_id, cell_id),
        )
      }
      case "move_cell_down": {
        const { buffer_id, cell_id } =
          (input as { buffer_id: number; cell_id: string }) || {}
        setStatus(AIOperationStatus.ConfiguringLayout, { cellId: cell_id })
        return routeNotebookTool(() =>
          modelToolsClient.moveCellDown(buffer_id, cell_id),
        )
      }
      case "duplicate_cell": {
        const { buffer_id, cell_id } =
          (input as { buffer_id: number; cell_id: string }) || {}
        setStatus(AIOperationStatus.AddingCell, { cellId: cell_id })
        return routeNotebookTool(() =>
          modelToolsClient.duplicateCell(buffer_id, cell_id),
        )
      }
      case "run_cell": {
        const { buffer_id, cell_id } =
          (input as { buffer_id: number; cell_id: string }) || {}
        setStatus(AIOperationStatus.RunningCell, { cellId: cell_id })
        if (perms && validateSql) {
          const cellSql = modelToolsClient.getCellSql
            ? modelToolsClient.getCellSql(buffer_id, cell_id)
            : null
          if (cellSql === null) {
            return {
              content: denyReasonUnresolvedSql("run_cell"),
              is_error: true,
            }
          }
          const decision = await classifyAndCheckSqlForExecution(
            cellSql,
            perms,
            validateSql,
          )
          if (!decision.granted) {
            return { content: decision.reason, is_error: true }
          }
        }
        return routeNotebookTool(() =>
          modelToolsClient.runCell(buffer_id, cell_id, signal),
        )
      }
      case "set_layout_mode": {
        const { buffer_id, mode } =
          (input as { buffer_id: number; mode: "list" | "grid" }) || {}
        setStatus(AIOperationStatus.ConfiguringLayout)
        return routeNotebookTool(() =>
          modelToolsClient.setLayoutMode(buffer_id, mode),
        )
      }
      case "set_cell_layout": {
        const { buffer_id, cell_id, x, y, w, h } =
          (input as {
            buffer_id: number
            cell_id: string
            x: number
            y: number
            w: number
            h: number
          }) || {}
        setStatus(AIOperationStatus.ConfiguringLayout, { cellId: cell_id })
        return routeNotebookTool(() =>
          modelToolsClient.setCellLayout(buffer_id, cell_id, x, y, w, h),
        )
      }
      case "set_cell_mode": {
        const { buffer_id, cell_id, mode } =
          (input as {
            buffer_id: number
            cell_id: string
            mode: CellMode
          }) || {}
        setStatus(AIOperationStatus.ConfiguringLayout, { cellId: cell_id })
        if (mode === "draw" && validateSql) {
          const cellSql = modelToolsClient.getCellSql
            ? modelToolsClient.getCellSql(buffer_id, cell_id)
            : null
          if (cellSql === null) {
            return {
              content: denyReasonUnresolvedSql("set_cell_mode"),
              is_error: true,
            }
          }
          const decision = await requireAllDQL(cellSql, validateSql)
          if (!decision.granted) {
            return { content: decision.reason, is_error: true }
          }
        }
        return routeNotebookTool(() =>
          modelToolsClient.setCellMode(buffer_id, cell_id, mode),
        )
      }
      case "set_cell_chart_config": {
        const { buffer_id, cell_id, x_column, name, queries, right_axis } =
          (input as {
            buffer_id: number
            cell_id: string
            x_column?: string | null
            name?: string | null
            queries?: (ToolQueryChart | null)[] | null
            right_axis?: ToolRightAxis | null
          }) || {}
        setStatus(AIOperationStatus.ConfiguringChart, { cellId: cell_id })
        // Patch: top-level null = preserve; a non-null queries array replaces
        // all per-query configs (queries:[] clears them, back to inference).
        const patch: Partial<ChartConfig> = {}
        if (x_column !== undefined && x_column !== null)
          patch.xColumn = x_column
        if (name !== undefined && name !== null) patch.name = name
        if (queries !== undefined && queries !== null)
          patch.queries = queries.map((q) => (q ? mapQueryChart(q) : null))
        if (right_axis !== undefined && right_axis !== null)
          patch.rightAxis = mapRightAxis(right_axis)
        if (
          patch.queries?.some(
            (q) => q != null && q.type === "candlestick" && !q.ohlc,
          )
        ) {
          return {
            content: JSON.stringify({
              error_code: "validation",
              message:
                "VALIDATION_ERROR: a candlestick query requires an ohlc mapping (open/high/low/close). Provide ohlc, or use a non-candlestick type.",
            }),
            is_error: true,
          }
        }
        // A non-null queries array REPLACES every per-query config
        if (patch.queries && patch.queries.length > 0) {
          const cellSql = modelToolsClient.getCellSql
            ? modelToolsClient.getCellSql(buffer_id, cell_id)
            : null
          if (cellSql !== null) {
            const statementCount = getQueriesFromText(cellSql).length
            if (statementCount > 0 && patch.queries.length !== statementCount) {
              return {
                content: JSON.stringify({
                  error_code: "validation",
                  message: `VALIDATION_ERROR: queries has ${patch.queries.length} ${
                    patch.queries.length === 1 ? "entry" : "entries"
                  } but the cell has ${statementCount} \`;\`-split statement${
                    statementCount === 1 ? "" : "s"
                  }. A non-null queries array replaces all per-query configs, so send exactly one entry per statement (index-aligned). Use queries:[] to reset to inference, or omit queries to preserve the existing config.`,
                }),
                is_error: true,
              }
            }
          }
        }
        return routeNotebookTool(() =>
          modelToolsClient.setCellChartConfig(buffer_id, cell_id, patch),
        )
      }
      case "set_cell_autorefresh": {
        const { buffer_id, cell_id, value } =
          (input as {
            buffer_id: number
            cell_id: string
            value: boolean
          }) || {}
        setStatus(AIOperationStatus.ConfiguringChart, { cellId: cell_id })
        return routeNotebookTool(() =>
          modelToolsClient.setCellAutoRefresh(buffer_id, cell_id, value),
        )
      }
      case "set_cell_chart_maximized": {
        const { buffer_id, cell_id, value } =
          (input as {
            buffer_id: number
            cell_id: string
            value: boolean
          }) || {}
        setStatus(AIOperationStatus.ConfiguringChart, { cellId: cell_id })
        return routeNotebookTool(() =>
          modelToolsClient.setCellChartMaximized(buffer_id, cell_id, value),
        )
      }
      case "apply_notebook_state": {
        const { buffer_id, layout_mode, maximized_cell_id, variables, cells } =
          (input as {
            buffer_id: number
            layout_mode?: "list" | "grid" | null
            maximized_cell_id?: string | null
            variables?: NotebookVariable[] | null
            cells: Array<{
              id?: string | null
              value: string
              mode?: CellMode | null
              auto_refresh?: boolean | null
              is_chart_maximized?: boolean | null
              chart_config?: {
                x_column?: string | null
                name?: string | null
                queries?: (ToolQueryChart | null)[] | null
                right_axis?: ToolRightAxis | null
              } | null
              grid?: { x: number; y: number; w: number; h: number } | null
            }>
          }) || {}
        setStatus(AIOperationStatus.BuildingNotebook)
        if (!Array.isArray(cells)) {
          return {
            content: JSON.stringify({
              error_code: "validation",
              message:
                "VALIDATION_ERROR: cells must be an array of desired cell states.",
            }),
            is_error: true,
          }
        }
        // Refuse the wipe foot-gun even if a misbehaving agent bypasses the
        // bridge's minItems:1. delete_cell per-cell is the explicit path.
        if (cells.length === 0) {
          return {
            content: JSON.stringify({
              error_code: "validation",
              message:
                "VALIDATION_ERROR: cells must contain at least one entry. " +
                "To delete every cell, use delete_cell per-cell — apply_notebook_state " +
                "with cells:[] is rejected to prevent accidental wipes.",
            }),
            is_error: true,
          }
        }
        if (
          variables !== undefined &&
          variables !== null &&
          !Array.isArray(variables)
        ) {
          return {
            content: JSON.stringify({
              error_code: "validation",
              message:
                "VALIDATION_ERROR: variables must be an ordered array of {name,value} entries (or null to preserve).",
            }),
            is_error: true,
          }
        }
        if (Array.isArray(variables)) {
          const seen = new Set<string>()
          for (const [idx, variable] of variables.entries()) {
            if (
              !variable ||
              typeof variable !== "object" ||
              typeof variable.name !== "string" ||
              typeof variable.value !== "string"
            ) {
              return {
                content: JSON.stringify({
                  error_code: "validation",
                  message: `VALIDATION_ERROR: variables[${idx}] must be an object with string name and value fields.`,
                }),
                is_error: true,
              }
            }
            const { name } = variable
            if (!isValidVariableName(name)) {
              return {
                content: JSON.stringify({
                  error_code: "validation",
                  message: `VALIDATION_ERROR: variables[${idx}].name "${name}" is not a valid QuestDB identifier. First char must be a letter, underscore, or non-ASCII Unicode char (U+0080..U+FFFF); remaining chars may also include digits. No leading '@'.`,
                }),
                is_error: true,
              }
            }
            if (seen.has(name)) {
              return {
                content: JSON.stringify({
                  error_code: "validation",
                  message: `VALIDATION_ERROR: duplicate variable name "${name}". Variables are ordered, but each name may only appear once.`,
                }),
                is_error: true,
              }
            }
            seen.add(name)
          }
          for (let idx = 0; idx < variables.length; idx += 1) {
            const shapeError = validateVariableShape(variables[idx])
            if (shapeError) {
              return {
                content: JSON.stringify({
                  error_code: "validation",
                  message: `VALIDATION_ERROR: variables[${idx}] (${variables[idx].name}) shape check failed (${shapeError.kind}). Each value must be a single expression with no embedded assignments, top-level commas, or DECLARE syntax. Use parentheses to group expressions if commas are needed.`,
                }),
                is_error: true,
              }
            }
          }
          if (validateSql) {
            for (let idx = 0; idx < variables.length; idx += 1) {
              const result = await validateSql(
                renderDeclareValidationQuery(variables.slice(0, idx + 1)),
              )
              if ("error" in result) {
                return {
                  content: JSON.stringify({
                    error_code: "validation",
                    message: `VALIDATION_ERROR: variables[${idx}] (${variables[idx].name}) failed QuestDB validation: ${result.error}`,
                  }),
                  is_error: true,
                }
              }
            }
          }
        }
        // Shared by the draw-invariant gate (below) and the post-apply
        // auto-run loop (after applyNotebookState).
        const existingModes = new Map<string, CellMode | undefined>()
        if (validateSql) {
          await Promise.all(
            cells.map(async (c) => {
              if (typeof c.id !== "string" || c.id.length === 0) return
              if (c.mode !== undefined && c.mode !== null) return
              try {
                const existing = await modelToolsClient.getCell(buffer_id, c.id)
                existingModes.set(c.id, existing.mode)
              } catch {
                // Let applyNotebookState's all-or-nothing validation surface
                // the precise unknown-cell error.
              }
            }),
          )
          const drawCells = cells.filter((c) => {
            const resolved =
              c.mode === undefined || c.mode === null
                ? typeof c.id === "string"
                  ? existingModes.get(c.id)
                  : undefined
                : c.mode
            return resolved === "draw"
          })
          const decisions = await Promise.all(
            drawCells.map((c) => requireAllDQL(c.value, validateSql)),
          )
          const denied = decisions.find((d) => !d.granted)
          if (denied && !denied.granted) {
            return { content: denied.reason, is_error: true }
          }
        }
        const request: ApplyNotebookStateRequest = {
          layoutMode: layout_mode ?? null,
          maximizedCellId:
            maximized_cell_id === undefined ? undefined : maximized_cell_id,
          variables:
            variables === undefined || variables === null
              ? undefined
              : variables,
          cells: cells.map<ApplyNotebookStateCellRequest>((c) => {
            const cell: ApplyNotebookStateCellRequest = { value: c.value }
            if (c.id !== undefined && c.id !== null) cell.id = c.id
            if (c.mode !== undefined && c.mode !== null) cell.mode = c.mode
            if (c.auto_refresh !== undefined && c.auto_refresh !== null)
              cell.autoRefresh = c.auto_refresh
            if (
              c.is_chart_maximized !== undefined &&
              c.is_chart_maximized !== null
            )
              cell.isChartMaximized = c.is_chart_maximized
            if (c.chart_config) {
              const cfg = c.chart_config
              const chartConfig: ChartConfig = {
                xColumn: cfg.x_column ?? null,
                queries: (cfg.queries ?? []).map((q) =>
                  q ? mapQueryChart(q) : null,
                ),
              }
              if (cfg.name) chartConfig.name = cfg.name
              if (cfg.right_axis)
                chartConfig.rightAxis = mapRightAxis(cfg.right_axis)
              cell.chartConfig = chartConfig
            }
            if (c.grid) cell.grid = c.grid
            return cell
          }),
        }
        try {
          const out = await modelToolsClient.applyNotebookState(
            buffer_id,
            request,
          )
          // buildAppliedCells pushes new-cell ids to `applied.added` in
          type ResolvedRun = {
            cellId: string
            value: string
            runnable: boolean
          }
          const resolved: ResolvedRun[] = []
          let newCellIdx = 0
          for (const c of cells) {
            const requestedId =
              typeof c.id === "string" && c.id.length > 0 ? c.id : undefined
            const cellId = requestedId ?? out.applied.added[newCellIdx++]
            if (!cellId) continue
            // Undefined existing mode === "run" (NotebookCell.mode comment).
            const resolvedMode: CellMode =
              c.mode === undefined || c.mode === null
                ? requestedId !== undefined
                  ? (existingModes.get(requestedId) ?? "run")
                  : "run"
                : c.mode
            const runnable = resolvedMode === "run" && c.value.trim().length > 0
            resolved.push({ cellId, value: c.value, runnable })
          }
          type RunEntry = {
            cellId: string
            success: boolean
            queryCount?: number
            results?: string[]
            error?: string
          }
          const settled = await Promise.all(
            resolved.map(async (r): Promise<RunEntry | null> => {
              if (!r.runnable) return null
              if (perms && validateSql) {
                const decision = await classifyAndCheckSqlForExecution(
                  r.value,
                  perms,
                  validateSql,
                )
                if (!decision.granted) {
                  return {
                    cellId: r.cellId,
                    success: false,
                    error: decision.reason,
                  }
                }
              }
              try {
                const result = await modelToolsClient.runCell(
                  buffer_id,
                  r.cellId,
                  signal,
                )
                return {
                  cellId: r.cellId,
                  success: result.success,
                  queryCount: result.queryCount,
                  results: result.results,
                }
              } catch (runErr) {
                const message =
                  runErr instanceof Error ? runErr.message : String(runErr)
                return { cellId: r.cellId, success: false, error: message }
              }
            }),
          )
          const runs = settled.filter(
            (entry): entry is RunEntry => entry !== null,
          )
          return { content: JSON.stringify({ ...out, runs }) }
        } catch (e) {
          if (e instanceof NotebookToolError) {
            return {
              is_error: true,
              content: JSON.stringify({
                error_code: e.code,
                message: e.message,
                hint: notebookErrorHint(e.code),
              }),
            }
          }
          if (e instanceof Error && e.name === "ApplyNotebookStateError") {
            return {
              is_error: true,
              content: JSON.stringify({
                error_code: "validation",
                message: `VALIDATION_ERROR: ${e.message}`,
                hint: "No state was changed. Fix the request and retry; remember the cells array is the COMPLETE desired list.",
              }),
            }
          }
          const message = e instanceof Error ? e.message : String(e)
          return {
            is_error: true,
            content: `Tool execution error: ${message}`,
          }
        }
      }
      case "set_cell_maximized": {
        const { buffer_id, cell_id } =
          (input as { buffer_id: number; cell_id: string | null }) || {}
        setStatus(AIOperationStatus.ConfiguringLayout, {
          cellId: cell_id ?? undefined,
        })
        return routeNotebookTool(() =>
          modelToolsClient.setCellMaximized(buffer_id, cell_id),
        )
      }
      case "run_query": {
        const { sql, limit } =
          (input as { sql?: string; limit?: number | null }) || {}
        if (typeof sql !== "string" || sql.trim().length === 0) {
          return {
            content: JSON.stringify({
              error:
                "sql parameter is required and must be a non-empty string.",
            }),
            is_error: true,
          }
        }
        if (perms && validateSql) {
          const decision = await classifyAndCheckSqlForRunQuery(
            sql,
            perms,
            validateSql,
          )
          if (!decision.granted) {
            return { content: decision.reason, is_error: true }
          }
        }
        let formattedSql = sql
        try {
          formattedSql = formatSql(sql)
        } catch {
          // Fall back to raw SQL if the formatter can't parse it.
        }
        setStatus(AIOperationStatus.RunningQuery, { content: formattedSql })
        try {
          const requestedLimit =
            typeof limit === "number" && Number.isFinite(limit)
              ? limit
              : RUN_QUERY_DEFAULT_LIMIT
          const raw = await modelToolsClient.runQueryRaw(
            sql,
            requestedLimit,
            signal,
          )
          // Schema panel listens for MSG_QUERY_SCHEMA and refreshes its cache.
          if (raw.type === "ddl" || raw.type === "dml") {
            eventBus.publish(EventType.MSG_QUERY_SCHEMA)
          }
          const payload = buildRunQueryPayload(raw, requestedLimit)
          return {
            content: JSON.stringify(payload),
            is_error: raw.type === "error" ? true : undefined,
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          return {
            content: JSON.stringify({ error: `run_query failed: ${message}` }),
            is_error: true,
          }
        }
      }
      default:
        return { content: `Unknown tool: ${toolName}`, is_error: true }
    }
  } catch (error) {
    return {
      content: `Tool execution error: ${error instanceof Error ? error.message : "Unknown error"}`,
      is_error: true,
    }
  }
}
