import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useState,
} from "react"
import _ from "lodash"
import styled from "styled-components"
import { ConsoleConfig, Settings, Warning } from "./types"
import { CenteredLayout, Box, Text, Button } from "../../components"
import { Refresh } from "@styled-icons/remix-line"
import { CloseOutline } from "@styled-icons/evaicons-outline"
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

const TextContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding: 2.4rem;
  gap: 2.8rem;
`
const RefreshButton = styled(Button)`
  padding: 1.2rem;
  height: unset !important;
`

const Whoops = styled.img`
  width: auto;
  height: auto;

  @media (max-width: 1000px) {
    width: 600px;
    height: auto;
  }
`

const ErrorMessage = styled(Text).attrs({ color: "red", size: "md" })`
  height: 3rem;
  align-self: center;
  display: flex;
  align-items: center;
  gap: 0.2rem;
`

const CloseOutlineIcon = styled(CloseOutline)`
  color: ${({ theme }) => theme.color.red};
  flex-shrink: 0;
`

const connectionError = (
  <Box flexDirection="column" gap="0">
    <Text align="center" size="lg" color="offWhite" weight={600}>
      It appears we can&apos;t connect to the database.
    </Text>
    <Text align="center" size="lg" color="offWhite">
      Please, check if the server is running correctly.
    </Text>
  </Box>
)

const consoleConfigError = (
  <Box flexDirection="column" gap="0">
    <Text align="center" size="lg" color="offWhite" weight={600}>
      It appears we can&apos;t connect to the database.
    </Text>
    <Text align="center" size="lg" color="offWhite">
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
  const errorTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

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
      <CenteredLayout preloadedImages={preloadedImages}>
        <Box flexDirection="column" gap="6.4rem">
          <a href="https://questdb.com">
            <img
              src={
                preloadedImages["assets/questdb-logo-3d.png"] ||
                "assets/questdb-logo-3d.png"
              }
              alt="QuestDB logo"
              width="163"
              height="144"
            />
          </a>
          <Whoops
            src={preloadedImages["assets/whoops.svg"] || "assets/whoops.svg"}
            alt="Whoops"
          />
          <TextContainer>
            {state.errorMessage ?? (
              <Box flexDirection="column" gap="0">
                <Text align="center" size="lg" color="offWhite" weight={600}>
                  It appears we can&apos;t connect to the database.
                </Text>
                <Text align="center" size="lg" color="offWhite">
                  Please, check if the server is running correctly.
                </Text>
              </Box>
            )}
            <RefreshButton
              skin="primary"
              prefixIcon={<Refresh size="18px" />}
              onClick={() => {
                void fetchAll(false)
                  .then(() => dispatch({ view: View.ready }))
                  .catch(() => {
                    if (errorTimeoutRef.current) {
                      clearTimeout(errorTimeoutRef.current)
                    }
                    setErrorMessage("Retry failed")
                    errorTimeoutRef.current = setTimeout(
                      () => setErrorMessage(null),
                      3000,
                    )
                  })
              }}
            >
              Retry
            </RefreshButton>
            <ErrorMessage>
              {errorMessage && (
                <>
                  <CloseOutlineIcon size="18px" />
                  {errorMessage}
                </>
              )}
            </ErrorMessage>
          </TextContainer>
        </Box>
      </CenteredLayout>
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
      if (!_.isEqual(newSettings, settings)) {
        setSettings(newSettings)
      }
      if (!_.isEqual(newPreferences, preferences)) {
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
