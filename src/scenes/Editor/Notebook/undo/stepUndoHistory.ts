import type { NotebookCell } from "../../../../store/notebook"
import { neighbourOfRemovedCells, type CellPlacement } from "../notebookUtils"
import type { Arrangement } from "./cellArrangement"
import {
  peekRedoEntry,
  peekUndoEntry,
  settleRedo,
  settleUndo,
  type UndoEntry,
} from "./notebookUndoHistory"

// What an undo or redo did, so the UI can select and announce it.
export type HistoryStep =
  | { kind: "empty" }
  | { kind: "stale" }
  | { kind: "inserted"; cellIds: string[] }
  | { kind: "removed"; cellIds: string[]; neighbourId: string | undefined }
  | { kind: "arranged"; cellIds: string[]; arrangement: Arrangement }

export type HistoryStepDeps = {
  cells: NotebookCell[]
  detach: (cellIds: string[]) => CellPlacement[] | undefined
  attach: (placements: CellPlacement[]) => string[] | undefined
  arrange: (arrangement: Arrangement) => boolean
}

// Undo does the opposite of the entry's change and redo does it again. A
// removal reads the cells as they are now, so a redo brings back the latest
// content. An entry that no longer fits the document is dropped.
export const stepUndoHistory = (
  bufferId: number,
  from: "undo" | "redo",
  deps: HistoryStepDeps,
): HistoryStep => {
  const { cells, detach, attach, arrange } = deps
  const entry =
    from === "undo" ? peekUndoEntry(bufferId) : peekRedoEntry(bufferId)
  if (!entry) return { kind: "empty" }
  const settleStack = from === "undo" ? settleUndo : settleRedo
  // An entry that does not apply leaves the document as it is now.
  const presentCellIds = new Set(cells.map((cell) => cell.id))
  const settle = (applied: UndoEntry | undefined) =>
    settleStack(bufferId, applied, presentCellIds)
  if (entry.change === "arrange") {
    const arrangement = from === "undo" ? entry.before : entry.after
    const arranged = arrange(arrangement)
    settle(arranged ? entry : undefined)
    return arranged
      ? { kind: "arranged", cellIds: entry.cellIds, arrangement }
      : { kind: "stale" }
  }
  const cellIds = entry.placements.map(({ cell }) => cell.id)
  const removes = (entry.change === "insert") === (from === "undo")
  if (removes) {
    const neighbourId = neighbourOfRemovedCells(cells, cellIds)
    const placements = detach(cellIds)
    // Keep the entry identity used by the Undo toast through a round trip.
    if (placements) entry.placements = placements
    settle(placements ? entry : undefined)
    return placements
      ? { kind: "removed", cellIds, neighbourId }
      : { kind: "stale" }
  }
  const attached = attach(entry.placements)
  settle(attached && entry)
  return attached ? { kind: "inserted", cellIds } : { kind: "stale" }
}
