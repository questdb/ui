import type { CellRunOutcome } from "../../scenes/Editor/Notebook/notebookUtils"
import { isFailClosedClassifyDenial } from "../../utils/tools/permissions"
import { trackEvent } from "."
import { ConsoleEvent } from "./events"

export type NotebookExecutionOutcome =
  | "success"
  | "error"
  | "cancelled"
  | "superseded"
  | "unverified"
  // Refused by a permission.
  | "denied"
  // A write that an auto-run or a draw cell does not execute.
  | "skipped"
  // The SQL could not be classified (validate failed), so it did not run.
  | "validation_failed"
  | "not_started"

// Use this run's result, never a cell's previous/polled frame. A successful
// tool call or an accepted click alone does not establish query success.
export const notebookRunOutcome = (
  run: CellRunOutcome,
): NotebookExecutionOutcome => {
  if (run.denied !== undefined) {
    return isFailClosedClassifyDenial(run.denied)
      ? "validation_failed"
      : "denied"
  }

  if (run.skipped !== undefined) {
    return "skipped"
  }

  if (run.superseded) {
    return "superseded"
  }

  if (run.cancelled !== undefined) {
    return "cancelled"
  }

  if (run.cellChanged || run.resultCleared) {
    return "unverified"
  }

  if (run.notStarted || !run.result) {
    return "not_started"
  }

  const hasUnsentRequest = run.result.results.some(
    (result) => result.type === "error" && result.requestNotSent,
  )
  if (hasUnsentRequest) {
    return "unverified"
  }

  const hasCancelledQuery = run.result.results.some(
    (result) => result.type === "cancelled",
  )
  if (hasCancelledQuery) {
    return "cancelled"
  }

  return run.ok ? "success" : "error"
}

export const trackNotebookExecution = (payload: {
  notebookId: number
  cellId: string
  // Chart outcomes describe the data fetch, not ECharts rendering. An empty
  // successful query is still success. No query text or result rows are sent.
  mode: "grid" | "chart"
  trigger: "run" | "manual_refresh" | "initial_load" | "auto_run"
  // "user" for an auto-run the console starts for the user (a dashboard or an
  // import); unset for an agent's.
  initiator?: "user"
  outcome: NotebookExecutionOutcome
  durationMs: number
}): void => {
  void trackEvent(ConsoleEvent.NOTEBOOK_CELL_EXECUTION, payload)
}
