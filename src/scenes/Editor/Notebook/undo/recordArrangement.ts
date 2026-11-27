import type { CellLayoutItem, NotebookCell } from "../../../../store/notebook"
import { arrangementChange, arrangementOf } from "./cellArrangement"
import { recordUndoEntry } from "./notebookUndoHistory"

export type ArrangeOptions = {
  // The cells as they were when the gesture started, for a gesture that
  // writes the store before it ends.
  startCells?: NotebookCell[]
  // Joins repeats of the same gesture, see MERGE_WINDOW_MS.
  mergeKey?: string
}

export type ArrangedDocument = {
  cells: NotebookCell[]
  layout: CellLayoutItem[] | undefined
}

// A move or resize goes on the history as the change it made to the cell
// order, the grid layout and the given cells' pane sizes. The document is
// read again after `apply`, so `apply` must write it synchronously.
export const recordArrangement = (
  bufferId: number,
  readDocument: () => ArrangedDocument,
  cellIds: string[],
  apply: () => void,
  { startCells, mergeKey }: ArrangeOptions = {},
): void => {
  const start = readDocument()
  const before = arrangementOf(start.cells, start.layout, cellIds, startCells)
  apply()
  const end = readDocument()
  const change = arrangementChange(
    before,
    arrangementOf(end.cells, end.layout, cellIds),
  )
  if (change) {
    recordUndoEntry(
      bufferId,
      { change: "arrange", cellIds, ...change },
      mergeKey,
    )
  }
}
