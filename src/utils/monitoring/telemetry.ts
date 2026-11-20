import { bufferStore } from "../../store/buffers"
import { isMonitoringDashboard } from "./identity"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"

export type InitialChartFailure =
  | "validation_failed"
  | "write_blocked"
  | "request_not_sent"
  | "query_error"

// Charts bootstrap in the refresh engine, independently of the drawer's
// initial grid runs. The caller records at most one outcome per chart mount.
export const trackMonitoringChartFailure = async (
  notebookId: number,
  cellId: string,
  reason: InitialChartFailure,
): Promise<void> => {
  const session = authSessionState.capture()
  try {
    const buffer = await bufferStore.getById(notebookId)
    if (!session.isCurrent() || !buffer || !isMonitoringDashboard(buffer))
      return
    await trackEvent(ConsoleEvent.MONITORING_DASHBOARD_FAILED, {
      notebookId,
      cellId,
      kind: buffer.monitoring?.target.kind,
      stage: "initial_query",
      mode: "chart",
      reason,
    })
  } catch {
    // Telemetry must never affect chart execution.
  }
}
