import { createContext, useContext } from "react"
import type { ConsoleConfig, Settings, Warning } from "./types"
import type { Preferences } from "../../utils/questdb/types"

// The context lives apart from the provider so consumers that only need
// `useSettings` (EditorProvider, for one) do not pull in the provider's UI
// and, through the components barrel, Radix.
export const SettingContext = createContext<{
  settings: Settings
  preferences: Preferences
  consoleConfig: ConsoleConfig
  warnings: Warning[]
  refreshSettingsAndPreferences: () => Promise<{
    settings: Settings
    preferences: Preferences
  }>
}>({
  settings: {},
  preferences: {},
  consoleConfig: {},
  warnings: [],
  refreshSettingsAndPreferences: () =>
    Promise.resolve({
      settings: {},
      preferences: {},
    }),
})

export const useSettings = () => useContext(SettingContext)
