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
// @ts-nocheck

import "echarts/lib/chart/bar"
import "echarts/lib/chart/line"
import "echarts/lib/component/tooltip"
import "echarts/lib/component/title"
import * as echarts from "echarts/lib/echarts"
import { LegendComponent, GridComponent } from "echarts/components"

import $ from "jquery"
import SlimSelect from "slim-select"

import eChartsMacarons from "./utils/macarons"
import { arrayEquals } from "./array-equals"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"

echarts.use([LegendComponent, GridComponent])

export function quickVis(
  root: ReturnType<typeof jQuery>,
  msgBus: ReturnType<typeof jQuery>,
) {
  let bus = msgBus
  let div = root
  const btnDraw = $("#_qvis_frm_draw")
  let viewport
  let echart: echarts.ECharts
  let query: any
  let queryExecutionTimestamp: number
  let xAxis: unknown
  let yAxis: string | any[]
  let chartType: string | string[]
  const columnSet = new Set()
  const blankChartOptions = {
    title: {},
    tooltip: {},
    legend: {
      data: ["Series"],
    },
    xAxis: {
      data: [],
    },
    yAxis: {},
    series: [
      {
        name: "Y-axis",
        type: "bar",
        data: [],
      },
    ],
  }

  let cachedResponse: any
  let cachedQuery: any
  let hActiveRequest: JQuery.jqXHR<any> | null

  const chartTypePicker = new SlimSelect({
    select: "#_qvis_frm_chart_type",
  })

  const xAxisPicker = new SlimSelect({
    select: "#_qvis_frm_axis_x",
  })

  const yAxisPicker = new SlimSelect({
    select: "#_qvis_frm_axis_y",
  })

  function resize() {
    echart.resize()
  }

  function addToSet(array: string | any[], set: Set<unknown>) {
    for (let i = 0; i < array.length; i++) {
      set.add(array[i])
    }
  }

  function setDrawBtnToCancel() {
    btnDraw.html('<i class="icon icon-stop"></i><span>Cancel</span>')
    btnDraw.removeClass("js-chart-draw").addClass("js-chart-cancel")
  }

  function setDrawBtnToDraw() {
    btnDraw.html('<i class="icon icon-play"></i><span>Draw</span>')
    btnDraw.removeClass("js-chart-cancel").addClass("js-chart-draw")
  }

  // draw server response
  function draw(r: { columns: any; dataset: any }) {
    try {
      let i
      // create column name to index map
      const columns = r.columns
      const dataset = r.dataset
      if (columns && dataset) {
        const map = new Map()
        for (i = 0; i < columns.length; i++) {
          map.set(columns[i].name, i)
        }

        // prepare x-axis, there can only be one
        let optionXAxis
        if (xAxis != null) {
          let xAxisDataIndex = map.get(xAxis)
          // x-axis data
          const data = []
          for (i = 0; i < dataset.length; i++) {
            data[i] = dataset[i][xAxisDataIndex]
          }

          optionXAxis = {
            type: "category",
            name: xAxis,
            data: data,
          }
        } else {
          optionXAxis = {}
        }

        let series = []
        // prepare series data
        if (yAxis.length > 0) {
          for (i = 0; i < yAxis.length; i++) {
            const columnIndex = map.get(yAxis[i])
            if (columnIndex) {
              let seriesData = []
              for (let j = 0; j < dataset.length; j++) {
                seriesData[j] = dataset[j][columnIndex]
              }

              if (chartType === "area") {
                series[i] = {
                  type: "line",
                  name: yAxis[i],
                  data: seriesData,
                  areaStyle: {},
                  smooth: true,
                  symbol: "none",
                }
              } else {
                series[i] = {
                  name: yAxis[i],
                  type: chartType,
                  data: seriesData,
                  large: true,
                }
              }
            }
          }
        }
        const option = {
          tooltip: {
            trigger: "axis",
            axisPointer: {
              label: {
                show: false,
              },
            },
          },
          legend: {},
          xAxis: optionXAxis,
          yAxis: {
            type: "value",
          },
          series: series,
        }
        echart.setOption(option, true)
      }
    } finally {
      resize()
      setDrawBtnToDraw()
    }
  }

  function handleServerResponse(r) {
    hActiveRequest = null
    eventBus.publish(EventType.MSG_QUERY_OK, {
      delta: new Date().getTime() - queryExecutionTimestamp,
      count: r.count,
    })
    cachedResponse = r
    cachedQuery = query
    draw(r)
  }

  function handleServerError(r) {
    hActiveRequest = null
    setDrawBtnToDraw()
    eventBus.publish(EventType.MSG_QUERY_ERROR, {
      query: cachedQuery,
      r: r.responseJSON,
      status: r.status,
      statusText: r.statusText,
      delta: new Date().getTime() - queryExecutionTimestamp,
    })
  }

  function executeQueryAndDraw() {
    setDrawBtnToCancel()
    chartType = chartTypePicker.selected()

    // check if the only change is chart type
    const selectedXAxis = xAxisPicker.selected()
    const selectedYAxis = yAxisPicker.selected()

    if (
      arrayEquals(selectedXAxis, xAxis) &&
      arrayEquals(selectedYAxis, yAxis) &&
      query === cachedQuery
    ) {
      draw(cachedResponse)
    } else {
      // create set of unique column names that are necessary to build a chart
      columnSet.clear()

      // copy axis columns to set to remove duplicate column names
      // also make a copy of selected fields in case user updates controls while query is being executed
      xAxis = xAxisPicker.selected()
      if (xAxis) {
        columnSet.add(xAxis)
      }

      yAxis = yAxisPicker.selected()
      addToSet(yAxisPicker.selected(), columnSet)

      // expand the set into HTTP query parameter value
      // we only need columns used in chart rather than all columns in the result set
      let urlColumns = ""
      columnSet.forEach(function (value) {
        if (urlColumns !== "") {
          urlColumns += ","
        }
        urlColumns += value
      })

      const requestParams = {}
      requestParams.query = query
      requestParams.count = false
      requestParams.cols = urlColumns
      requestParams.src = "vis"
      // time the query because control that displays query success expected time delta
      queryExecutionTimestamp = new Date().getTime()
      hActiveRequest = $.get("exec", requestParams)
      eventBus.publish(EventType.MSG_QUERY_RUNNING)
      hActiveRequest.done(handleServerResponse).fail(handleServerError)
    }
  }

  function clearChart() {
    echart.setOption(blankChartOptions, true)
  }

  function updatePickers(data: { columns: any; query: any }) {
    let x = []
    const columns = data.columns
    for (let i = 0; i < columns.length; i++) {
      x[i] = { text: columns[i].name, value: columns[i].name }
    }
    xAxisPicker.setData(x)
    yAxisPicker.setData(x)

    yAxisPicker.set(x.slice(1).map((item) => item.text))

    // stash query text so that we can use this later to server for chart column values
    query = data.query
    clearChart()
  }

  function cancelDraw() {
    if (hActiveRequest) {
      hActiveRequest.abort()
      hActiveRequest = null
    }
  }

  function btnDrawClick() {
    if (hActiveRequest) {
      cancelDraw()
    } else {
      executeQueryAndDraw()
    }
    return false
  }

  function bind() {
    viewport = div.find(".quick-vis-canvas")[0]
    $(window).resize(resize)
    eventBus.subscribe(EventType.MSG_ACTIVE_SIDEBAR, resize)
    // @ts-ignore
    echart = echarts.init(viewport, eChartsMacarons)
    eventBus.subscribe(EventType.MSG_QUERY_DATASET, updatePickers)
    btnDraw.click(btnDrawClick)
    clearChart()
  }

  bind()
  resize()
}
