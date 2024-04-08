import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useState,
} from "react"
import { Settings } from "./types"
import { CenteredLayout } from "../../components"
import { Box, Button, Text } from "@questdb/react-components"
import { Refresh } from "@styled-icons/remix-line"

enum View {
  loading = 0,
  ready = 1,
  error = 2,
}

type State = { view: View }

const initialState = { view: View.loading }

const reducer = (s: State, n: Partial<State>) => ({ ...s, ...n })

const SettingContext = createContext<Settings>({})

export const SettingsProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [settings, setSettings] = useState<Settings>({})

  const views: { [key in View]: () => React.ReactNode } = {
    [View.loading]: () => null,
    [View.ready]: () => (
      <SettingContext.Provider value={settings}>
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
            onClick={fetchSettings}
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
        dispatch({ view: View.ready })
      } else {
        dispatch({ view: View.error })
      }
    } catch (e) {
      dispatch({ view: View.error })
    }
  }

  useEffect(() => {
    void fetchSettings()
  }, [])

  return <>{views[state.view]()}</>
}

export const useSettings = () => useContext(SettingContext)
