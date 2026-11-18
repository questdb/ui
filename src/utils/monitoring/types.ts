import type { AutoRefresh, NotebookCell } from "../../store/notebook"
import type { MaterializedView } from "../questdb/types"

export type MonitoringRefreshSchedule = Pick<
  MaterializedView,
  "refresh_type" | "timer_interval" | "timer_interval_unit"
>

export type MonitoringKind = "table" | "matview"

// The dashboard SQL addresses the table by name, so the name is its identity:
// a renamed table gets a new dashboard, a re-created one reuses its dashboard.
export type MonitoringTarget = {
  instanceKey: string
  kind: MonitoringKind
  name: string
}

// Present only while the notebook is an unedited dashboard, like an example
// dashboard's `templateId`. The first authored edit, a rename or an archive
// removes it for good: the notebook is then the user's own, and opening the
// dashboard again creates a fresh one.
export type MonitoringSource = {
  target: MonitoringTarget
  templateVersion: number
  initialFingerprint: string
}

export type MonitoringCellTemplate = {
  name: string
  value: string
  type?: "markdown"
  row: number
  x: number
  w: number
  height: number
  autoRefresh?: AutoRefresh
  // Reads `sys.telemetry_mat_view`, which the server records only while
  // telemetry is enabled. WAL telemetry is recorded regardless of the setting.
  telemetry?: boolean
  chartConfig?: NotebookCell["chartConfig"]
  highlightConfig?: NotebookCell["highlightConfig"]
}
