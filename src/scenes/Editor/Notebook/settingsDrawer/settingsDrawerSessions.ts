import type { DrawDraft, DrawSettings } from "../CellChart/drawSettings"
import type { GridSettings } from "../result-table/highlightConfig"
import type { HighlightDraft } from "../CellHighlight/ruleDraft"
import { createSettingsDrawerSessionStore } from "./settingsDrawerSessionStore"

export type ChartSettingsSession = {
  configAtOpen: DrawSettings | undefined
  draft: DrawDraft | null
}

export type HighlightSettingsSession = {
  configAtOpen: GridSettings | undefined
  draft: HighlightDraft | null
}

// What a toolbar control asks of a cell's drawer: the kebab entry opens and
// keeps an open draft, the spotlight gear toggles.
export type SettingsDrawerRequest = {
  cellId: string
  mode: "open" | "toggle"
  // Open on a section, and in it on a column (the grid header's "Format
  // column").
  focus?: { section: string; column?: string }
}

export const chartSettingsSessions =
  createSettingsDrawerSessionStore<ChartSettingsSession>()

export const highlightSettingsSessions =
  createSettingsDrawerSessionStore<HighlightSettingsSession>()

export const clearSettingsDrawerSessions = (cellId: string) => {
  chartSettingsSessions.clear(cellId)
  highlightSettingsSessions.clear(cellId)
}
