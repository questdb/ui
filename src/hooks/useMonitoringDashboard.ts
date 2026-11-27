import { useEffect, useReducer } from "react"
import { useEditor } from "../providers/EditorProvider"
import { toast } from "../components/Toast"
import {
  openMonitoringDashboard,
  type MonitoringRequest,
} from "../utils/monitoring/openDashboard"
import { authSessionState } from "../modules/OAuth2/authSessionState"
import { trackEvent } from "../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../modules/ConsoleEventTracker/events"
import { bufferStore } from "../store/buffers"
import { notebookFailureReason } from "../utils/notebooks/notebookFailureReason"
import { NotebookToolError } from "../utils/notebooks/notebookToolError"
import type { CellRunOutcome } from "../utils/notebooks/runCellsAfterApply"
import { useEditorBusy } from "./useEditorBusy"

// Why a first run did not fill its cell, or null when it ran or was only
// interrupted (the dashboard was opened or closed, or the session ended
// mid-run).
const firstRunFailure = (outcome: CellRunOutcome): string | null => {
  if ("error" in outcome) {
    const { error } = outcome
    // The user closed the dashboard (deleted or archived it) before or during
    // a run; the activate stage records that once (unless the user already
    // navigated away).
    if (
      error instanceof NotebookToolError &&
      (error.code === "deleted" || error.code === "archived")
    )
      return null
    return notebookFailureReason(error)
  }
  const { summary } = outcome
  if (summary.success) return null
  if (summary.denied !== undefined)
    return summary.deniedCode === "classify_failed"
      ? "validation_failed"
      : "permission_denied"
  if (summary.skipped !== undefined) return "write_blocked"
  if (summary.cancelled !== undefined || summary.unverified) return null
  return "query_error"
}

// One open at a time, shared by every instance: the drawer's action unmounts
// when the drawer switches to its Details tab, and the action shown again
// must still see the open in progress (and ignore clicks during it).
const openState = { inFlight: false, busy: false }
const openListeners = new Set<() => void>()
const setOpenState = (next: Partial<typeof openState>) => {
  Object.assign(openState, next)
  openListeners.forEach((listener) => listener())
}

export const useMonitoringDashboard = () => {
  const { addBuffer, setActiveBuffer, tabsDisabled } = useEditor()
  const [, rerender] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    openListeners.add(rerender)
    return () => {
      openListeners.delete(rerender)
    }
  }, [])
  // Read after the first runs, seconds after the click: a script or query
  // started meanwhile would be aborted by activating the dashboard.
  const isEditorBusy = useEditorBusy()

  const open = async (
    request: MonitoringRequest,
    isCurrentTarget: () => boolean,
    onOpened: () => void,
  ) => {
    // A script owns the tabs: no dashboard can be opened during it.
    if (openState.inFlight || tabsDisabled) return
    // Repeated clicks are ignored for the whole open, but the button shows
    // progress only while a new dashboard is created: activating an open one
    // is immediate and must not flash a disabled spinner.
    setOpenState({ inFlight: true })
    const session = authSessionState.capture()
    let notebookId: number | undefined
    let stage = "create_or_reuse"
    const trackFailure = (reason: string) => {
      if (!session.isCurrent()) return
      void trackEvent(ConsoleEvent.MONITORING_DASHBOARD_FAILED, {
        notebookId,
        kind: request.target.kind,
        stage,
        reason,
      })
    }
    try {
      const result = await openMonitoringDashboard(request, addBuffer, () => {
        setOpenState({ busy: true })
      })
      if (!session.isCurrent()) return
      if (!result) {
        trackFailure("tab_limit")
        return
      }
      const { buffer, outcome, runs = [] } = result
      if (buffer.id === undefined) return
      notebookId = buffer.id
      if (outcome === "created") {
        void trackEvent(ConsoleEvent.NOTEBOOK_CREATE, {
          source: "table_monitoring",
          notebookId,
        })
      }
      const failures = runs.flatMap((run) => {
        const reason = firstRunFailure(run)
        return reason === null ? [] : [{ cellId: run.cellId, reason }]
      })
      failures.forEach(({ cellId, reason }) =>
        trackEvent(ConsoleEvent.MONITORING_DASHBOARD_FAILED, {
          notebookId,
          kind: request.target.kind,
          stage: "initial_query",
          reason,
          cellId,
          mode: "grid",
        }),
      )
      if (failures.length > 0)
        toast.error(
          failures.length === 1
            ? "1 monitoring cell could not run. Check its error in the notebook."
            : `${failures.length} monitoring cells could not run. Check their errors in the notebook.`,
        )
      stage = "activate"
      if (!isCurrentTarget()) {
        trackFailure("target_changed")
        return
      }
      const current = await bufferStore.getById(buffer.id)
      if (!session.isCurrent()) return
      if (!current || current.archived) {
        trackFailure(current ? "archived" : "deleted")
        return
      }
      let targetChanged = false
      const canActivate = () => {
        targetChanged = !isCurrentTarget()
        return session.isCurrent() && !targetChanged && !isEditorBusy()
      }
      if (
        !canActivate() ||
        !(await setActiveBuffer(current, { canActivate }))
      ) {
        if (!session.isCurrent()) return
        if (targetChanged) {
          trackFailure("target_changed")
          return
        }
        trackFailure("editor_running")
        toast.info(
          `${current.label} is ready. Open its tab once the editor finishes running.`,
        )
        return
      }
      if (!session.isCurrent()) return
      onOpened()
      void trackEvent(ConsoleEvent.MONITORING_DASHBOARD_OPEN, {
        notebookId,
        kind: request.target.kind,
        outcome,
        // Table history is WAL telemetry, recorded whatever the setting.
        history: request.target.kind === "table" || request.telemetryEnabled,
      })
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
      setOpenState({ inFlight: false, busy: false })
    }
  }

  // `busy` means a dashboard is opening. `unavailable` means it can't be
  // opened right now (a script owns the tabs), which is not progress.
  return { open, busy: openState.busy, unavailable: tabsDisabled }
}
