import {
  getController,
  type NotebookWorkspaceController,
} from "../notebookAIBridge"
import type {
  CellLayoutItem,
  NotebookCell,
  NotebookSettings,
} from "../../store/notebook"
import type { UserActionDigest } from "../../providers/AIConversationProvider/types"
import type { WorkspaceInfo } from "../executeAIFlow"
import { normalizeVariables } from "../../scenes/Editor/Notebook/declareUtils"

// Structural data only — previews ≤ 120 chars, error summaries ≤ 200 chars.
// Never includes columns/rows/count from query results.
export type NotebookContextCell = {
  id: string
  preview: string
  mode?: "run" | "draw"
  auto_refresh?: boolean
  is_chart_maximized?: boolean
  chart?: { name?: string; type?: string }
  last_run_status?: "success" | "error" | "none" | "running"
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

// Prompt-injection guard: `<`→`‹` (U+2039), `>`→`›` (U+203A) so user-controlled
// strings can't forge closing tags. Applied AFTER truncation to keep length bounds.
export const sanitizeForPromptContext = (s: string): string =>
  s.replace(/</g, "\u2039").replace(/>/g, "\u203A")

const preview = (value: string): string =>
  sanitizeForPromptContext(escapeNewlines(truncate(value, PREVIEW_MAX)))

// Forwards ONLY status + trimmed error — no columns, rows, or counts.
const lastRunSummary = (
  cell: NotebookCell,
): Pick<NotebookContextCell, "last_run_status" | "last_run_error_summary"> => {
  if (!cell.result || cell.result.results.length === 0) {
    return { last_run_status: "none" }
  }
  const latest = cell.result.results[cell.result.results.length - 1]
  switch (latest.type) {
    case "dql":
    case "ddl":
    case "dml":
      return { last_run_status: "success" }
    case "error":
      return {
        last_run_status: "error",
        last_run_error_summary: sanitizeForPromptContext(
          truncate(latest.error, ERROR_MAX),
        ),
      }
    case "running":
    case "queued":
      return { last_run_status: "running" }
    case "cancelled":
      return { last_run_status: "none" }
    default:
      return { last_run_status: "none" }
  }
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
  if (cell.mode === "draw" || cell.mode === "run") out.mode = cell.mode
  if (typeof cell.autoRefresh === "boolean") out.auto_refresh = cell.autoRefresh
  if (typeof cell.isChartMaximized === "boolean") {
    out.is_chart_maximized = cell.isChartMaximized
  }
  if (cell.chartConfig) {
    out.chart = {
      name: cell.chartConfig.name,
      type: cell.chartConfig.type,
    }
  }
  if (layoutMode === "grid") {
    const g = gridByCellId.get(cell.id)
    if (g) out.grid = { x: g.x, y: g.y, w: g.w, h: g.h }
  }
  return out
}

// Prefers live controller (freshest); falls back to persisted view state so unmounted notebooks work without a tab switch.
export const buildSnapshot = (
  workspace: NotebookWorkspaceController | undefined,
  bufferId: number,
): NotebookContextSnapshot | null => {
  if (!workspace) return null
  const meta = workspace.getBufferMeta(bufferId)
  if (meta === null) return null
  if (meta.kind === "deleted") {
    return { status: "deleted", buffer_id: bufferId }
  }
  if (meta.kind === "archived") {
    return { status: "archived", buffer_id: bufferId, label: meta.label }
  }

  const controller = getController(bufferId)
  const cells: NotebookCell[] = controller
    ? controller.getCellsSnapshot()
    : meta.notebookViewState.cells
  const settings: NotebookSettings = controller
    ? controller.getSettings()
    : (meta.notebookViewState.settings ?? {})
  const maximizedCellId = controller
    ? controller.getMaximizedCellId()
    : (meta.notebookViewState.maximizedCellId ?? null)

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
    if (c.mode) lines.push(`      mode: ${c.mode}`)
    if (c.auto_refresh !== undefined)
      lines.push(`      auto_refresh: ${c.auto_refresh}`)
    if (c.is_chart_maximized !== undefined)
      lines.push(`      is_chart_maximized: ${c.is_chart_maximized}`)
    if (c.chart) {
      const parts: string[] = []
      if (c.chart.name !== undefined)
        parts.push(
          `name: ${JSON.stringify(sanitizeForPromptContext(c.chart.name))}`,
        )
      if (c.chart.type !== undefined) parts.push(`type: ${c.chart.type}`)
      lines.push(`      chart: { ${parts.join(", ")} }`)
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
    lines.push(
      `  active: { buffer_id: ${ws.active.buffer_id}, label: ${JSON.stringify(
        sanitizeForPromptContext(ws.active.label),
      )}, kind: ${ws.active.kind} }`,
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
