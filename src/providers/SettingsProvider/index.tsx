import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useState,
} from "react"
import isEqual from "lodash.isequal"
import { ConsoleConfig, Settings, Warning } from "./types"
import { Box, Text } from "../../components"
import { ConnectionErrorView } from "../../components/ConnectionErrorView"
import { setValue } from "../../utils/localStorage"
import { StoreKey } from "../../utils/localStorage/types"
import { Preferences } from "../../utils"

enum View {
  loading = 0,
  ready = 1,
  error = 2,
}

type State = { view: View; errorMessage?: React.ReactNode }

type SettingsResponse = {
  config: Settings
  preferences: Preferences
  "preferences.version": number
}

const initialState = { view: View.loading }

const reducer = (s: State, n: Partial<State>) => ({ ...s, ...n })

const SettingContext = createContext<{
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

const connectionError = (
  <Box flexDirection="column" gap="0">
    <Text align="center" size="lg" color="contentSecondary" weight={600}>
      It appears we can&apos;t connect to the database.
    </Text>
    <Text align="center" size="lg" color="contentSecondary">
      Please, check if the server is running correctly.
    </Text>
  </Box>
)

const consoleConfigError = (
  <Box flexDirection="column" gap="0">
    <Text align="center" size="lg" color="contentSecondary" weight={600}>
      It appears we can&apos;t connect to the database.
    </Text>
    <Text align="center" size="lg" color="contentSecondary">
      Error loading the console configuration file.
    </Text>
  </Box>
)

export const SettingsProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [settings, setSettings] = useState<Settings>({})
  const [preferences, _setPreferences] = useState<Preferences>({})
  const [warnings, setWarnings] = useState<Warning[]>([])
  const [consoleConfig, setConsoleConfig] = useState<ConsoleConfig>({})
  const [preloadedImages, setPreloadedImages] = useState<
    Record<string, string>
  >({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [retryPending, setRetryPending] = useState(false)
  const retryInFlight = React.useRef(false)

  useEffect(() => {
    const preloadImages = async () => {
      const imagesToPreload = [
        "assets/questdb-logo-3d.png",
        "assets/whoops.svg",
        "assets/grid-bg.webp",
      ]

      const imageDataUrls: Record<string, string> = {}

      for (const src of imagesToPreload) {
        try {
          const response = await fetch(src)
          const blob = await response.blob()
          imageDataUrls[src] = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () =>
              reject(`Failed to read image blob for ${src}`)
            reader.readAsDataURL(blob)
          })
        } catch (error) {
          imageDataUrls[src] = src
        }
      }

      setPreloadedImages(imageDataUrls)
    }

    void preloadImages()
  }, [])

  const views: { [key in View]: () => React.ReactNode } = {
    [View.loading]: () => null,
    [View.ready]: () => (
      <SettingContext.Provider
        value={{
          settings,
          consoleConfig,
          warnings,
          preferences,
          refreshSettingsAndPreferences,
        }}
      >
        {children}
      </SettingContext.Provider>
    ),
    [View.error]: () => (
      <ConnectionErrorView
        preloadedImages={preloadedImages}
        error={state.errorMessage ?? connectionError}
        status={retryPending ? "Reconnecting…" : (errorMessage ?? undefined)}
        pending={retryPending}
        retryLabel="Retry"
        onRetry={() => {
          if (retryInFlight.current) return
          retryInFlight.current = true
          setRetryPending(true)
          setErrorMessage(null)
          void fetchAll(false)
            .then(() => dispatch({ view: View.ready }))
            .catch(() => setErrorMessage("Retry failed"))
            .finally(() => {
              retryInFlight.current = false
              setRetryPending(false)
            })
        }}
      />
    ),
  }

  const fetchEndpoint = async <ResponseType = unknown,>(
    endpoint: string,
    errorMessage?: React.ReactNode,
  ): Promise<ResponseType | undefined> => {
    try {
      const response = await fetch(endpoint)
      if (response.status === 200) {
        return (await response.json()) as ResponseType
      } else {
        dispatch({ view: View.error, errorMessage })
      }
    } catch (e) {
      dispatch({ view: View.error, errorMessage })
    }
  }

  const setPreferences = (preferences: Preferences) => {
    if (preferences?.instance_name) {
      const suffix = preferences?.instance_type
        ? `${preferences.instance_type.charAt(0).toUpperCase()}${preferences.instance_type.slice(1)}`
        : "QuestDB"
      const newTitle = `${preferences.instance_name} | ${suffix}`
      if (document.title !== newTitle) {
        document.title = newTitle
      }
    }
    _setPreferences(preferences)
  }

  const refreshSettingsAndPreferences = async () => {
    const result = await fetchEndpoint<{
      config: Settings
      preferences: Preferences
      "preferences.version": number
    }>("settings", connectionError)
    if (result) {
      const newSettings = result?.config
      const newPreferences = {
        version: result["preferences.version"],
        ...result?.preferences,
      }
      if (!isEqual(newSettings, settings)) {
        setSettings(newSettings)
      }
      if (!isEqual(newPreferences, preferences)) {
        setPreferences(newPreferences)
      }
      return {
        settings: newSettings,
        preferences: newPreferences,
      }
    }

    return {
      settings: {},
      preferences: {},
    }
  }

  const fetchAll = useCallback(async (switchView = true) => {
    const settings = await fetchEndpoint<SettingsResponse>(
      "settings",
      switchView ? connectionError : undefined,
    )
    const warnings = await fetchEndpoint<Warning[]>(
      "warnings",
      switchView ? connectionError : undefined,
    )
    const consoleConfig = await fetchEndpoint<ConsoleConfig>(
      "assets/console-configuration.json",
      switchView ? consoleConfigError : undefined,
    )
    if (settings) {
      setSettings(settings.config)
      setPreferences({
        version: settings["preferences.version"],
        ...settings.preferences,
      })
      if (settings.config["release.type"]) {
        setValue(StoreKey.RELEASE_TYPE, settings.config["release.type"])
      }
    }
    if (warnings) {
      setWarnings(warnings)
    }
    if (consoleConfig) {
      setConsoleConfig(consoleConfig)
    }

    if (!settings || !consoleConfig) {
      throw new Error("Failed to fetch settings from the server")
    }
  }, [])

  useEffect(() => {
    void fetchAll()
      .then(() => dispatch({ view: View.ready }))
      .catch((_err) => {
        // view should already be set to error
      })
  }, [])

  return <>{views[state.view]()}</>
}

export const useSettings = () => useContext(SettingContext)
