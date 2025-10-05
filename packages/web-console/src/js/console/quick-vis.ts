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
import * as QuestDB from "../../utils/questdb"
import { AnyIfEmpty } from "react-redux"
import { request } from "http"

echarts.use([LegendComponent, GridComponent])

export function quickVis(
  root: ReturnType<typeof jQuery>,
  msgBus: ReturnType<typeof jQuery>,
  quest: QuestDB.Client,
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
  let cachedQuery: AnyIfEmpty
  let requestActive: boolean = false
  let selectedTimeFormat: string = "auto"

  const chartTypePicker = new SlimSelect({
    select: "#_qvis_frm_chart_type",
  })

  const xAxisPicker = new SlimSelect({
    select: "#_qvis_frm_axis_x",
  })

  const yAxisPicker = new SlimSelect({
    select: "#_qvis_frm_axis_y",
  })

  const timeFormatPicker = new SlimSelect({
    select: "#_qvis_frm_time_format",
  })

  function resize() {
    echart.resize()
  }

  function addToSet(array: string | any[], set: Set<unknown>) {
    for (let i = 0; i < array.length; i++) {
      set.add(array[i])
    }
  }

  function detectTimeColumns(columns: any[]) {
    return columns.filter(col => {
      // Detect timestamp columns by type or name patterns
      return col.type === 'TIMESTAMP' || 
             col.type === 'TIMESTAMP_NS' ||
             /timestamp|time|date|created|updated/i.test(col.name)
    })
  }

  function isValidTimestamp(value: any): boolean {
    if (typeof value === 'string') {
      const parsed = Date.parse(value)
      return !isNaN(parsed) && parsed > 0
    }
    if (typeof value === 'number') {
      return value > 0 && value < 9999999999999 // Reasonable timestamp range
    }
    return false
  }

  function formatTimestamp(timestamp: any, format: string): string {
    let date: Date
    
    if (typeof timestamp === 'string') {
      date = new Date(timestamp)
    } else if (typeof timestamp === 'number') {
      date = new Date(timestamp)
    } else {
      return timestamp.toString()
    }

    if (isNaN(date.getTime())) {
      return timestamp.toString()
    }

    switch (format) {
      case 'HH:mm:ss':
        return date.toLocaleTimeString('en-US', { hour12: false })
      case 'HH:mm':
        return date.toLocaleTimeString('en-US', { hour12: false, second: undefined })
      case 'yyyy-MM-dd HH:mm:ss':
        return date.toLocaleString('sv-SE') // ISO-like format
      case 'MM/dd HH:mm':
        return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) + 
               ' ' + date.toLocaleTimeString('en-US', { hour12: false, second: undefined })
      case 'MMM dd, yyyy':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      case 'relative':
        return formatRelativeTime(date.getTime())
      case 'auto':
      default:
        return autoDetectTimeFormat(date.getTime())
    }
  }

  function formatRelativeTime(timestamp: number): string {
    const now = new Date().getTime()
    const diff = now - timestamp
    const absDiff = Math.abs(diff)
    
    if (absDiff < 60000) return `${Math.floor(absDiff/1000)}s ago`
    if (absDiff < 3600000) return `${Math.floor(absDiff/60000)}m ago`
    if (absDiff < 86400000) return `${Math.floor(absDiff/3600000)}h ago`
    return `${Math.floor(absDiff/86400000)}d ago`
  }

  function autoDetectTimeFormat(timestamp: number): string {
    const date = new Date(timestamp)
    const now = new Date().getTime()
    const diff = Math.abs(now - timestamp)
    
    if (diff < 3600000) { // < 1 hour: show time with seconds
      return date.toLocaleTimeString('en-US', { hour12: false })
    } else if (diff < 86400000) { // < 1 day: show time
      return date.toLocaleTimeString('en-US', { hour12: false, second: undefined })
    } else if (diff < 2592000000) { // < 30 days: show date + time
      return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) + 
             ' ' + date.toLocaleTimeString('en-US', { hour12: false, second: undefined })
    } else { // > 30 days: show date only
      return date.toLocaleDateString('sv-SE').substring(0, 10) // yyyy-MM-dd
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

          // Check if this is a time column
          const timeColumns = detectTimeColumns(columns)
          const isTimeColumn = timeColumns.some(col => col.name === xAxis)
          
          if (isTimeColumn) {
            // For time columns, format the data and use time axis
            const formattedData = data.map(value => {
              if (isValidTimestamp(value)) {
                return formatTimestamp(value, selectedTimeFormat)
              }
              return value
            })
            
            optionXAxis = {
              type: "category",
              name: xAxis,
              data: formattedData,
              axisLabel: {
                rotate: data.length > 10 ? 45 : 0, // Rotate labels for better readability
                interval: 'auto'
              }
            }
          } else {
            optionXAxis = {
              type: "category",
              name: xAxis,
              data: data,
            }
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
    requestActive = false
    eventBus.publish(EventType.MSG_QUERY_OK, {
      delta: new Date().getTime() - queryExecutionTimestamp,
      count: r.count,
    })
    cachedResponse = r
    cachedQuery = query
    draw(r)
  }

  function handleServerError(r) {
    requestActive = false
    setDrawBtnToDraw()
    eventBus.publish(EventType.MSG_QUERY_ERROR, {
      query: cachedQuery,
      r: r.responseJSON,
      status: r.status,
      statusText: r.statusText,
      delta: new Date().getTime() - queryExecutionTimestamp,
    })
  }

  async function executeQueryAndDraw() {
    setDrawBtnToCancel()
    requestActive = true
    chartType = chartTypePicker.selected()
    selectedTimeFormat = timeFormatPicker.selected()

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
        urlColumns += JSON.stringify(value)
      })

      // time the query because control that displays query success expected time delta
      queryExecutionTimestamp = new Date().getTime()
      const response = await quest.queryRaw(query, {
        count: false,
        timings: false,
        cols: urlColumns,
        src: "vis",
      })
      if (response.type === QuestDB.Type.DQL) {
        handleServerResponse(response)
      } else {
        handleServerError(response)
      }
      eventBus.publish(EventType.MSG_QUERY_RUNNING)
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

    // Set up time format picker options
    const timeFormatOptions = [
      { text: "Auto", value: "auto" },
      { text: "2021-11-21 14:04:09", value: "yyyy-MM-dd HH:mm:ss" },
      { text: "14:04:09", value: "HH:mm:ss" },
      { text: "14:04", value: "HH:mm" },
      { text: "11/21 14:04", value: "MM/dd HH:mm" },
      { text: "Nov 21, 2021", value: "MMM dd, yyyy" },
      { text: "Relative (5m ago)", value: "relative" }
    ]
    timeFormatPicker.setData(timeFormatOptions)
    
    // Show/hide time format picker based on time column detection
    const timeColumns = detectTimeColumns(columns)
    const timeFormatGroup = document.querySelector('.time-format-group')
    if (timeFormatGroup) {
      if (timeColumns.length > 0) {
        timeFormatGroup.classList.add('visible')
      } else {
        timeFormatGroup.classList.remove('visible')
      }
    }

    // stash query text so that we can use this later to server for chart column values
    query = data.query
    clearChart()
  }

  function cancelDraw() {
    quest.abort()
  }

  function btnDrawClick() {
    if (requestActive) {
      cancelDraw()
    } else {
      executeQueryAndDraw()
    }
    executeQueryAndDraw()
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
    
    // Add event listener for X-axis selection to toggle time format visibility
    xAxisPicker.onChange = (info: any) => {
      if (cachedResponse && cachedResponse.columns) {
        const timeColumns = detectTimeColumns(cachedResponse.columns)
        const isTimeColumn = timeColumns.some(col => col.name === info.value)
        const timeFormatGroup = document.querySelector('.time-format-group')
        
        if (timeFormatGroup) {
          if (isTimeColumn) {
            timeFormatGroup.classList.add('visible')
          } else {
            timeFormatGroup.classList.remove('visible')
          }
        }
      }
    }
    
    clearChart()
  }

  bind()
  resize()
}
