import {
  cellPlacementsOf,
  generateId,
} from "../../scenes/Editor/Notebook/notebookUtils"
import { recordUndoEntry } from "../../scenes/Editor/Notebook/undo/notebookUndoHistory"
import { addCellTransition, withBoundNotebook } from "./notebookController"

// Appends a SQL cell the way the notebook's "Add cell" button does: at the
// end, full width in grid mode. Like that button, it goes on the notebook's
// undo history, so Cmd/Ctrl+Z takes the appended cell away first. Returns the
// new cell's id; a full notebook throws the cell_limit NotebookToolError.
export const appendCellToNotebook = async (
  bufferId: number,
  value: string,
): Promise<string> => {
  const { cellId, placements } = await withBoundNotebook(
    bufferId,
    (controller) =>
      controller.mutate((parts) => {
        const added = addCellTransition(parts, bufferId, {
          id: generateId(),
          value,
        })
        return {
          parts: added.parts,
          touchedCellId: added.touchedCellId,
          result: {
            cellId: added.result,
            placements: cellPlacementsOf(
              added.parts.cells,
              added.parts.settings.layout,
              [added.result],
            ),
          },
        }
      }),
  )
  recordUndoEntry(bufferId, { change: "insert", placements })
  return cellId
}
