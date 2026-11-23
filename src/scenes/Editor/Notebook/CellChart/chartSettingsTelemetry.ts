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

export type ChartSettingsTelemetry = {
  onCancel?: (method: ChartSettingsCancelMethod) => void
  onSave?: (payload: ChartSettingsSavePayload) => void
  onSaveBlocked?: (reason: "ohlc_incomplete") => void
  onTypeChange?: (from: ChartType, to: ChartType) => void
  onResetAuto?: (chartType: ChartType) => void
}
