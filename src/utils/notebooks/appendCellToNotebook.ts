import type { NotebookCell } from "../../store/notebook"
import { generateId } from "../../scenes/Editor/Notebook/notebookUtils"
import { addCellTransition, withBoundNotebook } from "./notebookController"

type CellPresentation = Pick<
  NotebookCell,
  "name" | "autoRefresh" | "paneView" | "highlightConfig"
>

// Appends a SQL cell the way the notebook's "Add cell" button does: at the
// end, full width in grid mode. Mark the insertion so the controller can
// record it for undo after saving. A full notebook throws cell_limit.
export const appendCellToNotebook = async (
  bufferId: number,
  value: string,
  {
    id = generateId(),
    ...presentation
  }: CellPresentation & { id?: string } = {},
): Promise<string> =>
  withBoundNotebook(bufferId, (controller) =>
    controller.mutate((parts) => {
      const added = addCellTransition(parts, bufferId, { id, value })
      const cells = added.parts.cells.map((cell) =>
        cell.id === id ? { ...cell, ...presentation } : cell,
      )
      return {
        ...added,
        parts: { ...added.parts, cells },
        undoInsertCellId: id,
      }
    }),
  )
