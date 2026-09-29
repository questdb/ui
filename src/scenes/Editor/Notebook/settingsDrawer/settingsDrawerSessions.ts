import type { ChartConfig } from "../CellChart/chartTypes"
import type { HighlightConfig } from "../../../../components/ResultGrid/highlight"
import type { HighlightDraft } from "../CellHighlight/ruleDraft"
import { createSettingsDrawerSessionStore } from "./settingsDrawerSessionStore"

export type ChartSettingsSession = {
  configAtOpen: ChartConfig | undefined
  draft: ChartConfig | null
}

export type HighlightSettingsSession = {
  configAtOpen: HighlightConfig | undefined
  draft: HighlightDraft | null
}

// What a toolbar control asks of a cell's drawer: the kebab entry opens and
// keeps an open draft, the spotlight gear toggles.
export type SettingsDrawerRequest = {
  cellId: string
  mode: "open" | "toggle"
}

export const chartSettingsSessions =
  createSettingsDrawerSessionStore<ChartSettingsSession>()

export const highlightSettingsSessions =
  createSettingsDrawerSessionStore<HighlightSettingsSession>()

export const clearSettingsDrawerSessions = (cellId: string) => {
  chartSettingsSessions.clear(cellId)
  highlightSettingsSessions.clear(cellId)
}
