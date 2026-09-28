import type {
  CancelledQueryResult,
  CancelReason,
} from "../../../store/notebook"

export const cancelledResult = (
  query: string,
  reason: CancelReason,
): CancelledQueryResult => ({
  type: "cancelled",
  query,
  reason,
  fetchedAt: Date.now(),
})

export const SUPERSEDED_RUN_NOTE =
  "Run completed, but a newer run of this cell started before the result " +
  "could be recorded, so it was discarded. The newer run's outcome is " +
  "authoritative; verify before re-running anything with side effects."

export const RESULT_CLEARED_MID_RUN_NOTE =
  "Run completed, but this cell's result was cleared while it was running " +
  "(the notebook state was replaced, or the result view was reset), so the " +
  "result was not recorded. Call get_notebook_state to see the current cell " +
  "state, and verify before re-running anything with side effects."

export const CELL_DELETED_MID_RUN_NOTE =
  "Run completed, but the cell was deleted while it was running, so the " +
  "result was not recorded. Call get_notebook_state to see the current " +
  "notebook state, and verify before re-running anything with side effects."

export const NOTEBOOK_DELETED_MID_RUN_NOTE =
  "Run completed, but the notebook was deleted while it was running, so the " +
  "result was not recorded. Call get_workspace_state to see the current " +
  "workspace, and verify before re-running anything with side effects."

export const NOTEBOOK_ARCHIVED_MID_RUN_NOTE =
  "Run completed, but the notebook was archived while it was running, so the " +
  "result was not recorded. Restore it and call get_notebook_state to see the " +
  "current cell state, and verify before re-running anything with side effects."

// Why an in-flight run was cancelled. Transitions name the cause; the shells
// carry it on the abort signal so both exits can report it.
export type RunCancelReason =
  | "result_cleared"
  | "mode_changed"
  | "cell_deleted"
  | "notebook_archived"
  | "notebook_deleted"
  | "superseded"

// A signal aborted without a known reason (the tool call itself was aborted).
export type RunCancellation = RunCancelReason | "cancelled"

const RUN_CANCEL_REASONS: ReadonlySet<string> = new Set<RunCancelReason>([
  "result_cleared",
  "mode_changed",
  "cell_deleted",
  "notebook_archived",
  "notebook_deleted",
  "superseded",
])

export const runCancellationOf = (signal: AbortSignal): RunCancellation =>
  typeof signal.reason === "string" && RUN_CANCEL_REASONS.has(signal.reason)
    ? (signal.reason as RunCancelReason)
    : "cancelled"

const describeRunCancellation = (reason: RunCancellation): string => {
  switch (reason) {
    case "result_cleared":
      return "the cell's result view was cleared"
    case "mode_changed":
      return "the cell was switched to chart mode"
    case "cell_deleted":
      return "the cell was deleted"
    case "notebook_archived":
      return "the notebook was archived"
    case "notebook_deleted":
      return "the notebook was deleted"
    case "superseded":
      return "a newer run of this cell started"
    case "cancelled":
      return "the request was cancelled"
  }
}

export const cancelledBeforeRunNote = (reason: RunCancellation): string =>
  `Run NOT started: ${describeRunCancellation(reason)} before validation ` +
  "finished, so nothing was executed. Call get_notebook_state to see the " +
  "current cell state; it is safe to re-run."

const MODE_CHANGED_MID_RUN_NOTE =
  "Run completed, but the cell was switched to chart mode while it was " +
  "running, so the result was not recorded; the chart now owns the cell. " +
  "Call get_notebook_state to see the current cell state, and verify before " +
  "re-running anything with side effects."

const CANCELLED_MID_RUN_NOTE =
  "Run completed, but it was cancelled while it was running, so the result " +
  "was not recorded. Call get_notebook_state to see the current cell state, " +
  "and verify before re-running anything with side effects."

export const midRunCancellationNote = (reason: RunCancellation): string => {
  switch (reason) {
    case "result_cleared":
      return RESULT_CLEARED_MID_RUN_NOTE
    case "mode_changed":
      return MODE_CHANGED_MID_RUN_NOTE
    case "cell_deleted":
      return CELL_DELETED_MID_RUN_NOTE
    case "notebook_archived":
      return NOTEBOOK_ARCHIVED_MID_RUN_NOTE
    case "notebook_deleted":
      return NOTEBOOK_DELETED_MID_RUN_NOTE
    case "superseded":
      return SUPERSEDED_RUN_NOTE
    case "cancelled":
      return CANCELLED_MID_RUN_NOTE
  }
}

export const cancelledBeforeLaunchSummary = (reason: RunCancellation) => ({
  success: false,
  queryCount: 0,
  results: [] as string[],
  cancelled: reason,
  note: cancelledBeforeRunNote(reason),
})
