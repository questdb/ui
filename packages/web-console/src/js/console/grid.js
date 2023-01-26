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
  };
  const ACTIVE_CELL_CLASS = " qg-c-active";
  const NAV_EVENT_ANY_VERTICAL = 0;
  const NAV_EVENT_LEFT = 1;
  const NAV_EVENT_RIGHT = 2;
  const NAV_EVENT_HOME = 3;
  const NAV_EVENT_END = 4;

  const bus = msgBus;
  let $style;
  const div = root;
  let viewport;
  let canvas;
  let header;
  let colMax;
  let columns = [];
  let columnCount = 0;
  let data = [];
  let totalWidth = -1;
  // number of divs in "rows" cache, has to be power of two
  const dc = defaults.divCacheSize;
  const dcn = dc - 1;
  const pageSize = 1000;
  const oneThirdPage = Math.floor(pageSize / 3);
  const twoThirdsPage = oneThirdPage * 2;
  let loPage;
  let hiPage;
  let query;
  let queryTimer;
  let dbg;
  let downKey = [];
  let visLeftColumn = 0;
  let visColumnCount = 10;

  // viewport height
  let viewportHeight = defaults.viewportHeight;
  // row height in px
  const rh = defaults.rowHeight;
  // virtual row count in grid
  let r;
  // max virtual y (height) of grid canvas
  let yMax;
  // current virtual y of grid canvas
  let y;
  // actual height of grid canvas
  let h;
  // last scroll top
  let top;
  // yMax / h - ratio between virtual and actual height
  let M;
  // offset to bring virtual y inline with actual y
  let o;
  // row div cache
  let rows = [];
  // active (highlighted) row
  let activeRow = -1;
  // row div that is highlighted
  let activeRowContainer;
  // index of focused cell with range from 0 to columns.length - 1
  let focusedCellIndex = -1;
  // DOM container for the focused cell
  let focusedCell;
  // rows in current view
  let rowsInView;

  function addRows(n) {
    r += n
    yMax = r * rh
    if (yMax < defaults.yMaxThreshold) {
      h = yMax
    } else {
      h = defaults.yMaxThreshold
    }
    M = yMax / h
    canvas.css("height", h === 0 ? 1 : h)
  }

  function renderRow(rowContainer, n) {
    if (rowContainer.questIndex !== n) {
      const rowData = data[Math.floor(n / pageSize)];
      const offset = n % pageSize;
      let k;
      if (rowData) {
        const d = rowData[offset];
        if (d) {
          rowContainer.style.display = "flex"
          for (k = 0; k < visColumnCount; k++) {
            const dd = d[k + visLeftColumn]
            setCellData(rowContainer.childNodes[(k + visLeftColumn) % visColumnCount], dd)
          }
        } else {
          rowContainer.style.display = "none"
        }
        rowContainer.questIndex = n
      } else {
        // clear grid if there is no row data
        for (k = 0; k < visColumnCount; k++) {
          rowContainer.childNodes[(k + visLeftColumn) % visLeftColumn].innerHTML = ""
        }
        rowContainer.questIndex = -1
      }
      rowContainer.style.top = n * rh - o + "px"
      if (rowContainer === activeRowContainer) {
        if (n === activeRow) {
          rowContainer.className = "qg-r qg-r-active"
          setFocus(rowContainer.childNodes[focusedCellIndex % visColumnCount])
        } else {
          rowContainer.className = "qg-r"
          removeFocus(rowContainer.childNodes[focusedCellIndex % visColumnCount])
        }
      }
    }
  }

  function renderViewportNoCompute() {
    // calculate the viewport + buffer
    const t = Math.max(0, Math.floor((y - viewportHeight) / rh));
    const b = Math.min(yMax / rh, Math.ceil((y + viewportHeight + viewportHeight) / rh));

    for (let i = t; i < b; i++) {
      renderRow(rows[i & dcn], i)
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

    let lo;
    let hi;
    let renderFunc;

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

    let tp; // top page
    let tr; // top remaining
    let bp; // bottom page
    let br; // bottom remaining

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

  function renderViewport(direction) {
    // calculate the viewport + buffer
    let t = Math.max(0, Math.floor((y - viewportHeight) / rh));
    let b = Math.min(yMax / rh, Math.ceil((y + viewportHeight + viewportHeight) / rh));

    if (direction !== 0) {
      computePages(direction, t, b)
    }

    if (t === 0) {
      b = dc
    } else if (b > r - 2) {
      t = Math.max(0, b - dc)
    }

    for (let i = t; i < b; i++) {
      const row = rows[i & dcn];
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

  function generatePxWidth(rules) {
    let left = 0;
    // calculate CSS and width for all columns even though
    // we will render only a subset of them
    for (let i = 0; i < colMax.length; i++) {
      rules.push(".qg-w" + i + "{width:" + colMax[i] + "px;" + "position: absolute;" + "left:" + left + "px;" + getColumnAlignment(i) + "}",)
      left += colMax[i];
    }
    rules.push(".qg-r{width:" + totalWidth + "px;}")
  }

  function createCss() {
    if (data.length > 0) {
      if ($style) {
        $style.remove()
      }
      $style = $('<style rel="stylesheet"/>').appendTo($("head"),)
      const rules = [];

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
    colMax = []
    let i, k, w;
    totalWidth = 0
    for (i = 0; i < columnCount; i++) {
      const c = columns[i];

      const col = $('<div class="qg-header qg-w' + i + '" data-column-name="' + c.name + '"><span class="qg-header-type">' + c.type.toLowerCase() + '</span><span class="qg-header-name">' + c.name + "</span></div>",)
        .on("click", function (e) {
          bus.trigger("editor.insert.column", e.currentTarget.getAttribute("data-column-name"),)
        })
        .appendTo(header);

      switch (c.type) {
        case "STRING":
        case "SYMBOL":
          col.addClass("qg-header-l")
          break
      }

      w = Math.max(defaults.minColumnWidth, Math.ceil((c.name.length + c.type.length) * 8 * 1.2 + 8),)
      colMax.push(w)
      totalWidth += w
    }

    const max = data[0].length > defaults.maxRowsToAnalyze ? defaults.maxRowsToAnalyze : data[0].length;

    for (let i = 0; i < max; i++) {
      const row = data[0][i];
      let sum = 0;
      for (k = 0; k < row.length; k++) {
        const cell = row[k];
        const str = cell !== null ? cell.toString() : "null";
        w = Math.max(defaults.minColumnWidth, str.length * 8 + 8)
        colMax[k] = Math.max(w, colMax[k])
        sum += colMax[k]
      }
      totalWidth = Math.max(totalWidth, sum)
    }
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
    visLeftColumn = 0;
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
    if (!cell.className.includes(ACTIVE_CELL_CLASS)) {
      cell.className += ACTIVE_CELL_CLASS
    }
  }

  function moveViewPortRight() {
    const rowCount = rows.length;
    if (rowCount > 0) {
      if (columnCount > 0) {

        let t = Math.max(0, Math.floor((y - viewportHeight) / rh));
        let b = Math.min(yMax / rh, Math.ceil((y + viewportHeight + viewportHeight) / rh));
        // adjust t,b to back-fill the entire "rows" contents
        // t,b lands us somewhere in the middle of rows array when adjusted to `dcn`
        // we want to cover all the rows
        t -= (t & dcn)
        b = b - (b & dcn) + dc;
        // we need these loop indexes to accurately locate data
        // in the data arrays
        for (let i = t; i < b; i++) {
          // locate data for the viewport cell
          const row = rows[i & dcn];
          const dataBatch = data[Math.floor(i / pageSize)];
          const rowData = dataBatch[i % pageSize];
          if (rowData) {
            setCellDataAndAttributes(
              row.childNodes[visLeftColumn % visColumnCount],
              rowData[visColumnCount + visLeftColumn],
              visColumnCount + visLeftColumn
            )
          }
        }
      }
      visLeftColumn += 1;
    }
  }

  function moveViewPortLeft() {
    const rowCount = rows.length;
    if (rowCount > 0) {
      if (columnCount > 0) {

        let t = Math.max(0, Math.floor((y - viewportHeight) / rh));
        let b = Math.min(yMax / rh, Math.ceil((y + viewportHeight + viewportHeight) / rh));
        // adjust t,b to back-fill the entire "rows" contents
        // t,b lands us somewhere in the middle of rows array when adjusted to `dcn`
        // we want to cover all the rows
        t -= (t & dcn)
        b = b - (b & dcn) + dc;
        for (let i = t; i < b; i++) {
          const row = rows[i & dcn];
          const dataBatch = data[Math.floor(i / pageSize)];
          const rowIndexInBatch = i % pageSize;
          const rowData = dataBatch[rowIndexInBatch];
          if (rowData) {
            setCellDataAndAttributes(
              row.childNodes[Math.abs((visLeftColumn - 1) % visColumnCount)],
              rowData[visLeftColumn - 1],
              visLeftColumn - 1
            )
          }
        }
      }
      visLeftColumn -= 1;
    }
  }

  function moveViewPortHome() {
    const rowCount = rows.length;
    if (rowCount > 0 && columnCount > 0) {
      let t = Math.max(0, Math.floor((y - viewportHeight) / rh));
      let b = Math.min(yMax / rh, Math.ceil((y + viewportHeight + viewportHeight) / rh));
      // adjust t,b to back-fill the entire "rows" contents
      // t,b lands us somewhere in the middle of rows array when adjusted to `dcn`
      // we want to cover all the rows
      t -= (t & dcn)
      b = b - (b & dcn) + dc;
      for (let i = t; i < b; i++) {
        const row = rows[i & dcn];
        const dataBatch = data[Math.floor(i / pageSize)];
        const rowIndexInBatch = i % pageSize;
        const rowData = dataBatch[rowIndexInBatch];
        if (rowData) {
          for (let j = 0; j < visColumnCount; j++) {
            setCellDataAndAttributes(row.childNodes[j], rowData[j], j);
          }
        }
      }
      visLeftColumn = 0;
    }
  }

  function setCellData(cell, cellData) {
    cell.innerHTML = cellData !== null ? cellData.toString() : "null"
  }

  function setCellDataAndAttributes(cell, cellData, cellIndex) {
    cell.className = "qg-c qg-w" + cellIndex
    cell.cellIndex = cellIndex
    setCellData(cell, cellData)
  }

  function moveViewPortEnd() {
    const start = (columnCount - visColumnCount) % visColumnCount;
    const end = start + visColumnCount;
    const nextVisLeftColumn = columnCount - visColumnCount;

    if (rows.length > 0 && columnCount > 0) {
      let t = Math.max(0, Math.floor((y - viewportHeight) / rh));
      let b = Math.min(yMax / rh, Math.ceil((y + viewportHeight + viewportHeight) / rh));
      // adjust t,b to back-fill the entire "rows" contents
      // t,b lands us somewhere in the middle of rows array when adjusted to `dcn`
      // we want to cover all the rows
      t -= (t & dcn)
      b = b - (b & dcn) + dc;
      for (let i = t; i < b; i++) {
        const row = rows[i & dcn];
        const dataBatch = data[Math.floor(i / pageSize)];
        const rowIndexInBatch = i % pageSize;
        const rowData = dataBatch[rowIndexInBatch];
        if (rowData) {
          // We need to put cells in the same order, which one would
          // get scrolling towards the end of row using right arrow, e.g. one cell at a time
          // This is to make sure scrolling one column left at a time works correctly
          for (let j = start; j < end; j++) {
            const cell = row.childNodes[j % visColumnCount];
            const cellIndex = columnCount - visColumnCount - start + j;
            const cellData = rowData[cellIndex];
            cell.className = "qg-c qg-w" + cellIndex
            setCellData(cell, cellData);
            cell.cellIndex = cellIndex
          }
        }
      }
      visLeftColumn = nextVisLeftColumn;
    }
  }

  function activeCellOn(navEvent) {
    const viewportContainerCount = activeRowContainer.childNodes.length;

    // left/right conditions seem to provide adequate user interaction
    if (navEvent === NAV_EVENT_RIGHT && focusedCellIndex - visLeftColumn >= viewportContainerCount) {
      moveViewPortRight();
    } else if (navEvent === NAV_EVENT_LEFT && focusedCellIndex - visLeftColumn < 0) {
      moveViewPortLeft();
    } else if (navEvent === NAV_EVENT_HOME && visLeftColumn > 0 && columnCount > visColumnCount) {
      moveViewPortHome();
    } else if (navEvent === NAV_EVENT_END && visLeftColumn + visColumnCount < columnCount) {
      moveViewPortEnd();
    }

    focusedCell = activeRowContainer.childNodes[focusedCellIndex % visColumnCount]
    setFocus(focusedCell)

    if (navEvent !== NAV_EVENT_ANY_VERTICAL) {
      let w;
      w = Math.max(0, focusedCell.offsetLeft - 5)
      if (w < viewport.scrollLeft) {
        viewport.scrollLeft = w
      } else {
        w = focusedCell.offsetLeft + focusedCell.clientWidth + 5
        if (w > viewport.scrollLeft + viewport.clientWidth) {
          viewport.scrollLeft = w - viewport.clientWidth
        }
      }
    }
  }

  function activeRowUp(n) {
    if (activeRow > 0) {
      activeRow = Math.max(0, activeRow - n)
      activeRowContainer.className = "qg-r"
      activeCellOff()
      activeRowContainer = rows[activeRow & dcn]
      activeRowContainer.className = "qg-r qg-r-active"
      activeCellOn(NAV_EVENT_ANY_VERTICAL)
      const scrollTop = activeRow * rh - o;
      if (scrollTop < viewport.scrollTop) {
        viewport.scrollTop = Math.max(0, scrollTop)
      }
    }
  }

  function activeRowDown(n) {
    if (activeRow > -1 && activeRow < r - 1) {
      activeRow = Math.min(r - 1, activeRow + n)
      activeRowContainer.className = "qg-r"
      activeCellOff()
      activeRowContainer = rows[activeRow & dcn]
      activeRowContainer.className = "qg-r qg-r-active"
      activeCellOn(NAV_EVENT_ANY_VERTICAL)
      const scrollTop = activeRow * rh - viewportHeight + rh - o;
      if (scrollTop > viewport.scrollTop) {
        viewport.scrollTop = scrollTop
      }
    }
  }

  function viewportScroll(event) {
    header.scrollLeft(viewport.scrollLeft)

    const scrollTop = viewport.scrollTop;
    if (scrollTop !== top || event) {
      const oldY = y;
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
      renderViewport(y - oldY)
    }
    logDebug()
  }

  function updateVisibleColumnCount() {
    if (totalWidth < viewport.getBoundingClientRect().width) {
      // viewport is wider than total column width
      visColumnCount = columnCount;
    } else {
      // compute max number of columns that can fit into the viewport
      // the computation checks every column "sequence" in case column
      // widths are uneven
      let max = 0;
      const limit = viewport.getBoundingClientRect().width;
      for (let i = 0, n = colMax.length; i < n; i++) {
        let count = 0;
        let sum = colMax[i];
        for (let j = i + 1; j < n; j++, ++count) {
          sum += colMax[j]
          if (sum > limit) {
            max = Math.max(max, count)
            break
          }
        }
      }
      visColumnCount = Math.min(max + 3, colMax.length);
    }
  }

  function resize() {
    if ($("#grid").css("display") !== "none") {
      const wh = window.innerHeight - $(window).scrollTop()
      viewportHeight = Math.round(wh - viewport.getBoundingClientRect().top - $('[data-hook="notifications-wrapper"]').height() - $("#footer").height(),)
      viewportHeight = Math.max(viewportHeight, defaults.minVpHeight)
      rowsInView = Math.floor(viewportHeight / rh)
      createCss()
      viewportScroll(true)
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
    const keyCode = "which" in e ? e.which : e.keyCode;
    let preventDefault = true;
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

  function addColumns() {
    for (let i = 0; i < dc; i++) {
      const rowDiv = $('<div class="qg-r" tabindex="' + i + '"/>');
      if (i === 0) {
        activeRowContainer = rowDiv
      }
      for (let k = 0; k < visColumnCount; k++) {
        const cell = $('<div class="qg-c qg-w' + k + '"/>')
          .click(rowClick)
          .appendTo(rowDiv)[0];
        if (i === 0 && k === 0) {
          focusedCell = cell
        }

        cell.cellIndex = k
      }
      rowDiv.css({top: -100, height: rh}).appendTo(canvas)
      rows.push(rowDiv[0])
    }
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
      columnCount = columns.length;
      computeColumnWidths()
      updateVisibleColumnCount()
      addColumns()
      addRows(m.count)
      viewport.scrollTop = 0
      resize()
      focusCell()
    }, 0)
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
    header = div.find(".qg-header-row")
    viewport = div.find(".qg-viewport")[0]
    viewport.onscroll = viewportScroll
    canvas = div.find(".qg-canvas")
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
