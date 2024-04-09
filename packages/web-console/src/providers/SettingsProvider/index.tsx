import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useState,
} from "react"
import { ConsoleConfig, Settings } from "./types"
import { CenteredLayout } from "../../components"
import { Box, Button, Text } from "@questdb/react-components"
import { Refresh } from "@styled-icons/remix-line"

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
}>({ settings: {}, consoleConfig: {} })

const settingsError = (
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
  const [consoleConfig, setConsoleConfig] = useState<ConsoleConfig>({})

  const views: { [key in View]: () => React.ReactNode } = {
    [View.loading]: () => null,
    [View.ready]: () => (
      <SettingContext.Provider value={{ settings, consoleConfig }}>
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
              src="/assets/questdb-logotype.svg"
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

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${window.location.origin}/settings`)
      if (response.status === 200) {
        const settings = await response.json()
        setSettings(settings)
      } else {
        dispatch({ view: View.error, errorMessage: settingsError })
      }
    } catch (e) {
      dispatch({ view: View.error, errorMessage: settingsError })
    }
  }

  const fetchConsoleConfig = async () => {
    try {
      const response = await fetch(
        `${window.location.origin}/assets/console-configuration.json`,
      )
      if (response.status === 200) {
        const consoleConfig = await response.json()
        setConsoleConfig(consoleConfig)
      } else {
        dispatch({ view: View.error, errorMessage: consoleConfigError })
      }
    } catch (e) {
      dispatch({ view: View.error, errorMessage: consoleConfigError })
    }
  }

  useEffect(() => {
    const fetchAll = async () => {
      await fetchSettings()
      await fetchConsoleConfig()
    }

    fetchAll().then(() => dispatch({ view: View.ready }))
  }, [])

  return <>{views[state.view]()}</>
}

export const useSettings = () => useContext(SettingContext)
