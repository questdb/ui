import type { NotebookCell } from "../../store/notebook"
import type { RunCellGate } from "../tools/permissions"
import { withBoundNotebook, type RunCellSummary } from "./notebookController"

export type CellRunOutcome = { cellId: string } & (
  | { summary: RunCellSummary }
  | { error: unknown }
)

// The cells a committed notebook state runs: SQL cells in run mode. Draw
// cells render themselves, and markdown is never SQL.
export const cellsToRunAfterApply = (cells: NotebookCell[]): NotebookCell[] =>
  cells.filter(
    (cell) =>
      cell.type !== "markdown" &&
      (cell.mode ?? "run") === "run" &&
      cell.value.trim().length > 0,
  )

// The run step after a notebook state is committed, shared by the agent's
// apply_notebook_state and the console's own generated notebooks. Cells run in
// parallel through the auto-run gate: each is classified before it launches,
// so a write is skipped, never run unattended, and one slow or failing cell
// never holds up the others. The open notebook runs them when it is mounted;
// otherwise they run in the background and their results are saved.
export const runCellsAfterApply = (
  bufferId: number,
  cells: Array<{ cellId: string; sql?: string }>,
  signal: AbortSignal | undefined,
  gate: RunCellGate = { kind: "autoRun" },
): Promise<CellRunOutcome[]> =>
  Promise.all(
    cells.map(async ({ cellId, sql }): Promise<CellRunOutcome> => {
      try {
        const summary = await withBoundNotebook(
          bufferId,
          (controller) => controller.runCell(cellId, signal, sql, gate),
          signal,
        )
        return { cellId, summary }
      } catch (error) {
        return { cellId, error }
      }
    }),
  )
