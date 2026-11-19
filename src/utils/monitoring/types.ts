import type { AutoRefresh, NotebookCell } from "../../store/notebook"
import type { MaterializedView } from "../questdb/types"

export type MonitoringRefreshSchedule = Pick<
  MaterializedView,
  "refresh_type" | "timer_interval" | "timer_interval_unit"
>

export type MonitoringKind = "table" | "matview"

// The dashboard SQL addresses the table by name, so the name is its identity:
// a renamed table gets a new dashboard, one re-created under the same name
// reuses its dashboard.
export type MonitoringTarget = {
  kind: MonitoringKind
  name: string
}

// The table a dashboard monitors. The notebook is an unedited dashboard only
// while it also has the dashboard's `templateId` (identity.ts), as an example
// dashboard is: the first authored edit, a rename or an archive removes that
// for good, and opening the dashboard again creates a fresh one.
export type MonitoringSource = {
  target: MonitoringTarget
  templateVersion: number
}

// Values a template inserts once, as plain interpolation: nothing rescans the
// result, so a name containing template-like text is kept verbatim.
export type MonitoringTemplateValues = {
  // The target name as a quoted SQL string literal.
  targetSql: string
  // The target name as a markdown code span.
  targetName: string
  // Clamped chart windows for 1-minute and 5-second buckets.
  window1m: string
  window5s: string
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
