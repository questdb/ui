import { useEffect, useRef, useState } from "react"
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
    let notebookId: number | undefined
    let stage = "create_or_restore"
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
    // The mounted dashboard runs its never-run grid cells itself
    // (useMonitoringAutoRun), however it was opened.
  }

  // `busy` means a dashboard is opening. `unavailable` means it can't be
  // opened right now (a script owns the tabs), which is not progress.
  return { open, busy, unavailable: tabsDisabled }
}
