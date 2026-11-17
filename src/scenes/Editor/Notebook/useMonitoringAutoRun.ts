import { useEffect, useRef } from "react"
import { toast } from "../../../components/Toast"
import type { NotebookCell } from "../../../store/notebook"
import type { MonitoringSource } from "../../../utils/monitoring/types"
import { loadSnapshotCellIds } from "../../../store/notebookResults"
import { waitForController } from "../../../utils/notebooks/notebookController"
import { hasTransferSnapshot } from "../../../utils/notebooks/notebookTransferState"
import { notebookFailureReason } from "../../../utils/notebooks/notebookFailureReason"
import { authSessionState } from "../../../modules/OAuth2/authSessionState"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"

// A grid frame only ever comes from a run (the refresh engine never bootstraps
// one). A cell that never ran, or whose run was interrupted before it left a
// result, would stay empty despite its auto-refresh.
const neverRan = (
  bufferId: number,
  cell: NotebookCell,
  snapshotIds: Set<string>,
): boolean =>
  cell.type !== "markdown" &&
  cell.mode !== "draw" &&
  cell.value.trim().length > 0 &&
  cell.result == null &&
  (cell.lastRunStatus === undefined ||
    (cell.lastRunStatus === "cancelled" &&
      !snapshotIds.has(cell.id) &&
      !hasTransferSnapshot(bufferId, cell.id)))

const runNeverRunCells = async (
  bufferId: number,
  kind: MonitoringSource["target"]["kind"],
  signal: AbortSignal,
): Promise<void> => {
  const session = authSessionState.capture()
  // Live controller only: a background (Dexie) run would be reported as an
  // agent edit. If the tab is left, the abort ends the runs and the next
  // mount picks the cells up again.
  const controller = await waitForController(bufferId, 3000, signal)
  const snapshotIds = new Set(await loadSnapshotCellIds(bufferId))
  if (signal.aborted) return
  const { cells } = await controller.readView()
  const pending = cells.filter((cell) => neverRan(bufferId, cell, snapshotIds))
  // Same path as an agent's post-apply runs: in parallel, read-only gate, and
  // a signal, so a run never queues behind a confirmation dialog.
  const outcomes = await Promise.all(
    pending.map((cell) =>
      controller
        .runCell(cell.id, signal, undefined, {
          kind: "autoRun",
          source: "monitoring",
        })
        .then(
          (summary) => {
            if (summary.success) return null
            // Leaving the tab aborts the run: not a failure.
            const interrupted =
              summary.denied === undefined &&
              summary.skipped === undefined &&
              (summary.cancelled !== undefined || summary.unverified === true)
            if (interrupted) return null
            return {
              cellId: cell.id,
              reason:
                summary.denied !== undefined
                  ? "permission_denied"
                  : summary.skipped !== undefined
                    ? "write_blocked"
                    : "query_error",
            }
          },
          (error: unknown) =>
            signal.aborted
              ? null
              : { cellId: cell.id, reason: notebookFailureReason(error) },
        ),
    ),
  )
  const failures = outcomes.filter(
    (outcome): outcome is { cellId: string; reason: string } =>
      outcome !== null,
  )
  if (failures.length === 0 || signal.aborted || !session.isCurrent()) return
  failures.forEach(({ cellId, reason }) =>
    trackEvent(ConsoleEvent.MONITORING_DASHBOARD_FAILED, {
      notebookId: bufferId,
      kind,
      stage: "initial_query",
      reason,
      cellId,
      mode: "grid",
    }),
  )
  toast.error(
    `${failures.length} monitoring cells could not run. Check their errors in the notebook.`,
  )
}

// Fills an unedited monitoring dashboard's never-run grid cells when it is
// mounted: on creation, reuse, restore and after an interrupted first load.
// A user-edited dashboard never runs SQL on its own.
export const useMonitoringAutoRun = (
  bufferId: number | null,
  monitoring: MonitoringSource | undefined,
  mounted: boolean,
): void => {
  // Decided once per mount: editing the dashboard while its cells load must
  // not abort them.
  const monitoringRef = useRef(monitoring)
  monitoringRef.current = monitoring
  useEffect(() => {
    const source = monitoringRef.current
    if (!mounted || bufferId === null || !source) return
    if (source.customizedAt !== undefined) return
    const abort = new AbortController()
    const unsubscribe = authSessionState.onEnd(() => abort.abort())
    runNeverRunCells(bufferId, source.target.kind, abort.signal).catch(
      () => undefined,
    )
    return () => {
      unsubscribe()
      abort.abort()
    }
  }, [bufferId, mounted])
}
