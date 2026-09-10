import {
  MAX_NOTEBOOK_CELLS,
  type AutoRefresh,
  type CellMode,
  type CellPaneView,
  type CellType,
  type NotebookCell,
} from "../../../store/notebook"
import { NotebookToolError } from "../notebookToolError"
import type { ViewParts } from "../notebookDexieView"
import { requireCellIn, requireCellWithinLineLimit } from "../notebookDexieView"
import type { ApplyNotebookStateRequest } from "./notebookController"
import type { ChartConfig } from "../../../scenes/Editor/Notebook/CellChart/chartTypes"
import {
  agentCellDimensionsPatch,
  buildAppliedNotebookState,
  carriedRunError,
  carriedRunStatus,
  cellGridBoundsError,
  cellHasRunOutcome,
  cellModeChangePatch,
  discardCellResult,
  clearCellAutoRefresh,
  computeAgentCellGridH,
  duplicateCellAt,
  insertCell,
  isExpectingResult,
  mergeCellChartConfig,
  nextGridSeedPosition,
  reconcileCellResultForValue,
  agentCellPresentation,
  type AgentCellPresentation,
  removeCell,
  swapCellDown,
  swapCellUp,
  topHeightForSql,
  upsertCellLayout,
  validateAgentCellDimensions,
  type CellGridPosition,
  type AgentCellDimensions,
  type CellResultStatus,
  type CellResultStatusReader,
  type RunCancelReason,
} from "../../../scenes/Editor/Notebook/notebookUtils"

// The single home for every notebook mutation's behavior. Each transition is a
// pure function `(parts, ...) → { parts, result, ... }` that validates its op
// (throwing typed NotebookToolError) and returns the next document parts. Both
// the mounted (React) and unmounted (Dexie) shells run these same functions, so
// a behavior change can never land on one surface and not the other.
//
// Side effects are returned as data, never performed here:
//   - `cleanup.cellIds`    — snapshots/layouts each shell drops after its commit.
//   - `cancelRuns`          — cells whose in-flight run either shell aborts
//                            because the transition invalidated its eventual
//                            result, and the reason the run reports for it.
//   - `deleteSnapshots.cellIds` — cells that survive the transition but whose
//                            persisted result no longer matches their SQL;
//                            each shell deletes the snapshot so hydration
//                            cannot resurrect the old SQL's rows.
//   - `touchedCellId`      — the cell an agent-edit notification should point at.
//
// Identity contract: untouched cells keep object identity (the composed
// notebookUtils helpers guarantee it), and `parts.settings` is returned by
// reference when unchanged, so shells can `!==` a slice to decide whether to
// write it.

export type NotebookTransitionResult<T = void> = {
  parts: ViewParts
  result: T
  touchedCellId?: string
  cleanup?: { cellIds: string[] }
  cancelRuns?: { cellIds: string[]; reason: RunCancelReason }
  deleteSnapshots?: { cellIds: string[] }
}

const requireCellCapacity = (cells: NotebookCell[], bufferId: number): void => {
  if (cells.length >= MAX_NOTEBOOK_CELLS) {
    throw new NotebookToolError(
      "cell_limit",
      `Notebook ${bufferId} already has the maximum of ${MAX_NOTEBOOK_CELLS} cells. Delete a cell first.`,
    )
  }
}

const patchCellIn = (
  cells: NotebookCell[],
  cellId: string,
  patch: Partial<NotebookCell>,
): NotebookCell[] =>
  cells.map((c) => (c.id === cellId ? { ...c, ...patch } : c))

export const addCellTransition = (
  parts: ViewParts,
  bufferId: number,
  args: { id: string; value: string; afterCellId?: string; type?: CellType },
): NotebookTransitionResult<string> => {
  requireCellCapacity(parts.cells, bufferId)
  if (args.type !== "markdown") requireCellWithinLineLimit(args.value)
  const cells = insertCell(parts.cells, args.afterCellId, undefined, {
    id: args.id,
    value: args.value,
    type: args.type,
  })
  const settings =
    parts.settings.layoutMode === "grid"
      ? {
          ...parts.settings,
          layout: upsertCellLayout(
            parts.settings.layout,
            args.id,
            nextGridSeedPosition(parts.settings.layout),
          ),
        }
      : parts.settings
  return {
    parts: { ...parts, cells, settings },
    result: args.id,
    touchedCellId: args.id,
  }
}

export const updateCellTransition = (
  parts: ViewParts,
  bufferId: number,
  cellId: string,
  updates: Partial<NotebookCell>,
): NotebookTransitionResult => {
  const cell = requireCellIn(parts.cells, cellId, bufferId)
  let patch = updates
  if (updates.value !== undefined && cell.type !== "markdown") {
    requireCellWithinLineLimit(updates.value)
    if (!cell.topResized && updates.topHeight === undefined) {
      const estimated = topHeightForSql(updates.value)
      if (cell.topHeight == null || estimated !== topHeightForSql(cell.value)) {
        patch = { ...patch, topHeight: estimated }
      }
    }
    if (updates.value !== cell.value && cell.result != null) {
      const reconciled = reconcileCellResultForValue(cell.result, updates.value)
      patch = { ...patch, result: reconciled }
      if (reconciled === null) {
        patch = {
          ...patch,
          lastRunStatus: carriedRunStatus(cell),
          lastRunError: carriedRunError(cell),
        }
      }
    }
  }
  const resultDropped = patch.result === null && cell.result != null
  return {
    parts: { ...parts, cells: patchCellIn(parts.cells, cellId, patch) },
    result: undefined,
    touchedCellId: cellId,
    ...(resultDropped ? { deleteSnapshots: { cellIds: [cellId] } } : {}),
  }
}

export const deleteCellTransition = (
  parts: ViewParts,
  bufferId: number,
  cellId: string,
): NotebookTransitionResult => {
  requireCellIn(parts.cells, cellId, bufferId)
  // removeCell silently no-ops on the last cell, so the snapshot/layout
  // cleanup below must never run for a cell that in fact stays.
  if (parts.cells.length <= 1) {
    throw new NotebookToolError(
      "last_cell",
      `Cell ${cellId} is the only cell in notebook ${bufferId}; a notebook must keep at least one cell.`,
    )
  }
  return {
    parts: {
      ...parts,
      cells: removeCell(parts.cells, cellId),
      maximizedCellId:
        parts.maximizedCellId === cellId ? null : parts.maximizedCellId,
      focusedCellId:
        parts.focusedCellId === cellId ? null : parts.focusedCellId,
    },
    // The touched cell is gone; a notification must not aim at a ghost.
    result: undefined,
    touchedCellId: undefined,
    cleanup: { cellIds: [cellId] },
  }
}

export const moveCellUpTransition = (
  parts: ViewParts,
  bufferId: number,
  cellId: string,
): NotebookTransitionResult => {
  requireCellIn(parts.cells, cellId, bufferId)
  return {
    parts: { ...parts, cells: swapCellUp(parts.cells, cellId) },
    result: undefined,
    touchedCellId: cellId,
  }
}

export const moveCellDownTransition = (
  parts: ViewParts,
  bufferId: number,
  cellId: string,
): NotebookTransitionResult => {
  requireCellIn(parts.cells, cellId, bufferId)
  return {
    parts: { ...parts, cells: swapCellDown(parts.cells, cellId) },
    result: undefined,
    touchedCellId: cellId,
  }
}

export const duplicateCellTransition = (
  parts: ViewParts,
  bufferId: number,
  cellId: string,
  newId: string,
): NotebookTransitionResult<string> => {
  requireCellIn(parts.cells, cellId, bufferId)
  requireCellCapacity(parts.cells, bufferId)
  const cells = duplicateCellAt(parts.cells, cellId, newId)
  const original =
    parts.settings.layoutMode === "grid"
      ? (parts.settings.layout ?? []).find((l) => l.i === cellId)
      : undefined
  const settings = original
    ? {
        ...parts.settings,
        layout: upsertCellLayout(parts.settings.layout, newId, {
          x: original.x,
          y: original.y,
          w: original.w,
          h: original.h,
        }),
      }
    : parts.settings
  return {
    parts: { ...parts, cells, settings },
    result: newId,
    touchedCellId: newId,
  }
}

export const setLayoutModeTransition = (
  parts: ViewParts,
  mode: "list" | "grid",
): NotebookTransitionResult => ({
  parts: { ...parts, settings: { ...parts.settings, layoutMode: mode } },
  result: undefined,
})

export const setNotebookAutoRefreshTransition = (
  parts: ViewParts,
  value: AutoRefresh,
  resetCellOverrides: boolean,
): NotebookTransitionResult => ({
  parts: {
    ...parts,
    cells: resetCellOverrides
      ? parts.cells.map(clearCellAutoRefresh)
      : parts.cells,
    settings: { ...parts.settings, autoRefreshDefault: value },
  },
  result: undefined,
})

export const clearCellAutoRefreshTransition = (
  parts: ViewParts,
  bufferId: number,
  cellId: string,
): NotebookTransitionResult => {
  requireCellIn(parts.cells, cellId, bufferId)
  return {
    parts: {
      ...parts,
      cells: parts.cells.map((c) =>
        c.id === cellId ? clearCellAutoRefresh(c) : c,
      ),
    },
    result: undefined,
    touchedCellId: cellId,
  }
}

export const setCellLayoutTransition = (
  parts: ViewParts,
  bufferId: number,
  cellId: string,
  pos: Omit<CellGridPosition, "h"> & { resultStatus?: CellResultStatus },
): NotebookTransitionResult<
  AgentCellPresentation & { grid: { x: number; y: number; w: number } }
> => {
  const cell = requireCellIn(parts.cells, cellId, bufferId)
  const gridError = cellGridBoundsError(pos)
  if (gridError) throw new NotebookToolError("validation", gridError)
  const layoutPos: CellGridPosition = {
    x: pos.x,
    y: pos.y,
    w: pos.w,
    h: computeAgentCellGridH(
      cell,
      isExpectingResult(cell, pos.resultStatus ?? "unrequested"),
    ),
  }
  return {
    parts: {
      ...parts,
      settings: {
        ...parts.settings,
        layout: upsertCellLayout(parts.settings.layout, cellId, layoutPos),
      },
    },
    result: {
      grid: { x: pos.x, y: pos.y, w: pos.w },
      ...agentCellPresentation(cell, pos.resultStatus),
    },
    touchedCellId: cellId,
  }
}

export const setCellDimensionsTransition = (
  parts: ViewParts,
  bufferId: number,
  cellId: string,
  requested: AgentCellDimensions,
): NotebookTransitionResult<
  AgentCellPresentation & { result_discarded?: true }
> => {
  const cell = requireCellIn(parts.cells, cellId, bufferId)
  const validation = validateAgentCellDimensions(cell, requested)
  if (!validation.ok) {
    const { issue } = validation
    if (issue.reason === "invalid_view") {
      throw new NotebookToolError(
        "validation",
        "view must be editor, result, or editor_result.",
      )
    }
    if (issue.reason === "invalid_type") {
      throw new NotebookToolError(
        "validation",
        `${issue.field} must be a number, auto, or null.`,
      )
    }
    if (issue.reason === "below_minimum") {
      throw new NotebookToolError(
        "validation",
        issue.field === "editor_height"
          ? `editor_height must be at least ${issue.limit}px.`
          : `result_height must be at least ${issue.limit}px for this cell.`,
      )
    }
    throw new NotebookToolError(
      "validation",
      `Pane heights must be at most ${issue.limit}px.`,
    )
  }
  const { dimensions } = validation

  const wantsEditorOnly = dimensions.view === "editor"
  const discarding = wantsEditorOnly && cellHasRunOutcome(cell)
  const patch = agentCellDimensionsPatch(cell, dimensions)
  const nextCell = {
    ...(wantsEditorOnly ? discardCellResult(cell) : cell),
    ...patch,
  }
  const replacesCell =
    discarding ||
    Object.keys(patch).length > 0 ||
    (wantsEditorOnly && (cell as { mode?: unknown }).mode !== undefined)
  const layout = parts.settings.layout?.map((item) =>
    item.i === cellId
      ? {
          ...item,
          h: computeAgentCellGridH(
            nextCell,
            discarding
              ? false
              : isExpectingResult(
                  cell,
                  dimensions.resultStatus ?? "unrequested",
                ),
          ),
        }
      : item,
  )
  return {
    parts: {
      ...parts,
      cells: replacesCell
        ? parts.cells.map((c) => (c.id === cellId ? nextCell : c))
        : parts.cells,
      settings:
        layout === parts.settings.layout
          ? parts.settings
          : { ...parts.settings, layout },
    },
    result: {
      ...agentCellPresentation(nextCell, dimensions.resultStatus),
      ...(discarding ? { result_discarded: true as const } : {}),
    },
    touchedCellId: cellId,
    // A headless run has no persisted `running` placeholder, and a live run
    // may still be behind its validation barrier. Emit the cancellation intent
    // for every SQL-cell editor-only request; shells treat it idempotently when
    // no run exists.
    ...(wantsEditorOnly
      ? { cancelRuns: { cellIds: [cellId], reason: "result_cleared" as const } }
      : {}),
    // Snapshot rows live outside the buffer document, so a marker-less cell
    // cannot prove that none exist. Deletion is idempotent and view:"editor"
    // is the explicit discard gesture.
    ...(wantsEditorOnly ? { deleteSnapshots: { cellIds: [cellId] } } : {}),
  }
}

export const setCellModeTransition = (
  parts: ViewParts,
  bufferId: number,
  cellId: string,
  mode: CellMode,
): NotebookTransitionResult => {
  const cell = requireCellIn(parts.cells, cellId, bufferId)
  if (cell.type === "markdown") {
    throw new NotebookToolError(
      "validation",
      "Markdown cells have no run or draw mode.",
    )
  }
  const entersDraw = mode === "draw" && cell.mode !== "draw"
  const nextCell: NotebookCell = {
    ...cell,
    ...cellModeChangePatch(cell, mode),
  }
  if (mode === "draw") nextCell.mode = "draw"
  else delete nextCell.mode
  return {
    parts: {
      ...parts,
      cells: parts.cells.map((c) => (c.id === cellId ? nextCell : c)),
    },
    result: undefined,
    touchedCellId: cellId,
    ...(entersDraw
      ? { cancelRuns: { cellIds: [cellId], reason: "mode_changed" as const } }
      : {}),
  }
}

export const setCellChartConfigTransition = (
  parts: ViewParts,
  bufferId: number,
  cellId: string,
  patch: Partial<ChartConfig>,
): NotebookTransitionResult => {
  const cell = requireCellIn(parts.cells, cellId, bufferId)
  return {
    parts: {
      ...parts,
      cells: patchCellIn(parts.cells, cellId, {
        chartConfig: mergeCellChartConfig(cell, patch),
      }),
    },
    result: undefined,
    touchedCellId: cellId,
  }
}

export const setCellPaneViewTransition = (
  parts: ViewParts,
  bufferId: number,
  cellId: string,
  paneView: CellPaneView,
): NotebookTransitionResult => {
  const cell = requireCellIn(parts.cells, cellId, bufferId)
  if (cell.type === "markdown") {
    throw new NotebookToolError(
      "validation",
      "Markdown cells have no pane view.",
    )
  }
  return {
    parts: {
      ...parts,
      cells: patchCellIn(parts.cells, cellId, {
        paneView,
      }),
    },
    result: undefined,
    touchedCellId: cellId,
  }
}

export const setCellMaximizedTransition = (
  parts: ViewParts,
  bufferId: number,
  cellId: string | null,
): NotebookTransitionResult => {
  if (cellId !== null) requireCellIn(parts.cells, cellId, bufferId)
  return {
    parts: { ...parts, maximizedCellId: cellId },
    result: undefined,
    touchedCellId: cellId ?? undefined,
  }
}

export const applyNotebookStateTransition = (
  parts: ViewParts,
  request: ApplyNotebookStateRequest,
  resultStatusOf?: CellResultStatusReader,
): NotebookTransitionResult<{
  applied: { added: string[]; updated: string[]; deleted: string[] }
}> => {
  const next = buildAppliedNotebookState(parts, request, resultStatusOf)
  const existingSqlCellIds = new Set(
    parts.cells
      .filter((cell) => cell.type !== "markdown")
      .map((cell) => cell.id),
  )
  const invalidatedResultIds = new Set(next.resultsCleared)
  for (const cell of request.cells) {
    if (
      cell.view === "editor" &&
      typeof cell.id === "string" &&
      existingSqlCellIds.has(cell.id)
    ) {
      // Passive runs do not install a persisted `running` result, and snapshot
      // rows live outside this document. An editor-only request must therefore
      // invalidate both even when there is no visible outcome to clear.
      invalidatedResultIds.add(cell.id)
    }
  }
  return {
    parts: {
      ...parts,
      cells: next.cells,
      settings: next.settings,
      maximizedCellId: next.maximizedCellId,
      // A full-state apply can drop the focused cell; a dangling id would aim
      // the next mount's scroll at a ghost.
      focusedCellId:
        parts.focusedCellId &&
        next.cells.some((c) => c.id === parts.focusedCellId)
          ? parts.focusedCellId
          : null,
    },
    result: { applied: next.diff },
    cleanup: { cellIds: next.diff.deleted },
    ...(invalidatedResultIds.size > 0
      ? {
          cancelRuns: {
            cellIds: [...invalidatedResultIds],
            reason: "result_cleared" as const,
          },
        }
      : {}),
    ...(invalidatedResultIds.size > 0
      ? { deleteSnapshots: { cellIds: [...invalidatedResultIds] } }
      : {}),
  }
}
