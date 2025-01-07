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
} from "react"
import { useDispatch } from "react-redux"
import styled, { css } from "styled-components"
import {
  CheckboxCircle,
  Close,
  FileCopy,
  Loader3,
  Refresh,
} from "@styled-icons/remix-line"
import {
  PaneContent,
  PaneWrapper,
  PopperHover,
  PrimaryToggleButton,
  spinAnimation,
  Text,
  Tooltip,
} from "../../components"
import { actions } from "../../store"
import { color, copyToClipboard, ErrorResult } from "../../utils"
import * as QuestDB from "../../utils/questdb"
import Table from "./Table"
import LoadingError from "./LoadingError"
import { Box } from "../../components/Box"
import { Button } from "@questdb/react-components"
import { Panel } from "../../components/Panel"
import { QuestContext } from "../../providers"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { Toolbar } from "./Toolbar/toolbar"
import { SchemaContext } from "./SchemaContext"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { StoreKey } from "../../utils/localStorage/types"
import { NotificationType } from "../../types"
import { Checkbox } from "./checkbox"

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
  display: block;
  overflow: auto;
  ${({ _loading }) => _loading && loadingStyles};
`

const Loader = styled(Loader3)`
  margin-left: 1rem;
  align-self: center;
  color: ${color("foreground")};
  ${spinAnimation};
`

const FlexSpacer = styled.div`
  flex: 1;
`

const ToolbarToggleButton = styled(PrimaryToggleButton)`
  &&:not(:disabled) {
    width: auto;
    padding: 0 1rem;
    height: 3rem;
  }
`

const Loading = () => {
  const [loaderShown, setLoaderShown] = useState(false)
  // Show the loader only for delayed fetching process
  useEffect(() => {
    const timeout = setTimeout(() => setLoaderShown(true), 1000)
    return () => clearTimeout(timeout)
  }, [])

  return loaderShown ? <Loader size="22px" /> : null
}

enum View {
  loading,
  error,
  ready,
}

type State = { view: View; loadingError?: ErrorResult }

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
  const [opened, setOpened] = useState<string>()
  const [isScrolling, setIsScrolling] = useState(false)
  const dispatch = useDispatch()
  const [scrollAtTop, setScrollAtTop] = useState(true)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [query, setQuery] = useState("")
  const [filterSuspendedOnly, setFilterSuspendedOnly] = useState(false)
  const { autoRefreshTables, updateSettings } = useLocalStorage()
  const [selectOpen, setSelectOpen] = useState(false)
  const [selectedTables, setSelectedTables] = useState<string[]>([])
  const [focusListenerActive, setFocusListenerActive] = useState(false)
  const listenerActiveRef = useRef(false)

  const handleChange = (name: string) => {
    setOpened(name === opened ? undefined : name)
  }

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
    let tablesWithError: string[] = []
    const ddls = await Promise.all(
      selectedTables.map(async (table) => {
        try {
          const tableDDLResponse = await quest.query<{ ddl: string }>(
            `SHOW CREATE TABLE ${table}`,
          )
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

  const handleSelectToggle = (table_name: string) => {
    if (selectedTables.includes(table_name)) {
      setSelectedTables(selectedTables.filter((t) => t !== table_name))
    } else {
      setSelectedTables([...selectedTables, table_name])
    }
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

  const focusListener = () => {
    if (listenerActiveRef.current) {
      void fetchTables()
      void fetchColumns()
    }
  }

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

  const views: { [key in View]: () => React.ReactNode } = {
    [View.loading]: () => <Loading />,
    [View.error]: () =>
      loadingError ? <LoadingError error={loadingError} /> : <FlexSpacer />,
    [View.ready]: () => (
      <>
        {tables && tables.length > 0 && (
          <Toolbar
            suspendedTablesCount={
              walTables?.filter((t) => t.suspended).length ?? 0
            }
            filterSuspendedOnly={filterSuspendedOnly}
            setFilterSuspendedOnly={setFilterSuspendedOnly}
          />
        )}
        {tables &&
          tables
            .filter((table: QuestDB.Table) => {
              const normalizedTableName = table.table_name.toLowerCase()
              const normalizedQuery = query.toLowerCase()
              return (
                normalizedTableName.includes(normalizedQuery) &&
                (filterSuspendedOnly
                  ? table.walEnabled &&
                    walTables?.find((t) => t.name === table.table_name)
                      ?.suspended
                  : true)
              )
            })
            .map((table: QuestDB.Table) => (
              <Table
                designatedTimestamp={table.designatedTimestamp}
                expanded={table.table_name === opened}
                isScrolling={isScrolling}
                key={table.table_name}
                table_name={table.table_name}
                onChange={handleChange}
                partitionBy={table.partitionBy}
                ttlValue={table.ttlValue}
                ttlUnit={table.ttlUnit}
                walEnabled={table.walEnabled}
                walTableData={walTables?.find(
                  (wt) => wt.name === table.table_name,
                )}
                dedup={table.dedup}
                selectOpen={selectOpen}
                selected={selectedTables.includes(table.table_name)}
                onSelectToggle={handleSelectToggle}
              />
            ))}
      </>
    ),
  }

  return (
    <SchemaContext.Provider value={{ query, setQuery }}>
      <Wrapper ref={innerRef} {...rest}>
        <Panel.Header
          title="Tables"
          afterTitle={
            <div style={{ display: "flex", marginRight: "1rem" }}>
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
                            selectedTables.length === tables?.length
                              ? setSelectedTables([])
                              : setSelectedTables(
                                  tables?.map((t) => t.table_name) ?? [],
                                )
                          }}
                        >
                          <Checkbox
                            visible={true}
                            checked={selectedTables.length === tables?.length}
                          />
                        </Button>
                      }
                    >
                      <Tooltip>
                        {selectedTables.length === tables?.length
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
          {views[state.view]()}
        </Content>
      </Wrapper>
    </SchemaContext.Provider>
  )
}

const SchemaWithRef = (props: Props, ref: Ref<HTMLDivElement>) => (
  <Schema {...props} innerRef={ref} />
)

export default forwardRef(SchemaWithRef)
