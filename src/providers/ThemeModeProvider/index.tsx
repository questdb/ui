import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { ThemeProvider } from "styled-components"
import { darkTheme, lightTheme } from "../../theme"
import { setRuntimeTheme } from "../../theme/runtime"
import type { ThemeMode, ThemePreference } from "../../types"
import { getValue, setValue } from "../../utils/localStorage"
import { StoreKey } from "../../utils/localStorage/types"
import { applyMonacoTheme, monacoPromise } from "../../utils/monacoInit"

type ThemeModeContextValue = {
  preference: ThemePreference
  mode: ThemeMode
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
  const mode = preference === "system" ? systemMode : preference
  const activeTheme = mode === "light" ? lightTheme : darkTheme
  setRuntimeTheme(activeTheme)

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference)
    setValue(StoreKey.THEME_PREFERENCE, nextPreference)
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
    document.documentElement.style.colorScheme = mode
    void monacoPromise.then((monaco) => applyMonacoTheme(monaco, mode))
  }, [mode])

  const value = useMemo(
    () => ({ preference, mode, setPreference }),
    [preference, mode, setPreference],
  )

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={activeTheme}>{children}</ThemeProvider>
    </ThemeModeContext.Provider>
  )
}

export const useThemeMode = () => useContext(ThemeModeContext)
