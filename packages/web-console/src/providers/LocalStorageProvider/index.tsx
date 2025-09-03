/*******************************************************************************
 *     ___                  _   ____  ____
 *    / _ \ _   _  ___  ___| |_|  _ \| __ )
 *   | | | | | | |/ _ \/ __| __| | | |  _ \
 *   | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *    \__\_\\__,_|\___||___/\__|____/|____/
 *
 *  Copyright (c) 2014-2019 Appsicle
 *  Copyright (c) 2019-2022 QuestDB
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 ******************************************************************************/

import React, {
  createContext,
  PropsWithChildren,
  useState,
  useContext,
  useCallback,
} from "react"
import { getValue, setValue } from "../../utils/localStorage"
import { StoreKey } from "../../utils/localStorage/types"
import { parseInteger } from "./utils"
import { LocalConfig, SettingsType, LeftPanelState, LeftPanelType, AiAssistantSettings } from "./types"

/* eslint-disable prettier/prettier */
type Props = {}

export const DEFAULT_AI_ASSISTANT_SETTINGS = {
  apiKey: "",
  model: "claude-sonnet-4-0",
  grantSchemaAccess: true,
  maxTokens: 1000
}

const defaultConfig: LocalConfig = {
  editorCol: 10,
  editorLine: 10,
  editorSplitterBasis: 350,
  resultsSplitterBasis: 350,
  exampleQueriesVisited: false,
  autoRefreshTables: true,
  aiAssistantSettings: DEFAULT_AI_ASSISTANT_SETTINGS,
  leftPanelState: {
    type: LeftPanelType.DATASOURCES,
    width: 350
  }
}

type ContextProps = {
  editorCol: number
  editorLine: number
  editorSplitterBasis: number
  resultsSplitterBasis: number
  updateSettings: (key: StoreKey, value: SettingsType) => void
  exampleQueriesVisited: boolean
  autoRefreshTables: boolean
  leftPanelState: LeftPanelState
  updateLeftPanelState: (state: LeftPanelState) => void
  aiAssistantSettings: AiAssistantSettings
}

const defaultValues: ContextProps = {
  editorCol: 1,
  editorLine: 1,
  editorSplitterBasis: 350,
  resultsSplitterBasis: 350,
  updateSettings: (key: StoreKey, value: SettingsType) => undefined,
  exampleQueriesVisited: false,
  autoRefreshTables: true,
  leftPanelState: defaultConfig.leftPanelState,
  updateLeftPanelState: (state: LeftPanelState) => undefined,
  aiAssistantSettings: defaultConfig.aiAssistantSettings,
}

export const LocalStorageContext = createContext<ContextProps>(defaultValues)

export const LocalStorageProvider = ({
  children,
}: PropsWithChildren<Props>) => {
  const [editorCol, setEditorCol] = useState<number>(
    parseInteger(getValue(StoreKey.EDITOR_COL), defaultConfig.editorCol),
  )
  const [editorLine, setEditorLine] = useState<number>(
    parseInteger(getValue(StoreKey.EDITOR_LINE), defaultConfig.editorLine),
  )
  const [editorSplitterBasis, seteditorSplitterBasis] = useState<number>(
    parseInteger(
      getValue(StoreKey.EDITOR_SPLITTER_BASIS),
      defaultConfig.editorSplitterBasis,
    ),
  )
  const [resultsSplitterBasis, setresultsSplitterBasis] = useState<number>(
    parseInteger(
      getValue(StoreKey.RESULTS_SPLITTER_BASIS),
      defaultConfig.resultsSplitterBasis,
    ),
  )

  const [exampleQueriesVisited, setExampleQueriesVisited] = useState<boolean>(
    getValue(StoreKey.EXAMPLE_QUERIES_VISITED) === "true",
  )

  const [autoRefreshTables, setAutoRefreshTables] = useState<boolean>(
    getValue(StoreKey.AUTO_REFRESH_TABLES)
      ? getValue(StoreKey.AUTO_REFRESH_TABLES) === "true"
      : defaultConfig.autoRefreshTables,
  )

  const getLeftPanelState = (): LeftPanelState => {
    const stored = getValue("left.panel.state" as any)
    if (stored) {
      try {
        return JSON.parse(stored) as LeftPanelState
      } catch (e) {
        return defaultConfig.leftPanelState
      }
    }
    return defaultConfig.leftPanelState
  }

  const [leftPanelState, setLeftPanelState] = useState<LeftPanelState>(getLeftPanelState())

  const getAiAssistantSettings = (): AiAssistantSettings => {
    const stored = getValue(StoreKey.AI_ASSISTANT_SETTINGS)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as AiAssistantSettings
        return {
          apiKey: parsed.apiKey || "",
          model: parsed.model || DEFAULT_AI_ASSISTANT_SETTINGS.model,
          grantSchemaAccess: parsed.grantSchemaAccess !== undefined ? parsed.grantSchemaAccess : true,
          maxTokens: parsed.maxTokens || DEFAULT_AI_ASSISTANT_SETTINGS.maxTokens
        }
      } catch (e) {
        return defaultConfig.aiAssistantSettings
      }
    }
    return defaultConfig.aiAssistantSettings
  }

  const [aiAssistantSettings, setAiAssistantSettings] = useState<AiAssistantSettings>(getAiAssistantSettings())

  const updateSettings = (key: StoreKey, value: SettingsType) => {
    if (key === StoreKey.AI_ASSISTANT_SETTINGS) {
      setValue(key, JSON.stringify(value))
    } else {
      setValue(key, value.toString())
    }
    refreshSettings(key)
  }

  const updateLeftPanelState = useCallback((state: LeftPanelState) => {
    setValue("left.panel.state" as any, JSON.stringify(state))
    setLeftPanelState(state)
  }, [])

  const refreshSettings = (key: StoreKey) => {
    const value = getValue(key)
    switch (key) {
      case StoreKey.EDITOR_COL:
        setEditorCol(parseInteger(value, defaultConfig.editorCol))
        break
      case StoreKey.EDITOR_LINE:
        setEditorLine(parseInteger(value, defaultConfig.editorLine))
        break
      case StoreKey.EXAMPLE_QUERIES_VISITED:
        setExampleQueriesVisited(value === "true")
        break
      case StoreKey.EDITOR_SPLITTER_BASIS:
        seteditorSplitterBasis(
          parseInteger(value, defaultConfig.editorSplitterBasis),
        )
        break
      case StoreKey.RESULTS_SPLITTER_BASIS:
        setresultsSplitterBasis(
          parseInteger(value, defaultConfig.resultsSplitterBasis),
        )
        break
      case StoreKey.AUTO_REFRESH_TABLES:
        setAutoRefreshTables(value === "true")
        break
      case StoreKey.AI_ASSISTANT_SETTINGS:
        setAiAssistantSettings(getAiAssistantSettings())
        break
    }
  }

  return (
    <LocalStorageContext.Provider
      value={{
        editorCol,
        editorLine,
        editorSplitterBasis,
        resultsSplitterBasis,
        updateSettings,
        exampleQueriesVisited,
        autoRefreshTables,
        leftPanelState,
        updateLeftPanelState,
        aiAssistantSettings,
      }}
    >
      {children}
    </LocalStorageContext.Provider>
  )
}

export const useLocalStorage = () => {
  return useContext(LocalStorageContext)
}
/* eslint-enable prettier/prettier */
