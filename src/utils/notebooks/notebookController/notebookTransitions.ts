import {
  MAX_NOTEBOOK_CELLS,
  type CellMode,
  type CellType,
  type NotebookCell,
} from "../../../store/notebook"
import { NotebookToolError } from "../notebookToolError"
import type { ViewParts } from "../notebookDexieView"
import { requireCellIn, requireCellWithinLineLimit } from "../notebookDexieView"
import type { ApplyNotebookStateRequest } from "./notebookController"
import type { ChartConfig } from "../../../scenes/Editor/Notebook/CellChart/chartTypes"
import {
  buildAppliedNotebookState,
  cellHeightPatchForRows,
  cellModeChangePatch,
  duplicateCellAt,
  insertCell,
  isExpectingResult,
  mergeCellChartConfig,
  nextGridSeedPosition,
  NOTEBOOK_GRID_MARGIN_Y,
  NOTEBOOK_GRID_ROW_HEIGHT,
  removeCell,
  swapCellDown,
  swapCellUp,
  topHeightForSql,
  upsertCellLayout,
  type CellGridPosition,
} from "../../../scenes/Editor/Notebook/notebookUtils"

// The single home for every notebook mutation's behavior. Each transition is a
// pure function `(parts, ...) → { parts, result, ... }` that validates its op
// (throwing typed NotebookToolError) and returns the next document parts. Both
// the mounted (React) and unmounted (Dexie) shells run these same functions, so
// a behavior change can never land on one surface and not the other.
//
// Side effects are returned as data, never performed here:
//   - `cleanup.cellIds`    — snapshots/layouts each shell drops after its commit.
//   - `cancelRuns.cellIds` — cells whose in-flight run the mounted shell aborts
//                            (the run would keep writing cell.result after the
//                            chart engine takes ownership).
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
  cancelRuns?: { cellIds: string[] }
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
        patch = { ...updates, topHeight: estimated }
      }
    }
  }
  return {
    parts: { ...parts, cells: patchCellIn(parts.cells, cellId, patch) },
    result: undefined,
    touchedCellId: cellId,
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

export const setCellLayoutTransition = (
  parts: ViewParts,
  bufferId: number,
  cellId: string,
  pos: CellGridPosition,
): NotebookTransitionResult => {
  const cell = requireCellIn(parts.cells, cellId, bufferId)
  // Pin an intentionally-resized h into the cell (see cellHeightPatchForRows).
  const heightPatch = cellHeightPatchForRows(
    cell,
    pos.h,
    NOTEBOOK_GRID_ROW_HEIGHT,
    NOTEBOOK_GRID_MARGIN_Y,
    isExpectingResult(cell, "unrequested"),
  )
  return {
    parts: {
      ...parts,
      cells:
        Object.keys(heightPatch).length > 0
          ? patchCellIn(parts.cells, cellId, heightPatch)
          : parts.cells,
      settings: {
        ...parts.settings,
        layout: upsertCellLayout(parts.settings.layout, cellId, pos),
      },
    },
    result: undefined,
    touchedCellId: cellId,
  }
}

export const setCellModeTransition = (
  parts: ViewParts,
  bufferId: number,
  cellId: string,
  mode: CellMode,
): NotebookTransitionResult => {
  const cell = requireCellIn(parts.cells, cellId, bufferId)
  const entersDraw = mode === "draw" && cell.mode !== "draw"
  return {
    parts: {
      ...parts,
      cells: patchCellIn(parts.cells, cellId, {
        mode,
        ...cellModeChangePatch(cell, mode),
      }),
    },
    result: undefined,
    touchedCellId: cellId,
    ...(entersDraw ? { cancelRuns: { cellIds: [cellId] } } : {}),
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

export const setCellViewMaximizedTransition = (
  parts: ViewParts,
  bufferId: number,
  cellId: string,
  value: boolean,
): NotebookTransitionResult => {
  requireCellIn(parts.cells, cellId, bufferId)
  return {
    parts: {
      ...parts,
      cells: patchCellIn(parts.cells, cellId, { isViewMaximized: value }),
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
): NotebookTransitionResult<{
  applied: { added: string[]; updated: string[]; deleted: string[] }
}> => {
  const next = buildAppliedNotebookState(parts, request)
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
  }
}
