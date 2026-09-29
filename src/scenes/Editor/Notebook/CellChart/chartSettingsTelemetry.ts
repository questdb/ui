import type { ChartType } from "./chartTypes"

export type ChartSettingsCancelMethod =
  | "backdrop"
  | "close"
  | "button"
  | "escape"

export type ChartSettingsSavePayload = {
  chartType: ChartType | undefined
  seriesCount: number
  queryCount: number
  hasRightAxis: boolean
  partitioned: boolean
}

export type ChartSettingsBlockReason = "ohlc_incomplete" | "axis_bounds_invalid"

export type ChartSettingsTelemetry = {
  onCancel?: (method: ChartSettingsCancelMethod) => void
  onSave?: (payload: ChartSettingsSavePayload) => void
  onSaveBlocked?: (reason: ChartSettingsBlockReason) => void
  onTypeChange?: (from: ChartType, to: ChartType) => void
  onResetAuto?: (chartType: ChartType) => void
}
