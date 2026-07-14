import type { StatusCallback } from "../ai/aiAssistant"
import { AIOperationStatus } from "../../providers/AIStatusProvider"
import { getBufferActionSeq } from "../notebooks/notebookAIBridge"
import { NotebookToolError } from "../notebooks/notebookToolError"
import {
  applyNotebookStateTransition,
  withBoundNotebook,
  withBoundNotebookReadOnly,
  type ApplyNotebookStateCellRequest,
  type ApplyNotebookStateRequest,
} from "../notebooks/notebookController"
import type { CellMode, CellType, NotebookVariable } from "../../store/notebook"
import type { ChartConfig } from "../../scenes/Editor/Notebook/CellChart/chartTypes"
import {
  classifyAndCheckSqlForAutoRun,
  denyReasonUnresolvedSql,
  requireAllDQL,
  type PermissionDecision,
  type Permissions,
} from "./permissions"
import { isAutoRefresh } from "../../scenes/Editor/Notebook/notebookUtils"
import type { ValidateQueryResult } from "../questdb/types"
import {
  isValidVariableName,
  renderDeclareValidationQuery,
  validateVariableShape,
} from "../../scenes/Editor/Notebook/declareUtils"
import type { ToolExecutionContext } from "../ai/shared"
import {
  mapQueryChart,
  mapRightAxis,
  type ToolQueryChart,
  type ToolRightAxis,
} from "./chartConfigWire"
import {
  applyStaleNotebookResult,
  notebookErrorHint,
} from "../notebooks/notebookToolMessages"
import { captureReadSeq } from "../notebooks/notebookFreshness"

type ToolResult = { content: string; is_error?: boolean }

const validationError = (message: string): ToolResult => ({
  content: JSON.stringify({
    error_code: "validation",
    message: `VALIDATION_ERROR: ${message}`,
  }),
  is_error: true,
})

const validateApplyVariables = async (
  variables: NotebookVariable[] | null | undefined,
  validateSql: ((sql: string) => Promise<ValidateQueryResult>) | undefined,
): Promise<ToolResult | null> => {
  if (
    variables !== undefined &&
    variables !== null &&
    !Array.isArray(variables)
  ) {
    return validationError(
      "variables must be an ordered array of {name,value} entries (or null to preserve).",
    )
  }
  if (!Array.isArray(variables)) return null

  const seen = new Set<string>()
  for (const [idx, variable] of variables.entries()) {
    if (
      !variable ||
      typeof variable !== "object" ||
      typeof variable.name !== "string" ||
      typeof variable.value !== "string"
    ) {
      return validationError(
        `variables[${idx}] must be an object with string name and value fields.`,
      )
    }
    const { name } = variable
    if (!isValidVariableName(name)) {
      return validationError(
        `variables[${idx}].name "${name}" is not a valid QuestDB identifier. First char must be a letter, underscore, or non-ASCII Unicode char (U+0080..U+FFFF); remaining chars may also include digits. No leading '@'.`,
      )
    }
    if (seen.has(name)) {
      return validationError(
        `duplicate variable name "${name}". Variables are ordered, but each name may only appear once.`,
      )
    }
    seen.add(name)
  }
  for (let idx = 0; idx < variables.length; idx += 1) {
    const shapeError = validateVariableShape(variables[idx])
    if (shapeError) {
      return validationError(
        `variables[${idx}] (${variables[idx].name}) shape check failed (${shapeError.kind}). Each value must be a single expression with no embedded assignments, top-level commas, or DECLARE syntax. Use parentheses to group expressions if commas are needed.`,
      )
    }
  }
  if (validateSql) {
    for (let idx = 0; idx < variables.length; idx += 1) {
      const result = await validateSql(
        renderDeclareValidationQuery(variables.slice(0, idx + 1)),
      )
      if ("error" in result) {
        return validationError(
          `variables[${idx}] (${variables[idx].name}) failed QuestDB validation: ${result.error}`,
        )
      }
    }
  }
  return null
}

type ResolvedRun = {
  cellId: string
  value: string
  runnable: boolean
}

type RunEntry = {
  cellId: string
  success: boolean
  queryCount?: number
  results?: string[]
  error?: string
  unverified?: boolean
  note?: string
  skipped?: boolean
}

const runAppliedCells = async (
  resolved: ResolvedRun[],
  bufferId: number,
  perms: Permissions | undefined,
  validateSql: ((sql: string) => Promise<ValidateQueryResult>) | undefined,
  signal: AbortSignal | undefined,
): Promise<RunEntry[]> => {
  const settled = await Promise.all(
    resolved.map(async (r): Promise<RunEntry | null> => {
      if (!r.runnable) return null
      if (perms && validateSql) {
        const decision = await classifyAndCheckSqlForAutoRun(
          r.value,
          validateSql,
        )
        if (decision.action === "deny") {
          return { cellId: r.cellId, success: false, error: decision.reason }
        }
        if (decision.action === "skip") {
          return {
            cellId: r.cellId,
            success: true,
            skipped: true,
            note: decision.reason,
          }
        }
      }
      try {
        const result = await withBoundNotebook(
          bufferId,
          (ctrl) =>
            ctrl.runCell(
              r.cellId,
              signal,
              perms && validateSql ? r.value : undefined,
            ),
          signal,
        )
        return {
          cellId: r.cellId,
          success: result.success,
          queryCount: result.queryCount,
          results: result.results,
          ...(result.unverified ? { unverified: result.unverified } : {}),
          ...(result.note ? { note: result.note } : {}),
        }
      } catch (runErr) {
        const message =
          runErr instanceof Error ? runErr.message : String(runErr)
        return { cellId: r.cellId, success: false, error: message }
      }
    }),
  )
  return settled.filter((entry): entry is RunEntry => entry !== null)
}

// The apply_notebook_state handler: wholesale-PUT validation, the draw-cell
// DQL invariant, the stale re-check around server round-trips, and the
// post-apply auto-run loop.
export const dispatchApplyNotebookState = async (
  input: unknown,
  setStatus: StatusCallback,
  perms: Permissions | undefined,
  validateSql: ((sql: string) => Promise<ValidateQueryResult>) | undefined,
  signal: AbortSignal | undefined,
  toolContext: ToolExecutionContext | undefined,
): Promise<{ content: string; is_error?: boolean }> => {
  const { buffer_id, layout_mode, maximized_cell_id, variables, cells } =
    (input as {
      buffer_id: number
      layout_mode?: "list" | "grid" | null
      maximized_cell_id?: string | null
      variables?: NotebookVariable[] | null
      cells: Array<{
        id?: string | null
        name?: string | null
        value?: string | null
        preserve_value?: boolean | null
        type?: "sql" | "markdown" | null
        mode?: CellMode | null
        auto_refresh?: boolean | string | null
        is_view_maximized?: boolean | null
        chart_config?: {
          x_column?: string | null
          queries?: (ToolQueryChart | null)[] | null
          right_axis?: ToolRightAxis | null
        } | null
        grid?: { x: number; y: number; w: number; h: number } | null
      }>
    }) || {}
  setStatus(AIOperationStatus.BuildingNotebook)
  // The MCP freshness gate is checked once before dispatch, but the
  // per-variable/per-cell validation below awaits server round-trips.
  // Snapshot user edits now and re-check before the destructive commit.
  const userActionSeqAtStart = captureReadSeq(buffer_id)
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
  for (const [idx, c] of cells.entries()) {
    const hasValue = typeof c.value === "string"
    const preserves = c.preserve_value === true
    if (preserves === hasValue) {
      return {
        content: JSON.stringify({
          error_code: "validation",
          message: preserves
            ? `VALIDATION_ERROR: cells[${idx}] provides both value and preserve_value:true. Send exactly one per cell.`
            : `VALIDATION_ERROR: cells[${idx}] has no value. Send the full SQL text, or preserve_value:true to keep an existing cell's value unchanged.`,
        }),
        is_error: true,
      }
    }
    if (preserves && !(typeof c.id === "string" && c.id.length > 0)) {
      return {
        content: JSON.stringify({
          error_code: "validation",
          message: `VALIDATION_ERROR: cells[${idx}] sets preserve_value:true without an existing cell id. New cells must send value.`,
        }),
        is_error: true,
      }
    }
  }
  // One snapshot of every cell per phase: resolving N cells one-by-one would
  // read the whole view N times on a background buffer, so read it once here.
  const readBasics = (): Promise<
    Map<string, { value: string; type: CellType; mode: CellMode | undefined }>
  > =>
    withBoundNotebookReadOnly(
      buffer_id,
      (view) =>
        Promise.resolve(
          new Map(
            view.cells.map((c) => [
              c.id,
              { value: c.value, type: c.type ?? "sql", mode: c.mode },
            ]),
          ),
        ),
      signal,
    )
  // preserve_value cells defer to the committed notebook for their SQL; the
  // gate input must be that same full text, never a truncated read.
  const resolveCellSql = (
    c: (typeof cells)[number],
    basics: Map<string, { value: string }>,
  ): string | null => {
    if (typeof c.value === "string") return c.value
    if (typeof c.id !== "string") return null
    return basics.get(c.id)?.value ?? null
  }
  const variablesError = await validateApplyVariables(variables, validateSql)
  if (variablesError) return variablesError
  // Shared by the draw-invariant gate (below) and the post-apply
  // auto-run loop's mode resolution.
  const existingModes = new Map<string, CellMode | undefined>()
  if (validateSql) {
    const preApplyBasics = await readBasics()
    for (const c of cells) {
      if (typeof c.id !== "string" || c.id.length === 0) continue
      const existing = preApplyBasics.get(c.id)
      // Unknown ids fall through so applyNotebookState's all-or-nothing
      // validation surfaces the precise error.
      if (existing) existingModes.set(c.id, existing.mode)
    }
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
      drawCells.map(async (c): Promise<PermissionDecision> => {
        const sql = resolveCellSql(c, preApplyBasics)
        if (sql === null) {
          return {
            granted: false,
            reason: denyReasonUnresolvedSql("apply_notebook_state"),
          }
        }
        return requireAllDQL(sql, validateSql)
      }),
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
      variables === undefined || variables === null ? undefined : variables,
    cells: cells.map<ApplyNotebookStateCellRequest>((c) => {
      const cell: ApplyNotebookStateCellRequest =
        c.preserve_value === true ? { preserveValue: true } : { value: c.value }
      if (c.id !== undefined && c.id !== null) cell.id = c.id
      if (c.name !== undefined) cell.name = c.name
      if (c.type === "sql" || c.type === "markdown") cell.type = c.type
      if (c.mode !== undefined && c.mode !== null) cell.mode = c.mode
      if (isAutoRefresh(c.auto_refresh)) cell.autoRefresh = c.auto_refresh
      if (c.is_view_maximized !== undefined && c.is_view_maximized !== null)
        cell.isViewMaximized = c.is_view_maximized
      if (c.chart_config) {
        const cfg = c.chart_config
        const chartConfig: ChartConfig = {
          xColumn: cfg.x_column ?? null,
          queries: (cfg.queries ?? []).map((q) =>
            q ? mapQueryChart(q) : null,
          ),
        }
        if (cfg.right_axis) chartConfig.rightAxis = mapRightAxis(cfg.right_axis)
        cell.chartConfig = chartConfig
      }
      if (c.grid) cell.grid = c.grid
      return cell
    }),
  }
  if (signal?.aborted) {
    return {
      content: JSON.stringify({
        error_code: "aborted",
        message: "ABORTED: notebook state was not applied.",
      }),
      is_error: true,
    }
  }
  const staleBaseline =
    toolContext?.notebookFreshness?.getReadSeq(buffer_id) ??
    userActionSeqAtStart
  if (getBufferActionSeq(buffer_id) !== staleBaseline) {
    return applyStaleNotebookResult(toolContext)
  }
  try {
    const out = await withBoundNotebook(
      buffer_id,
      (ctrl) =>
        ctrl.mutate((parts) => applyNotebookStateTransition(parts, request)),
      signal,
    )
    // New-cell ids arrive in request order via `applied.added`.
    const resolved: ResolvedRun[] = []
    const postApplyBasics = await readBasics()
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
      // Post-apply, the committed notebook is authoritative, so preserved
      // cells resolve to their kept full value here.
      const value = resolveCellSql(c, postApplyBasics)
      // Cell kind is sticky, so a preserved markdown cell (no type in the
      // request) is still markdown post-apply — read it from the committed
      // notebook and never auto-run prose as SQL.
      const isMarkdown = postApplyBasics.get(cellId)?.type === "markdown"
      const runnable =
        !isMarkdown &&
        resolvedMode === "run" &&
        value !== null &&
        value.trim().length > 0
      resolved.push({ cellId, value: value ?? "", runnable })
    }
    const runs = await runAppliedCells(
      resolved,
      buffer_id,
      perms,
      validateSql,
      signal,
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
