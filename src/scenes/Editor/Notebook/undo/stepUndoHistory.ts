import type { NotebookCell, NotebookVariable } from "../../../../store/notebook"
import { collectReferencedVariables } from "../cellEditing/cellClipboardPayload"
import { neighbourOfRemovedCells, type CellPlacement } from "../notebookUtils"
import type { Arrangement } from "./cellArrangement"
import {
  peekRedoEntry,
  peekUndoEntry,
  settleRedo,
  settleUndo,
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
  variables: NotebookVariable[]
  detach: (
    cellIds: string[],
    variables: NotebookVariable[],
  ) => CellPlacement[] | undefined
  attach: (
    placements: CellPlacement[],
    variables: NotebookVariable[],
  ) => string[] | undefined
  arrange: (arrangement: Arrangement) => boolean
}

// Variables an insert brought in leave with its cells, unless a remaining
// cell still uses them, directly or through another variable's value.
const variablesOnlyUsedBy = (
  { cells, variables: notebookVariables }: HistoryStepDeps,
  added: NotebookVariable[],
  cellIds: string[],
): NotebookVariable[] => {
  const remainingSql = cells
    .filter((cell) => !cellIds.includes(cell.id) && cell.type !== "markdown")
    .map((cell) => cell.value)
  const stillUsed = new Set(
    collectReferencedVariables(remainingSql, notebookVariables).map(
      ({ name }) => name,
    ),
  )
  return added.filter(({ name }) => !stillUsed.has(name))
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
  const settle = from === "undo" ? settleUndo : settleRedo
  if (entry.change === "arrange") {
    const arrangement = from === "undo" ? entry.before : entry.after
    const arranged = arrange(arrangement)
    settle(bufferId, arranged ? entry : undefined)
    return arranged
      ? { kind: "arranged", cellIds: entry.cellIds, arrangement }
      : { kind: "stale" }
  }
  const cellIds = entry.placements.map(({ cell }) => cell.id)
  const removes = (entry.change === "insert") === (from === "undo")
  if (removes) {
    const neighbourId = neighbourOfRemovedCells(cells, cellIds)
    const placements = detach(
      cellIds,
      variablesOnlyUsedBy(deps, entry.variables, cellIds),
    )
    settle(bufferId, placements && { ...entry, placements })
    return placements
      ? { kind: "removed", cellIds, neighbourId }
      : { kind: "stale" }
  }
  const attached = attach(entry.placements, entry.variables)
  settle(bufferId, attached && entry)
  return attached ? { kind: "inserted", cellIds } : { kind: "stale" }
}
