import type { ChartConfig } from "../CellChart/chartTypes"
import type { HighlightDraft } from "../CellHighlight/ruleDraft"
import { createSettingsDrawerSessionStore } from "./settingsDrawerSessionStore"

export type ChartSettingsSession = {
  configAtOpen: ChartConfig | undefined
  draft: ChartConfig | null
}

export type HighlightSettingsSession = {
  draft: HighlightDraft | null
}

export const chartSettingsSessions =
  createSettingsDrawerSessionStore<ChartSettingsSession>()

export const highlightSettingsSessions =
  createSettingsDrawerSessionStore<HighlightSettingsSession>()

export const highlightSessionKey = (cellId: string, statementIndex: number) =>
  `${cellId}:${statementIndex}`

export const clearSettingsDrawerSessions = (cellId: string) => {
  chartSettingsSessions.clear(cellId)
  highlightSettingsSessions.clearWhere((key) => key.startsWith(`${cellId}:`))
}
