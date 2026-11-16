import type { AutoRefresh, NotebookCell } from "../../store/notebook"
import type { MaterializedView } from "../questdb/types"

export type MonitoringRefreshSchedule = Pick<
  MaterializedView,
  "refresh_type" | "timer_interval" | "timer_interval_unit"
>

export type MonitoringKind = "table" | "matview"

export type MonitoringTarget = {
  instanceKey: string
  tableId: number
  kind: MonitoringKind
}

export type MonitoringSource = {
  target: MonitoringTarget
  templateVersion: number
  initialFingerprint: string
  /** First durable user/agent customization; retained across edits and undo. */
  customizedAt?: number
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
  history?: boolean
  chartConfig?: NotebookCell["chartConfig"]
  highlightConfig?: NotebookCell["highlightConfig"]
}
