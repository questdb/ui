import type { ModelToolsClient, StatusCallback } from "../ai/aiAssistant"
import { loadRe2 } from "../../components/ResultGrid/highlight"
import { AIOperationStatus } from "../../providers/AIStatusProvider"
import {
  backgroundOf,
  bringCellIntoView,
  cellChartInstance,
  pictureOf,
  settled,
  waitForCellChart,
  type CellChartPicture,
} from "../../scenes/Editor/Notebook/cellChartImages"
import { getRenderReport } from "../../scenes/Editor/Notebook/renderReports"
import {
  cellImage,
  denyReasonForCellImage,
  type CellImageDeps,
} from "./cellImageTool"
import {
  getQuestDBTableOfContents,
  getSpecificDocumentation,
  parseDocItems,
  DocCategory,
} from "../questdbDocsRetrieval"
import { getBufferActionSeq } from "../notebooks/notebookAIBridge"
import { NotebookToolError } from "../notebooks/notebookToolError"
import { requireCellIn } from "../notebooks/notebookDexieView"
import type {
  AgentCellView,
  CellMode,
  NotebookCell,
} from "../../store/notebook"
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
  classifyAndCheckSqlForRunQuery,
  denyReasonUnresolvedSql,
  requireAllDQL,
  runPermissionGate,
  type Permissions,
  type RunCellGate,
} from "./permissions"
import type { ValidateQueryResult } from "../questdb/types"
import { stringifyWithBigInts } from "../questdb/serialize"
import {
  categoryFor,
  mutatesNotebook,
  requiresFreshNotebookRead,
} from "./tools"
import { getQueriesFromText } from "../../scenes/Editor/Monaco/utils"
import {
  isAutoRefresh,
  isUnverifiableExecError,
  UNVERIFIED_RUN_NOTE,
} from "../../scenes/Editor/Notebook/notebookUtils"
import { snapshotResultsMatchQueries } from "../../scenes/Editor/Notebook/statementIdentity"
import { buildRunQueryPayload, RUN_QUERY_DEFAULT_LIMIT } from "./runQuery"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import type { ToolExecutionContext } from "../ai/shared"
import { formatSql } from "../formatSql"
import { dispatchApplyNotebookState } from "./applyNotebookState"
import {
  mapQueryChart,
  mapChartOptions,
  mapRightAxis,
  type ToolQueryChart,
  type ToolChartOptions,
  type ToolRightAxis,
} from "./chartConfigWire"
import {
  type HighlightConfigWire,
  parseHighlightConfigFor,
  regexLiteralNotes,
  shownResultsOf,
  wireUsesPatterns,
} from "./highlightConfigWire"
import { loadCellSnapshot } from "../../store/notebookResults"
import {
  WireError,
  parseChartSync,
  parseCustomOption,
  parseFormats,
  parseGridMode,
  parseInteractions,
  parseVisual,
  type FormatWire,
  type InteractionsWire,
  type VisualWire,
} from "./dashboardWire"
import { lightColors } from "../../theme"
import { checkCustomOption } from "../../scenes/Editor/Notebook/customChart/prepareCustomOption"
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
  clearCellAutoRefreshTransition,
  deleteCellTransition,
  duplicateCellTransition,
  getController,
  moveCellDownTransition,
  moveCellUpTransition,
  setCellChartConfigTransition,
  setCellDashboardTransition,
  setCellHighlightConfigTransition,
  setNotebookSettingsTransition,
  setCellDimensionsTransition,
  setCellLayoutTransition,
  setCellMaximizedTransition,
  setCellModeTransition,
  setLayoutModeTransition,
  setNotebookAutoRefreshTransition,
  updateCellTransition,
  type ViewParts,
  type NotebookTransitionResult,
} from "../notebooks/notebookController"
import {
  loadNotebookResultStatusReader,
  readNotebookState,
  serializeCell,
  summarizeCells,
} from "../ai/notebookSnapshot"
import type { CellResultStatusReader } from "../../scenes/Editor/Notebook/cellSizing"
import { generateId } from "../../scenes/Editor/Notebook/notebookUtils"
import {
  copyNotebookSnapshots,
  deleteCellSnapshot,
} from "../../store/notebookResults"

// Runs a transition on the bound notebook (live or passive) — the one path
// every mutation takes. The transition validates and throws typed errors
// identically on both routes.
class NotebookStateChangedError extends Error {}
class DuplicateSourceChangedError extends Error {}

const requireUnchangedSince = (
  bufferId: number,
  expectedActionSeq: number | undefined,
): void => {
  if (
    expectedActionSeq !== undefined &&
    getBufferActionSeq(bufferId) !== expectedActionSeq
  ) {
    throw new NotebookStateChangedError()
  }
}

const runTransition = <T>(
  bufferId: number,
  transition: (parts: ViewParts) => NotebookTransitionResult<T>,
  signal?: AbortSignal,
  expectedActionSeq?: number,
): Promise<T> =>
  withBoundNotebook(
    bufferId,
    (ctrl) => {
      requireUnchangedSince(bufferId, expectedActionSeq)
      return ctrl.mutate(transition)
    },
    signal,
  )

const runTransitionWithResultStatus = <T>(
  bufferId: number,
  transition: (
    parts: ViewParts,
    resultStatusOf: CellResultStatusReader,
  ) => NotebookTransitionResult<T>,
  signal?: AbortSignal,
): Promise<T> =>
  withBoundNotebook(
    bufferId,
    (ctrl) => ctrl.mutateWithResultStatus(transition),
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

const readSettings = (
  bufferId: number,
  signal?: AbortSignal,
): Promise<NonNullable<ViewParts["settings"]>> =>
  withBoundNotebookReadOnly(
    bufferId,
    (view) => Promise.resolve(view.settings ?? {}),
    signal,
  )

const validationResult = (message: string) => ({
  content: JSON.stringify({
    error_code: "validation",
    message: `VALIDATION_ERROR: ${message}`,
  }),
  is_error: true,
})

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
  signal: AbortSignal | undefined,
  sql: string,
  gate: RunCellGate,
) =>
  withBoundNotebook(
    bufferId,
    (ctrl) => ctrl.runCell(cellId, signal, sql, gate),
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
          message:
            e.code === "validation"
              ? `VALIDATION_ERROR: ${e.message}`
              : e.message,
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
  perms: Permissions,
  validateSql: (sql: string) => Promise<ValidateQueryResult>,
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
  const decision = await classifyAndCheckSqlForRunQuery(sql, perms, validateSql)
  if (!decision.granted) {
    return { content: decision.reason, is_error: true }
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

/** A picture a tool returns besides its text (get_cell_image). */
export type ToolImage = { data: string; mimeType: "image/png" }

export type DispatchOutput = {
  content: string
  is_error?: boolean
  images?: ToolImage[]
}

/** A tool's result with a picture beside its text, unless it failed. */
export const withPicture = (
  out: DispatchOutput,
  picture: CellChartPicture | null,
): DispatchOutput =>
  out.is_error || !picture
    ? out
    : { ...out, images: [{ data: picture.data, mimeType: "image/png" }] }

// The page side of get_cell_image (see cellImageTool).
const cellImageDeps: CellImageDeps = {
  readCells,
  liveView: async (bufferId) => {
    // Only the open notebook has a live controller; the rest live in storage.
    const controller = getController(bufferId)
    if (controller?.kind !== "live") return null
    const view = await controller.readView()
    return { maximizedCellId: view.maximizedCellId ?? null }
  },
  chartOf: cellChartInstance,
  bringIntoView: bringCellIntoView,
  waitForChart: (bufferId, cellId, signal) =>
    waitForCellChart(bufferId, cellId, 4000, signal),
  settle: (instance, signal) => settled(instance, 1500, signal),
  picture: (instance) => pictureOf(instance, backgroundOf(instance.getDom())),
  reportOf: getRenderReport,
}

export const dispatchTool = async (
  toolName: string,
  input: unknown,
  modelToolsClient: ModelToolsClient,
  setStatus: StatusCallback,
  permsOrResolver: Permissions | (() => Permissions),
  validateSql: (sql: string) => Promise<ValidateQueryResult>,
  signal?: AbortSignal,
  toolContext?: ToolExecutionContext,
): Promise<DispatchOutput> => {
  const perms =
    typeof permsOrResolver === "function" ? permsOrResolver() : permsOrResolver

  const gate = runPermissionGate(toolName, {
    permissions: perms,
    categoryFor,
  })
  if (!gate.granted) {
    return { content: gate.reason, is_error: true }
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
            content: stringifyWithBigInts(
              {
                tables: truncated,
                total_count: result.length,
                truncated: true,
                message: `Showing ${MAX_TABLES} of ${result.length} tables. Use get_table_schema with a specific table name to get details if you are interested in a specific table.`,
              },
              2,
            ),
          }
        }
        return { content: stringifyWithBigInts(result, 2) }
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
            ? stringifyWithBigInts(result, 2)
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
            hint: "Duplicated in the background — the tab was not switched. Run history is preserved; matching saved result snapshots copy best-effort in the background and hydrate when opened. The user is notified and can open it. Only call activate_notebook if they explicitly ask to be taken there.",
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
            async (view, controller) => {
              const resultStatusOf = await loadNotebookResultStatusReader(
                buffer_id,
                controller,
              )
              return summarizeCells(
                view.cells,
                controller?.readRefreshState?.(),
                resultStatusOf,
              )
            },
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
            async (view, controller) => {
              const resultStatusOf = await loadNotebookResultStatusReader(
                buffer_id,
                controller,
              )
              return serializeCell(
                view.cells,
                cell_id,
                buffer_id,
                get_full_content === true,
                controller?.readRefreshState?.(),
                resultStatusOf(cell_id),
                perms.read,
              )
            },
            signal,
          ),
        )
      }
      case "get_cell_image": {
        const { buffer_id, cell_id } =
          (input as { buffer_id: number; cell_id: string }) || {}
        // A picture shows query results, which only a read grant may see.
        if (!perms.read)
          return { content: denyReasonForCellImage(), is_error: true }
        setStatus(AIOperationStatus.InspectingNotebook, { cellId: cell_id })
        // The picture travels beside the JSON text, not inside it.
        const taken: { picture: CellChartPicture | null } = { picture: null }
        const out = await routeNotebookTool(async () => {
          const result = await cellImage(
            buffer_id,
            cell_id,
            cellImageDeps,
            signal,
          )
          taken.picture = result.picture
          return result.body
        })
        return withPicture(out, taken.picture)
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
            setStatus(AIOperationStatus.RunningCell, { cellId })
            // The runner's barrier classification decides auto-run
            // eligibility — writes are skipped at launch, never pre-checked.
            const r = await runCellBound(buffer_id, cellId, signal, sql, {
              kind: "autoRun",
            })
            if (r.denied !== undefined) {
              return { cellId, ran: false, error: r.denied }
            }
            if (r.skipped !== undefined) {
              return { cellId, ran: false, skipped: true, note: r.skipped }
            }
            return {
              cellId,
              ran: r.success,
              queryCount: r.queryCount,
              results: r.results,
              ...(r.cancelled !== undefined ? { cancelled: r.cancelled } : {}),
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
        const current = (await readCells(buffer_id, signal)).find(
          (c) => c.id === cell_id,
        )
        if (current?.mode === "draw") {
          const decision = await requireAllDQL(value, validateSql)
          if (!decision.granted) {
            return { content: decision.reason, is_error: true }
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

          const duplicateCurrentCell = (guardCopiedSnapshot: boolean) =>
            runTransition(
              buffer_id,
              (parts) => {
                if (
                  guardCopiedSnapshot &&
                  controller?.kind === "live" &&
                  parts.cells.find((cell) => cell.id === cell_id) !== sourceCell
                ) {
                  throw new DuplicateSourceChangedError()
                }
                return duplicateCellTransition(parts, buffer_id, cell_id, newId)
              },
              signal,
              seqBeforeRead,
            )

          try {
            return {
              cellId: await duplicateCurrentCell(snapshotsCopied > 0),
            }
          } catch (error) {
            if (snapshotsCopied > 0) {
              await deleteCellSnapshot(buffer_id, newId).catch(() => undefined)
              snapshotsCopied = 0
            }
            if (error instanceof DuplicateSourceChangedError) {
              return { cellId: await duplicateCurrentCell(false) }
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
        if (value === null) {
          return {
            content: denyReasonUnresolvedSql("run_cell"),
            is_error: true,
          }
        }
        // The runner's barrier classification enforces the permission — one
        // classification per launch, shared with strategy selection.
        let deniedReason: string | undefined
        const routed = await routeNotebookTool(async () => {
          const summary = await runCellBound(
            buffer_id,
            cell_id,
            signal,
            value,
            {
              kind: "explicit",
              permissions: perms,
            },
          )
          if (summary.denied !== undefined) {
            deniedReason = summary.denied
            return {}
          }
          return summary
        })
        if (deniedReason !== undefined) {
          return { content: deniedReason, is_error: true }
        }
        return routed
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
        const { buffer_id, cell_id, x, y, w } =
          (input as {
            buffer_id: number
            cell_id: string
            x: number
            y: number
            w: number
          }) || {}
        setStatus(AIOperationStatus.ConfiguringLayout, { cellId: cell_id })
        return routeNotebookTool(() =>
          runTransitionWithResultStatus(
            buffer_id,
            (parts, resultStatusOf) =>
              setCellLayoutTransition(parts, buffer_id, cell_id, {
                x,
                y,
                w,
                resultStatus: resultStatusOf(cell_id),
              }),
            signal,
          ),
        )
      }
      case "set_cell_dimensions": {
        const { buffer_id, cell_id, editor_height, result_height, view } =
          (input as {
            buffer_id: number
            cell_id: string
            editor_height: number | "auto" | null
            result_height: number | "auto" | null
            view: AgentCellView | null
          }) || {}
        setStatus(AIOperationStatus.ConfiguringLayout, { cellId: cell_id })
        return routeNotebookTool(() =>
          runTransitionWithResultStatus(
            buffer_id,
            (parts, resultStatusOf) =>
              setCellDimensionsTransition(parts, buffer_id, cell_id, {
                editorHeight: editor_height,
                resultHeight: result_height,
                view,
                resultStatus: resultStatusOf(cell_id),
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
        if (mode === "draw") {
          const modeCell = (await readCells(buffer_id, signal)).find(
            (c) => c.id === cell_id,
          )
          // Markdown holds prose, not SQL: the transition rejects it with the
          // typed error instead of a misleading DQL verdict on the prose.
          if (modeCell?.type !== "markdown") {
            const cellSql = modeCell?.value ?? null
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
        const {
          buffer_id,
          cell_id,
          x_column,
          queries,
          right_axis,
          horizontal,
          thresholds,
        } =
          (input as {
            buffer_id: number
            cell_id: string
            x_column?: string | null
            queries?: (ToolQueryChart | null)[] | null
            right_axis?: ToolRightAxis | null
          } & ToolChartOptions) || {}
        setStatus(AIOperationStatus.ConfiguringChart, { cellId: cell_id })
        const chartBaseline = getBufferActionSeq(buffer_id)
        // Patch: top-level null = preserve; a non-null queries array replaces
        // all per-query configs (queries:[] clears them, back to inference).
        const patch: Partial<ChartConfig> = {}
        if (x_column !== undefined && x_column !== null)
          patch.xColumn = x_column
        if (queries !== undefined && queries !== null) {
          patch.queries = queries.map((q) => (q ? mapQueryChart(q) : null))
          // Preset series replace a visual or custom option.
          patch.visual = undefined
          patch.custom = undefined
        }
        if (right_axis !== undefined && right_axis !== null)
          patch.rightAxis = mapRightAxis(right_axis)
        Object.assign(patch, mapChartOptions({ horizontal, thresholds }))
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
      case "set_cell_visual": {
        const { buffer_id, cell_id, visual } =
          (input as {
            buffer_id: number
            cell_id: string
            visual?: VisualWire | null
          }) || {}
        setStatus(AIOperationStatus.ConfiguringChart, { cellId: cell_id })
        const baseline = getBufferActionSeq(buffer_id)
        let parsed: ReturnType<typeof parseVisual> | undefined
        try {
          parsed = visual ? parseVisual(visual, "visual") : undefined
        } catch (e) {
          if (e instanceof WireError) return validationResult(e.message)
          throw e
        }
        return routeNotebookTool(async () => {
          const cell = (await readCells(buffer_id, signal)).find(
            (c) => c.id === cell_id,
          )
          await runTransition(
            buffer_id,
            (parts) =>
              setCellChartConfigTransition(parts, buffer_id, cell_id, {
                visual: parsed,
                ...(parsed ? { custom: undefined } : {}),
              }),
            signal,
            baseline,
          )
          return {
            ok: true,
            ...(cell?.mode !== "draw"
              ? {
                  note: "The visual shows once the cell is in draw mode: call set_cell_mode with mode 'draw'.",
                }
              : {}),
            hint: "Read render_report with get_cell to see what was drawn and any missing columns.",
          }
        }, toolContext)
      }
      case "set_cell_custom_chart": {
        const { buffer_id, cell_id, option_json } =
          (input as {
            buffer_id: number
            cell_id: string
            option_json?: string | null
          }) || {}
        setStatus(AIOperationStatus.ConfiguringChart, { cellId: cell_id })
        const baseline = getBufferActionSeq(buffer_id)
        let option: Record<string, unknown> | undefined
        try {
          option = option_json
            ? parseCustomOption(option_json, "option_json")
            : undefined
        } catch (e) {
          if (e instanceof WireError) return validationResult(e.message)
          throw e
        }
        return routeNotebookTool(async () => {
          const problems = option ? checkCustomOption(option, lightColors) : []
          if (problems.some((p) => p.severity === "error" && p.path === ""))
            throw new NotebookToolError("validation", problems[0].message)
          const cell = (await readCells(buffer_id, signal)).find(
            (c) => c.id === cell_id,
          )
          await runTransition(
            buffer_id,
            (parts) =>
              setCellChartConfigTransition(parts, buffer_id, cell_id, {
                custom: option ? { option } : undefined,
                ...(option ? { visual: undefined } : {}),
              }),
            signal,
            baseline,
          )
          return {
            ok: true,
            ...(problems.length > 0 ? { problems } : {}),
            ...(cell?.mode !== "draw"
              ? {
                  note: "The chart shows once the cell is in draw mode: call set_cell_mode with mode 'draw'.",
                }
              : {}),
            hint: "Read render_report with get_cell after the chart draws: it lists data problems such as encode columns that are not in a dataset.",
          }
        }, toolContext)
      }
      case "set_cell_formats": {
        const { buffer_id, cell_id, formats, grid_mode } =
          (input as {
            buffer_id: number
            cell_id: string
            formats?: FormatWire[] | null
            grid_mode?: string | null
          }) || {}
        setStatus(AIOperationStatus.ConfiguringHighlight, { cellId: cell_id })
        const baseline = getBufferActionSeq(buffer_id)
        const patch: Parameters<typeof setCellDashboardTransition>[3] = {}
        try {
          if (formats != null) {
            const parsed = parseFormats(formats, "formats")
            patch.formats = Object.keys(parsed).length > 0 ? parsed : undefined
          }
          if (grid_mode != null)
            patch.gridMode = parseGridMode(grid_mode, "grid_mode")
        } catch (e) {
          if (e instanceof WireError) return validationResult(e.message)
          throw e
        }
        return routeNotebookTool(
          () =>
            runTransition(
              buffer_id,
              (parts) =>
                setCellDashboardTransition(parts, buffer_id, cell_id, patch),
              signal,
              baseline,
            ).then(() => ({ ok: true })),
          toolContext,
        )
      }
      case "set_cell_interactions": {
        const { buffer_id, cell_id, click, brush } =
          (input as {
            buffer_id: number
            cell_id: string
            click?: InteractionsWire["click"]
            brush?: InteractionsWire["brush"]
          }) || {}
        setStatus(AIOperationStatus.ConfiguringChart, { cellId: cell_id })
        const baseline = getBufferActionSeq(buffer_id)
        let interactions: ReturnType<typeof parseInteractions>
        try {
          interactions = parseInteractions({ click, brush }, "interactions")
        } catch (e) {
          if (e instanceof WireError) return validationResult(e.message)
          throw e
        }
        return routeNotebookTool(async () => {
          const settings = await readSettings(buffer_id, signal)
          const known = new Set((settings.variables ?? []).map((v) => v.name))
          const missing = [
            interactions?.click?.variable,
            interactions?.brush?.from,
            interactions?.brush?.to,
          ].filter((v): v is string => v !== undefined && !known.has(v))
          await runTransition(
            buffer_id,
            (parts) =>
              setCellDashboardTransition(parts, buffer_id, cell_id, {
                interactions,
              }),
            signal,
            baseline,
          )
          return {
            ok: true,
            ...(missing.length > 0
              ? {
                  note: `Variables ${missing.map((m) => `@${m}`).join(", ")} do not exist yet; a click or drag creates them. Declare them with apply_notebook_state variables to give cells a starting value.`,
                }
              : {}),
          }
        }, toolContext)
      }
      case "set_notebook_chart_sync": {
        const { buffer_id, crosshair, zoom } =
          (input as {
            buffer_id: number
            crosshair?: string | null
            zoom?: boolean | null
          }) || {}
        setStatus(AIOperationStatus.ConfiguringLayout)
        const baseline = getBufferActionSeq(buffer_id)
        const sync = parseChartSync({ crosshair, zoom })
        return routeNotebookTool(
          () =>
            runTransition(
              buffer_id,
              (parts) =>
                setNotebookSettingsTransition(parts, {
                  chartSync:
                    sync.crosshair === "off" && !sync.zoom ? undefined : sync,
                }),
              signal,
              baseline,
            ).then(() => ({ ok: true })),
          toolContext,
        )
      }
      case "set_cell_highlight_config": {
        const { buffer_id, cell_id, highlight_config } =
          (input as {
            buffer_id: number
            cell_id: string
            highlight_config?: HighlightConfigWire | null
          }) || {}
        setStatus(AIOperationStatus.ConfiguringHighlight, { cellId: cell_id })
        const highlightBaseline = getBufferActionSeq(buffer_id)
        if (highlight_config && wireUsesPatterns(highlight_config)) {
          await loadRe2()
        }
        const notes = highlight_config
          ? regexLiteralNotes(highlight_config)
          : []
        return routeNotebookTool(async () => {
          const snapshot = highlight_config
            ? await loadCellSnapshot(buffer_id, cell_id)
            : undefined
          await runTransition(
            buffer_id,
            (parts) =>
              setCellHighlightConfigTransition(
                parts,
                buffer_id,
                cell_id,
                highlight_config
                  ? parseHighlightConfigFor(
                      highlight_config,
                      shownResultsOf(
                        requireCellIn(parts.cells, cell_id, buffer_id),
                        snapshot,
                      ),
                      "highlight_config",
                    )
                  : null,
              ),
            signal,
            highlightBaseline,
          )
          return notes.length > 0 ? { notes } : undefined
        }, toolContext)
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
        if (value !== null && !isAutoRefresh(value)) {
          return {
            content: JSON.stringify({
              error_code: "validation",
              message: `VALIDATION_ERROR: value must be true, false, null, or an interval of digits plus ms, s or m from 50ms to 60m, e.g. "250ms", "5s", "15m".`,
            }),
            is_error: true,
          }
        }
        // Markdown cells hold prose and never run, so an interval on them is
        // meaningless — mirrors run_cell's markdown refusal.
        const autoRefreshCell = (await readCells(buffer_id, signal)).find(
          (c) => c.id === cell_id,
        )
        if (autoRefreshCell?.type === "markdown") {
          return {
            content: JSON.stringify({
              error_code: "validation",
              message:
                "VALIDATION_ERROR: markdown cells are never executed, so auto-refresh does not apply to them.",
            }),
            is_error: true,
          }
        }
        setStatus(AIOperationStatus.ConfiguringAutoRefresh, { cellId: cell_id })
        return routeNotebookTool(() =>
          runTransition(
            buffer_id,
            (parts) =>
              value === null
                ? clearCellAutoRefreshTransition(parts, buffer_id, cell_id)
                : updateCellTransition(parts, buffer_id, cell_id, {
                    autoRefresh: value,
                  }),
            signal,
          ),
        )
      }
      case "set_notebook_autorefresh": {
        const { buffer_id, value, reset_cell_overrides } =
          (input as {
            buffer_id: number
            value: unknown
            reset_cell_overrides?: boolean
          }) || {}
        if (!isAutoRefresh(value)) {
          return {
            content: JSON.stringify({
              error_code: "validation",
              message: `VALIDATION_ERROR: value must be true, false, or an interval of digits plus ms, s or m from 50ms to 60m, e.g. "250ms", "5s", "15m".`,
            }),
            is_error: true,
          }
        }
        setStatus(AIOperationStatus.ConfiguringAutoRefresh)
        return routeNotebookTool(() =>
          runTransition(
            buffer_id,
            (parts) =>
              setNotebookAutoRefreshTransition(
                parts,
                value,
                reset_cell_overrides === true,
              ),
            signal,
          ),
        )
      }
      case "apply_notebook_state": {
        return await dispatchApplyNotebookState(
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
