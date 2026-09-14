import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { ThemeProvider } from "styled-components"
import { darkTheme, lightTheme, createTheme } from "../../theme"
import {
  readThemeTreatment,
  themeTreatments,
  type ThemeTreatmentId,
} from "../../theme/treatments"
import { setRuntimeTheme } from "../../theme/runtime"
import type { ThemeMode, ThemePreference } from "../../types"
import { getValue, setValue } from "../../utils/localStorage"
import { StoreKey } from "../../utils/localStorage/types"
import { applyMonacoTheme, monacoPromise } from "../../utils/monacoInit"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"

type ThemeModeContextValue = {
  preference: ThemePreference
  mode: ThemeMode
  treatment: ThemeTreatmentId
  setPreference: (preference: ThemePreference) => void
}

const SYSTEM_DARK_MODE_QUERY = "(prefers-color-scheme: dark)"

const isThemePreference = (value: string): value is ThemePreference =>
  value === "system" || value === "light" || value === "dark"

const readInitialPreference = (): ThemePreference => {
  const storedPreference = getValue(StoreKey.THEME_PREFERENCE)
  if (isThemePreference(storedPreference)) {
    return storedPreference
  }
  return "system"
}

const readSystemMode = (): ThemeMode =>
  typeof window !== "undefined" &&
  window.matchMedia?.(SYSTEM_DARK_MODE_QUERY).matches
    ? "dark"
    : "light"

const ThemeModeContext = createContext<ThemeModeContextValue>({
  preference: "system",
  mode: "dark",
  treatment: "control",
  setPreference: () => undefined,
})

export const ThemeModeProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    readInitialPreference,
  )
  const [systemMode, setSystemMode] = useState<ThemeMode>(readSystemMode)
  const [treatment, setTreatment] = useState<ThemeTreatmentId>(
    readThemeTreatment,
  )
  const mode = preference === "system" ? systemMode : preference
  const overlay = themeTreatments[treatment][mode]
  const baseTheme = mode === "light" ? lightTheme : darkTheme
  const activeTheme = useMemo(
    () =>
      Object.keys(overlay).length === 0
        ? baseTheme
        : createTheme({ ...baseTheme.color, ...overlay }, mode),
    [baseTheme, mode, overlay],
  )
  setRuntimeTheme(activeTheme)

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference)
    setValue(StoreKey.THEME_PREFERENCE, nextPreference)
  }, [])

  useEffect(() => {
    const handleTreatmentChange = () => setTreatment(readThemeTreatment())
    window.addEventListener("popstate", handleTreatmentChange)
    return () => window.removeEventListener("popstate", handleTreatmentChange)
  }, [])

  useEffect(() => {
    const query = window.matchMedia(SYSTEM_DARK_MODE_QUERY)
    const handleSystemModeChange = (event: MediaQueryListEvent) => {
      setSystemMode(event.matches ? "dark" : "light")
    }

    setSystemMode(query.matches ? "dark" : "light")
    query.addEventListener("change", handleSystemModeChange)

    return () => query.removeEventListener("change", handleSystemModeChange)
  }, [])

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== StoreKey.THEME_PREFERENCE) {
        return
      }

      setPreferenceState(
        event.newValue != null && isThemePreference(event.newValue)
          ? event.newValue
          : "system",
      )
    }

    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = mode
    document.documentElement.dataset.treatment = treatment
    document.documentElement.style.colorScheme = mode
    void monacoPromise.then((monaco) => applyMonacoTheme(monaco, mode))
    eventBus.publish(EventType.MSG_THEME_CHANGED, mode)
  }, [mode, treatment])

  const value = useMemo(
    () => ({ preference, mode, treatment, setPreference }),
    [preference, mode, treatment, setPreference],
  )

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={activeTheme}>{children}</ThemeProvider>
    </ThemeModeContext.Provider>
  )
}

export const useThemeMode = () => useContext(ThemeModeContext)
