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
    scrollerGirth: 10,
    timestampColor: '#50fa7b',
    dragHandleWidth: 20,
  }
  const ACTIVE_CELL_CLASS = ' qg-c-active'
  const STYLE_TILE = 'qg-questdb-grid'
  const COLUMN_WIDTH_SELECTOR_PREFIX = 'qg-w'
  const NAV_EVENT_ANY_VERTICAL = 0
  const NAV_EVENT_LEFT = 1
  const NAV_EVENT_RIGHT = 2
  const NAV_EVENT_HOME = 3
  const NAV_EVENT_END = 4

  const bus = msgBus
  let style
  const grid = root[0]
  let viewport
  let canvas
  let header
  let columnResizeGhost
  let columnOffsets
  let columns = []
  let columnCount = 0
  let timestampIndex = -1
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
  let dbg
  let downKey = []
  // index of the leftmost visible column in the grid
  let visColumnLo = 0
  // visible column count, e.g. number of columns that is actually rendered in the grid
  let visColumnCount = 10
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
  const pendingRender = {colLo: 0, colHi: 0, nextVisColumnLo: 0, render: false}
  const scrollerGirth = defaults.scrollerGirth
  let headerScrollerPlaceholder
  let colResizeDragHandleStartX
  let colResizeMouseDownX
  let colResizeColIndex
  let colResizeColOrigOffset
  let colResizeColOrigWidth
  let colResizeOrigMargin

  let hoverEnabled = true
  let recomputeColumnWidthOnResize = false

  function setRowCount(rowCount) {
    r += rowCount
    yMax = r * rh
    if (yMax < defaults.yMaxThreshold) {
      h = yMax
    } else {
      h = defaults.yMaxThreshold
    }
    M = yMax / h
    canvas[0].style.height = (h === 0 ? 1 : h) + 'px'
  }

  function renderRow(row, rowIndex) {
    if (row.questIndex !== rowIndex) {
      const rowData = data[Math.floor(rowIndex / pageSize)]
      let k
      if (rowData) {
        const d = rowData[rowIndex % pageSize]
        if (d) {
          row.style.display = 'flex'
          for (k = 0; k < visColumnCount; k++) {
            setCellData(row.childNodes[(k + visColumnLo) % visColumnCount], d[k + visColumnLo])
          }
        } else {
          row.style.display = 'none'
        }
        row.questIndex = rowIndex
      } else {
        // clear grid if there is no row data
        for (k = 0; k < visColumnCount; k++) {
          row.childNodes[(k + visColumnLo) % visColumnCount].innerHTML = ''
        }
        row.questIndex = -1
      }
      row.style.top = rowIndex * rh - o + 'px'
      if (row === activeRowContainer) {
        if (rowIndex === activeRow) {
          row.className = 'qg-r qg-r-active'
          setFocus(row.childNodes[focusedCellIndex % visColumnCount])
        } else {
          row.className = 'qg-r'
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
    for (let i = 0, n = data.length; i < n; i++) {
      if ((i < loPage || i > hiPage) && data[i]) {
        delete data[i]
      }
    }
  }

  function getColumnWidthSelector(columnIndex) {
    return COLUMN_WIDTH_SELECTOR_PREFIX + columnIndex
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
    $.get('/exec', {query, limit: lo + 1 + ',' + hi, nm: true}).done(renderFunc)
  }

  function loadPagesDelayed(p1, p2) {
    if (queryTimer) {
      clearTimeout(queryTimer)
    }
    queryTimer = setTimeout(function () {
      loadPages(p1, p2)
    }, 75)
  }

  function computeDataPages(direction, t, b) {
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
      computeDataPages(direction, t, b)
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

  function getColumnColor(columnIndex) {
    if (columnIndex === timestampIndex) {
      return 'color: ' + defaults.timestampColor + ';'
    }
    return ''
  }

  function getColumnWidth(i) {
    return columnOffsets[i + 1] - columnOffsets[i]
  }

  function isLeftAligned(columnIndex) {
    const col = columns[columnIndex]
    if (col) {
      switch (col.type) {
        case 'STRING':
        case 'SYMBOL':
          return true
        default:
          return false
      }
    }
  }

  function getColumnWidthStyleSelector(columnIndex, width, left, isLeftAligned) {
    return '.' + getColumnWidthSelector(columnIndex) + '{width:' + width + 'px;' + 'position: absolute;' + 'left:' + left + 'px;' + (isLeftAligned ? 'text-align: left;' : '') + getColumnColor(columnIndex) + '}'
  }

  function createColumnWidthStyleRules(rules) {
    let left = 0
    // calculate CSS and width for all columns even though
    // we will render only a subset of them
    for (let i = 0; i < columnCount; i++) {
      const w = getColumnWidth(i)
      const la = isLeftAligned(i)
      rules.push(getColumnWidthStyleSelector(i, w, left, la))
      left += w
    }
    rules.push(getColumnWidthStyleSelector(columnCount, scrollerGirth, left))
    rules.push('.qg-r{width:' + totalWidth + 'px;}')
  }

  function createCellStyle() {
    if (data.length > 0) {
      // replace the stylesheet
      if (style) {
        style.remove()
      }

      style = document.createElement('style')
      style.title = STYLE_TILE
      document.head.append(style)

      const rules = []

      createColumnWidthStyleRules(rules)

      rules.push('.qg-c{height:' + rh + 'px;}')
      if (style.styleSheet) {
        // IE
        style.styleSheet.cssText = rules.join(' ')
      } else {
        style.appendChild(document.createTextNode(rules.join(' ')))
      }
    }
  }

  function broadcastColumnName(e) {
    bus.trigger('editor.insert.column', e.currentTarget.getAttribute('data-column-name'))
  }

  function columnResizeStart(e) {
    e.preventDefault()
    const target = e.target
    const className = e.target.className
    const i1 = className.indexOf(COLUMN_WIDTH_SELECTOR_PREFIX)
    let i2 = className.indexOf(' ', i1)
    if (i2 === -1) {
      i2 = className.length
    }
    // column index is derived from stylesheet selector name
    colResizeColIndex = parseInt(className.substr(i1 + 4, i2)) - 1
    colResizeColOrigOffset = columnOffsets[colResizeColIndex]
    colResizeColOrigWidth = getColumnWidth(colResizeColIndex)
    colResizeOrigMargin = target.style.marginLeft

    colResizeDragHandleStartX = target.offsetLeft + defaults.dragHandleWidth / 2
    colResizeMouseDownX = e.clientX

    document.onmousemove = columnResizeDrag
    document.onmouseup = columnResizeEnd

    columnResizeGhost.style.top = target.getBoundingClientRect().top + 'px'
    columnResizeGhost.style.left = colResizeDragHandleStartX + 'px'
    columnResizeGhost.style.height = (grid.getBoundingClientRect().height - (isHorizontalScroller() ? scrollerGirth : 0)) + 'px'
    columnResizeGhost.style.visibility = 'visible';

    // set initial width, in case there is no "drag"
    colResizeTargetWidth = colResizeColOrigWidth
  }

  // updates cell offset array after updating with of one of the columns
  function updateColumnWidth(columnIndex, width) {
    let offset = columnOffsets[columnIndex] + width
    for (let i = columnIndex + 1; i <= columnCount; i++) {
      const w = getColumnWidth(i);
      columnOffsets[i] = offset
      offset += w
    }
    totalWidth = columnOffsets[columnCount]
  }

  let colResizeTargetWidth = 0

  function columnResizeDrag(e) {
    e.preventDefault()
    const delta = e.clientX - colResizeMouseDownX
    const width = colResizeColOrigWidth + delta
    if (width > defaults.minColumnWidth) {
      columnResizeGhost.style.left = (colResizeDragHandleStartX + delta - viewport.scrollLeft) + 'px'
      colResizeTargetWidth = width
    }
  }

  function columnResizeEnd(e) {
    e.preventDefault()
    document.onmousemove = null
    document.onmouseup = null

    updateColumnWidth(colResizeColIndex, colResizeTargetWidth)
    createCellStyle()
    ensureCellsFillVisibleWindow()

    columnResizeGhost.style.visibility = 'hidden';
    columnResizeGhost.style.left = 0;
  }

  function getCellWidth(valueLen) {
    return Math.max(defaults.minColumnWidth, Math.ceil(valueLen * 8 * 1.2));
  }

  function createHeaderElements() {
    columnOffsets = []
    let i, w
    totalWidth = 0
    let lastColLeftAligned = false;
    for (i = 0; i < columnCount; i++) {
      const c = columns[i]
      const la = isLeftAligned(i)

      const h = document.createElement('div')
      h.className = 'qg-header ' + getColumnWidthSelector(i)
      h.setAttribute('data-column-name', c.name)
      if (isLeftAligned(i)) {
        h.className += ' qg-header-l'
      }

      const hType = document.createElement('span')
      hType.className = 'qg-header-type'
      hType.innerHTML = c.type.toLowerCase()

      const hName = document.createElement('span')
      hName.className = 'qg-header-name'
      hName.innerHTML = c.name

      if (i > 0) {
        // drag handle for this column is located on left side of i+1 column (visually). So column
        // 0 does not have drag handle
        const handle = document.createElement('div')
        handle.className = 'qg-drag-handle ' + getColumnWidthSelector(i) + (la ? ' qg-drag-handle-l' : '')
        // handle.innerHTML = i
        handle.onmousedown = columnResizeStart
        header.append(handle)
        const hBorderSpan = document.createElement('span')
        hBorderSpan.className = 'qg-header-border'
        h.append(hBorderSpan)
      }

      h.append(hName, hType)
      h.onclick = broadcastColumnName
      header.append(h)

      w = getCellWidth(c.name.length + c.type.length)
      columnOffsets.push(totalWidth)
      totalWidth += w

      lastColLeftAligned = la
    }

    const handle = document.createElement('div')
    handle.className = 'qg-drag-handle ' + getColumnWidthSelector(columnCount)
    handle.onmousedown = columnResizeStart
    header.append(handle)

    headerScrollerPlaceholder = document.createElement('div')
    headerScrollerPlaceholder.className = 'qg-header qg-stub ' + getColumnWidthSelector(columnCount)
    header.append(headerScrollerPlaceholder)

    columnOffsets.push(totalWidth)
  }

  function clear() {
    top = 0
    y = 0
    o = 0
    r = 0

    if (style) {
      style.remove()
    }
    header.innerHTML = ''
    canvas[0].innerHTML = ''
    rows = []
    data = []
    query = null
    loPage = 0
    hiPage = 0
    downKey = []
    activeRowContainer = null
    focusedCell = null
    activeRow = 0
    focusedCellIndex = -1
    visColumnLo = 0
    visColumnCount = 10
    lastKnownViewportWidth = 0
    timestampIndex = -1
    recomputeColumnWidthOnResize = false
    enableHover()
  }

  function logDebug() {
    if (dbg) {
      dbg.empty()
      dbg.append('time = ' + new Date() + '<br>')
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
    disableHover()
  }

  function removeClass(e, className) {
    e.className = e.className.replace(className, '')
  }

  function addClass(e, className) {
    if (e && !e.className.includes(className)) {
      e.className += className
    }
  }

  function removeFocus(cell) {
    removeClass(cell, ACTIVE_CELL_CLASS)
  }

  function setFocus(cell) {
    addClass(cell, ACTIVE_CELL_CLASS)
  }

  function setCellData(cell, cellData) {
    cell.innerHTML = cellData !== null ? cellData.toString() : 'null'
  }

  function setCellDataAndAttributes(row, rowData, cellIndex) {
    const cell = row.childNodes[cellIndex % visColumnCount]
    cell.className = 'qg-c ' + getColumnWidthSelector(cellIndex)
    cell.cellIndex = cellIndex
    setCellData(cell, rowData[cellIndex])
  }

  function renderCells(colLo, colHi, nextVisColumnLo) {
    if (rows.length > 0 && columnCount > 0) {

      pendingRender.colLo = colLo
      pendingRender.colHi = colHi
      pendingRender.nextVisColumnLo = nextVisColumnLo
      pendingRender.render = false

      let t = Math.max(0, Math.floor((y - viewportHeight) / rh))
      let b = Math.min(yMax / rh, Math.ceil((y + viewportHeight + viewportHeight) / rh))
      // adjust t,b to back-fill the entire "rows" contents
      // t,b lands us somewhere in the middle of rows array when adjusted to `dcn`
      // we want to cover all the rows
      t -= (t & dcn)
      b = b - (b & dcn) + dc

      for (let i = t; i < b; i++) {
        const row = rows[i & dcn]
        const m = Math.floor(i / pageSize)
        const n = i % pageSize
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
          pendingRender.render = true
        }
      }
      visColumnLo = Math.max(0, Math.min(nextVisColumnLo, columnCount - visColumnCount))
      computeVisibleColumnsPosition()
    }
  }

  function setScrollLeft(scrollLeft, focusedCell) {
    const before = viewport.scrollLeft
    viewport.scrollLeft = scrollLeft
    header.scrollLeft = scrollLeft
    if (before === viewport.scrollLeft) {
      setFocus(focusedCell)
    }
  }

  function updateFocusedCellFromIndex() {
    if (focusedCellIndex !== -1) {
      focusedCell = activeRowContainer.childNodes[focusedCellIndex % visColumnCount]
    }
  }

  function activeCellOn(navEvent) {
    if (navEvent === NAV_EVENT_HOME && visColumnLo > 0 && columnCount > visColumnCount) {
      renderCells(0, visColumnCount, 0)
    } else if (navEvent === NAV_EVENT_END && visColumnLo + visColumnCount < columnCount) {
      renderCells(columnCount - visColumnCount, columnCount, columnCount - visColumnCount)
    }

    updateFocusedCellFromIndex()

    const columnOffset = columnOffsets[focusedCellIndex]
    const columnWidth = columnOffsets[focusedCellIndex + 1] - columnOffset

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
      activeRow = Math.max(0, activeRow - n)
      activeRowContainer.className = 'qg-r'
      activeCellOff()
      activeRowContainer = rows[activeRow & dcn]
      activeRowContainer.className = 'qg-r qg-r-active'
      activeCellOn(NAV_EVENT_ANY_VERTICAL)
      const scrollTop = activeRow * rh - o - 5 // top margin
      if (scrollTop < viewport.scrollTop) {
        viewport.scrollTop = Math.max(0, scrollTop)
      }
    }
  }

  function isHorizontalScroller() {
    return viewport.scrollWidth > lastKnownViewportWidth
  }

  function activeRowDown(n) {
    if (activeRow > -1 && activeRow < r - 1) {
      activeRow = Math.min(r - 1, activeRow + n)
      activeRowContainer.className = 'qg-r'
      activeCellOff()
      activeRowContainer = rows[activeRow & dcn]
      activeRowContainer.className = 'qg-r qg-r-active'
      activeCellOn(NAV_EVENT_ANY_VERTICAL)
      const scrollTop = activeRow * rh - viewportHeight + rh - o
      const sh = isHorizontalScroller() ? scrollerGirth : 0
      if (scrollTop > viewport.scrollTop) {
        viewport.scrollTop = scrollTop + sh
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
        while (w > vpl && k > 0) {
          w -= getColumnWidth(--k)
        }

        const z = Math.min(visColumnCount, visColumnLo - k)
        renderCells(k, Math.min(z + k, columnCount), k)
      }
    }
  }

  function enableHover() {
    if (!hoverEnabled) {
      addClass(grid, 'qg-hover')
      hoverEnabled = true
    }
  }

  function disableHover() {
    if (hoverEnabled) {
      removeClass(grid, 'qg-hover')
      hoverEnabled = false
    }
  }

  function scroll(event) {

    if (header.scrollLeft !== viewport.scrollLeft) {
      header.scrollLeft = viewport.scrollLeft
    }

    renderColumns()

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

    setFocus(focusedCell)
    logDebug()
  }

  function computeVisibleColumnWindow() {
    const viewportWidth = viewport.getBoundingClientRect().width
    if (totalWidth < viewportWidth) {
      // viewport is wider than total column width
      visColumnCount = columnCount
      visColumnLo = 0
      computeVisibleColumnsPosition()
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
      visColumnCount = Math.min(count, columnCount)
      // When scroller is positioned to extreme right, window resize pulls left side
      // of the grid into the view. In other scroller positions right side of the grid is extended first.
      // The delta is by how much we overshot our column count. If non-zero, we have to reduce `lo`
      const delta = visColumnLo + visColumnCount - columnCount
      if (delta > 0 && visColumnLo >= delta) {
        visColumnLo -= delta
        computeVisibleColumnsPosition()
        // visColumnX -= xShift
      }
    }
  }

  function removeCellElements(colCount) {
    for (let i = 0, n = rows.length; i < n; i++) {
      const row = rows[i]
      for (let j = visColumnCount; j < colCount; j++) {
        // as we remove, the children shift left
        row.childNodes[visColumnCount].remove()
      }
    }
    renderCells(visColumnLo, visColumnLo + visColumnCount, visColumnLo)
  }

  function addCellElements(colCount) {
    for (let i = 0, n = rows.length; i < n; i++) {
      const row = rows[i]
      // add extra cells
      for (let j = 0; j < colCount; j++) {
        const div = document.createElement('div')
        div.onclick = rowClick
        row.append(div)
      }

      // re-index exiting cells
      for (let j = 0; j < visColumnCount; j++) {
        row.childNodes[j].className = 'qg-c ' + getColumnWidthSelector((visColumnLo + j) % visColumnCount)
      }

    }
    renderCells(visColumnLo, visColumnLo + visColumnCount, visColumnLo)
  }

  function isVerticalScroller() {
    // bounding rect height is floating point number, may not be exact match for integer
    return Math.abs(viewport.scrollHeight - viewport.getBoundingClientRect().height) > 0.8
  }

  function toggleScrollerPlaceholder() {
    if (headerScrollerPlaceholder) {
      headerScrollerPlaceholder.style.display = isHorizontalScroller() && isVerticalScroller() ? 'block' : 'none'
    }
  }

  function ensureCellsFillVisibleWindow() {
    toggleScrollerPlaceholder()
    const prevVisColumnCount = visColumnCount
    computeVisibleColumnWindow()
    if (prevVisColumnCount < visColumnCount) {
      addCellElements(visColumnCount - prevVisColumnCount)
    } else if (prevVisColumnCount > visColumnCount) {
      removeCellElements(prevVisColumnCount)
    }
  }

  function resize() {
    // If viewport is invisible when grid is updated it is not possible
    // to calculate column width correctly. When grid becomes visible again, resize()
    // is called where we continue calculating column widths. resize() can also be
    // called under many other circumstances, so width calculation is conditional
    if (recomputeColumnWidthOnResize) {
      recomputeColumnWidthOnResize = false
      computeColumnWidths()
    }

    if (grid.style.display !== 'none') {
      viewportHeight = Math.max(viewport.getBoundingClientRect().height, defaults.minVpHeight)
      rowsInView = Math.floor(viewportHeight / rh)
      const viewportWidth = viewport.getBoundingClientRect().width
      if (lastKnownViewportWidth !== viewportWidth) {
        lastKnownViewportWidth = viewportWidth
        ensureCellsFillVisibleWindow();
      }
      scroll()
    }
  }

  function rowClick() {
    if (activeRowContainer) {
      activeRowContainer.className = 'qg-r'
    }
    this.focus()
    activeRowContainer = this.parentElement
    activeRowContainer.className += ' qg-r-active'
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
    delete downKey['which' in e ? e.which : e.keyCode]
  }

  function copyActiveCellToClipboard() {
    if (focusedCell) {
      navigator.clipboard.writeText(focusedCell.innerHTML)
    }
  }

  function onKeyDown(e) {
    const keyCode = 'which' in e ? e.which : e.keyCode
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
      case 67: // Ctrl+C (copy)
      case 45: // Ctrl+Insert (copy)
        copyActiveCellToClipboard()
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

  function createRowElements() {
    for (let i = 0; i < dc; i++) {
      const rowDiv = document.createElement('div')
      rowDiv.className = 'qg-r'
      rowDiv.tabIndex = i + i

      if (i === 0) {
        activeRowContainer = rowDiv
      }
      for (let k = 0; k < visColumnCount; k++) {
        const cell = document.createElement('div')
        cell.className = 'qg-c ' + getColumnWidthSelector(k)
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
      canvas[0].append(rowDiv)
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

  function computeColumnWidths() {
    const maxWidth = viewport.getBoundingClientRect().width * 0.8
    recomputeColumnWidthOnResize = maxWidth < 0.1

    if (!recomputeColumnWidthOnResize && data && data.length > 0) {
      const dataBatch = data[0]
      const dataBatchLen = dataBatch.length
      // a little inefficient, but lets traverse
      let offset = 0
      for (let i = 0; i < columnCount; i++) {
        // this assumes that initial width has been set to the width of the header
        let w = getColumnWidth(i)
        for (let j = 0; j < dataBatchLen; j++) {
          columnOffsets[i] = offset
          const value = dataBatch[j][i]
          const str = value !== null ? value.toString() : "null"
          w = Math.min(maxWidth, Math.max(w, getCellWidth(str.length)))
        }
        offset += w
      }
      columnOffsets[columnCount] = offset
      totalWidth = offset;
    }
  }

  function update(x, m) {
    $('.js-query-refresh .fa').removeClass('fa-spin')

    setTimeout(() => {
        clear()
        query = m.query
        data.push(m.dataset)
        columns = m.columns
        columnCount = columns.length
        timestampIndex = m.timestamp
        createHeaderElements()
        computeVisibleColumnWindow()
        // visible position depends on correctness of visColumnCount value
        computeVisibleColumnsPosition()
        computeColumnWidths()
        createRowElements()
        setRowCount(m.count)
        viewport.scrollTop = 0
        // makes browser render visuals for the given column widths
        createCellStyle()
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
      $('.js-query-refresh .fa').removeClass('fa-spin')
    }
  }

  function bind() {
    dbg = $('#debug')
    header = document.createElement('div')
    addClass(header, 'qg-header-row')

    viewport = document.createElement('div')
    viewport.onscroll = scroll
    addClass(viewport, 'qg-viewport')


    grid.append(header, viewport)
    // when grid is navigated via keyboard, mouse hover is disabled
    // to not to confuse user. Hover is then re-enabled on mouse move
    grid.onmousemove = enableHover

    canvas = $('<div>')
    canvas[0].className = 'qg-canvas'
    // we're using jQuery here to handle key bindings
    canvas.bind('keydown', onKeyDown)
    canvas.bind('keyup', onKeyUp)

    columnResizeGhost = document.createElement('div')
    columnResizeGhost.className = 'qg-col-resize-ghost'

    viewport.append(canvas[0], columnResizeGhost)

    window.onresize = resize

    bus.on(qdb.MSG_QUERY_DATASET, update)
    bus.on('grid.focus', focusCell)
    bus.on('grid.refresh', refreshQuery)
    bus.on('grid.publish.query', publishQuery)
    bus.on(qdb.MSG_ACTIVE_PANEL, resize)
  }

  bind()
  resize()
}
