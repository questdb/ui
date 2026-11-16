import { useEffect, useRef, useState } from "react"
import { useEditor } from "../providers/EditorProvider"
import { toast } from "../components/Toast"
import {
  openMonitoringDashboard,
  type MonitoringRequest,
} from "../utils/monitoring/openDashboard"
import { withBoundNotebook } from "../utils/notebooks/notebookController"
import { authSessionState } from "../modules/OAuth2/authSessionState"
import { trackEvent } from "../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../modules/ConsoleEventTracker/events"
import { bufferStore, type Buffer } from "../store/buffers"
import { NotebookToolError } from "../utils/notebooks/notebookToolError"
import { notebookFailureReason } from "../utils/notebooks/notebookFailureReason"

export const useMonitoringDashboard = () => {
  const { addBuffer, setActiveBuffer, tabsDisabled, updateBuffer } = useEditor()
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const open = async (
    request: MonitoringRequest,
    isCurrentTarget: () => boolean,
    onOpened: () => void,
  ) => {
    if (inFlight.current || tabsDisabled) return
    inFlight.current = true
    setBusy(true)
    const session = authSessionState.capture()
    let created: Buffer | undefined
    let notebookId: number | undefined
    let stage = "create_or_restore"
    const trackFailure = (reason: string, cellId?: string) => {
      if (!session.isCurrent()) return
      void trackEvent(ConsoleEvent.MONITORING_DASHBOARD_FAILED, {
        notebookId,
        kind: request.target.kind,
        stage,
        reason,
        ...(cellId ? { cellId, mode: "grid" } : {}),
      })
    }
    try {
      const result = await openMonitoringDashboard(request, addBuffer)
      if (!session.isCurrent()) return
      if (!result) {
        trackFailure("tab_limit")
        return
      }
      const { buffer, outcome } = result
      if (buffer.id === undefined) return
      notebookId = buffer.id
      if (outcome === "created") {
        void trackEvent(ConsoleEvent.NOTEBOOK_CREATE, {
          source: "table_monitoring",
          notebookId,
        })
        created = buffer
      }
      stage = "activate"
      if (isCurrentTarget()) {
        // Clear a closed-tab preview before activating the restored notebook.
        await updateBuffer(buffer.id, { archived: false, isTemporary: false })
        const current = await bufferStore.getById(buffer.id)
        if (!session.isCurrent()) return
        if (!current) {
          trackFailure("deleted")
          return
        }
        await setActiveBuffer(
          { ...current, isTemporary: false },
          { throwOnError: true },
        )
        if (!session.isCurrent()) return
        onOpened()
        void trackEvent(ConsoleEvent.MONITORING_DASHBOARD_OPEN, {
          notebookId,
          kind: request.target.kind,
          outcome,
          history: request.telemetryEnabled && request.walEnabled,
        })
      } else {
        // Navigation cancellation is distinguishable from a technical error.
        trackFailure("target_changed")
        return
      }
    } catch (error) {
      trackFailure(notebookFailureReason(error))
      if (session.isCurrent())
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not open the monitoring dashboard.",
        )
      return
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }

    // Opening is complete. Initial queries must not keep the action locked;
    // subsequent clicks can reuse this notebook while its cells are running.
    if (created?.id === undefined) return
    stage = "initial_query"
    // Charts bootstrap on mount. Grids run through the same read-only
    // auto-run gate as imports; never execute user-edited SQL on reopen.
    let failures = 0
    for (const cell of created.notebookViewState?.cells ?? []) {
      if (!session.isCurrent()) break
      if (cell.type === "markdown" || cell.mode === "draw") continue
      try {
        const summary = await withBoundNotebook(created.id, (controller) =>
          controller.runCell(cell.id, undefined, undefined, {
            kind: "autoRun",
          }),
        )
        if (summary.denied || summary.skipped || !summary.success) {
          failures++
          trackFailure(
            summary.denied
              ? "permission_denied"
              : summary.skipped
                ? "write_blocked"
                : summary.cancelled
                  ? "cancelled"
                  : "query_error",
            cell.id,
          )
        }
      } catch (error) {
        trackFailure(notebookFailureReason(error), cell.id)
        if (
          error instanceof NotebookToolError &&
          ["deleted", "archived", "unknown_buffer"].includes(error.code)
        )
          return
        failures++
      }
    }
    if (failures && session.isCurrent())
      toast.error(
        `${failures} monitoring cells could not run. Check their errors in the notebook.`,
      )
  }
  return { open, busy: busy || tabsDisabled }
}
