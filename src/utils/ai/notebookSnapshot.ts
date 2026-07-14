import { getController } from "../notebooks/notebookController"
import { enqueueBufferTask } from "../notebooks/notebookBufferQueue"
import { readNotebookBufferMeta } from "../notebooks/notebookDexieView"
import { NotebookToolError } from "../notebooks/notebookToolError"
import { sanitizeForPromptContext } from "./sanitizeForPromptContext"
import type {
  AutoRefresh,
  CellLayoutItem,
  NotebookCell,
  NotebookSettings,
} from "../../store/notebook"
import type { UserActionDigest } from "../../providers/AIConversationProvider/types"
import type { WorkspaceInfo } from "./executeAIFlow"
import { normalizeVariables } from "../../scenes/Editor/Notebook/declareUtils"
import { computeAgentCellGridH } from "../../scenes/Editor/Notebook/notebookUtils"
import { getCellRunStatus, type RunStatus } from "./runStatus"
import type { ChartConfig } from "../../scenes/Editor/Notebook/CellChart/chartTypes"

type ChartQueryWire = {
  type: string
  y_columns: string[]
  ohlc?: { open: string; high: string; low: string; close: string }
  partition_by_column?: string
  axis?: "left" | "right"
  enabled?: boolean
  name?: string
}
export type ChartConfigWire = {
  x_column: string | null
  queries: (ChartQueryWire | null)[]
  right_axis?: { name?: string; min?: number; max?: number }
}

// Structural data only — previews ≤ 120 chars, error summaries ≤ 200 chars.
// Never includes columns/rows/count from query results.
export type NotebookContextCell = {
  id: string
  preview: string
  // Set only when the value exceeds PREVIEW_MAX. A preview is never the full
  // value to echo back — read the cell with get_cell when rewriting it.
  preview_truncated?: true
  full_length?: number
  name?: string
  // Omitted for SQL cells (the default); "markdown" for prose cells (rendered,
  // never executed).
  type?: "sql" | "markdown"
  mode?: "run" | "draw"
  auto_refresh?: AutoRefresh
  is_view_maximized?: boolean
  chart_config?: ChartConfigWire
  last_run_status?: RunStatus
  last_run_error_summary?: string
  grid?: { x: number; y: number; w: number; h: number }
}

export type NotebookContextSnapshot =
  | {
      status: "ok"
      buffer_id: number
      label: string
      layout_mode: "list" | "grid"
      maximized_cell_id: string | null
      variables?: Array<{ name: string; value: string }>
      cells: NotebookContextCell[]
    }
  | {
      status: "archived" | "deleted"
      buffer_id: number
      label?: string
    }

const PREVIEW_MAX = 120
const ERROR_MAX = 200

const truncate = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, max - 3)}...`

const escapeNewlines = (s: string): string => s.replace(/\n/g, "\\n")

const preview = (value: string): string =>
  sanitizeForPromptContext(escapeNewlines(truncate(value, PREVIEW_MAX)))

export const toChartConfigWire = (cfg: ChartConfig): ChartConfigWire => ({
  x_column: cfg.xColumn,
  queries: cfg.queries.map((q) =>
    q == null
      ? null
      : {
          type: q.type,
          y_columns: q.yColumns,
          ...(q.ohlc ? { ohlc: q.ohlc } : {}),
          ...(q.partitionByColumn
            ? { partition_by_column: q.partitionByColumn }
            : {}),
          ...(q.axis ? { axis: q.axis } : {}),
          ...(q.enabled === false ? { enabled: false } : {}),
          ...(q.name != null ? { name: q.name } : {}),
        },
  ),
  ...(cfg.rightAxis ? { right_axis: cfg.rightAxis } : {}),
})

// Forwards ONLY status + trimmed error — no columns, rows, or counts.
const lastRunSummary = (
  cell: NotebookCell,
): Pick<NotebookContextCell, "last_run_status" | "last_run_error_summary"> => {
  const { status, error } = getCellRunStatus(cell)
  if (status === "error") {
    return {
      last_run_status: "error",
      last_run_error_summary: sanitizeForPromptContext(
        truncate(error ?? "", ERROR_MAX),
      ),
    }
  }
  return { last_run_status: status }
}

const buildCell = (
  cell: NotebookCell,
  gridByCellId: Map<string, CellLayoutItem>,
  layoutMode: "list" | "grid",
): NotebookContextCell => {
  const out: NotebookContextCell = {
    id: cell.id,
    preview: preview(cell.value),
    ...lastRunSummary(cell),
  }
  if (cell.value.length > PREVIEW_MAX) {
    out.preview_truncated = true
    out.full_length = cell.value.length
  }
  if (cell.name != null) out.name = cell.name
  if (cell.type === "markdown") out.type = "markdown"
  if (cell.mode === "draw" || cell.mode === "run") out.mode = cell.mode
  if (cell.autoRefresh !== undefined) out.auto_refresh = cell.autoRefresh
  if (typeof cell.isViewMaximized === "boolean") {
    out.is_view_maximized = cell.isViewMaximized
  }
  const chartConfig = cell.chartConfig
  if (chartConfig && Array.isArray(chartConfig.queries)) {
    out.chart_config = toChartConfigWire(chartConfig)
  }
  if (layoutMode === "grid") {
    const g = gridByCellId.get(cell.id)
    if (g) {
      out.grid = {
        x: g.x,
        y: g.y,
        w: g.w,
        h: computeAgentCellGridH(cell),
      }
    }
  }
  return out
}

export const buildSnapshot = async (
  bufferId: number,
): Promise<NotebookContextSnapshot | null> => {
  const controller = getController(bufferId)
  const meta = await enqueueBufferTask(bufferId, () =>
    readNotebookBufferMeta(bufferId),
  )
  if (meta.kind === "not_a_notebook") return null
  if (meta.kind === "deleted") {
    return { status: "deleted", buffer_id: bufferId }
  }
  if (meta.kind === "archived") {
    return { status: "archived", buffer_id: bufferId, label: meta.label }
  }
  const view = controller ? await controller.readView() : meta.view
  const cells: NotebookCell[] = view.cells
  const settings: NotebookSettings = view.settings ?? {}
  const maximizedCellId = view.maximizedCellId ?? null

  const layoutMode: "list" | "grid" = settings.layoutMode ?? "list"
  const gridByCellId = new Map<string, CellLayoutItem>(
    (settings.layout ?? []).map((l) => [l.i, l]),
  )

  const out: NotebookContextSnapshot = {
    status: "ok",
    buffer_id: bufferId,
    label: meta.label,
    layout_mode: layoutMode,
    maximized_cell_id: maximizedCellId,
    cells: cells.map((c) => buildCell(c, gridByCellId, layoutMode)),
  }
  const variables = normalizeVariables(settings.variables)
  if (variables.length > 0) {
    out.variables = variables
  }
  return out
}

// YAML-ish shape — stable regardless of escape characters in cell values.
export const formatSnapshot = (snap: NotebookContextSnapshot): string => {
  if (snap.status !== "ok") {
    const lines = [
      "<notebook_context>",
      `  status: ${snap.status}`,
      `  buffer_id: ${snap.buffer_id}`,
    ]
    if (snap.label)
      lines.push(
        `  label: ${JSON.stringify(sanitizeForPromptContext(snap.label))}`,
      )
    lines.push(
      "  hint: Previously-attached notebook is unavailable. Call create_notebook if the user wants to continue.",
    )
    lines.push("</notebook_context>")
    return lines.join("\n")
  }

  const lines: string[] = ["<notebook_context>"]
  lines.push(`  buffer_id: ${snap.buffer_id}`)
  lines.push(`  label: ${JSON.stringify(sanitizeForPromptContext(snap.label))}`)
  lines.push(`  layout_mode: ${snap.layout_mode}`)
  lines.push(
    `  maximized_cell_id: ${
      snap.maximized_cell_id ? JSON.stringify(snap.maximized_cell_id) : "null"
    }`,
  )
  if (snap.variables && snap.variables.length > 0) {
    lines.push("  variables:")
    for (const { name, value } of snap.variables) {
      lines.push(
        `    ${name}: ${JSON.stringify(sanitizeForPromptContext(value))}`,
      )
    }
  }
  lines.push("  cells:")
  for (const c of snap.cells) {
    lines.push(`    - id: ${c.id}`)
    lines.push(`      preview: ${JSON.stringify(c.preview)}`)
    if (c.preview_truncated) {
      lines.push(`      preview_truncated: true`)
      lines.push(`      full_length: ${c.full_length}`)
    }
    if (c.name)
      lines.push(
        `      name: ${JSON.stringify(sanitizeForPromptContext(c.name))}`,
      )
    if (c.type) lines.push(`      type: ${c.type}`)
    if (c.mode) lines.push(`      mode: ${c.mode}`)
    if (c.auto_refresh !== undefined)
      lines.push(`      auto_refresh: ${c.auto_refresh}`)
    if (c.is_view_maximized !== undefined)
      lines.push(`      is_view_maximized: ${c.is_view_maximized}`)
    if (c.chart_config) {
      lines.push(
        `      chart_config: ${sanitizeForPromptContext(
          JSON.stringify(c.chart_config),
        )}`,
      )
    }
    if (c.last_run_status)
      lines.push(`      last_run_status: ${c.last_run_status}`)
    if (c.last_run_error_summary)
      lines.push(
        `      last_run_error_summary: ${JSON.stringify(
          c.last_run_error_summary,
        )}`,
      )
    if (c.grid) {
      lines.push(
        `      grid: { x: ${c.grid.x}, y: ${c.grid.y}, w: ${c.grid.w}, h: ${c.grid.h} }`,
      )
    }
  }
  lines.push("</notebook_context>")
  return lines.join("\n")
}

// Empty digest returns "" so the block is omitted entirely.
export const formatDigest = (digest: UserActionDigest): string => {
  const parts: string[] = []
  if (digest.added.size > 0)
    parts.push(`  added: [${Array.from(digest.added).join(", ")}]`)
  if (digest.deleted.size > 0)
    parts.push(`  deleted: [${Array.from(digest.deleted).join(", ")}]`)
  if (digest.edited.size > 0)
    parts.push(`  edited: [${Array.from(digest.edited).join(", ")}]`)
  if (digest.ran.size > 0) {
    const entries = Array.from(digest.ran.entries())
      .map(([id, status]) => `${id}: ${status}`)
      .join(", ")
    parts.push(`  ran: { ${entries} }`)
  }
  if (digest.layoutModeTo) parts.push(`  layout_mode: ${digest.layoutModeTo}`)
  if (digest.notebookStatusChange)
    parts.push(`  notebook_status: ${digest.notebookStatusChange}`)
  if (parts.length === 0) return ""
  return [
    `<user_events since_last_turn="true">`,
    ...parts,
    "</user_events>",
  ].join("\n")
}

// Emitted even for unbound chats so the AI can resolve user-said labels to buffer_ids.
export const formatWorkspace = (ws: WorkspaceInfo): string => {
  const lines: string[] = ["<workspace>"]
  if (ws.active) {
    const archived = ws.active.archived ? ", archived: true" : ""
    lines.push(
      `  active: { buffer_id: ${ws.active.buffer_id}, label: ${JSON.stringify(
        sanitizeForPromptContext(ws.active.label),
      )}, kind: ${ws.active.kind}${archived} }`,
    )
  }
  if (ws.notebooks.length > 0) {
    lines.push("  notebooks:")
    for (const nb of ws.notebooks) {
      const parts = [
        `buffer_id: ${nb.buffer_id}`,
        `label: ${JSON.stringify(sanitizeForPromptContext(nb.label))}`,
      ]
      if (nb.archived) parts.push("archived: true")
      if (nb.bound_to_this_chat) parts.push("bound_to_this_chat: true")
      lines.push(`    - { ${parts.join(", ")} }`)
    }
  } else {
    lines.push("  notebooks: []")
  }
  lines.push("</workspace>")
  return lines.join("\n")
}

// === Read serializers — model-facing payloads for get_cell / list_cells /
// get_notebook_state. Dispatch reads a bound view (withBoundNotebookReadOnly)
// and formats it here, the one read-serialization home. ===

const CELL_VALUE_MAX = 4096
const FULL_CELL_VALUE_MAX = 1_000_000
const LAST_ERROR_MAX = 200

const trimRunError = (msg: string | undefined): string | undefined => {
  if (!msg) return undefined
  const clipped =
    msg.length <= LAST_ERROR_MAX
      ? msg
      : `${msg.slice(0, LAST_ERROR_MAX - 3)}...`
  return sanitizeForPromptContext(clipped)
}

const runStatusOf = (
  cell: NotebookCell,
): { status: RunStatus; error?: string } => {
  const { status, error } = getCellRunStatus(cell)
  return status === "error"
    ? { status, error: trimRunError(error) }
    : { status }
}

export type NotebookCellSummary = {
  id: string
  name?: string
  preview: string
  position: number
  type?: "sql" | "markdown"
  mode?: "run" | "draw"
  last_run_status?: RunStatus
}

export type NotebookCellDetails = {
  id: string
  value: string
  truncated?: true
  full_length?: number
  name?: string
  position: number
  type?: "sql" | "markdown"
  mode?: "run" | "draw"
  auto_refresh?: AutoRefresh
  is_view_maximized?: boolean
  chart_config?: ChartConfigWire
  last_run_status?: RunStatus
  last_run_error?: string
}

export const summarizeCells = (cells: NotebookCell[]): NotebookCellSummary[] =>
  cells.map((cell) => {
    const summary: NotebookCellSummary = {
      id: cell.id,
      preview:
        cell.value.length <= 120
          ? cell.value
          : `${cell.value.slice(0, 117)}...`,
      position: cell.position,
      last_run_status: runStatusOf(cell).status,
    }
    if (cell.name) summary.name = cell.name
    if (cell.type === "markdown") summary.type = "markdown"
    if (cell.mode) summary.mode = cell.mode
    return summary
  })

export const serializeCell = (
  cells: NotebookCell[],
  cellId: string,
  bufferId: number,
  getFullContent: boolean,
): NotebookCellDetails => {
  const cell = cells.find((c) => c.id === cellId)
  if (!cell) {
    throw new NotebookToolError(
      "unknown_cell",
      `Cell ${cellId} not found in notebook ${bufferId}.`,
    )
  }
  if (getFullContent && cell.value.length > FULL_CELL_VALUE_MAX) {
    throw new NotebookToolError(
      "cell_too_large",
      `Cell ${cellId} is ${cell.value.length} chars — over the ${FULL_CELL_VALUE_MAX}-char get_full_content limit, so it cannot be read or edited via agent tools. In apply_notebook_state, keep it with preserve_value:true.`,
    )
  }
  const truncated = !getFullContent && cell.value.length > CELL_VALUE_MAX
  const value = truncated ? cell.value.slice(0, CELL_VALUE_MAX) : cell.value
  const run = runStatusOf(cell)
  const out: NotebookCellDetails = {
    id: cell.id,
    value,
    position: cell.position,
    last_run_status: run.status,
    last_run_error: run.error,
  }
  if (truncated) {
    out.truncated = true
    out.full_length = cell.value.length
  }
  if (cell.name != null) out.name = cell.name
  if (cell.type === "markdown") out.type = "markdown"
  if (cell.mode) out.mode = cell.mode
  if (cell.autoRefresh !== undefined) out.auto_refresh = cell.autoRefresh
  if (typeof cell.isViewMaximized === "boolean")
    out.is_view_maximized = cell.isViewMaximized
  if (cell.chartConfig && Array.isArray(cell.chartConfig.queries))
    out.chart_config = toChartConfigWire(cell.chartConfig)
  return out
}

// buildSnapshot + the not-a-notebook / deleted / archived guards get_notebook_state
// enforces. Returns the "ok" snapshot; throws typed errors otherwise.
export const readNotebookState = async (
  bufferId: number,
): Promise<NotebookContextSnapshot> => {
  const snap = await buildSnapshot(bufferId)
  if (!snap) {
    throw new NotebookToolError(
      "not_a_notebook",
      `Buffer ${bufferId} has no notebook state.`,
    )
  }
  if (snap.status === "deleted") {
    throw new NotebookToolError(
      "deleted",
      `Notebook ${bufferId} no longer exists.`,
    )
  }
  if (snap.status === "archived") {
    throw new NotebookToolError(
      "archived",
      `Notebook "${snap.label ?? bufferId}" is archived.`,
    )
  }
  return snap
}

// Order matters: workspace first (label resolution), then snapshot, then digest.
export const formatNotebookContextPrefix = (
  snap: NotebookContextSnapshot | null,
  digest: UserActionDigest | undefined,
  workspace?: WorkspaceInfo,
): string => {
  const out: string[] = []
  if (workspace) out.push(formatWorkspace(workspace))
  if (snap) out.push(formatSnapshot(snap))
  if (digest) {
    const d = formatDigest(digest)
    if (d) out.push(d)
  }
  if (out.length === 0) return ""
  return `${out.join("\n")}\n\n`
}
