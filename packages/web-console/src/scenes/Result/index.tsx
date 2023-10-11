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
import React, { useCallback, useEffect, useRef, useState } from "react"
import { useSelector } from "react-redux"
import styled from "styled-components"
import { Download2, Refresh } from "@styled-icons/remix-line"
import { Reset } from "@styled-icons/boxicons-regular"
import { HandPointLeft } from "@styled-icons/fa-regular"
import { TableFreezeColumn } from "@styled-icons/fluentui-system-filled"
import { grid } from "../../js/console/grid"
import { quickVis } from "../../js/console/quick-vis"
import {
  PaneContent,
  PaneWrapper,
  PopperHover,
  Text,
  Tooltip,
  useScreenSize,
} from "../../components"
import { selectors } from "../../store"
import { color } from "../../utils"
import * as QuestDB from "../../utils/questdb"
import { BusEvent } from "../../consts"
import { ViewMode } from "scenes/Console/types"
import { Button } from "@questdb/react-components"

const Root = styled.div`
  display: flex;
  flex: 1;
  width: 100%;
`

const Wrapper = styled(PaneWrapper)`
  overflow: hidden;
  width: calc(100vw - 4rem - 5.8rem - 4.5rem); /* substract both sidebars */
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
  gap: 1rem;
  align-items: center;
  justify-content: flex-end;
  width: 100%;
  height: 4.5rem;
  background: ${({ theme }) => theme.color.backgroundDarker};
`

const TableFreezeColumnIcon = styled(TableFreezeColumn)`
  transform: scaleX(-1);
`

const RowCount = styled(Text)`
  margin-right: 1rem;
`

const Result = ({ viewMode }: { viewMode: ViewMode }) => {
  const [count, setCount] = useState<number | undefined>()
  const { sm } = useScreenSize()
  const result = useSelector(selectors.query.getResult)
  const activePanel = useSelector(selectors.console.getActivePanel)
  const gridRef = useRef<any | undefined>()
  const [gridFreezeLeftState, setGridFreezeLeftState] = useState<number>(0)

  useEffect(() => {
    const _grid = grid(
      document.getElementById("grid"),
      function (sql, lo, hi, rendererFn: (data: any) => void) {
        fetch(
          "/exec?query=" +
            encodeURIComponent(sql) +
            "&limit=" +
            lo +
            "," +
            hi +
            "&nm=true",
        )
          .then((response) => response.json())
          .then(rendererFn)
      },
    )
    gridRef.current = _grid
    quickVis($("#quick-vis"), window.bus as unknown as ReturnType<typeof $>)

    bus.on(BusEvent.GRID_FOCUS, function () {
      _grid.focus()
    })

    bus.on(BusEvent.MSG_QUERY_DATASET, function (x, data) {
      _grid.setData(data)
    })

    _grid.addEventListener("header.click", function (event: CustomEvent) {
      bus.trigger("editor.insert.column", event.detail.columnName)
    })

    _grid.addEventListener("yield.focus", function () {
      bus.trigger(BusEvent.MSG_EDITOR_FOCUS)
    })

    _grid.addEventListener("freeze.state", function (event: CustomEvent) {
      setGridFreezeLeftState(event.detail.freezeLeft)
    })
  }, [])

  const handleExportClick = useCallback(() => {
    const sql = gridRef.current.getSQL()
    if (sql) {
      bus.trigger(BusEvent.MSG_QUERY_EXPORT, { q: sql })
    }
  }, [])

  const handleRefreshClick = useCallback(() => {
    const sql = gridRef.current.getSQL()
    if (sql) {
      bus.trigger(BusEvent.MSG_QUERY_EXEC, { q: sql })
    }
  }, [])

  const handleGridLayoutResetClick = useCallback(() => {
    gridRef.current.clearCustomLayout()
  }, [])

  const handleShuffleGridColumnToFrontClick = useCallback(() => {
    gridRef.current.shuffleFocusedColumnToFront()
  }, [])

  const handleGridColumnFreezeGridColumnToggle = useCallback(() => {
    gridRef.current.toggleFreezeLeft()
    gridRef.current.focus()
  }, [])

  useEffect(() => {
    if (result?.type === QuestDB.Type.DQL) {
      setCount(result.count)
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
      gridRef.current.show()
    } else {
      gridRef.current.hide()
      chart.style.display = "flex"
    }
  }, [viewMode])

  useEffect(() => {
    if (activePanel === "console") {
      gridRef.current.render()
    }
  }, [activePanel])

  const gridActions = [
    {
      tooltipText: "Freeze left column",
      trigger: (
        <Button
          skin={gridFreezeLeftState > 0 ? "success" : "secondary"}
          onClick={handleGridColumnFreezeGridColumnToggle}
        >
          <TableFreezeColumnIcon size="18px" />
        </Button>
      ),
    },
    {
      tooltipText: "Move selected column to the front",
      trigger: (
        <Button skin="secondary" onClick={handleShuffleGridColumnToFrontClick}>
          <HandPointLeft size="18px" />
        </Button>
      ),
    },
    {
      tooltipText: "Reset grid layout",
      trigger: (
        <Button skin="secondary" onClick={handleGridLayoutResetClick}>
          <Reset size="18px" />
        </Button>
      ),
    },
    {
      tooltipText: "Refresh",
      trigger: (
        <Button skin="secondary" onClick={handleRefreshClick}>
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

          <PopperHover
            delay={350}
            placement="bottom"
            trigger={
              <Button skin="secondary" onClick={handleExportClick}>
                <Download2 size="18px" />
              </Button>
            }
          >
            <Tooltip>Download result as a CSV file</Tooltip>
          </PopperHover>
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
                  <select id="_qvis_frm_axis_x" />
                </div>
                <div className="form-group">
                  <label>Series</label>
                  <select id="_qvis_frm_axis_y" multiple />
                </div>
                <button
                  className="button-primary js-chart-draw"
                  id="_qvis_frm_draw"
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
