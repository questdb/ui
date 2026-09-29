import type { CellResult, NotebookCell } from "../../../store/notebook"
import { deriveRunStatusFromResults } from "../../../utils/ai/runStatus"
import type { RunStatus } from "../../../utils/ai/runStatus"

const collapseResultToRunStatus = (result: CellResult): RunStatus => {
  const status = deriveRunStatusFromResults(result.results).status
  return status === "running" ? "cancelled" : status
}

// Run history must survive every path that drops the result blob (persist,
// duplicate, clone) — agents read last_run_status to decide whether a cell
// still needs an explicit run_cell. Recorded history wins: every run commit
// stamps it, so it is at least as fresh as any run-produced result; only
// refresh results are newer, and excluding those is the point. A draw frame
// is always refresh-produced, so it never seeds history — deriving from it
// would freeze a transient poll error into a permanent fabricated failure.
export const carriedRunStatus = (cell: NotebookCell): RunStatus | undefined =>
  cell.lastRunStatus ??
  (cell.mode !== "draw" && cell.result
    ? collapseResultToRunStatus(cell.result)
    : undefined)

// The error travels with its recorded status as one pair; derivation from the
// result happens only for records that predate stamping.
export const carriedRunError = (cell: NotebookCell): string | undefined => {
  if (cell.lastRunStatus !== undefined) return cell.lastRunError
  if (cell.mode === "draw") return undefined
  const errored = cell.result?.results.find((r) => r.type === "error")
  return errored?.type === "error" ? errored.error : undefined
}

// The stamp a run commit writes next to its result. A run without an error
// clears any previous one — history describes the last run wholesale.
export const runHistoryPatch = (
  result: CellResult,
): Pick<NotebookCell, "lastRunStatus" | "lastRunError"> => {
  const errored = result.results.find((r) => r.type === "error")
  return {
    lastRunStatus: collapseResultToRunStatus(result),
    lastRunError: errored?.type === "error" ? errored.error : undefined,
  }
}
