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
            return { cellId, ran: r.success, error: r.error }
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
        const {
          buffer_id,
          cell_id,
          type,
          x_column,
          y_columns,
          partition_by_column,
          name,
          ohlc,
        } =
          (input as {
            buffer_id: number
            cell_id: string
            type: ChartType
            x_column?: string | null
            y_columns?: string[] | null
            partition_by_column?: string | null
            name?: string | null
            ohlc?: {
              open: string
              high: string
              low: string
              close: string
            } | null
          }) || {}
        setStatus(AIOperationStatus.ConfiguringChart, { cellId: cell_id })
        const patch: Partial<ChartConfig> & { type: ChartType } = { type }
        if (x_column !== undefined && x_column !== null)
          patch.xColumn = x_column
        if (y_columns !== undefined && y_columns !== null)
          patch.yColumns = y_columns
        if (partition_by_column !== undefined && partition_by_column !== null)
          patch.partitionByColumn = partition_by_column
        if (name !== undefined && name !== null) patch.name = name
        if (ohlc) patch.ohlc = ohlc
        // Candlestick renders from config.ohlc, not yColumns.
        if (
          type === "candlestick" &&
          !patch.ohlc &&
          y_columns &&
          y_columns.length === 4
        ) {
          const [open, high, low, close] = y_columns
          patch.ohlc = { open, high, low, close }
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
                type: ChartType
                x_column?: string | null
                y_columns?: string[] | null
                partition_by_column?: string | null
                name?: string | null
                ohlc?: {
                  open: string
                  high: string
                  low: string
                  close: string
                } | null
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
                type: cfg.type,
                xColumn: cfg.x_column ?? null,
                yColumns: cfg.y_columns ?? [],
              }
              if (cfg.partition_by_column)
                chartConfig.partitionByColumn = cfg.partition_by_column
              if (cfg.name) chartConfig.name = cfg.name
              if (cfg.ohlc) chartConfig.ohlc = cfg.ohlc
              else if (
                cfg.type === "candlestick" &&
                cfg.y_columns &&
                cfg.y_columns.length === 4
              ) {
                const [open, high, low, close] = cfg.y_columns
                chartConfig.ohlc = { open, high, low, close }
              }
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
                  error: result.error,
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
