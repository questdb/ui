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

import * as qdb from "./globals"

export function grid(root, msgBus) {
  const defaults = {
    minColumnWidth: 60,
    rowHeight: 28,
    divCacheSize: 128,
    viewportHeight: 400,
    yMaxThreshold: 10000000,
    maxRowsToAnalyze: 100,
    minVpHeight: 120,
    minDivHeight: 160,
  }
  const ACTIVE_CELL_CLASS = " qg-c-active"
  const NAV_EVENT_ANY_VERTICAL = 0
  const NAV_EVENT_LEFT = 1
  const NAV_EVENT_RIGHT = 2
  const NAV_EVENT_HOME = 3
  const NAV_EVENT_END = 4

  const bus = msgBus
  let $style
  const grid = root
  let viewport
  let canvas
  let header
  let columnWidths
  let columnOffsets
  let columns = []
  let columnCount = 0
  let data = []
  let totalWidth = -1
  // number of divs in "rows" cache, has to be power of two
  const dc = defaults.divCacheSize
  const dcn = dc - 1
  const pageSize = 1000
  const oneThirdPage = Math.floor(pageSize / 3)
  const twoThirdsPage = oneThirdPage * 2
  let loPage
  let hiPage
  let query
  let queryTimer
  let hoverTimer
  let dbg
  let downKey = []
  // index of the leftmost visible column in the grid
  let visColumnLo = 0
  // visible column count, e.g. number of columns that is actually rendered in the grid
  let visColumnCount = 10
  const visColumnCountExtra = 3
  // X coordinate of the leftmost visible column
  let visColumnX = 0
  // width in pixels of all visible columns
  let visColumnWidth = 0
  // the viewport width for which we calculated visColumnCount
  // this variable is used to avoid unnecessary computation when
  // viewport width does not change
  let lastKnownViewportWidth = 0

  // viewport height
  let viewportHeight = defaults.viewportHeight
  // row height in px
  const rh = defaults.rowHeight
  // virtual row count in grid
  let r
  // max virtual y (height) of grid canvas
  let yMax
  // current virtual y of grid canvas
  let y
  // actual height of grid canvas
  let h
  // last scroll top
  let top
  // yMax / h - ratio between virtual and actual height
  let M
  // offset to bring virtual y inline with actual y
  let o
  // row div cache
  let rows = []
  // active (highlighted) row
  let activeRow = -1
  // row div that is highlighted
  let activeRowContainer
  // index of focused cell with range from 0 to columns.length - 1
  let focusedCellIndex = -1
  // DOM container for the focused cell
  let focusedCell
  // rows in current view
  let rowsInView
  // Aggressive grid navigation might reorder data fetch and render. In that
  // when render is attempted before data is available, we need to "remember" the
  // last render attempt and repeat is when data is ready
  const pendingRender = {colLo: 0, colHi: 0, nextVisColumnLo: 0, render: false};
  const scrollerHeight = 10
  let headerScrollerPlaceholder

  function setRowCount(rowCount) {
    r += rowCount
    yMax = r * rh
    if (yMax < defaults.yMaxThreshold) {
      h = yMax
    } else {
      h = defaults.yMaxThreshold
    }
    M = yMax / h
    canvas.css("height", h === 0 ? 1 : h)
  }

  function renderRow(row, rowIndex) {
    if (row.questIndex !== rowIndex) {
      const rowData = data[Math.floor(rowIndex / pageSize)]
      let k
      if (rowData) {
        const d = rowData[rowIndex % pageSize]
        if (d) {
          row.style.display = "flex"
          for (k = 0; k < visColumnCount; k++) {
            setCellData(row.childNodes[(k + visColumnLo) % visColumnCount], d[k + visColumnLo])
          }
        } else {
          row.style.display = "none"
        }
        row.questIndex = rowIndex
      } else {
        // clear grid if there is no row data
        for (k = 0; k < visColumnCount; k++) {
          row.childNodes[(k + visColumnLo) % visColumnCount].innerHTML = ""
        }
        row.questIndex = -1
      }
      row.style.top = rowIndex * rh - o + "px"
      if (row === activeRowContainer) {
        if (rowIndex === activeRow) {
          row.className = "qg-r qg-r-active"
          setFocus(row.childNodes[focusedCellIndex % visColumnCount])
        } else {
          row.className = "qg-r"
          removeFocus(row.childNodes[focusedCellIndex % visColumnCount])
        }
      }
    }
  }

  function renderViewportNoCompute() {
    // calculate the viewport + buffer
    const t = Math.max(0, Math.floor((y - viewportHeight) / rh))
    const b = Math.min(yMax / rh, Math.ceil((y + viewportHeight + viewportHeight) / rh))

    for (let i = t; i < b; i++) {
      renderRow(rows[i & dcn], i)
    }

    if (pendingRender.render) {
      renderCells(pendingRender.colLo, pendingRender.colHi, pendingRender.nextVisColumnLo)
    }
  }

  function purgeOutlierPages() {
    for (let i = 0; i < data.length; i++) {
      if ((i < loPage || i > hiPage) && data[i]) {
        delete data[i]
      }
    }
  }

  function empty(x) {
    return data[x] === null || data[x] === undefined || data[x].length === 0
  }

  function loadPages(p1, p2) {
    purgeOutlierPages()

    let lo
    let hi
    let renderFunc

    if (p1 !== p2 && empty(p1) && empty(p2)) {
      lo = p1 * pageSize
      hi = lo + pageSize * (p2 - p1 + 1)
      renderFunc = function (response) {
        data[p1] = response.dataset.splice(0, pageSize)
        data[p2] = response.dataset
        renderViewportNoCompute()
      }
    } else if (empty(p1) && (!empty(p2) || p1 === p2)) {
      lo = p1 * pageSize
      hi = lo + pageSize
      renderFunc = function (response) {
        data[p1] = response.dataset
        renderViewportNoCompute()
      }
    } else if ((!empty(p1) || p1 === p2) && empty(p2)) {
      lo = p2 * pageSize
      hi = lo + pageSize
      renderFunc = function (response) {
        data[p2] = response.dataset
        renderViewportNoCompute()
      }
    } else {
      renderViewportNoCompute()
      return
    }
    $.get("/exec", {query, limit: lo + 1 + "," + hi, nm: true}).done(renderFunc)
  }

  function loadPagesDelayed(p1, p2) {
    if (queryTimer) {
      clearTimeout(queryTimer)
    }
    queryTimer = setTimeout(function () {
      loadPages(p1, p2)
    }, 75)
  }

  function computePages(direction, t, b) {
    if (t !== t || b !== b) {
      return
    }

    let tp // top page
    let tr // top remaining
    let bp // bottom page
    let br // bottom remaining

    tp = Math.floor(t / pageSize)
    bp = Math.floor(b / pageSize)

    if (direction > 0) {
      br = b % pageSize

      if (tp >= loPage && bp < hiPage) {
        return
      }

      if (bp === hiPage) {
        if (br > twoThirdsPage) {
          hiPage = bp + 1
          loPage = bp
          loadPagesDelayed(bp, bp + 1)
        }
        return
      }

      if (tp < bp) {
        loadPagesDelayed(tp, bp)
        loPage = tp
        hiPage = bp
      } else if (br > twoThirdsPage) {
        loadPagesDelayed(bp, bp + 1)
        loPage = bp
        hiPage = bp + 1
      } else {
        hiPage = tp
        loPage = tp
        loadPagesDelayed(tp, tp)
      }
    } else {
      tr = t % pageSize

      if (tp > loPage && bp <= hiPage) {
        return
      }

      if (tp === loPage) {
        if (tr < oneThirdPage && loPage > 0) {
          loPage = Math.max(0, tp - 1)
          hiPage = tp
          loadPagesDelayed(tp - 1, tp)
        }
        return
      }

      if (tp < bp) {
        loadPagesDelayed(tp, bp)
        loPage = tp
        hiPage = bp
      } else if (tr < oneThirdPage && tp > 0) {
        loadPagesDelayed(tp - 1, tp)
        loPage = Math.max(0, tp - 1)
        hiPage = tp
      } else {
        loPage = tp
        hiPage = tp
        loadPagesDelayed(tp, tp)
      }
    }
  }

  function renderRows(direction) {
    // calculate the viewport + buffer
    let t = Math.max(0, Math.floor((y - viewportHeight) / rh))
    let b = Math.min(yMax / rh, Math.ceil((y + viewportHeight + viewportHeight) / rh))

    if (direction !== 0) {
      computePages(direction, t, b)
    }

    if (t === 0) {
      b = dc
    } else if (b > r - 2) {
      t = Math.max(0, b - dc)
    }

    for (let i = t; i < b; i++) {
      const row = rows[i & dcn]
      if (row) {
        renderRow(row, i)
      }
    }
  }

  function getColumnAlignment(i) {
    switch (columns[i].type) {
      case "STRING":
      case "SYMBOL":
        return "text-align: left;"
      default:
        return ""
    }
  }

  function getColumnWidth(i) {
    return columnOffsets[i + 1] - columnOffsets[i];
    // return columnWidths[i]
  }

  function generatePxWidth(rules) {
    let left = 0
    // calculate CSS and width for all columns even though
    // we will render only a subset of them
    for (let i = 0; i < columnCount; i++) {
      const w = getColumnWidth(i)
      rules.push(".qg-w" + i + "{width:" + w + "px;" + "position: absolute;" + "left:" + left + "px;" + getColumnAlignment(i) + "}")
      left += w
    }
    rules.push(".qg-w" + columnCount + "{width:" + scrollerHeight + "px;" + "position: absolute;" + "left:" + left + "px;}")
    rules.push(".qg-r{width:" + totalWidth + "px;}")
  }

  function createCss() {
    if (data.length > 0) {
      if ($style) {
        $style.remove()
      }
      $style = $('<style rel="stylesheet"/>').appendTo($("head"))
      const rules = []

      generatePxWidth(rules)

      rules.push(".qg-c{height:" + rh + "px;}")
      if ($style[0].styleSheet) {
        // IE
        $style[0].styleSheet.cssText = rules.join(" ")
      } else {
        $style[0].appendChild(document.createTextNode(rules.join(" ")))
      }
    }
  }

  function computeColumnWidths() {
    columnWidths = []
    columnOffsets = []
    let i, w
    totalWidth = 0
    for (i = 0; i < columnCount; i++) {
      const c = columns[i]

      const col = $('<div class="qg-header qg-w' + i + '" data-column-name="' + c.name + '"><span class="qg-header-type">' + c.type.toLowerCase() + '</span><span class="qg-header-name">' + c.name + "</span></div>",)
        .on("click", function (e) {
          bus.trigger("editor.insert.column", e.currentTarget.getAttribute("data-column-name"),)
        })
        .appendTo(header)

      switch (c.type) {
        case "STRING":
        case "SYMBOL":
          col.addClass("qg-header-l")
          break
      }

      headerScrollerPlaceholder = $('<div class="qg-header qg-w' + columnCount + '"/>')
        .appendTo(header)

      w = Math.max(defaults.minColumnWidth, Math.ceil((c.name.length + c.type.length) * 8 * 1.2 + 10))
      columnOffsets.push(totalWidth)
      columnWidths.push(w)
      totalWidth += w
    }

    columnOffsets.push(totalWidth)
  }

  function clear() {
    top = 0
    y = 0
    o = 0
    r = 0

    if ($style) {
      $style.remove()
    }
    header.empty()
    canvas.empty()
    rows = []
    data = []
    query = null
    loPage = 0
    hiPage = 0
    downKey = []
    activeRowContainer = null
    focusedCell = null
    activeRow = 0
    focusedCellIndex = 0
    visColumnLo = 0
    visColumnCount = 10
    lastKnownViewportWidth = 0
    enableHover()
  }

  function logDebug() {
    if (dbg) {
      dbg.empty()
      dbg.append("time = " + new Date() + "<br>")
      dbg.append("y = " + y + "<br>")
      dbg.append("M = " + M + "<br>")
      dbg.append("o = " + o + "<br>")
      dbg.append("h = " + h + "<br>")
      dbg.append("viewportHeight = " + viewportHeight + "<br>")
      dbg.append("yMax = " + yMax + "<br>")
      dbg.append("top = " + top + "<br>")
      dbg.append("activeRow = " + activeRow + "<br>")
    }
  }

  function activeCellOff() {
    removeFocus(focusedCell)
  }

  function removeFocus(cell) {
    cell.className = cell.className.replace(ACTIVE_CELL_CLASS, "")
  }

  function setFocus(cell) {
    if (cell && !cell.className.includes(ACTIVE_CELL_CLASS)) {
      cell.className += ACTIVE_CELL_CLASS
    }
  }

  function setCellData(cell, cellData) {
    cell.innerHTML = cellData !== null ? cellData.toString() : "null"
  }

  function setCellDataAndAttributes(row, rowData, cellIndex) {
    const cell = row.childNodes[cellIndex % visColumnCount]
    cell.className = "qg-c qg-w" + cellIndex
    cell.cellIndex = cellIndex
    setCellData(cell, rowData[cellIndex])
  }

  function renderCells(colLo, colHi, nextVisColumnLo) {
    if (rows.length > 0 && columnCount > 0) {

      pendingRender.colLo = colLo
      pendingRender.colHi = colHi
      pendingRender.nextVisColumnLo = nextVisColumnLo
      pendingRender.render = false;

      let t = Math.max(0, Math.floor((y - viewportHeight) / rh))
      let b = Math.min(yMax / rh, Math.ceil((y + viewportHeight + viewportHeight) / rh))
      // adjust t,b to back-fill the entire "rows" contents
      // t,b lands us somewhere in the middle of rows array when adjusted to `dcn`
      // we want to cover all the rows
      t -= (t & dcn)
      b = b - (b & dcn) + dc

      for (let i = t; i < b; i++) {
        const row = rows[i & dcn]
        const m = Math.floor(i / pageSize);
        const n = i % pageSize;
        let d1
        let d2
        if (m < data.length && (d1 = data[m]) && n < d1.length && (d2 = d1[n])) {
          // We need to put cells in the same order, which one would
          // get scrolling towards the end of row using right arrow, e.g. one cell at a time
          // This is to make sure scrolling one column left at a time works correctly
          for (let j = colLo; j < colHi; j++) {
            setCellDataAndAttributes(row, d2, j)
          }
        } else {
          pendingRender.render = true;
        }
      }

      const lo = Math.max(0, Math.min(nextVisColumnLo, columnCount - visColumnCount))
      if (visColumnLo < lo) {
        for (let i = visColumnLo; i < lo; i++) {
          visColumnX += getColumnWidth(i)
        }
      } else {
        for (let i = lo; i < visColumnLo; i++) {
          visColumnX -= getColumnWidth(i)
        }
      }
      visColumnLo = lo

      // compute new width
      let sum = 0
      for (let i = visColumnLo, n = visColumnLo + visColumnCount; i < n; i++) {
        sum += getColumnWidth(i)
      }
      visColumnWidth = sum
    }
  }

  function setScrollLeft(scrollLeft, focusedCell) {
    console.log("setting: " + scrollLeft)
    const before = viewport.scrollLeft
    viewport.scrollLeft = scrollLeft
    header.scrollLeft(scrollLeft);
    if (before === viewport.scrollLeft) {
      setFocus(focusedCell)
    }
  }

  function activeCellOn(navEvent) {
    if (navEvent === NAV_EVENT_HOME && visColumnLo > 0 && columnCount > visColumnCount) {
      renderCells(0, visColumnCount, 0)
    } else if (navEvent === NAV_EVENT_END && visColumnLo + visColumnCount < columnCount) {
      renderCells(columnCount - visColumnCount, columnCount, columnCount - visColumnCount)
    }

    focusedCell = activeRowContainer.childNodes[focusedCellIndex % visColumnCount]
    const columnOffset = columnOffsets[focusedCellIndex];
    const columnWidth = columnOffsets[focusedCellIndex + 1] - columnOffset;

    if (navEvent !== NAV_EVENT_ANY_VERTICAL) {
      const w = Math.max(0, columnOffset)
      if (w < viewport.scrollLeft) {
        setScrollLeft(w, focusedCell)
        return
      }

      if (w > viewport.scrollLeft) {
        const w = columnOffset + columnWidth
        if (w > viewport.scrollLeft + viewport.clientWidth) {
          setScrollLeft(w - viewport.clientWidth, focusedCell)
          return
        }
      }
    }
    setFocus(focusedCell)
  }

  function activeRowUp(n) {
    if (activeRow > 0) {
      disableHover()
      activeRow = Math.max(0, activeRow - n)
      activeRowContainer.className = "qg-r"
      activeCellOff()
      activeRowContainer = rows[activeRow & dcn]
      activeRowContainer.className = "qg-r qg-r-active"
      activeCellOn(NAV_EVENT_ANY_VERTICAL)
      const scrollTop = activeRow * rh - o - 5 // top margin
      if (scrollTop < viewport.scrollTop) {
        viewport.scrollTop = Math.max(0, scrollTop)
      } else {
        enableHover()
      }
    }
  }

  function activeRowDown(n) {
    if (activeRow > -1 && activeRow < r - 1) {
      disableHover()
      activeRow = Math.min(r - 1, activeRow + n)
      activeRowContainer.className = "qg-r"
      activeCellOff()
      activeRowContainer = rows[activeRow & dcn]
      activeRowContainer.className = "qg-r qg-r-active"
      activeCellOn(NAV_EVENT_ANY_VERTICAL)
      const scrollTop = activeRow * rh - viewportHeight + rh - o
      const scrollerHeight = viewport.scrollWidth > lastKnownViewportWidth ? 10 : 0;
      if (scrollTop > viewport.scrollTop) {
        viewport.scrollTop = scrollTop + scrollerHeight
      } else {
        enableHover()
      }
    }
  }

  function renderColumns() {
    const colRightEdge = visColumnX + visColumnWidth
    const colLeftEdge = visColumnX
    const vpl = viewport.scrollLeft
    const vpw = viewport.getBoundingClientRect().width
    if (columnOffsets) {
      if (vpl + vpw > colRightEdge) {
        // count columns that are behind left edge completely
        // we do this by finding first column that steps out from left edge
        // this is column index (0..columnCount), -1 would mean that all cells that show data are hidden
        let k = -1
        let w = visColumnX
        for (let i = visColumnLo, n = visColumnCount + visColumnLo; i < n; i++) {
          w += getColumnWidth(i)
          if (w > vpl) {
            // is this the first column to step out
            k = i
            break
          }
        }

        if (k > visColumnLo) {
          // Scroll right, incrementally to improve rendering performance. The data cells are partially visible. We are moving
          // invisible cells to the "right" (visually) and have them render new data
          renderCells(visColumnCount + visColumnLo, Math.min(visColumnCount + k, columnCount), k)
        } else if (k === -1) {
          // the data cells disappeared from the view entirely. Render cells in the new view.
          // calculate columns we need to render. We know the width of data cells up to the right edge of what we have
          // from this right edge we move right until we find column that comes into view. This will be our first render column
          let w = colRightEdge
          let k = visColumnCount + visColumnLo
          while (w < vpl) {
            w += getColumnWidth(++k)
          }
          renderCells(k, Math.min(visColumnCount + k, columnCount), k)
        }
      } else if (colLeftEdge > vpl) {
        // left edge of the data cells is in the "middle" of the viewport
        // we need to decrease visColumnLeft for the data to come into view
        // compute the new value
        let k = visColumnLo
        let w = visColumnX
        while (w > vpl) {
          w -= getColumnWidth(--k)
        }

        const z = Math.min(visColumnCount, visColumnLo - k)
        renderCells(k, Math.min(z + k, columnCount), k)
      }
    }
  }

  function enableHover() {
    if (hoverTimer) {
      clearTimeout(hoverTimer)
    }
    hoverTimer = setTimeout(() => {
        grid.addClass('qg-hover')
      }, 500
    )
  }

  function disableHover() {
    grid.removeClass('qg-hover')
  }

  function scroll(event) {

    disableHover();
    renderColumns();

    const scrollTop = viewport.scrollTop
    if (scrollTop !== top || !event) {
      const oldY = y
      // if grid content fits in viewport we don't need to adjust activeRow
      if (scrollTop >= h - viewportHeight) {
        // final leap to bottom of grid
        // this happens when container div runs out of vertical height
        // and we artificially force leap to bottom
        y = Math.max(0, yMax - viewportHeight)
        top = scrollTop
        o = y - top
        activeRowDown(r - activeRow)
      } else {
        if (scrollTop === 0 && top > 0) {
          // this happens when grid is coming slowly back up after being scrolled down harshly
          // because 'y' is much greater than top, we have to jump to top artificially.
          y = 0
          o = 0
          activeRowUp(activeRow)
        } else {
          y += scrollTop - top
        }
        top = scrollTop
      }
      renderRows(y - oldY)
    }

    enableHover();
    setFocus(focusedCell)
    logDebug()
  }

  function updateVisibleColumnCount() {
    const viewportWidth = viewport.getBoundingClientRect().width
    if (totalWidth < viewportWidth) {
      // viewport is wider than total column width
      visColumnCount = columnCount
    } else {
      let lo = 0
      let hi = 0
      let w = 0
      let count = 0
      while (hi < columnCount) {
        const wHi = getColumnWidth(hi)
        // when stride exceeds the viewport we will exclude first column
        // and try to create a new stride
        if (w + wHi > viewportWidth) {
          if (count < hi - lo + 1) {
            //
            count = hi - lo + 1
          }
          w -= getColumnWidth(lo)
          lo++
        } else {
          w += wHi
          hi++
        }
      }

      // take into account the last stride
      count = Math.max(count, hi - lo + 1)
      visColumnCount = Math.min(
        count + visColumnCountExtra,
        columnCount
      )
    }
  }

  function removeColumns(colCount) {
    for (let i = 0, n = rows.length; i < n; i++) {
      const row = rows[i];
      for (let j = visColumnCount; j < colCount; j++) {
        row.childNodes[j].remove()
      }
    }
    renderCells(visColumnLo, visColumnLo + visColumnCount, visColumnLo)
  }

  function appendColumns(colCount) {
    for (let i = 0, n = rows.length; i < n; i++) {
      const row = rows[i];
      for (let j = 0; j < colCount; j++) {
        const div = document.createElement('div')
        div.className = 'qg-c qg-w' + ((visColumnLo + j) % visColumnCount)
        row.append(div)
      }
    }
    renderCells(visColumnLo, visColumnLo + visColumnCount, visColumnLo)
  }

  function resize() {
    if (grid.css("display") !== "none") {
      viewportHeight = Math.max(viewport.getBoundingClientRect().height, defaults.minVpHeight)
      if (canvas[0].getBoundingClientRect().width > viewport.getBoundingClientRect().width) {
        // there is horizontal scroller eating into usable viewport height
        // viewportHeight -= 10; // assume scroller size is 10px
      }
      rowsInView = Math.floor(viewportHeight / rh)
      createCss()

      const viewportWidth = viewport.getBoundingClientRect().width
      if (lastKnownViewportWidth !== viewportWidth) {
        lastKnownViewportWidth = viewportWidth

        const prevVisColumnCount = visColumnCount
        updateVisibleColumnCount()
        if (prevVisColumnCount < visColumnCount) {
          appendColumns(visColumnCount - prevVisColumnCount)
        } else if (prevVisColumnCount > visColumnCount) {
          removeColumns(prevVisColumnCount);
        }
      }
      scroll()
    }
  }

  function rowClick() {
    if (activeRowContainer) {
      activeRowContainer.className = "qg-r"
    }
    this.focus()
    activeRowContainer = this.parentElement
    activeRowContainer.className += " qg-r-active"
    activeRow = activeRowContainer.questIndex

    if (focusedCell) {
      // remove qg-c-active class
      activeCellOff()
    }
    focusedCell = this
    focusedCellIndex = this.cellIndex
    setFocus(focusedCell)
  }

  function activeCellRight() {
    if (focusedCellIndex > -1 && focusedCellIndex < columnCount - 1) {
      activeCellOff()
      focusedCellIndex++
      activeCellOn(NAV_EVENT_RIGHT)
    }
  }

  function activeCellLeft() {
    if (focusedCellIndex > 0) {
      activeCellOff()
      focusedCellIndex--
      activeCellOn(NAV_EVENT_LEFT)
    }
  }

  function activeCellHome() {
    if (focusedCellIndex > 0) {
      activeCellOff()
      focusedCellIndex = 0
      activeCellOn(NAV_EVENT_HOME)
    }
  }

  function activeCellEnd() {
    if (focusedCellIndex > -1 && focusedCellIndex !== columnCount - 1) {
      activeCellOff()
      focusedCellIndex = columnCount - 1
      activeCellOn(NAV_EVENT_END)
    }
  }

  function unfocusCell() {
    if (focusedCell) {
      activeCellOff()
    }
  }

  function onKeyUp(e) {
    delete downKey["which" in e ? e.which : e.keyCode]
  }

  function onKeyDown(e) {
    const keyCode = "which" in e ? e.which : e.keyCode
    let preventDefault = true
    switch (keyCode) {
      case 33: // page up
        activeRowUp(rowsInView)
        break
      case 38: // arrow up
        if (downKey[91]) {
          activeRowUp(activeRow)
        } else {
          activeRowUp(1)
        }
        break
      case 40: // arrow down
        if (downKey[91]) {
          activeRowDown(r - activeRow)
        } else {
          activeRowDown(1)
        }
        break
      case 34: // page down
        activeRowDown(rowsInView)
        break
      case 39: // arrow right
        activeCellRight()
        break
      case 37: // arrow left
        activeCellLeft()
        break
      case 35: // end? Fn+arrow right on mac
        if (downKey[17]) {
          activeRowDown(r - activeRow)
        } else {
          activeCellEnd()
        }
        break
      case 36: // home ? Fn + arrow left on mac
        if (downKey[17]) {
          activeRowUp(activeRow)
        } else {
          activeCellHome()
        }
        break
      case 113:
        unfocusCell()
        bus.trigger(qdb.MSG_EDITOR_FOCUS)
        break
      default:
        downKey[keyCode] = true
        preventDefault = false
        break
    }

    if (preventDefault) {
      e.preventDefault()
    }
  }

  function setupCanvas() {
    for (let i = 0; i < dc; i++) {
      const rowDiv = document.createElement('div')
      rowDiv.className = 'qg-r'
      rowDiv.tabIndex = i + i

      if (i === 0) {
        activeRowContainer = rowDiv
      }
      for (let k = 0; k < visColumnCount; k++) {
        const cell = document.createElement('div')
        cell.className = 'qg-c qg-w' + k
        cell.onclick = rowClick
        rowDiv.append(cell)
        if (i === 0 && k === 0) {
          focusedCell = cell
        }
        cell.cellIndex = k
      }
      rowDiv.style.top = '-100'
      rowDiv.style.height = rh.toString() + 'px'
      rows.push(rowDiv)
      canvas[0].append(rowDiv);
    }
  }


  function computeVisibleColumnsPosition() {
    // compute left offset
    let x = 0
    for (let i = 0; i < visColumnLo; i++) {
      x += getColumnWidth(i)
    }

    // compute width of visible columns
    let width = 0
    for (let i = visColumnLo, n = visColumnLo + visColumnCount; i < n; i++) {
      width += getColumnWidth(i)
    }

    visColumnX = x
    visColumnWidth = width
  }

  function focusCell() {
    if (focusedCell && activeRowContainer) {
      focusedCell.click()
      activeRowContainer.focus()
    }
  }

//noinspection JSUnusedLocalSymbols
  function update(x, m) {
    $(".js-query-refresh .fa").removeClass("fa-spin")

    setTimeout(() => {
        clear()
        query = m.query
        data.push(m.dataset)
        columns = m.columns
        columnCount = columns.length
        computeColumnWidths()
        updateVisibleColumnCount()
        // visible position depends on correctness of visColumnCount value
        computeVisibleColumnsPosition()
        setupCanvas()
        setRowCount(m.count)
        viewport.scrollTop = 0
        resize()
        focusCell()
      },
      0
    )
  }

  function publishQuery() {
    if (query) {
      bus.trigger(qdb.MSG_QUERY_EXPORT, {q: query})
    }
  }

  function refreshQuery() {
    if (query) {
      bus.trigger(qdb.MSG_QUERY_EXEC, {q: query})
    } else {
      $(".js-query-refresh .fa").removeClass("fa-spin")
    }
  }

  function bind() {
    dbg = $("#debug")
    header = $('<div/>')
    header.addClass('qg-header-row')
    header.appendTo(grid);

    const vp = $('<div/>')
    vp.addClass('qg-viewport')
    vp.appendTo(grid)
    viewport = vp[0]
    viewport.onscroll = scroll

    canvas = $('<div>')
    canvas.addClass('qg-canvas')
    canvas.appendTo(vp)
    canvas.bind("keydown", onKeyDown)
    canvas.bind("keyup", onKeyUp)

    $(window).resize(resize)
    bus.on(qdb.MSG_QUERY_DATASET, update)
    bus.on("grid.focus", focusCell)
    bus.on("grid.refresh", refreshQuery)
    bus.on("grid.publish.query", publishQuery)
    bus.on(qdb.MSG_ACTIVE_PANEL, resize)
  }

  bind()
  resize()
}
