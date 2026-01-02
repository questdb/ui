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
  Box,
  Button,
  PaneContent,
  PaneWrapper,
  PopperHover,
  PrimaryToggleButton,
  Tooltip,
} from "../../components"
import { actions } from "../../store"
import { copyToClipboard, ErrorResult } from "../../utils"
import * as QuestDB from "../../utils/questdb"
import { Panel } from "../../components/Panel"
import { QuestContext } from "../../providers"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { Toolbar } from "./Toolbar/toolbar"
import VirtualTables from "./VirtualTables"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { StoreKey } from "../../utils/localStorage/types"
import { Checkbox } from "./checkbox"
import { AddChart } from "@styled-icons/material"
import { useEditor } from "../../providers/EditorProvider"
import {
  metricDurations,
  MetricViewMode,
  RefreshRate,
} from "../../scenes/Editor/Metrics/utils"
import type { Duration } from "../../scenes/Editor/Metrics/types"
import { useSchema } from "./SchemaContext"
import { SchemaProvider } from "./SchemaContext"
import { TreeNodeKind } from "./Row"
import { toast } from "../../components/Toast"

type Props = Readonly<{
  hideMenu?: boolean
  style?: CSSProperties
  open?: boolean
}>

const loadingStyles = css`
  display: flex;
  justify-content: center;
`

const Wrapper = styled(PaneWrapper)<{
  open?: boolean
}>`
  overflow-x: auto;
  height: 100%;
  ${({ open }) =>
    !open &&
    css`
      display: none;
    `}
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
  const [materializedViews, setMaterializedViews] =
    useState<QuestDB.MaterializedView[]>()
  const [views, setViews] = useState<QuestDB.View[]>()
  const dispatch = useDispatch()
  const [filterSuspendedOnly, setFilterSuspendedOnly] = useState(false)
  const { autoRefreshTables, updateSettings } = useLocalStorage()
  const [focusListenerActive, setFocusListenerActive] = useState(false)
  const listenerActiveRef = useRef(false)
  const latestFocusChangeTimestampRef = useRef<number>(0)
  const { addBuffer } = useEditor()
  const { selectOpen, setSelectOpen, selectedTables, setSelectedTables } =
    useSchema()

  const fetchTables = async () => {
    try {
      const response = await quest.showTables()
      if (response && response.type === QuestDB.Type.DQL) {
        errorRef.current = null
        const data = response.data.map((item) => ({
          ...item,
          table_type: item.table_type ?? (item.matView ? "M" : "T"),
        }))
        setTables(data)
        dispatch(actions.query.setTables(data))
        // Fetch WAL info about the tables
        const walTablesResponse =
          await quest.query<QuestDB.WalTable>("wal_tables()")
        if (walTablesResponse && walTablesResponse.type === QuestDB.Type.DQL) {
          // Filter out the system tables
          setWalTables(
            walTablesResponse.data.filter((wt) =>
              response.data.map((t) => t.table_name).includes(wt.name),
            ),
          )
        }
        void fetchMaterializedViews()
        // we only need views() to get view state: invalid/valid + invalidation reason
        // so only fetch if there are views present - this avoids unnecessary errors on older servers
        if (data.some((t) => t.table_type === "V")) {
          void fetchViews()
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

  const fetchViews = async () => {
    try {
      const viewsResponse = await quest.showViews()
      if (viewsResponse && viewsResponse.type === QuestDB.Type.DQL) {
        setViews(viewsResponse.data)
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
        const response =
          await quest.query<QuestDB.InformationSchemaColumn>(query)

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
    const tablesWithError: { name: string; type: TreeNodeKind }[] = []
    const ddls = await Promise.all(
      selectedTables.map(async (table) => {
        try {
          // selectedTables only contains "table" | "matview" | "view" types from allSelectableTables
          const response =
            table.type === "matview"
              ? await quest.showMatViewDDL(table.name)
              : table.type === "view"
                ? await quest.showViewDDL(table.name)
                : await quest.showTableDDL(table.name)

          if (response?.type === QuestDB.Type.DQL && response.data?.[0]?.ddl) {
            return response.data[0].ddl
          }
          tablesWithError.push(table)
        } catch (error) {
          tablesWithError.push(table)
        }
      }),
    )
    if (tablesWithError.length === 0) {
      void copyToClipboard(ddls.join("\n\n"))
      toast.success("Schemas copied to clipboard")
    } else {
      const tableNames = tablesWithError
        .map((t) => t.name)
        .sort()
        .join(", ")
      toast.error(`Cannot copy schemas from tables: ${tableNames}`)
    }
    setSelectOpen(false)
  }

  const handleAddMetricsBuffer = useCallback(async () => {
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
  }, [addBuffer])

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
    const now = Date.now()
    if (
      listenerActiveRef.current &&
      now - latestFocusChangeTimestampRef.current > 10_000
    ) {
      latestFocusChangeTimestampRef.current = now
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

    // Default to 'T' (table) for backward compatibility with older servers
    const regularTables = tables
      .filter((t) => (t.table_type ?? "T") === "T")
      .map((t) => ({ name: t.table_name, type: "table" as TreeNodeKind }))

    const matViews = tables
      .filter((t) => t.table_type === "M")
      .map((t) => ({ name: t.table_name, type: "matview" as TreeNodeKind }))

    const viewsList = tables
      .filter((t) => t.table_type === "V")
      .map((t) => ({ name: t.table_name, type: "view" as TreeNodeKind }))

    return [...regularTables, ...matViews, ...viewsList]
  }, [tables])

  const suspendedTablesCount = useMemo(
    () => walTables?.filter((t) => t.suspended).length ?? 0,
    [walTables],
  )

  useEffect(() => {
    if (suspendedTablesCount === 0 && filterSuspendedOnly) {
      setFilterSuspendedOnly(false)
    }
  }, [suspendedTablesCount, filterSuspendedOnly])

  return (
    <Wrapper ref={innerRef} {...rest}>
      <Panel.Header
        afterTitle={
          <div
            style={{
              display: "flex",
              marginRight: "1rem",
              justifyContent: "space-between",
              flex: 1,
            }}
          >
            <Toolbar
              suspendedTablesCount={suspendedTablesCount}
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
                          if (
                            selectedTables.length === allSelectableTables.length
                          ) {
                            setSelectedTables([])
                          } else {
                            setSelectedTables(allSelectableTables)
                          }
                        }}
                      >
                        <Checkbox
                          visible
                          checked={
                            selectedTables.length === allSelectableTables.length
                          }
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
                      Auto refresh {autoRefreshTables ? "enabled" : "disabled"}
                    </Tooltip>
                  </PopperHover>
                )}
              </Box>
            )}
          </div>
        }
      />

      <Content _loading={state.view === View.loading}>
        <VirtualTables
          tables={tables ?? []}
          walTables={walTables}
          materializedViews={materializedViews}
          views={views}
          filterSuspendedOnly={filterSuspendedOnly}
          state={state}
          loadingError={loadingError}
        />
      </Content>
    </Wrapper>
  )
}

const SchemaWithRefAndProvider = (props: Props, ref: Ref<HTMLDivElement>) => (
  <SchemaProvider>
    <Schema {...props} innerRef={ref} />
  </SchemaProvider>
)

export default forwardRef(SchemaWithRefAndProvider)
