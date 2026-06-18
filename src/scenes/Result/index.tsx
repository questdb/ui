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

import $ from "jquery"
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { useDispatch, useSelector } from "react-redux"
import styled from "styled-components"
import { Download2, Refresh } from "@styled-icons/remix-line"
import { Reset } from "@styled-icons/boxicons-regular"
import { HandPointLeft } from "@styled-icons/fa-regular"
import { TableFreezeColumn } from "@styled-icons/fluentui-system-filled"
import { Markdown } from "@styled-icons/bootstrap/Markdown"
import { Check } from "@styled-icons/bootstrap/Check"
import { ArrowDownS } from "@styled-icons/remix-line"
import { grid } from "../../js/console/grid"
import { quickVis } from "../../js/console/quick-vis"
import {
  Box,
  Button,
  PaneContent,
  PaneWrapper,
  PopperToggle,
  PrimaryToggleButton,
  Text,
  Tooltip,
} from "../../components"
import { actions, selectors } from "../../store"
import { color, ErrorResult, RawErrorResult } from "../../utils"
import * as QuestDB from "../../utils/questdb"
import { ResultViewMode } from "scenes/Console/types"
import type { IQuestDBGrid } from "../../js/console/grid.js"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { QuestContext } from "../../providers"
import { LINE_NUMBER_HARD_LIMIT } from "../Editor/Monaco"
import { QueryInNotification } from "../Editor/Monaco/query-in-notification"
import { NotificationType, RunningType } from "../../store/Query/types"
import { copyToClipboard } from "../../utils/copyToClipboard"
import { toast } from "../../components"
import { useQueryExecutionState } from "../../hooks/useQueryExecutionState"
import { API_VERSION } from "../../consts"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { ResultGridAdapter } from "./ResultGridAdapter"
import { type PaginationFn } from "./usePagedDataSource"
import { isMockPagination, mockPaginate, seedMock } from "./benchmarkMock"
import type { ResultGridRow } from "../../components/ResultGrid"

const Root = styled.div`
  display: flex;
  flex: 1;
  width: 100%;
`

const Wrapper = styled(PaneWrapper)`
  overflow: hidden;
`

const Content = styled(PaneContent)`
  flex: 1 1 0;
  color: ${color("foreground")};

  *::selection {
    background: ${color("red")};
    color: ${color("foreground")};
  }
`

const Actions = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: max-content;
  gap: 0.5rem;
  align-items: center;
  justify-content: flex-end;
  padding: 0 1rem;
  width: 100%;
  height: 4.5rem;
  border-bottom: 2px solid ${({ theme }) => theme.color.backgroundDarker};
  background: ${({ theme }) => theme.color.backgroundLighter};
`

const TableFreezeColumnIcon = styled(TableFreezeColumn)`
  transform: scaleX(-1);
`

const StyledPrimaryToggleButton = styled(PrimaryToggleButton)`
  padding: 0 1rem;
  height: 3rem;
  width: 4rem;
`

const RowCount = styled(Text)`
  margin-right: 1rem;
  line-height: 1.285;
`

const DownloadButton = styled(Button)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 1rem;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
`

const ArrowIcon = styled(ArrowDownS)<{ $open: boolean }>`
  transform: ${({ $open }) => ($open ? "rotate(180deg)" : "rotate(0deg)")};
`

const DownloadDropdownButton = styled(Button)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.5rem;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
`

const DownloadMenuItem = styled(Button)`
  display: flex;
  align-items: center;
  gap: 1.2rem;
  width: 100%;
  height: 3rem;
  padding: 0 1rem;
  font-size: 1.4rem;
`

const Result = ({ viewMode }: { viewMode: ResultViewMode }) => {
  const { quest, questExecution } = useContext(QuestContext)
  const [count, setCount] = useState<number | undefined>()
  const result = useSelector(selectors.query.getResult)
  const running = useSelector(selectors.query.getRunning)
  const { active: activeQueryExecution } = useQueryExecutionState()
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)
  const gridRef = useRef<IQuestDBGrid | null>(null)
  const runningRef = useRef(running)
  const [gridFreezeLeftState, setGridFreezeLeftState] = useState<number>(0)
  const [gridHasSelection, setGridHasSelection] = useState<boolean>(false)
  const [downloadMenuActive, setDownloadMenuActive] = useState<boolean>(false)
  const { useNewGrid } = useLocalStorage()
  const dispatch = useDispatch()

  // Shared by both grids. On a failed fetch it surfaces a notification and never
  // calls the renderer, leaving the failing page unloaded.
  const paginationFn = useCallback<PaginationFn>(
    async (sql, lo, hi, rendererFn) => {
      if (isMockPagination()) {
        mockPaginate(
          lo,
          hi,
          rendererFn as unknown as (d: { dataset: ResultGridRow[] }) => void,
        )
        return
      }
      try {
        const result = await quest.queryRaw(sql, {
          limit: `${lo},${hi}`,
          nm: true,
        })
        if (result.type === QuestDB.Type.DQL) {
          rendererFn(result)
        }
      } catch (err) {
        // Order of actions is important
        dispatch(
          actions.query.addNotification({
            query: `${sql}@${LINE_NUMBER_HARD_LIMIT + 1}-${LINE_NUMBER_HARD_LIMIT + 1}`,
            content: <Text color="red">{(err as ErrorResult).error}</Text>,
            sideContent: <QueryInNotification query={sql} />,
            type: NotificationType.ERROR,
            updateActiveNotification: true,
          }),
        )
        if (runningRef.current === RunningType.NONE) {
          dispatch(actions.query.stopRunning())
        }
      }
    },
    [],
  )

  useEffect(() => {
    runningRef.current = running
  }, [running])

  useEffect(() => {
    if (!useNewGrid) {
      gridRef.current = grid(document.getElementById("grid"), paginationFn)
    }

    quickVis(
      $("#quick-vis"),
      window.bus as unknown as ReturnType<typeof $>,
      quest,
      questExecution,
    )

    const _grid = gridRef.current
    if (!_grid) return

    const onSelectionChange = (event: CustomEvent<{ hasSelection: boolean }>) =>
      setGridHasSelection(event.detail.hasSelection)
    const onYieldFocus = () => eventBus.publish(EventType.MSG_EDITOR_FOCUS)
    const onFreezeState = (event: CustomEvent<{ freezeLeft: number }>) =>
      setGridFreezeLeftState(event.detail.freezeLeft)

    _grid.addEventListener("selection.change", onSelectionChange)
    _grid.addEventListener("yield.focus", onYieldFocus)
    _grid.addEventListener("freeze.state", onFreezeState)

    return () => {
      _grid.removeEventListener?.("selection.change", onSelectionChange)
      _grid.removeEventListener?.("yield.focus", onYieldFocus)
      _grid.removeEventListener?.("freeze.state", onFreezeState)
    }
  }, [])

  useEffect(() => {
    if (result?.type === QuestDB.Type.DQL) {
      setCount(result.count)
      gridRef?.current?.setData(result)
    }
  }, [result])

  // Benchmarking only: lets the harness seed either grid with a synthetic
  // rows x cols result without a real query. Inert unless mock.pagination is on.
  useEffect(() => {
    if (!isMockPagination()) return
    const benchSeed = (rows: number, cols: number) => {
      const seed = seedMock(rows, cols)
      setCount(seed.count)
      gridRef.current?.setData(seed)
    }
    const target = window as unknown as { __benchSeed?: typeof benchSeed }
    target.__benchSeed = benchSeed
    return () => {
      delete target.__benchSeed
    }
  }, [])

  useEffect(() => {
    const chart = document.getElementById("quick-vis")

    if (!chart) {
      return
    }

    if (viewMode === "grid") {
      chart.style.display = "none"
      gridRef?.current?.show()
    } else {
      gridRef?.current?.hide()
      chart.style.display = "flex"
    }
  }, [viewMode])

  useEffect(() => {
    gridRef?.current?.render()
  }, [activeSidebar])

  const [isCopied, setIsCopied] = useState<boolean>(false)

  const gridActions = [
    {
      tooltipText: "Copy current page to Markdown",
      trigger: (
        <Button
          data-hook="grid-toolbar-markdown"
          skin="transparent"
          onClick={() => {
            void trackEvent(ConsoleEvent.GRID_MARKDOWN_COPY)
            void copyToClipboard(
              gridRef?.current?.getResultAsMarkdown() as string,
            ).then(() => {
              setIsCopied(true)
              setTimeout(() => setIsCopied(false), 1000)
            })
          }}
        >
          {isCopied ? <Check size="18px" /> : <Markdown size="18px" />}
        </Button>
      ),
    },
    {
      tooltipText: "Freeze left column",
      trigger: (
        <StyledPrimaryToggleButton
          data-hook="grid-toolbar-freeze"
          // Keep the grid's keyboard focus and cell selection on the action.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            void trackEvent(ConsoleEvent.GRID_COLUMN_FREEZE)
            gridRef?.current?.toggleFreezeLeft()
            gridRef?.current?.focus()
          }}
          selected={gridFreezeLeftState > 0}
        >
          <TableFreezeColumnIcon size="18px" />
        </StyledPrimaryToggleButton>
      ),
    },
    {
      tooltipText: "Move selected column to the front",
      trigger: (
        <Button
          data-hook="grid-toolbar-move-front"
          skin="transparent"
          disabled={!gridHasSelection}
          // Do not lose focus of the grid
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            void trackEvent(ConsoleEvent.GRID_COLUMN_MOVE_TO_FRONT)
            gridRef?.current?.shuffleFocusedColumnToFront()
          }}
        >
          <HandPointLeft size="18px" />
        </Button>
      ),
    },
    {
      tooltipText: "Reset grid layout",
      trigger: (
        <Button
          data-hook="grid-toolbar-reset"
          skin="transparent"
          // Keep the grid's keyboard focus and cell selection on the action.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            void trackEvent(ConsoleEvent.GRID_LAYOUT_RESET)
            gridRef?.current?.clearCustomLayout()
          }}
        >
          <Reset size="18px" />
        </Button>
      ),
    },
    {
      tooltipText: "Refresh",
      trigger: (
        <Button
          data-hook="grid-toolbar-refresh"
          skin="transparent"
          disabled={activeQueryExecution !== null}
          onClick={() => {
            void trackEvent(ConsoleEvent.GRID_REFRESH)
            const sql = gridRef?.current?.getSQL()
            if (sql) {
              eventBus.publish(EventType.MSG_QUERY_EXEC, { q: sql })
            }
          }}
        >
          <Refresh size="18px" />
        </Button>
      ),
    },
  ]

  useEffect(() => {
    if (result?.type === QuestDB.Type.DQL) {
      setCount(result.count)
    }
  }, [result])

  const handleDownload = (format: "csv" | "parquet") => {
    void trackEvent(
      format === "parquet"
        ? ConsoleEvent.GRID_PARQUET_DOWNLOAD
        : ConsoleEvent.GRID_CSV_DOWNLOAD,
    )
    setDownloadMenuActive(false)
    const sql = gridRef?.current?.getSQL()
    if (!sql) {
      toast.error("No SQL query found to download")
      return
    }

    const url = `exp?${QuestDB.Client.encodeParams({
      query: sql,
      version: API_VERSION,
      fmt: format,
      filename: `questdb-query-${Date.now().toString()}`,
      ...(format === "parquet" ? { rmode: "nodelay" } : {}),
    })}`

    const iframe = document.createElement("iframe")
    iframe.style.display = "none"
    document.body.appendChild(iframe)

    iframe.onerror = (e) => {
      if (typeof e === "object") {
        toast.error(`An error occurred while downloading the file`)
      }
      const error = e as string
      toast.error(`An error occurred while downloading the file: ${error}`)
    }

    iframe.onload = () => {
      const content = iframe.contentDocument?.body?.textContent
      if (content) {
        let error = "An error occurred while downloading the file"
        try {
          const contentJson = JSON.parse(content) as RawErrorResult
          error += `: ${contentJson.error ?? content}`
        } catch (_) {
          error += `: ${content}`
        }
        toast.error(error)
      }
      document.body.removeChild(iframe)
    }

    iframe.src = url
  }

  return (
    <Root>
      <Wrapper>
        <Actions>
          {count && (
            <RowCount color="foreground">
              {`${count.toLocaleString()} row${count > 1 ? "s" : ""}`}
            </RowCount>
          )}
          {viewMode === "grid" &&
            gridActions.map((action) => (
              <Tooltip
                key={action.tooltipText}
                delay={350}
                placement="bottom"
                content={action.tooltipText}
              >
                {React.cloneElement(action.trigger, {
                  "aria-label": action.tooltipText,
                })}
              </Tooltip>
            ))}

          <Box gap="0">
            <DownloadButton
              skin="secondary"
              data-hook="download-parquet-button"
              onClick={() => handleDownload("parquet")}
            >
              <Box align="center" gap="0.5rem" style={{ lineHeight: "1.285" }}>
                <Download2 height="18px" width="18px" />
                Download as Parquet
              </Box>
            </DownloadButton>
            <PopperToggle
              active={downloadMenuActive}
              onToggle={setDownloadMenuActive}
              placement="bottom-end"
              modifiers={[
                {
                  name: "offset",
                  options: {
                    offset: [0, 4],
                  },
                },
              ]}
              trigger={
                <DownloadDropdownButton
                  skin="secondary"
                  data-hook="download-dropdown-button"
                >
                  <ArrowIcon size="18px" $open={downloadMenuActive} />
                </DownloadDropdownButton>
              }
            >
              <DownloadMenuItem
                data-hook="download-csv-button"
                skin="secondary"
                onClick={() => handleDownload("csv")}
              >
                Download as CSV
              </DownloadMenuItem>
            </PopperToggle>
          </Box>
        </Actions>

        <Content>
          {useNewGrid ? (
            <ResultGridAdapter ref={gridRef} paginationFn={paginationFn} />
          ) : (
            <div id="grid" />
          )}

          <div id="quick-vis">
            <div className="quick-vis-controls">
              <form className="v-fit">
                <div className="form-group">
                  <label htmlFor="_qvis_frm_chart_type">Chart type</label>
                  <select id="_qvis_frm_chart_type">
                    <option>bar</option>
                    <option>line</option>
                    <option>area</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="_qvis_frm_axis_x">Labels</label>
                  <select
                    id="_qvis_frm_axis_x"
                    data-hook="chart-panel-labels-select"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="_qvis_frm_axis_y">Series</label>
                  <select
                    id="_qvis_frm_axis_y"
                    data-hook="chart-panel-series-select"
                    multiple
                  />
                </div>
                <button
                  className="button-primary js-chart-draw"
                  id="_qvis_frm_draw"
                  data-hook="chart-panel-draw-button"
                >
                  <i className="icon icon-play" />
                  <span>Draw</span>
                </button>
              </form>
            </div>
            <div className="quick-vis-canvas" />
          </div>
        </Content>
      </Wrapper>
    </Root>
  )
}

export default Result
