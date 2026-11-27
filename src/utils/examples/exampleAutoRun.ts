import type { NotebookCell } from "../../store/notebook"

// Charts bootstrap on visibility. Grid cells need their first run.
export const exampleAutoRunCellIds = (cells: NotebookCell[]): string[] =>
  cells
    .filter((cell) => cell.type !== "markdown" && cell.mode !== "draw")
    .map((cell) => cell.id)
