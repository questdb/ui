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
  Add,
  FileCopy,
  Loader3,
  Refresh,
  Settings4,
} from "@styled-icons/remix-line"
import { CheckboxCircle } from "@styled-icons/remix-fill"
import {
  PaneContent,
  PaneWrapper,
  PopperHover,
  spinAnimation,
  Tooltip,
  Text,
} from "../../components"
import { actions } from "../../store"
import { color, copyToClipboard, ErrorResult, isServerError } from "../../utils"
import * as QuestDB from "../../utils/questdb"
import Table from "./Table"
import LoadingError from "./LoadingError"
import { Box } from "../../components/Box"
import { Button, DropdownMenu, ForwardRef } from "@questdb/react-components"
import { Panel } from "../../components/Panel"
import { QuestContext } from "../../providers"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { formatTableSchemaQueryResult } from "./Table/ContextualMenu/services"
import { Toolbar } from "./Toolbar/toolbar"
import { SchemaContext } from "./SchemaContext"

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

const StyledCheckboxCircle = styled(CheckboxCircle)`
  position: absolute;
  transform: translate(75%, -75%);
  color: ${({ theme }) => theme.color.green};
`

const DropdownMenuContent = styled(DropdownMenu.Content)`
  z-index: 100;
  background: ${({ theme }) => theme.color.backgroundDarker};
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
  const [copied, setCopied] = useState(false)
  const [query, setQuery] = useState("")
  const [filterSuspendedOnly, setFilterSuspendedOnly] = useState(false)
  const [columns, setColumns] = useState<QuestDB.InformationSchemaColumn[]>()
  const [dropdownOpen, setDropdownOpen] = useState(false)

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
    try {
      const response = await quest.query<QuestDB.InformationSchemaColumn>(
        "information_schema.columns()",
      )
      if (response && response && response.type === QuestDB.Type.DQL) {
        setColumns(response.data)
        dispatch(actions.query.setColumns(response.data))
      }
    } catch (error) {
      dispatchState({
        view: View.error,
      })
    }
  }

  const copySchemasToClipboard = async () => {
    if (!tables) return
    const ddls = await Promise.all(
      tables.map(async (table) => {
        const columnResponse = await quest.showColumns(table.table_name)
        if (
          columnResponse.type === QuestDB.Type.DQL &&
          columnResponse.data.length > 0
        ) {
          return formatTableSchemaQueryResult(
            table.table_name,
            table.partitionBy,
            columnResponse.data,
            table.walEnabled,
            table.dedup,
          )
        }
      }),
    )
    copyToClipboard(ddls.join("\n\n"))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    void fetchTables()
    void fetchColumns()

    eventBus.subscribe(EventType.MSG_QUERY_SCHEMA, () => {
      void fetchTables()
      void fetchColumns()
    })

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

    window.addEventListener("focus", () => {
      void fetchTables()
      void fetchColumns()
    })

    return () =>
      window.removeEventListener("focus", () => {
        void fetchTables()
        void fetchColumns()
      })
  }, [])

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
                walEnabled={table.walEnabled}
                walTableData={walTables?.find(
                  (wt) => wt.name === table.table_name,
                )}
                dedup={table.dedup}
              />
            ))}
        <FlexSpacer />
      </>
    ),
  }

  return (
    <SchemaContext.Provider value={{ query, setQuery }}>
      <Wrapper ref={innerRef} {...rest}>
        <Panel.Header
          title="Tables"
          afterTitle={
            <div style={{ display: "flex" }}>
              {tables && (
                <Box align="center" gap="0.5rem">
                  <DropdownMenu.Root
                    modal={false}
                    onOpenChange={setDropdownOpen}
                  >
                    <DropdownMenu.Trigger asChild>
                      <ForwardRef>
                        <PopperHover
                          delay={350}
                          placement="right"
                          trigger={
                            <Button
                              skin="transparent"
                              data-hook="schema-settings-button"
                            >
                              {copied && <StyledCheckboxCircle size="14px" />}
                              <Settings4 size="18px" />
                            </Button>
                          }
                        >
                          <Tooltip>Settings</Tooltip>
                        </PopperHover>
                      </ForwardRef>
                    </DropdownMenu.Trigger>

                    <DropdownMenu.Portal>
                      <DropdownMenuContent>
                        {tables.length > 0 && (
                          <DropdownMenu.Item
                            onClick={copySchemasToClipboard}
                            data-hook="schema-copy-all"
                          >
                            <FileCopy size="18px" />
                            <Text color="foreground">
                              Copy schemas to clipboard
                            </Text>
                          </DropdownMenu.Item>
                        )}
                        <DropdownMenu.Item
                          onClick={fetchTables}
                          data-hook="schema-refresh"
                        >
                          <Refresh size="18px" />
                          <Text color="foreground">Refresh tables</Text>
                        </DropdownMenu.Item>
                      </DropdownMenuContent>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
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
