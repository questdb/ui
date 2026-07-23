import type { ModelToolsClient, StatusCallback } from "../ai/aiAssistant"
import { AIOperationStatus } from "../../providers/AIStatusProvider"
import {
  getQuestDBTableOfContents,
  getSpecificDocumentation,
  parseDocItems,
  DocCategory,
} from "../questdbDocsRetrieval"
import { getBufferActionSeq } from "../notebooks/notebookAIBridge"
import { NotebookToolError } from "../notebooks/notebookToolError"
import type { CellMode, NotebookCell } from "../../store/notebook"
import {
  MAX_CELL_NAME_LENGTH,
  exceedsCellNameLimit,
} from "../../store/notebook"
import {
  MAX_BUFFER_NAME_LENGTH,
  exceedsBufferNameLimit,
} from "../../store/buffers"
import type { ChartConfig } from "../../scenes/Editor/Notebook/CellChart/chartTypes"
import {
  classifyAndCheckSqlForAutoRun,
  classifyAndCheckSqlForExecution,
  classifyAndCheckSqlForRunQuery,
  denyReasonUnresolvedSql,
  requireAllDQL,
  runPermissionGate,
  type Permissions,
} from "./permissions"
import type { ValidateQueryResult } from "../questdb/types"
import {
  categoryFor,
  mutatesNotebook,
  requiresFreshNotebookRead,
} from "./tools"
import { getQueriesFromText } from "../../scenes/Editor/Monaco/utils"
import {
  isAutoRefresh,
  isUnverifiableExecError,
  snapshotResultsMatchQueries,
  UNVERIFIED_RUN_NOTE,
} from "../../scenes/Editor/Notebook/notebookUtils"
import { buildRunQueryPayload, RUN_QUERY_DEFAULT_LIMIT } from "./runQuery"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import type { ToolExecutionContext } from "../ai/shared"
import { formatSql } from "../formatSql"
import { dispatchApplyNotebookState } from "./applyNotebookState"
import {
  mapQueryChart,
  mapRightAxis,
  type ToolQueryChart,
  type ToolRightAxis,
} from "./chartConfigWire"
import {
  invalidBufferIdResult,
  notebookErrorHint,
  notFetchedNotebookResult,
  staleNotebookResult,
} from "../notebooks/notebookToolMessages"
import { captureReadSeq } from "../notebooks/notebookFreshness"
import {
  withBoundNotebook,
  withBoundNotebookReadOnly,
  addCellTransition,
  deleteCellTransition,
  duplicateCellTransition,
  moveCellDownTransition,
  moveCellUpTransition,
  setCellChartConfigTransition,
  setCellLayoutTransition,
  setCellMaximizedTransition,
  setCellModeTransition,
  setCellViewMaximizedTransition,
  setLayoutModeTransition,
  updateCellTransition,
  type ViewParts,
  type NotebookTransitionResult,
} from "../notebooks/notebookController"
import {
  readNotebookState,
  serializeCell,
  summarizeCells,
} from "../ai/notebookSnapshot"
import { generateId } from "../../scenes/Editor/Notebook/notebookUtils"
import {
  copyNotebookSnapshots,
  deleteCellSnapshot,
} from "../../store/notebookResults"

// Runs a transition on the bound notebook (live or passive) — the one path
// every mutation takes. The transition validates and throws typed errors
// identically on both routes.
class NotebookStateChangedError extends Error {}

const runTransition = <T>(
  bufferId: number,
  transition: (parts: ViewParts) => NotebookTransitionResult<T>,
  signal?: AbortSignal,
  expectedActionSeq?: number,
): Promise<T> =>
  withBoundNotebook(
    bufferId,
    (ctrl) => {
      if (
        expectedActionSeq !== undefined &&
        getBufferActionSeq(bufferId) !== expectedActionSeq
      ) {
        throw new NotebookStateChangedError()
      }
      return ctrl.mutate(transition)
    },
    signal,
  )

// Reads the bound notebook's cells without moving the user's tab.
const readCells = (
  bufferId: number,
  signal?: AbortSignal,
): Promise<NotebookCell[]> =>
  withBoundNotebookReadOnly(
    bufferId,
    (view) => Promise.resolve(view.cells),
    signal,
  )

const cellValueOf = async (
  bufferId: number,
  cellId: string,
  signal?: AbortSignal,
): Promise<string | null> =>
  (await readCells(bufferId, signal)).find((c) => c.id === cellId)?.value ??
  null

const runCellBound = (
  bufferId: number,
  cellId: string,
  signal?: AbortSignal,
  sql?: string,
) =>
  withBoundNotebook(
    bufferId,
    (ctrl) => ctrl.runCell(cellId, signal, sql),
    signal,
  )

const routeNotebookTool = async <T>(
  op: () => Promise<T>,
  toolContext?: ToolExecutionContext,
): Promise<{ content: string; is_error?: boolean }> => {
  try {
    const result = await op()
    return { content: JSON.stringify(result ?? {}) }
  } catch (e) {
    if (e instanceof NotebookStateChangedError) {
      return staleNotebookResult(toolContext)
    }
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

const notebookBufferIdOf = (input: unknown): number | null => {
  const id = (input as { buffer_id?: unknown } | null | undefined)?.buffer_id
  return typeof id === "number" ? id : null
}

const dispatchRunQuery = async (
  input: unknown,
  modelToolsClient: ModelToolsClient,
  setStatus: StatusCallback,
  perms: Permissions | undefined,
  validateSql: ((sql: string) => Promise<ValidateQueryResult>) | undefined,
  signal: AbortSignal | undefined,
  toolContext: ToolExecutionContext | undefined,
): Promise<{ content: string; is_error?: boolean }> => {
  const { sql, limit } =
    (input as { sql?: string; limit?: number | null }) || {}
  if (typeof sql !== "string" || sql.trim().length === 0) {
    return {
      content: JSON.stringify({
        error: "sql parameter is required and must be a non-empty string.",
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
    const raw = await modelToolsClient.runQueryRaw(sql, requestedLimit, signal)
    // Schema panel listens for MSG_QUERY_SCHEMA and refreshes its cache.
    if (raw.type === "ddl" || raw.type === "dml") {
      if (toolContext) {
        toolContext.sqlWriteExecuted = true
      }
      eventBus.publish(EventType.MSG_QUERY_SCHEMA)
    }
    const payload = buildRunQueryPayload(raw, requestedLimit)
    const unverified = raw.type === "error" && isUnverifiableExecError(raw)
    return {
      content: JSON.stringify(
        unverified
          ? { ...payload, unverified: true, note: UNVERIFIED_RUN_NOTE }
          : payload,
      ),
      is_error: raw.type === "error" ? true : undefined,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const unverified = isUnverifiableExecError({
      type: "error",
      error: message,
    })
    return {
      content: JSON.stringify({
        error: `run_query failed: ${message}`,
        ...(unverified ? { unverified: true, note: UNVERIFIED_RUN_NOTE } : {}),
      }),
      is_error: true,
    }
  }
}

export const dispatchTool = async (
  toolName: string,
  input: unknown,
  modelToolsClient: ModelToolsClient,
  setStatus: StatusCallback,
  permsOrResolver?: Permissions | (() => Permissions),
  validateSql?: (sql: string) => Promise<ValidateQueryResult>,
  signal?: AbortSignal,
  toolContext?: ToolExecutionContext,
): Promise<{ content: string; is_error?: boolean }> => {
  const perms =
    typeof permsOrResolver === "function" ? permsOrResolver() : permsOrResolver

  if (perms) {
    const decision = runPermissionGate(toolName, {
      permissions: perms,
      categoryFor,
    })
    if (!decision.granted) {
      return { content: decision.reason, is_error: true }
    }
  }
  if (toolContext && mutatesNotebook(toolName)) {
    toolContext.notebookMutated = true
  }
  // Read-before-write gate, same predicate as the MCP surface: every
  // buffer-mutating call is blind until the flow has read the target
  // notebook. apply_notebook_state additionally re-checks its baseline
  // mid-apply (an edit landing between validation and commit still rejects).
  if (toolContext !== undefined && requiresFreshNotebookRead(toolName)) {
    const target = notebookBufferIdOf(input)
    if (target === null) {
      return invalidBufferIdResult()
    }
    switch (
      toolContext.notebookFreshness?.assertFresh(target) ??
      "not_fetched"
    ) {
      case "not_fetched":
        return notFetchedNotebookResult()
      case "stale":
        return staleNotebookResult(toolContext)
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
        if (typeof label === "string" && exceedsBufferNameLimit(label)) {
          return {
            content: JSON.stringify({
              error_code: "validation",
              message: `VALIDATION_ERROR: label must be at most ${MAX_BUFFER_NAME_LENGTH} characters.`,
            }),
            is_error: true,
          }
        }
        setStatus(AIOperationStatus.BuildingNotebook, { label })
        return routeNotebookTool(async () => {
          const res = await modelToolsClient.createNotebook(label, signal)
          toolContext?.notebookFreshness?.recordRead(
            res.bufferId,
            getBufferActionSeq(res.bufferId),
          )
          return {
            ...res,
            hint: "Created in the background — the tab was not switched. The user is notified and can open it. Only call activate_notebook if they explicitly ask to be taken there.",
          }
        })
      }
      case "activate_notebook": {
        const { buffer_id, cell_to_focus } =
          (input as { buffer_id: number; cell_to_focus?: string | null }) || {}
        setStatus(AIOperationStatus.InspectingNotebook)
        return routeNotebookTool(async () => {
          const ok = await modelToolsClient.activateNotebook(
            buffer_id,
            cell_to_focus,
          )
          if (!ok) {
            throw new NotebookToolError(
              "activation_failed",
              `Could not activate notebook ${buffer_id}.`,
            )
          }
          return { activated: true, buffer_id }
        })
      }
      case "duplicate_notebook": {
        const { buffer_id } = (input as { buffer_id: number }) || {}
        setStatus(AIOperationStatus.DuplicatingNotebook)
        return routeNotebookTool(async () => {
          const res = await modelToolsClient.duplicateNotebook(
            buffer_id,
            signal,
          )
          toolContext?.notebookFreshness?.recordRead(
            res.bufferId,
            getBufferActionSeq(res.bufferId),
          )
          return {
            ...res,
            hint: "Duplicated in the background — the tab was not switched. The user is notified and can open it. Only call activate_notebook if they explicitly ask to be taken there.",
          }
        })
      }
      case "delete_notebook": {
        const { buffer_id } = (input as { buffer_id: number }) || {}
        setStatus(AIOperationStatus.DeletingNotebook)
        return routeNotebookTool(() =>
          modelToolsClient.deleteNotebook(buffer_id),
        )
      }
      case "list_cells": {
        const { buffer_id } = (input as { buffer_id: number }) || {}
        setStatus(AIOperationStatus.InspectingNotebook)
        return routeNotebookTool(async () => ({
          cells: await withBoundNotebookReadOnly(
            buffer_id,
            (view) => Promise.resolve(summarizeCells(view.cells)),
            signal,
          ),
        }))
      }
      case "get_cell": {
        const { buffer_id, cell_id, get_full_content } =
          (input as {
            buffer_id: number
            cell_id: string
            get_full_content?: boolean | null
          }) || {}
        setStatus(AIOperationStatus.InspectingNotebook, { cellId: cell_id })
        return routeNotebookTool(() =>
          withBoundNotebookReadOnly(
            buffer_id,
            (view) =>
              Promise.resolve(
                serializeCell(
                  view.cells,
                  cell_id,
                  buffer_id,
                  get_full_content === true,
                ),
              ),
            signal,
          ),
        )
      }
      case "get_notebook_state": {
        const { buffer_id } = (input as { buffer_id: number }) || {}
        setStatus(AIOperationStatus.InspectingNotebook)
        const seqBeforeRead = captureReadSeq(buffer_id)
        const res = await routeNotebookTool(() => readNotebookState(buffer_id))
        if (!res.is_error) {
          toolContext?.notebookFreshness?.recordRead(buffer_id, seqBeforeRead)
        }
        return res
      }
      case "add_cell": {
        const { buffer_id, sql, after_cell_id, run, type } =
          (input as {
            buffer_id: number
            sql: string
            after_cell_id?: string | null
            run?: boolean | null
            type?: "sql" | "markdown" | null
          }) || {}
        setStatus(AIOperationStatus.AddingCell)
        const cellType = type === "markdown" ? "markdown" : undefined
        return routeNotebookTool(async () => {
          const cellId = await runTransition(
            buffer_id,
            (parts) =>
              addCellTransition(parts, buffer_id, {
                id: generateId(),
                value: sql,
                afterCellId: after_cell_id ?? undefined,
                type: cellType,
              }),
            signal,
          )
          if (cellType === "markdown") {
            // Markdown cells hold prose and are never executed — ignore `run`.
            return run
              ? {
                  cellId,
                  ran: false,
                  skipped: true,
                  note: "Markdown cells are not executable; `run` was ignored.",
                }
              : { cellId }
          }
          if (run) {
            if (perms && validateSql) {
              const decision = await classifyAndCheckSqlForAutoRun(
                sql,
                validateSql,
              )
              if (decision.action === "deny") {
                return {
                  cellId,
                  ran: false,
                  error: decision.reason,
                }
              }
              if (decision.action === "skip") {
                return {
                  cellId,
                  ran: false,
                  skipped: true,
                  note: decision.reason,
                }
              }
            }
            setStatus(AIOperationStatus.RunningCell, { cellId })
            const r = await runCellBound(
              buffer_id,
              cellId,
              signal,
              perms && validateSql ? sql : undefined,
            )
            return {
              cellId,
              ran: r.success,
              queryCount: r.queryCount,
              results: r.results,
              ...(r.unverified ? { unverified: r.unverified } : {}),
              ...(r.note ? { note: r.note } : {}),
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
        const updateBaseline =
          toolContext?.notebookFreshness?.getReadSeq(buffer_id) ??
          getBufferActionSeq(buffer_id)
        if (validateSql) {
          const current = (await readCells(buffer_id, signal)).find(
            (c) => c.id === cell_id,
          )
          if (current?.mode === "draw") {
            const decision = await requireAllDQL(value, validateSql)
            if (!decision.granted) {
              return { content: decision.reason, is_error: true }
            }
          }
        }
        // The read above awaits a round-trip; re-check the baseline so a user
        // edit landing mid-probe still rejects.
        if (getBufferActionSeq(buffer_id) !== updateBaseline) {
          return staleNotebookResult(toolContext)
        }
        return routeNotebookTool(() =>
          runTransition(
            buffer_id,
            (parts) =>
              updateCellTransition(parts, buffer_id, cell_id, { value }),
            signal,
          ),
        )
      }
      case "delete_cell": {
        const { buffer_id, cell_id } =
          (input as { buffer_id: number; cell_id: string }) || {}
        setStatus(AIOperationStatus.DeletingCell, { cellId: cell_id })
        return routeNotebookTool(() =>
          runTransition(
            buffer_id,
            (parts) => deleteCellTransition(parts, buffer_id, cell_id),
            signal,
          ),
        )
      }
      case "move_cell_up": {
        const { buffer_id, cell_id } =
          (input as { buffer_id: number; cell_id: string }) || {}
        setStatus(AIOperationStatus.ConfiguringLayout, { cellId: cell_id })
        return routeNotebookTool(() =>
          runTransition(
            buffer_id,
            (parts) => moveCellUpTransition(parts, buffer_id, cell_id),
            signal,
          ),
        )
      }
      case "move_cell_down": {
        const { buffer_id, cell_id } =
          (input as { buffer_id: number; cell_id: string }) || {}
        setStatus(AIOperationStatus.ConfiguringLayout, { cellId: cell_id })
        return routeNotebookTool(() =>
          runTransition(
            buffer_id,
            (parts) => moveCellDownTransition(parts, buffer_id, cell_id),
            signal,
          ),
        )
      }
      case "duplicate_cell": {
        const { buffer_id, cell_id } =
          (input as { buffer_id: number; cell_id: string }) || {}
        setStatus(AIOperationStatus.AddingCell, { cellId: cell_id })
        return routeNotebookTool(async () => {
          const seqBeforeRead = captureReadSeq(buffer_id)
          const { cells, controller } = await withBoundNotebookReadOnly(
            buffer_id,
            (view, ctrl) =>
              Promise.resolve({ cells: view.cells, controller: ctrl }),
            signal,
          )
          const sourceCell = cells.find((cell) => cell.id === cell_id)
          const newId = generateId()
          const queries = getQueriesFromText(sourceCell?.value ?? "")
          let snapshotsCopied = 0
          if (sourceCell) {
            try {
              await controller?.flushChartSnapshots?.()
            } catch {
              // best-effort — the copy proceeds with the last persisted frame
            }
            try {
              snapshotsCopied = await copyNotebookSnapshots(
                buffer_id,
                buffer_id,
                new Map([[cell_id, newId]]),
                (snapshot) =>
                  snapshotResultsMatchQueries(snapshot.results, queries),
              )
            } catch {
              // A copy failure (e.g. IndexedDB quota) must not block the
              // duplicate; the cell is still created, just without a result.
              snapshotsCopied = 0
            }
          }

          try {
            return {
              cellId: await runTransition(
                buffer_id,
                (parts) =>
                  duplicateCellTransition(parts, buffer_id, cell_id, newId),
                signal,
                seqBeforeRead,
              ),
            }
          } catch (error) {
            if (snapshotsCopied > 0) {
              await deleteCellSnapshot(buffer_id, newId).catch(() => undefined)
            }
            throw error
          }
        })
      }
      case "run_cell": {
        const { buffer_id, cell_id } =
          (input as { buffer_id: number; cell_id: string }) || {}
        setStatus(AIOperationStatus.RunningCell, { cellId: cell_id })
        const runCell = (await readCells(buffer_id, signal)).find(
          (c) => c.id === cell_id,
        )
        const value = runCell?.value ?? null
        if (runCell?.type === "markdown") {
          return routeNotebookTool(() =>
            Promise.resolve({
              cellId: cell_id,
              ran: false,
              skipped: true,
              note: "Markdown cells are not executable.",
            }),
          )
        }
        if (perms && validateSql) {
          if (value === null) {
            return {
              content: denyReasonUnresolvedSql("run_cell"),
              is_error: true,
            }
          }
          const decision = await classifyAndCheckSqlForExecution(
            value,
            perms,
            validateSql,
          )
          if (!decision.granted) {
            return { content: decision.reason, is_error: true }
          }
          return routeNotebookTool(() =>
            runCellBound(buffer_id, cell_id, signal, value),
          )
        }
        return routeNotebookTool(() => runCellBound(buffer_id, cell_id, signal))
      }
      case "set_layout_mode": {
        const { buffer_id, mode } =
          (input as { buffer_id: number; mode: "list" | "grid" }) || {}
        setStatus(AIOperationStatus.ConfiguringLayout)
        return routeNotebookTool(() =>
          runTransition(
            buffer_id,
            (parts) => setLayoutModeTransition(parts, mode),
            signal,
          ),
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
          runTransition(
            buffer_id,
            (parts) =>
              setCellLayoutTransition(parts, buffer_id, cell_id, {
                x,
                y,
                w,
                h,
              }),
            signal,
          ),
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
        const modeBaseline = getBufferActionSeq(buffer_id)
        if (mode === "draw" && validateSql) {
          const cellSql = await cellValueOf(buffer_id, cell_id, signal)
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
        return routeNotebookTool(
          () =>
            runTransition(
              buffer_id,
              (parts) => setCellModeTransition(parts, buffer_id, cell_id, mode),
              signal,
              modeBaseline,
            ),
          toolContext,
        )
      }
      case "set_cell_chart_config": {
        const { buffer_id, cell_id, x_column, queries, right_axis } =
          (input as {
            buffer_id: number
            cell_id: string
            x_column?: string | null
            queries?: (ToolQueryChart | null)[] | null
            right_axis?: ToolRightAxis | null
          }) || {}
        setStatus(AIOperationStatus.ConfiguringChart, { cellId: cell_id })
        const chartBaseline = getBufferActionSeq(buffer_id)
        // Patch: top-level null = preserve; a non-null queries array replaces
        // all per-query configs (queries:[] clears them, back to inference).
        const patch: Partial<ChartConfig> = {}
        if (x_column !== undefined && x_column !== null)
          patch.xColumn = x_column
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
          const cellSql = await cellValueOf(buffer_id, cell_id, signal)
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
        return routeNotebookTool(
          () =>
            runTransition(
              buffer_id,
              (parts) =>
                setCellChartConfigTransition(parts, buffer_id, cell_id, patch),
              signal,
              chartBaseline,
            ),
          toolContext,
        )
      }
      case "set_cell_name": {
        const { buffer_id, cell_id, name } =
          (input as {
            buffer_id: number
            cell_id: string
            name?: string | null
          }) || {}
        if (typeof name === "string" && exceedsCellNameLimit(name)) {
          return {
            content: JSON.stringify({
              error_code: "validation",
              message: `VALIDATION_ERROR: name must be at most ${MAX_CELL_NAME_LENGTH} characters.`,
            }),
            is_error: true,
          }
        }
        setStatus(AIOperationStatus.UpdatingCell, { cellId: cell_id })
        return routeNotebookTool(() =>
          runTransition(
            buffer_id,
            (parts) =>
              updateCellTransition(parts, buffer_id, cell_id, {
                name: name ?? undefined,
              }),
            signal,
          ),
        )
      }
      case "set_cell_autorefresh": {
        const { buffer_id, cell_id, value } =
          (input as {
            buffer_id: number
            cell_id: string
            value: unknown
          }) || {}
        if (!isAutoRefresh(value)) {
          return {
            content: JSON.stringify({
              error_code: "validation",
              message: `VALIDATION_ERROR: value must be true, false, or one of "1s", "5s", "10s", "30s", "1m".`,
            }),
            is_error: true,
          }
        }
        setStatus(AIOperationStatus.ConfiguringChart, { cellId: cell_id })
        return routeNotebookTool(() =>
          runTransition(
            buffer_id,
            (parts) =>
              updateCellTransition(parts, buffer_id, cell_id, {
                autoRefresh: value,
              }),
            signal,
          ),
        )
      }
      case "set_cell_view_maximized": {
        const { buffer_id, cell_id, value } =
          (input as {
            buffer_id: number
            cell_id: string
            value: boolean
          }) || {}
        setStatus(AIOperationStatus.ConfiguringChart, { cellId: cell_id })
        return routeNotebookTool(() =>
          runTransition(
            buffer_id,
            (parts) =>
              setCellViewMaximizedTransition(parts, buffer_id, cell_id, value),
            signal,
          ),
        )
      }
      case "apply_notebook_state": {
        return dispatchApplyNotebookState(
          input,
          setStatus,
          perms,
          validateSql,
          signal,
          toolContext,
        )
      }

      case "set_cell_maximized": {
        const { buffer_id, cell_id } =
          (input as { buffer_id: number; cell_id: string | null }) || {}
        setStatus(AIOperationStatus.ConfiguringLayout, {
          cellId: cell_id ?? undefined,
        })
        return routeNotebookTool(() =>
          runTransition(
            buffer_id,
            (parts) => setCellMaximizedTransition(parts, buffer_id, cell_id),
            signal,
          ),
        )
      }
      case "run_query": {
        return dispatchRunQuery(
          input,
          modelToolsClient,
          setStatus,
          perms,
          validateSql,
          signal,
          toolContext,
        )
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
