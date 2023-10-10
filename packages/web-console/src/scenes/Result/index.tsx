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
import { Download2, Grid, PieChart, Refresh } from "@styled-icons/remix-line"
import { Reset } from "@styled-icons/boxicons-regular"
import { HandPointLeft } from "@styled-icons/fa-regular"
import { TableFreezeColumn } from "@styled-icons/fluentui-system-filled"

import { grid } from "../../js/console/grid"
import { quickVis } from "../../js/console/quick-vis"

import {
  PaneContent,
  PaneMenu,
  PaneWrapper,
  PopperHover,
  PrimaryToggleButton,
  SecondaryButton,
  Text,
  Tooltip,
  useScreenSize,
} from "../../components"
import { selectors } from "../../store"
import { color } from "../../utils"
import * as QuestDB from "../../utils/questdb"
import { BusEvent } from "../../consts"

const Menu = styled(PaneMenu)`
  justify-content: space-between;
`

const Wrapper = styled(PaneWrapper)`
  overflow: hidden;
`

const Content = styled(PaneContent)`
  color: ${color("foreground")};

  *::selection {
    background: ${color("red")};
    color: ${color("foreground")};
  }
`

const ButtonWrapper = styled.div`
  display: flex;
  align-items: center;
`

const RowCount = styled(Text)`
  margin-right: 2rem;
`

const RefreshButton = styled(SecondaryButton)`
  margin-right: 1rem;
`

const ResetGridLayoutButton = styled(SecondaryButton)`
  margin-right: 1rem;
`

const ShuffleGridColumnToFrontButton = styled(SecondaryButton)`
  margin-right: 1rem;
`

const ToggleGridColumnFreezeButton = styled(PrimaryToggleButton)`
  height: 4rem;
  width: 4.5rem;
  margin-right: 1rem;
`

const TableFreezeColumnIcon = styled(TableFreezeColumn)`
  transform: scaleX(-1);
`
const ToggleButton = styled(PrimaryToggleButton)`
  height: 4rem;
  width: 8.5rem;
`

const Result = () => {
  const [selected, setSelected] = useState<"chart" | "grid">("grid")
  const [count, setCount] = useState<number | undefined>()
  const { sm } = useScreenSize()
  const result = useSelector(selectors.query.getResult)
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

    bus.on(BusEvent.MSG_ACTIVE_PANEL, function () {
      _grid.render()
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

  const handleChartClick = useCallback(() => {
    setSelected("chart")
  }, [])

  const handleGridClick = useCallback(() => {
    setSelected("grid")
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

    if (selected === "grid") {
      chart.style.display = "none"
      gridRef.current.show()
    } else {
      gridRef.current.hide()
      chart.style.display = "flex"
    }
  }, [selected])

  return (
    <Wrapper>
      <Menu>
        <ButtonWrapper>
          <ToggleButton
            onClick={handleGridClick}
            selected={selected === "grid"}
          >
            <Grid size="18px" />
            <span>Grid</span>
          </ToggleButton>

          <ToggleButton
            onClick={handleChartClick}
            selected={selected === "chart"}
          >
            <PieChart size="18px" />
            <span>Chart</span>
          </ToggleButton>
        </ButtonWrapper>

        <ButtonWrapper>
          {count && !sm && (
            <RowCount color="foreground">
              {`${count.toLocaleString()} row${count > 1 ? "s" : ""}`}
            </RowCount>
          )}

          {!sm && (
            <PopperHover
              delay={350}
              placement="bottom"
              trigger={
                <ToggleGridColumnFreezeButton
                  onClick={handleGridColumnFreezeGridColumnToggle}
                  selected={gridFreezeLeftState > 0}
                >
                  <TableFreezeColumnIcon size="18px" />
                </ToggleGridColumnFreezeButton>
              }
            >
              <Tooltip>Freeze left column</Tooltip>
            </PopperHover>
          )}

          {!sm && (
            <PopperHover
              delay={350}
              placement="bottom"
              trigger={
                <ShuffleGridColumnToFrontButton
                  onClick={handleShuffleGridColumnToFrontClick}
                >
                  <HandPointLeft size="18px" />
                </ShuffleGridColumnToFrontButton>
              }
            >
              <Tooltip>Move selected column to the front</Tooltip>
            </PopperHover>
          )}

          {!sm && (
            <PopperHover
              delay={350}
              placement="bottom"
              trigger={
                <ResetGridLayoutButton onClick={handleGridLayoutResetClick}>
                  <Reset size="18px" />
                </ResetGridLayoutButton>
              }
            >
              <Tooltip>Reset grid layout</Tooltip>
            </PopperHover>
          )}

          {!sm && (
            <PopperHover
              delay={350}
              placement="bottom"
              trigger={
                <RefreshButton onClick={handleRefreshClick}>
                  <Refresh size="18px" />
                </RefreshButton>
              }
            >
              <Tooltip>Refresh</Tooltip>
            </PopperHover>
          )}

          <PopperHover
            delay={350}
            placement="bottom"
            trigger={
              <SecondaryButton onClick={handleExportClick}>
                <Download2 size="18px" />
                <span>CSV</span>
              </SecondaryButton>
            }
          >
            <Tooltip>Download result as a CSV file</Tooltip>
          </PopperHover>
        </ButtonWrapper>
      </Menu>

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
  )
}

export default Result
