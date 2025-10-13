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
import React, { useContext, useEffect, useRef, useState } from "react"
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
  PaneContent,
  PaneWrapper,
  PopperHover,
  PopperToggle,
  PrimaryToggleButton,
  Text,
  Tooltip,
} from "../../components"
import { actions, selectors } from "../../store"
import { color, ErrorResult, QueryRawResult } from "../../utils"
import * as QuestDB from "../../utils/questdb"
import { ResultViewMode } from "scenes/Console/types"
import { Button, Box } from "@questdb/react-components"
import type { IQuestDBGrid } from "../../js/console/grid.js"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { QuestContext } from "../../providers"
import { LINE_NUMBER_HARD_LIMIT } from "../Editor/Monaco"
import { QueryInNotification } from "../Editor/Monaco/query-in-notification"
import { NotificationType } from "../../store/Query/types"
import { copyToClipboard } from "../../utils/copyToClipboard"
import { toast, LoadingSpinner } from "../../components"

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
  gap: 0;
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

const RowCount = styled(Text)`
  margin-right: 1rem;
`

const DownloadButton = styled(Button)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-right: 0.7rem;
`

const DownloadMenu = styled.div`
  min-width: 200px;
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 1px solid ${({ theme }) => theme.color.gray1};
  border-radius: 0.4rem;
  overflow: hidden;
`

const DownloadMenuItem = styled.button`
  display: flex;
  align-items: center;
  gap: 1.2rem;
  width: 100%;
  padding: 0.75rem 1rem;
  text-align: left;
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.color.foreground};
  cursor: pointer;
  font-size: 13px;

  &:hover {
    background: ${({ theme }) => theme.color.selection};
  }
`

const Result = ({ viewMode }: { viewMode: ResultViewMode }) => {
  const { quest } = useContext(QuestContext)
  const [count, setCount] = useState<number | undefined>()
  const [downloadingQueries, setDownloadingQueries] = useState<Set<string>>(new Set())
  const [currentQuery, setCurrentQuery] = useState<string | undefined>()
  const result = useSelector(selectors.query.getResult)
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)
  const gridRef = useRef<IQuestDBGrid | undefined>()
  const [gridFreezeLeftState, setGridFreezeLeftState] = useState<number>(0)
  const [downloadMenuActive, setDownloadMenuActive] = useState<boolean>(false)
  const dispatch = useDispatch()

  useEffect(() => {
    const _grid = grid(
      document.getElementById("grid"),
      async function (sql, lo, hi, rendererFn: (data: QueryRawResult) => void) {
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
          dispatch(actions.query.stopRunning())
        }
      },
    )
    gridRef.current = _grid
    quickVis(
      $("#quick-vis"),
      window.bus as unknown as ReturnType<typeof $>,
      quest,
    )

    _grid.addEventListener("header.click", function (event: CustomEvent) {
      eventBus.publish(
        EventType.MSG_EDITOR_INSERT_COLUMN,
        event.detail.columnName,
      )
    })

    _grid.addEventListener("yield.focus", function () {
      eventBus.publish(EventType.MSG_EDITOR_FOCUS)
    })

    _grid.addEventListener("freeze.state", function (event: CustomEvent) {
      setGridFreezeLeftState(event.detail.freezeLeft)
    })
  }, [])

  useEffect(() => {
    if (result?.type === QuestDB.Type.DQL) {
      setCount(result.count)
      gridRef?.current?.setData(result)
    }
  }, [result])

  useEffect(() => {
    const grid = document.getElementById("grid")
    const chart = document.getElementById("quick-vis")

    if (!grid || !chart) {
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
      tooltipText: "Copy result to Markdown",
      trigger: (
        <PrimaryToggleButton
          onClick={() => {
            copyToClipboard(gridRef?.current?.getResultAsMarkdown() as string)
              .then(() => {
                setIsCopied(true)
                setTimeout(() => setIsCopied(false), 1000)
              })
          }}
        >
          {isCopied ? <Check size="18px" /> : <Markdown size="18px" />}
        </PrimaryToggleButton>
      ),
    },
    {
      tooltipText: "Freeze left column",
      trigger: (
        <PrimaryToggleButton
          onClick={() => {
            gridRef?.current?.toggleFreezeLeft()
            gridRef?.current?.focus()
          }}
          selected={gridFreezeLeftState > 0}
        >
          <TableFreezeColumnIcon size="18px" />
        </PrimaryToggleButton>
      ),
    },
    {
      tooltipText: "Move selected column to the front",
      trigger: (
        <Button
          skin="transparent"
          onClick={gridRef?.current?.shuffleFocusedColumnToFront}
        >
          <HandPointLeft size="18px" />
        </Button>
      ),
    },
    {
      tooltipText: "Reset grid layout",
      trigger: (
        <Button
          skin="transparent"
          onClick={gridRef?.current?.clearCustomLayout}
        >
          <Reset size="18px" />
        </Button>
      ),
    },
    {
      tooltipText: "Refresh",
      trigger: (
        <Button
          skin="transparent"
          onClick={() => {
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
      setCurrentQuery(result.query)
    }
  }, [result])

  const handleDownload = async (format: "csv" | "parquet") => {
    setDownloadMenuActive(false)
    const sql = gridRef?.current?.getSQL()
    if (sql) {
      try {
        setDownloadingQueries((prev) => {
          prev.add(sql)
          return new Set(prev)
        })
        await quest.exportQuery(sql, format)
      } catch (error) {
        toast.error((error as Error).message)
      } finally {
        setDownloadingQueries((prev) => {
          prev.delete(sql)
          return new Set(prev)
        })
      }
    } else {
      toast.error("No SQL query found")
    }
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
            gridActions.map((action, index) => (
              <PopperHover
                key={index}
                delay={350}
                placement="bottom"
                trigger={action.trigger}
              >
                <Tooltip>{action.tooltipText}</Tooltip>
              </PopperHover>
            ))}

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
              <DownloadButton skin="secondary" data-hook="result-download-button" disabled={!!currentQuery && downloadingQueries.has(currentQuery)}>
                {currentQuery && downloadingQueries.has(currentQuery) ? (
                  <Box align="center" gap="0.5rem" data-hook="download-loading-indicator">
                    <LoadingSpinner size="18px" />
                    <Text color="offWhite">Preparing the file</Text>
                  </Box>
                ) : (
                  <>
                    <Download2 size="18px" />
                    Download
                    <ArrowDownS size="18px" />
                  </>
                )}
              </DownloadButton>
            }
          >
            <DownloadMenu>
              <DownloadMenuItem onClick={() => handleDownload("parquet")} data-hook="download-parquet-button">
                <img src="assets/parquet-file.svg" alt="Parquet" width={18} height={18} />
                Download as Parquet
              </DownloadMenuItem>
              <DownloadMenuItem onClick={() => handleDownload("csv")} data-hook="download-csv-button">
                <img src="/assets/csv-file.svg" alt="CSV" width={18} height={18} />
                Download as CSV
              </DownloadMenuItem>
            </DownloadMenu>
          </PopperToggle>
        </Actions>

        <Content>
          <div id="grid" />

          <div id="quick-vis">
            <div className="quick-vis-controls">
              <form className="v-fit" role="form">
                <div className="form-group">
                  <label>Chart type</label>
                  <select id="_qvis_frm_chart_type">
                    <option>bar</option>
                    <option>line</option>
                    <option>area</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Labels</label>
                  <select
                    id="_qvis_frm_axis_x"
                    data-hook="chart-panel-labels-select"
                  />
                </div>
                <div className="form-group">
                  <label>Series</label>
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
