import React, { useRef } from "react"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import { useLocalStorage } from "../../../providers/LocalStorageProvider"
import { useMonitoringDashboard } from "../../../hooks/useMonitoringDashboard"
import type {
  MonitoringKind,
  MonitoringRefreshSchedule,
} from "../../../utils/monitoring/types"
import { MonitoringDashboardButton } from "./MonitoringDashboardButton"

// The drawer's dashboard action. It owns the editor-state subscriptions an
// open needs, so the drawer itself does not re-render on every buffer write.
export const MonitoringDashboardAction = ({
  kind,
  name,
  refreshSchedule,
  tablesUnavailable,
  isCurrentTarget,
}: {
  kind: MonitoringKind
  name: string
  refreshSchedule?: MonitoringRefreshSchedule
  tablesUnavailable: boolean
  isCurrentTarget: (name: string, kind: MonitoringKind) => boolean
}) => {
  const monitoringDashboard = useMonitoringDashboard()
  const telemetryConfig = useSelector(selectors.telemetry.getConfig)
  const { leftPanelState, updateLeftPanelState } = useLocalStorage()
  // Read when a dashboard finishes opening, which can be seconds after the
  // click: the user may have resized, opened or closed the panel meanwhile.
  const leftPanelStateRef = useRef(leftPanelState)
  leftPanelStateRef.current = leftPanelState

  const open = () =>
    void monitoringDashboard.open(
      {
        target: { kind, name },
        // The startup read of the telemetry config may have failed: then the
        // setting is unknown, and the dashboard says so.
        telemetryEnabled: telemetryConfig?.enabled === true,
        telemetryUnknown: telemetryConfig === undefined,
        refreshSchedule,
      },
      () => isCurrentTarget(name, kind),
      () => {
        const current = leftPanelStateRef.current
        if (current.type !== null) {
          updateLeftPanelState({ type: null, width: current.width })
        }
      },
    )

  return (
    <MonitoringDashboardButton
      busy={monitoringDashboard.busy}
      disabled={monitoringDashboard.unavailable || tablesUnavailable}
      onClick={open}
    />
  )
}
