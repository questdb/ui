import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useState,
} from "react"
import { ConsoleConfig, Settings, Warning } from "./types"
import { CenteredLayout } from "../../components"
import { Box, Button, Text } from "@questdb/react-components"
import { Refresh } from "@styled-icons/remix-line"
import {setValue} from "../../utils/localStorage";
import {StoreKey} from "../../utils/localStorage/types";

enum View {
  loading = 0,
  ready = 1,
  error = 2,
}

type State = { view: View; errorMessage?: React.ReactNode }

const initialState = { view: View.loading }

const reducer = (s: State, n: Partial<State>) => ({ ...s, ...n })

const SettingContext = createContext<{
  settings: Settings
  consoleConfig: ConsoleConfig
  warnings: Warning[]
}>({ settings: {}, consoleConfig: {}, warnings: [] })

const connectionError = (
  <>
    Error connecting to the database.
    <br />
    Please, check if the server is running correctly.
  </>
)

const consoleConfigError = <>Error loading the console configuration file</>

export const SettingsProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [settings, setSettings] = useState<Settings>({})
  const [warnings, setWarnings] = useState<Warning[]>([])
  const [consoleConfig, setConsoleConfig] = useState<ConsoleConfig>({})

  const views: { [key in View]: () => React.ReactNode } = {
    [View.loading]: () => null,
    [View.ready]: () => (
      <SettingContext.Provider value={{ settings, consoleConfig, warnings }}>
        {children}
      </SettingContext.Provider>
    ),
    [View.error]: () => (
      <CenteredLayout>
        <Box flexDirection="column" gap="2rem">
          <a href={"https://questdb.io"}>
            <img
              alt="QuestDB logotype"
              width="95"
              height="23"
              src="assets/questdb-logotype.svg"
            />
          </a>
          <Text align="center" size="lg">
            Error connecting to the database.
            <br />
            Please, check if the server is running correctly.
          </Text>
          <Button
            skin="secondary"
            prefixIcon={<Refresh size="18px" />}
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </Box>
      </CenteredLayout>
    ),
  }

  const fetchEndpoint = async (
    endpoint: string,
    errorMessage: React.ReactNode,
  ) => {
    try {
      const response = await fetch(endpoint)
      if (response.status === 200) {
        return await response.json()
      } else {
        dispatch({ view: View.error, errorMessage })
      }
    } catch (e) {
      dispatch({ view: View.error, errorMessage })
    }
  }

  useEffect(() => {
    const fetchAll = async () => {
      const settings = await fetchEndpoint("settings", connectionError)
      const warnings = await fetchEndpoint("warnings", connectionError)
      const consoleConfig = await fetchEndpoint(
        "assets/console-configuration.json",
        consoleConfigError,
      )
      if (settings) {
        setSettings(settings)
        setValue(StoreKey.RELEASE_TYPE, settings["release.type"])
      }
      if (warnings) {
        setWarnings(warnings)
      }
      if (consoleConfig) {
        setConsoleConfig(consoleConfig)
      }
    }

    fetchAll().then(() => dispatch({ view: View.ready }))
  }, [])

  return <>{views[state.view]()}</>
}

export const useSettings = () => useContext(SettingContext)
