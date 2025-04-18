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
  CSSProperties,
  forwardRef,
  Ref,
  useRef,
  useEffect,
  useState,
  useContext,
  useReducer,
  useCallback,
  useMemo,
} from "react"
import { useDispatch } from "react-redux"
import styled, { css } from "styled-components"
import {
  CheckboxCircle,
  Close,
  FileCopy,
  Refresh,
} from "@styled-icons/remix-line"
import {
  PaneContent,
  PaneWrapper,
  PopperHover,
  PrimaryToggleButton,
  Text,
  Tooltip,
} from "../../components"
import { actions } from "../../store"
import { copyToClipboard, ErrorResult } from "../../utils"
import * as QuestDB from "../../utils/questdb"
import { Box } from "../../components/Box"
import { Button } from "@questdb/react-components"
import { Panel } from "../../components/Panel"
import { QuestContext } from "../../providers"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { Toolbar } from "./Toolbar/toolbar"
import { VirtualTables } from "./VirtualTables"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { StoreKey } from "../../utils/localStorage/types"
import { NotificationType } from "../../types"
import { Checkbox } from "./checkbox"
import { AddChart } from "@styled-icons/material"
import { useEditor } from "../../providers/EditorProvider"
import {
  metricDurations,
  MetricViewMode,
  RefreshRate,
} from "../../scenes/Editor/Metrics/utils"
import type { Duration } from "../../scenes/Editor/Metrics/types"
import { TreeNodeKind } from "../../components/Tree"
import { SchemaProvider } from "./SchemaContext"

type Props = Readonly<{
  hideMenu?: boolean
  style?: CSSProperties
}>

const loadingStyles = css`
  display: flex;
  justify-content: center;
`

const Wrapper = styled(PaneWrapper)`
  overflow-x: auto;
  height: 100%;
`

const Content = styled(PaneContent)<{
  _loading: boolean
}>`
  display: flex;
  flex-direction: column;
  overflow: auto;
  ${({ _loading }) => _loading && loadingStyles};
`

const ToolbarToggleButton = styled(PrimaryToggleButton)`
  &&:not(:disabled) {
    width: auto;
    padding: 0 1rem;
    height: 3rem;
  }
`

export enum View {
  loading,
  error,
  ready,
}

export type State = { view: View; loadingError?: ErrorResult }

const initialState: State = {
  view: View.loading,
}

const reducer = (s: State, n: Partial<State>) => ({ ...s, ...n })

const Schema = ({
  innerRef,
  ...rest
}: Props & { innerRef: Ref<HTMLDivElement> }) => {
  const [state, dispatchState] = useReducer(reducer, initialState)
  const { quest } = useContext(QuestContext)
  const [loadingError, setLoadingError] = useState<ErrorResult | null>(null)
  const errorRef = useRef<ErrorResult | null>(null)
  const [tables, setTables] = useState<QuestDB.Table[]>()
  const [walTables, setWalTables] = useState<QuestDB.WalTable[]>()
  const [materializedViews, setMaterializedViews] = useState<QuestDB.MaterializedView[]>()
  const dispatch = useDispatch()
  const [scrollAtTop, setScrollAtTop] = useState(true)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [filterSuspendedOnly, setFilterSuspendedOnly] = useState(false)
  const { autoRefreshTables, updateSettings } = useLocalStorage()
  const [selectOpen, setSelectOpen] = useState(false)
  const [selectedTables, setSelectedTables] = useState<{name: string, type: TreeNodeKind}[]>([])
  const selectedTablesMap = useMemo(() => new Map(
    selectedTables.map(table => [`${table.name}-${table.type}`, table])
  ), [selectedTables])
  const [focusListenerActive, setFocusListenerActive] = useState(false)
  const listenerActiveRef = useRef(false)
  const { addBuffer } = useEditor()

  const fetchTables = async () => {
    try {
      const response = await quest.showTables()
      if (response && response.type === QuestDB.Type.DQL) {
        errorRef.current = null
        setTables(response.data)
        dispatch(actions.query.setTables(response.data))
        // Fetch WAL info about the tables
        const walTablesResponse = await quest.query<QuestDB.WalTable>(
          "wal_tables()",
        )
        if (walTablesResponse && walTablesResponse.type === QuestDB.Type.DQL) {
          // Filter out the system tables
          setWalTables(
            walTablesResponse.data.filter((wt) =>
              response.data.map((t) => t.table_name).includes(wt.name),
            ),
          )
        }
        void fetchMaterializedViews()
        dispatchState({ view: View.ready })
      } else {
        dispatchState({ view: View.error })
      }
    } catch (error) {
      dispatchState({
        view: View.error,
      })
    }
  }

  const fetchMaterializedViews = async () => {
    try {
      const matViewsResponse = await quest.query<QuestDB.MaterializedView>(
        "materialized_views()",
      )
      if (matViewsResponse && matViewsResponse.type === QuestDB.Type.DQL) {
        setMaterializedViews(matViewsResponse.data)
      }
    } catch (error) {
      // Fail silently
    }
  }

  const fetchColumns = async () => {
    const queries = [
      "information_schema.questdb_columns()",
      "information_schema.columns()", // fallback for older servers
    ]

    for (const query of queries) {
      try {
        const response = await quest.query<QuestDB.InformationSchemaColumn>(
          query,
        )

        if (response?.type === QuestDB.Type.DQL) {
          dispatch(actions.query.setColumns(response.data))
          return
        }
      } catch {
        // let's try another query
      }
    }

    dispatchState({ view: View.error })
  }

  const copySchemasToClipboard = async () => {
    if (!tables) return
    let tablesWithError: {name: string, type: TreeNodeKind}[] = []
    const ddls = await Promise.all(
      selectedTables.map(async (table) => {
        try {
          const tableDDLResponse = table.type === 'table'
            ? await quest.showTableDDL(table.name)
            : await quest.showMatViewDDL(table.name)
          if (tableDDLResponse && tableDDLResponse.type === QuestDB.Type.DQL) {
            return tableDDLResponse.data[0].ddl
          }
        } catch (error) {
          tablesWithError.push(table)
        }
      }),
    )
    if (tablesWithError.length === 0) {
      copyToClipboard(ddls.join("\n\n"))
      dispatch(
        actions.query.addNotification({
          content: <Text color="foreground">Schemas copied to clipboard</Text>,
        }),
      )
    } else {
      dispatch(
        actions.query.addNotification({
          content: (
            <Text color="red">
              Cannot copy schemas from tables:{" "}
              {tablesWithError.sort().join(", ")}
            </Text>
          ),
          type: NotificationType.ERROR,
        }),
      )
    }
  }

  const handleSelectToggle = ({name, type}: {name: string, type: TreeNodeKind}) => {
    const key = `${name}-${type}`
    if (selectedTablesMap.has(key)) {
      setSelectedTables(selectedTables.filter(t => `${t.name}-${t.type}` !== key))
    } else {
      setSelectedTables([...selectedTables, {name, type}])
    }
  }

  const handleAddMetricsBuffer = async () => {
    const last1h = metricDurations.find(
      (d) => d.dateFrom === "now-1h" && d.dateTo === "now",
    ) as Duration
    await addBuffer({
      metricsViewState: {
        metrics: [],
        dateFrom: last1h.dateFrom,
        dateTo: last1h.dateTo,
        refreshRate: RefreshRate.AUTO,
        viewMode: MetricViewMode.GRID,
      },
    })
  }

  useEffect(() => {
    void fetchTables()
    void fetchColumns()

    eventBus.subscribe<ErrorResult>(EventType.MSG_CONNECTION_ERROR, (error) => {
      if (error) {
        errorRef.current = error
        setLoadingError(error)
      }
    })

    eventBus.subscribe<ErrorResult>(EventType.MSG_CONNECTION_OK, () => {
      // The connection has been re-established, and we have an error in memory
      if (errorRef.current !== null) {
        void fetchTables()
        void fetchColumns()
      }
    })
  }, [])

  const focusListener = useCallback(() => {
    if (listenerActiveRef.current) {
      void fetchTables()
      void fetchColumns()
    }
  }, [])

  useEffect(() => {
    if (autoRefreshTables) {
      eventBus.subscribe(EventType.MSG_QUERY_SCHEMA, () => {
        void fetchTables()
        void fetchColumns()
      })

      window.addEventListener("focus", focusListener)
      setFocusListenerActive(true)
      listenerActiveRef.current = true
    } else if (focusListenerActive) {
      eventBus.unsubscribe(EventType.MSG_QUERY_SCHEMA)

      window.removeEventListener("focus", focusListener)
      setFocusListenerActive(false)
      listenerActiveRef.current = false
    }
  }, [autoRefreshTables])

  const allSelectableTables = useMemo(() => {
    if (!tables) return []
    
    const regularTables = tables
      .filter(t => !materializedViews?.find(v => v.view_name === t.table_name))
      .map(t => ({name: t.table_name, type: "table" as TreeNodeKind}))
    
    const matViews = materializedViews?.map(t => ({
      name: t.view_name, 
      type: "matview" as TreeNodeKind
    })) ?? []
    
    return [...regularTables, ...matViews]
  }, [tables, materializedViews])

  return (
    <SchemaProvider>
      <Wrapper ref={innerRef} {...rest}>
        <Panel.Header
          afterTitle={
            <div style={{ display: "flex", marginRight: "1rem", justifyContent: "space-between", flex: 1 }}>
              <Toolbar
                suspendedTablesCount={
                  walTables?.filter((t) => t.suspended).length ?? 0
                }
                filterSuspendedOnly={filterSuspendedOnly}
                setFilterSuspendedOnly={setFilterSuspendedOnly}
              />
              {tables && (
                <Box align="center" gap="0">
                  {selectOpen && (
                    <PopperHover
                      delay={350}
                      placement="bottom"
                      trigger={
                        <Button
                          skin="transparent"
                          data-hook="schema-copy-to-clipboard-button"
                          disabled={selectedTables.length === 0}
                          onClick={copySchemasToClipboard}
                        >
                          <FileCopy size="18px" />
                        </Button>
                      }
                    >
                      <Tooltip>Copy schemas to clipboard</Tooltip>
                    </PopperHover>
                  )}

                  {selectOpen && (
                    <PopperHover
                      delay={350}
                      placement="bottom"
                      trigger={
                        <Button
                          skin="transparent"
                          data-hook="schema-select-all-button"
                          onClick={() => {
                            selectedTables.length === allSelectableTables.length
                              ? setSelectedTables([])
                              : setSelectedTables(allSelectableTables)
                          }}
                        >
                          <Checkbox
                            visible={true}
                            checked={selectedTables.length === allSelectableTables.length}
                          />
                        </Button>
                      }
                    >
                      <Tooltip>
                        {selectedTables.length === allSelectableTables.length
                          ? "Deselect"
                          : "Select"}{" "}
                        all
                      </Tooltip>
                    </PopperHover>
                  )}

                  {selectOpen && (
                    <PopperHover
                      delay={350}
                      placement="bottom"
                      trigger={
                        <Button
                          data-hook="schema-cancel-select-button"
                          skin="transparent"
                          onClick={() => {
                            setSelectedTables([])
                            setSelectOpen(false)
                          }}
                        >
                          <Close size="18px" />
                        </Button>
                      }
                    >
                      <Tooltip>Cancel</Tooltip>
                    </PopperHover>
                  )}

                  {!selectOpen && (
                    <PopperHover
                      delay={350}
                      placement="bottom"
                      trigger={
                        <Button
                          data-hook="schema-add-metrics-button"
                          skin="transparent"
                          onClick={handleAddMetricsBuffer}
                        >
                          <AddChart size="20px" />
                        </Button>
                      }
                    >
                      <Tooltip>Add metrics</Tooltip>
                    </PopperHover>
                  )}
                  {!selectOpen && (
                    <PopperHover
                      delay={350}
                      placement="right"
                      trigger={
                        <ToolbarToggleButton
                          data-hook="schema-select-button"
                          onClick={() => {
                            if (selectOpen) {
                              setSelectedTables([])
                            }
                            setSelectOpen(!selectOpen)
                          }}
                          {...(selectOpen ? { className: "selected" } : {})}
                          selected={selectOpen}
                          disabled={tables?.length === 0}
                        >
                          <CheckboxCircle size="18px" />
                        </ToolbarToggleButton>
                      }
                    >
                      <Tooltip>Select</Tooltip>
                    </PopperHover>
                  )}

                  {!selectOpen && (
                    <PopperHover
                      delay={350}
                      placement="right"
                      trigger={
                        <ToolbarToggleButton
                          data-hook="schema-auto-refresh-button"
                          onClick={() => {
                            updateSettings(
                              StoreKey.AUTO_REFRESH_TABLES,
                              !autoRefreshTables,
                            )
                            void fetchTables()
                            void fetchColumns()
                          }}
                          selected={autoRefreshTables}
                        >
                          <Refresh size="18px" />
                        </ToolbarToggleButton>
                      }
                    >
                      <Tooltip>
                        Auto refresh{" "}
                        {autoRefreshTables ? "enabled" : "disabled"}
                      </Tooltip>
                    </PopperHover>
                  )}
                </Box>
              )}
            </div>
          }
          shadow={!scrollAtTop}
        />

        <Content
          _loading={state.view === View.loading}
          ref={scrollerRef}
          onScroll={() => setScrollAtTop(scrollerRef?.current?.scrollTop === 0)}
        >
          <VirtualTables
            tables={tables ?? []}
            walTables={walTables}
            materializedViews={materializedViews}
            selectOpen={selectOpen}
            selectedTables={selectedTables}
            handleSelectToggle={handleSelectToggle}
            filterSuspendedOnly={filterSuspendedOnly}
            state={state}
            loadingError={loadingError}
          />
        </Content>
      </Wrapper>
    </SchemaProvider>
  )
}

const SchemaWithRef = (props: Props, ref: Ref<HTMLDivElement>) => (
  <Schema {...props} innerRef={ref} />
)

export default forwardRef(SchemaWithRef)
