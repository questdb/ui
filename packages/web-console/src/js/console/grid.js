/*******************************************************************************
 *     ___                  _   ____  ____
 *    / _ \ _   _  ___  ___| |_|  _ \| __ )
 *   | | | | | | |/ _ \/ __| __| | | |  _ \
 *   | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *    \__\_\\__,_|\___||___/\__|____/|____/
 *
 *  Copyright (c) 2014-2019 Appsicle
 *  Copyright (c) 2019-2023 QuestDB
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
    gridID: 'qdb-grid',
    minColumnWidth: 60,
    rowHeight: 28,
    divCacheSize: 64,
    viewportHeight: 400,
    yMaxThreshold: 10000000,
    maxRowsToAnalyze: 100,
    minVpHeight: 120,
    minDivHeight: 160,
    scrollerGirth: 10,
    dragHandleWidth: 20,
    dataPageSize: 1000,
    layoutStoreTimeout: 1000
  }
  const ACTIVE_CELL_CLASS = 'qg-c-active'
  const NAV_EVENT_ANY_VERTICAL = 0
  const NAV_EVENT_LEFT = 1
  const NAV_EVENT_RIGHT = 2
  const NAV_EVENT_HOME = 3
  const NAV_EVENT_END = 4

  const bus = msgBus
  const gridID = defaults.gridID
  const layoutStoreID = gridID + '.columnLayout'
  const grid = root[0]
  let viewport
  let canvas
  let header
  let panelLeft
  let panelLeftWidth
  let viewportLeft
  let canvasLeft
  let headerLeft
  let activeRowContainerLeft
  let freezeLeft = 3
  let rowsLeft = []
  let columnResizeGhost
  let columnOffsets
  let columns = []
  let columnCount = 0
  let rowCount
  let timestampIndex = -1
  let data = []
  let totalWidth = -1
  // number of divs in "rows" cache, has to be power of two
  const dc = defaults.divCacheSize
  const dcn = dc - 1
  const pageSize = defaults.dataPageSize
  const oneThirdPage = Math.floor(pageSize / 3)
  const twoThirdsPage = oneThirdPage * 2
  let loPage
  let hiPage
  let query
  let queryTimer
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
  let headerStub
  let colResizeDragHandleStartX
  let colResizeMouseDownX
  let colResizeColIndex
  let colResizeColOrigOffset
  let colResizeColOrigWidth
  // let colResizeOrigMargin
  let colResizeTargetWidth = 0
  let colResizeTimer

  let hoverEnabled = true
  let recomputeColumnWidthOnResize = false

  // Persisted state of column layout. By that I mean remembering columns that have been manually resized
  // and storing their widths. The width are keyed against "column set", which is SHA-256 of JSON list of {name, type} pairs.
  // Technically it is possible (though improbable) that two column sets will have the same SHA-256. In which case
  // width of columns by the same name will be reused.
  let layoutStoreCache = {}
  let layoutStoreTextEncoder = new TextEncoder()
  let layoutStoreColumnSetKey = undefined
  let layoutStoreColumnSetSha256 = undefined
  let layoutStoreTimer

  // Timer that restores style of pulsed cell.
  // Cell will pulse when its content is copied to clipboard
  let activeCellPulseClearTimer

  // Freezing left columns. We should be able to freeze 0..N columns on the left. What this means that frozen
  // columns will be pinned at their positions in the viewport (always visible). The rest of the columns should
  // scroll normally without obscuring pinned columns. To get there we do the following:

  // 1. limit left position of where columns can be rendered, e.g. offset render of all columns by given number of pixels.
  // 2. reduce virtual viewport size by the left offset value
  // 3. render pinned columns separately with 0 left offset

  function computeCanvasHeight() {
    r = rowCount
    yMax = r * rh
    if (yMax < defaults.yMaxThreshold) {
      h = yMax
    } else {
      h = defaults.yMaxThreshold
    }
    M = yMax / h
    const canvasHeight = (h === 0 ? 1 : h) + 'px'
    canvas[0].style.height = canvasHeight
    canvasLeft.style.height = canvasHeight
  }

  function renderRow(row, rowIndex, colLo, colHi) {
    if (row.questIndex !== rowIndex) {
      const rowData = data[Math.floor(rowIndex / pageSize)]
      let k
      if (rowData) {
        const d = rowData[rowIndex % pageSize]
        if (d) {
          row.style.display = 'flex'
          for (k = colLo; k < colHi; k++) {
            setCellData(row.childNodes[k % colHi], d[k])
          }
          row.questIndex = rowIndex
        } else {
          row.style.display = 'none'
          row.questIndex = -1
        }
      } else {
        // clear grid if there is no row data
        for (k = colLo; k < colHi; k++) {
          row.childNodes[k % colHi].innerHTML = ''
        }
        row.questIndex = -1
      }
      row.style.top = rowIndex * rh - o + 'px'
    }
  }

  function setViewportScrollTop(scrollTop) {
    viewport.scrollTop = scrollTop
    viewportLeft.scrollTop = scrollTop
  }

  function renderViewportNoCompute() {
    // calculate the viewport + buffer
    const bounds = computeRowBounds()
    const t = bounds.t
    const b = bounds.b

    for (let i = t; i < b; i++) {
      renderRow(rows[i & dcn], i, Math.max(visColumnLo, freezeLeft), visColumnCount)
      renderRow(rowsLeft[i & dcn], i, 0, freezeLeft)
    }

    if (pendingRender.render) {
      renderCells(rows, pendingRender.colLo, pendingRender.colHi, pendingRender.nextVisColumnLo)
    }
  }

  function purgeOutlierPages() {
    for (let i = 0, n = data.length; i < n; i++) {
      if ((i < loPage || i > hiPage) && data[i]) {
        delete data[i]
      }
    }
  }

  function empty(x) {
    return data[x] === null || data[x] === undefined || data[x].length === 0
  }

  function setHeaderCellWidth(cell, width) {
    cell.style.minWidth = width + 'px'
    cell.style.maxWidth = width + 'px'
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

  function computeRowBounds() {
    let t = Math.max(0, Math.floor((y) / rh))
    let b = Math.min(yMax / rh, Math.ceil((y + viewportHeight) / rh))
    return {t: t, b: b}
  }

  function renderRows(direction) {
    // calculate the viewport + buffer
    const bounds = computeRowBounds()
    let t = bounds.t
    let b = bounds.b

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
        renderRow(row, i, Math.min(columnCount, Math.max(visColumnLo, freezeLeft)), visColumnCount)
        renderRow(rowsLeft[i & dcn], i, 0, Math.min(freezeLeft, columnCount))
      }
    }
  }

  function getColumnOffset(columnIndex) {
    return columnOffsets[columnIndex]
  }

  function getColumnWidth(columnIndex) {
    return columnOffsets[columnIndex + 1] - columnOffsets[columnIndex]
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

  function broadcastColumnName(e) {
    // avoid broadcasting fat finger clicks
    if (colResizeColIndex === -1) {
      bus.trigger('editor.insert.column', e.currentTarget.getAttribute('data-column-name'))
    }
  }

  function colResizeClearTimer() {
    if (colResizeTimer) {
      clearTimeout(colResizeTimer)
      colResizeTimer = undefined
    }
  }

  function getColResizeGhostLeft(delta, colResizeColIndex) {
    return (colResizeDragHandleStartX + delta - (colResizeColIndex < freezeLeft ? 0 : viewport.scrollLeft)) + 'px'
  }

  function columnResizeStart(e) {
    e.preventDefault()

    colResizeClearTimer()

    const target = e.target
    // column index is derived from stylesheet selector name
    colResizeColIndex = target.columnIndex
    colResizeColOrigOffset = getColumnOffset(colResizeColIndex)
    colResizeColOrigWidth = getColumnWidth(colResizeColIndex)
    const parent = target.parentElement
    // we place ghost on the right side of the column that is being resized
    colResizeDragHandleStartX = parent.offsetLeft + parent.getBoundingClientRect().width
    colResizeMouseDownX = e.clientX

    document.onmousemove = columnResizeDrag
    document.onmouseup = columnResizeEnd

    columnResizeGhost.style.top = 0
    columnResizeGhost.style.left = getColResizeGhostLeft(0, colResizeColIndex)
    columnResizeGhost.style.height = (grid.getBoundingClientRect().height - (isHorizontalScroller() ? scrollerGirth : 0)) + 'px'
    columnResizeGhost.style.visibility = 'visible'

    // set initial width, in case there is no "drag"
    colResizeTargetWidth = colResizeColOrigWidth
  }

  // updates cell offset array after updating with of one of the columns
  function updateColumnWidth(columnIndex, width) {
    let offset = columnOffsets[columnIndex] + width
    for (let i = columnIndex + 1; i <= columnCount; i++) {
      const w = getColumnWidth(i)
      columnOffsets[i] = offset
      offset += w
    }
    totalWidth = columnOffsets[columnCount]
  }

  function columnResizeDrag(e) {
    e.preventDefault()
    const delta = e.clientX - colResizeMouseDownX
    const width = colResizeColOrigWidth + delta
    if (width > defaults.minColumnWidth) {
      columnResizeGhost.style.left = getColResizeGhostLeft(delta, colResizeColIndex)
      colResizeTargetWidth = width
    }
  }

  function layoutStoreGetColumnSetSha2560(callback) {
    const data = layoutStoreTextEncoder.encode(layoutStoreColumnSetKey)
    const promise = crypto.subtle.digest('SHA-256', data)
    promise.then((buf) => {
      layoutStoreColumnSetSha256 = btoa(
        new Uint8Array(buf)
          .reduce((data, byte) => data + String.fromCharCode(byte), '')
      )
      callback()
    })
  }

  function layoutStoreComputeKeyAndHash(callback) {
    // SHA-256 is that of the "key" and "key" is
    // stringified JSON. This JSON is a list of column name + type pairs. The idea
    // is to remember column layout for column set but not row set.
    const columnSet = []
    for (let i = 0; i < columnCount; i++) {
      columnSet.push({name: columns[i].name, type: columns[i].type})
    }
    layoutStoreColumnSetKey = JSON.stringify(columnSet)
    layoutStoreGetColumnSetSha2560(callback)
  }

  function layoutStoreSaveAll0() {
    window.localStorage.setItem(layoutStoreID, JSON.stringify(layoutStoreCache))
  }

  function layoutStoreSaveAll() {
    if (layoutStoreTimer) {
      clearTimeout(layoutStoreTimer)
    }
    layoutStoreTimer = setTimeout(layoutStoreSaveAll0, defaults.layoutStoreTimeout)
  }

  function layoutStoreSaveColumnChange(columnName, width) {
    let entry = layoutStoreCache[layoutStoreColumnSetSha256]
    if (entry === undefined) {
      const deviants = {}
      deviants[columnName] = width
      entry = {key: layoutStoreColumnSetKey, deviants: deviants}
      layoutStoreCache[layoutStoreColumnSetSha256] = entry
    } else {
      entry.deviants[columnName] = width
    }
    layoutStoreSaveAll()
  }

  function setColumnWidth(columnIndex, width) {
    updateColumnWidth(columnIndex, width)
    // update header width
    if (columnIndex < freezeLeft) {
      setHeaderCellWidth(headerLeft.childNodes[columnIndex], width)
      renderCells(rowsLeft, 0, Math.min(freezeLeft, columnCount), visColumnLo)
      computePanelLeftWidth()
      applyPanelLeftWidth()
    } else {
      setHeaderCellWidth(header.childNodes[columnIndex - freezeLeft], width)
    }
    ensureCellsFillViewport()
    renderCells(rows, visColumnLo, visColumnLo + visColumnCount, visColumnLo)
  }

  function columnResizeEnd(e) {
    e.preventDefault()
    document.onmousemove = null
    document.onmouseup = null
    setColumnWidth(colResizeColIndex, colResizeTargetWidth)

    columnResizeGhost.style.visibility = 'hidden'
    columnResizeGhost.style.left = 0

    colResizeTimer = setTimeout(
      () => {
        // delay clearing drag end to prevent overlapping header click
        colResizeColIndex = -1
      },
      500
    )
    layoutStoreSaveColumnChange(columns[colResizeColIndex].name, colResizeTargetWidth)
  }

  function getCellWidth(valueLen) {
    return Math.max(defaults.minColumnWidth, Math.ceil(valueLen * 8 * 1.2))
  }

  function createHeaderElements(header, columnCount, freezeLeft) {
    for (let i = freezeLeft; i < columnCount; i++) {
      const c = columns[i]
      const h = document.createElement('div')
      addClass(h, 'qg-header')
      setHeaderCellWidth(h, getColumnWidth(i))
      h.setAttribute('data-column-name', c.name)

      if (i === freezeLeft) {
        h.style.marginLeft = (freezeLeft > 0 ? panelLeftWidth : 0) + 'px'
      }

      if (isLeftAligned(i)) {
        addClass(h, 'qg-header-l')
      }

      const hType = document.createElement('span')
      addClass(hType, 'qg-header-type')
      hType.innerHTML = c.type.toLowerCase()

      const hName = document.createElement('span')
      addClass(hName, 'qg-header-name')
      hName.innerHTML = c.name

      const handle = document.createElement('div')
      addClass(handle, 'qg-drag-handle')
      handle.columnIndex = i
      handle.onmousedown = columnResizeStart

      const hBorderSpan = document.createElement('span')
      addClass(hBorderSpan, 'qg-header-border')
      h.append(handle, hBorderSpan)
      h.append(hName, hType)
      h.onclick = broadcastColumnName
      header.append(h)
    }

    const stub = document.createElement('div')
    stub.className = 'qg-header qg-stub'
    stub.style.width = scrollerGirth + 'px'
    header.append(stub)
    return stub
  }

  function computeHeaderWidths() {
    columnOffsets = []
    totalWidth = 0
    for (let i = 0; i < columnCount; i++) {
      const c = columns[i]
      const w = getCellWidth(c.name.length + c.type.length)
      columnOffsets.push(totalWidth)
      totalWidth += w
    }
    columnOffsets.push(totalWidth)
  }

  function clear() {
    top = 0
    y = 0
    o = 0
    r = 0

    header.innerHTML = ''
    headerLeft.innerHTML = ''
    canvas[0].innerHTML = ''
    canvasLeft.innerHTML = ''
    rows = []
    rowsLeft = []
    data = []
    query = null
    loPage = 0
    hiPage = 0
    downKey = []
    columnCount = 0
    rowCount = 0
    activeRowContainer = null
    activeRowContainerLeft = null
    focusedCell = null
    activeRow = 0
    focusedCellIndex = -1
    visColumnLo = 0
    visColumnCount = 10
    lastKnownViewportWidth = 0
    timestampIndex = -1
    activeRow = -1
    recomputeColumnWidthOnResize = false
    // -1 means column is not being resized, anything else means user drags resize handle
    // this is to prevent overlapping events actioning anything accidentally
    colResizeColIndex = -1
    colResizeClearTimer()
    layoutStoreColumnSetKey = undefined
    layoutStoreColumnSetSha256 = undefined
    panelLeftWidth = 0
    enableHover()
  }

  function removeClass(e, className) {
    e.classList.remove(className)
  }

  function addClass(e, className) {
    if (e) {
      e.classList.add(className)
    }
  }

  function removeFocus(cell) {
    removeClass(cell, ACTIVE_CELL_CLASS)
  }

  function setFocus() {
    addClass(focusedCell, ACTIVE_CELL_CLASS)
  }

  function setFocusedCell(cell) {
    if (cell && focusedCell !== cell) {
      if (focusedCell) {
        removeFocus(focusedCell)
      }
      focusedCell = cell
      focusedCellIndex = cell.cellIndex
      setFocus()
    }
  }

  function setCellData(cell, cellData) {
    if (cellData !== null) {
      cell.innerHTML = cellData.toString()
      cell.classList.remove('qg-null')
    } else {
      cell.innerHTML = 'null'
      cell.classList.add('qg-null')
    }
  }

  function setCellDataAndAttributes(row, rowData, cellIndex) {
    const cell = row.childNodes[cellIndex % visColumnCount]
    configureCell(cell, cellIndex)
    setCellData(cell, rowData[cellIndex])
  }

  function getNonFrozenColLo(colLo) {
    return Math.max(freezeLeft, colLo)
  }

  function renderCells(rows, colLo, colHi, nextVisColumnLo) {
    if (rows.length > 0 && columnCount > 0) {

      pendingRender.colLo = colLo
      pendingRender.colHi = colHi
      pendingRender.nextVisColumnLo = nextVisColumnLo
      pendingRender.render = false

      const bounds = computeRowBounds()
      let t = bounds.t
      let b = bounds.b
      // adjust t,b to back-fill the entire "rows" contents
      // t,b lands us somewhere in the middle of rows array when adjusted to `dcn`
      // we want to cover all the rows
      t -= (t & dcn)
      b = b - (b & dcn) + dc

      for (let i = t; i < b; i++) {
        const row = rows[i & dcn]
        row.style.width = totalWidth + 'px'
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

  function setScrollLeft(scrollLeft) {
    const before = viewport.scrollLeft
    viewport.scrollLeft = scrollLeft
    header.scrollLeft = scrollLeft
    if (before === viewport.scrollLeft) {
      setFocus()
    }
  }

  function updateFocusedCellFromIndex() {
    if (focusedCellIndex !== -1) {
      const cell = focusedCellIndex < freezeLeft ? activeRowContainerLeft.childNodes[focusedCellIndex] : activeRowContainer.childNodes[focusedCellIndex % visColumnCount]
      cell.cellIndex = focusedCellIndex
      setFocusedCell(cell)
    }
  }

  function updateCellViewport(navEvent) {
    if (navEvent === NAV_EVENT_HOME && visColumnLo > 0 && columnCount > visColumnCount) {
      renderCells(rows, freezeLeft, visColumnCount, 0)
    } else if (navEvent === NAV_EVENT_END && visColumnLo + visColumnCount < columnCount) {
      renderCells(rows, getNonFrozenColLo(columnCount - visColumnCount), columnCount, columnCount - visColumnCount)
    }

    const columnOffset = getColumnOffset(focusedCellIndex)
    const columnWidth = getColumnWidth(focusedCellIndex)

    if (navEvent !== NAV_EVENT_ANY_VERTICAL) {
      const w = Math.max(0, columnOffset - panelLeftWidth)
      if (w < viewport.scrollLeft) {
        setScrollLeft(w)
      } else if (w > viewport.scrollLeft) {
        const w = columnOffset + columnWidth
        if (w > viewport.scrollLeft + viewport.clientWidth) {
          setScrollLeft(w - viewport.clientWidth)
        }
      }
    }
    updateFocusedCellFromIndex()
  }

  function activeRowUp(n) {
    if (activeRow > 0) {
      activeRow = Math.max(0, activeRow - n)
      setBothRowsInactive()
      disableHover()
      setBothRowsActive()
      updateCellViewport(NAV_EVENT_ANY_VERTICAL)
      const scrollTop = activeRow * rh - o - 5 // top margin
      if (scrollTop < viewport.scrollTop) {
        setViewportScrollTop(Math.max(0, scrollTop))
      }
    }
  }

  function isHorizontalScroller() {
    return viewport.scrollWidth > lastKnownViewportWidth
  }

  function setRowActive(rows) {
    const row = rows[activeRow & dcn]
    row.className = 'qg-r qg-r-active'
    return row
  }

  function setBothRowsActive() {
    activeRowContainer = setRowActive(rows)
    activeRowContainerLeft = setRowActive(rowsLeft)
  }

  function setBothRowsInactive() {
    if (activeRowContainer) {
      activeRowContainer.className = 'qg-r'
    }
    if (activeRowContainerLeft) {
      activeRowContainerLeft.className = 'qg-r'
    }
  }

  function activeRowDown(n) {
    if (activeRow > -1 && activeRow < r - 1) {
      activeRow = Math.min(r - 1, activeRow + n)
      setBothRowsInactive()
      disableHover()
      setBothRowsActive();
      updateCellViewport(NAV_EVENT_ANY_VERTICAL)
      const scrollTop = activeRow * rh - viewportHeight + rh - o
      const sh = isHorizontalScroller() ? scrollerGirth : 0
      if (scrollTop > viewport.scrollTop) {
        setViewportScrollTop(scrollTop + sh)
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
          renderCells(rows, getNonFrozenColLo(visColumnCount + visColumnLo), Math.min(visColumnCount + k, columnCount), k)
        } else if (k === -1) {
          // the data cells disappeared from the view entirely. Render cells in the new view.
          // calculate columns we need to render. We know the width of data cells up to the right edge of what we have
          // from this right edge we move right until we find column that comes into view. This will be our first render column
          let w = colRightEdge
          let k = visColumnCount + visColumnLo
          while (w < vpl) {
            w += getColumnWidth(++k)
          }
          renderCells(rows, getNonFrozenColLo(k), Math.min(visColumnCount + k, columnCount), k)
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
        renderCells(rows, getNonFrozenColLo(k), Math.min(z + k, columnCount), k)
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

    const scrollLeft = viewport.scrollLeft
    const scrollTop = viewport.scrollTop

    if (header.scrollLeft !== scrollLeft) {
      header.scrollLeft = scrollLeft
    }

    // give visual cue panels overlapping
    if (freezeLeft > 0) {
      if (scrollLeft > 0) {
        addClass(panelLeft, 'qg-panel-scrolled-left')
      } else {
        removeClass(panelLeft, 'qg-panel-scrolled-left')
      }
    }

    if (scrollTop > 0) {
      addClass(header, 'qg-panel-scrolled-top')
      addClass(headerLeft, 'qg-panel-scrolled-top')
    } else {
      removeClass(header, 'qg-panel-scrolled-top')
      removeClass(headerLeft, 'qg-panel-scrolled-top')
    }

    renderColumns()

    if (scrollTop !== top || !event) {
      const oldY = y
      // if grid content fits in viewport we don't need to adjust activeRow
      if (scrollTop >= h - viewportHeight) {
        // final leap to bottom of grid
        // this happens when container div runs out of vertical height
        // and we artificially force leap to bottom
        y = Math.max(0, yMax - viewportHeight)
        top = scrollTop
        o = Math.max(0, y - top)
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
    syncViewportLeftScroll()
    setFocus()
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
    renderCells(rows, getNonFrozenColLo(visColumnLo), visColumnLo + visColumnCount, visColumnLo)
  }

  function addCellElements(colCount) {
    for (let i = 0, n = rows.length; i < n; i++) {
      const row = rows[i]
      // add extra cells
      for (let j = 0; j < colCount; j++) {
        const div = document.createElement('div')
        div.className = 'qg-c'
        row.append(div)
      }

      // re-index exiting cells
      for (let j = 0; j < visColumnCount; j++) {
        configureCell(row.childNodes[j], visColumnLo + j)
      }

    }
    renderCells(rows, getNonFrozenColLo(visColumnLo), visColumnLo + visColumnCount, visColumnLo)
  }

  function isVerticalScroller() {
    // bounding rect height is floating point number, may not be exact match for integer
    return Math.abs(viewport.scrollHeight - viewport.getBoundingClientRect().height) > 0.8
  }

  function configureHeaderStub() {
    if (headerStub) {
      if (isHorizontalScroller() && isVerticalScroller()) {
        removeClass(headerStub, 'qg-stub-transparent')
      } else {
        addClass(headerStub, 'qg-stub-transparent')
      }
    }
  }

  function ensureCellsFillViewport() {
    configureHeaderStub()
    const prevVisColumnCount = visColumnCount
    computeVisibleColumnWindow()
    if (prevVisColumnCount < visColumnCount) {
      addCellElements(visColumnCount - prevVisColumnCount)
    } else if (prevVisColumnCount > visColumnCount) {
      removeCellElements(prevVisColumnCount)
    }
  }

  function computePanelLeftWidth() {
    let w = 0
    const n = Math.min(freezeLeft, columnCount)
    for (let i = 0; i < n; i++) {
      w += getColumnWidth(i)
    }
    panelLeftWidth = w
  }

  function computeColumnWidthAndConfigureHeader() {
    computeColumnWidths()
    // set frozen header widths
    for (let i = 0; i < freezeLeft; i++) {
      setHeaderCellWidth(headerLeft.childNodes[i], getColumnWidth(i))
    }
    // main set header widths
    for (let i = 0, n = columnCount - freezeLeft; i < n; i++) {
      setHeaderCellWidth(header.childNodes[i], getColumnWidth(i + freezeLeft))
    }
  }

  function syncViewportLeftScroll() {
    viewportLeft.style.height = (viewport.getBoundingClientRect().height - (isHorizontalScroller() ? 10 : 0)) + 'px'
    viewportLeft.scrollTop = viewport.scrollTop
  }

  function syncViewportScroll() {
    viewport.scrollTop = viewportLeft.scrollTop
  }

  function resize() {
    // If viewport is invisible when grid is updated it is not possible
    // to calculate column width correctly. When grid becomes visible again, resize()
    // is called where we continue calculating column widths. resize() can also be
    // called under many other circumstances, so width calculation is conditional
    if (recomputeColumnWidthOnResize) {
      recomputeColumnWidthOnResize = false
      computeColumnWidthAndConfigureHeader();
    }

    syncViewportLeftScroll();

    if (grid.style.display !== 'none') {
      viewportHeight = Math.max(viewport.getBoundingClientRect().height, defaults.minVpHeight)
      rowsInView = Math.floor(viewportHeight / rh)
      const viewportWidth = viewport.getBoundingClientRect().width
      if (lastKnownViewportWidth !== viewportWidth) {
        lastKnownViewportWidth = viewportWidth
        ensureCellsFillViewport()
      }
      // reduce panelLeft height to make horizontal scroller visible
      if (isHorizontalScroller()) {
        addClass(panelLeft, 'qg-panel-left-scroller-visible')
      } else {
        removeClass(panelLeft, 'qg-panel-left-scroller-visible')
      }
      scroll()
    }
  }

  function rowClick() {
    setBothRowsInactive()
    this.focus()
    activeRow = this.parentElement.questIndex
    setBothRowsActive()
    setFocusedCell(this)
  }

  function rowEnter(e) {
    e.preventDefault()
    const target = e.srcElement
    if (target) {
      const row = target.parentElement.questIndex & dcn
      addClass(rows[row], 'qg-r-hover')
      addClass(rowsLeft[row], 'qg-r-hover')
    }
  }

  function rowLeave(e) {
    e.preventDefault()
    const target = e.target
    if (target) {
      const row = target.parentElement.questIndex & dcn
      removeClass(rows[row], 'qg-r-hover')
      removeClass(rowsLeft[row], 'qg-r-hover')
    }
  }

  function activeCellRight() {
    if (focusedCellIndex > -1 && focusedCellIndex < columnCount - 1) {
      disableHover()
      focusedCellIndex++
      updateCellViewport(NAV_EVENT_RIGHT)
    }
  }

  function activeCellLeft() {
    if (focusedCellIndex > 0) {
      disableHover()
      focusedCellIndex--
      updateCellViewport(NAV_EVENT_LEFT)
    }
  }

  function activeCellHome() {
    if (focusedCellIndex > 0) {
      disableHover()
      focusedCellIndex = 0
      updateCellViewport(NAV_EVENT_HOME)
    }
  }

  function activeCellEnd() {
    if (focusedCellIndex > -1 && focusedCellIndex !== columnCount - 1) {
      disableHover()
      focusedCellIndex = columnCount - 1
      updateCellViewport(NAV_EVENT_END)
    }
  }

  function unfocusCell() {
    if (focusedCell) {
      removeFocus(focusedCell)
    }
  }

  function onKeyUp(e) {
    delete downKey['which' in e ? e.which : e.keyCode]
  }

  function copyActiveCellToClipboard() {
    if (focusedCell) {
      if (activeCellPulseClearTimer) {
        clearTimeout(activeCellPulseClearTimer)
      }
      addClass(focusedCell, 'qg-c-active-pulse')
      navigator.clipboard.writeText(focusedCell.innerHTML).then(undefined)

      activeCellPulseClearTimer = setTimeout(
        () => {
          removeClass(focusedCell, 'qg-c-active-pulse')
        }, 1000
      )
    }
  }

  function restoreColumnWidths() {
    // remove stored layout
    layoutStoreCache[layoutStoreColumnSetSha256] = undefined
    layoutStoreSaveAll()

    // compute column width from scratch
    computeHeaderWidths()
    computeColumnWidthAndConfigureHeader();
    ensureCellsFillViewport()
    renderCells(rows, getNonFrozenColLo(visColumnLo), visColumnLo + visColumnCount, visColumnLo)
    renderCells(rowsLeft, 0, freezeLeft, visColumnLo)
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
        if (downKey[17]) {
          copyActiveCellToClipboard()
        }
        break
      case 66:
        if (downKey[17]) {
          restoreColumnWidths()
        }
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

  function configureCell(cell, columnIndex) {
    const left = getColumnOffset(columnIndex)
    cell.style.left = left + 'px'
    cell.style.width = (getColumnOffset(columnIndex + 1) - left) + 'px'
    cell.style.height = defaults.rowHeight + 'px'
    cell.style.textAlign = isLeftAligned(columnIndex) ? 'left' : 'right'
    cell.onclick = rowClick
    cell.onmouseenter = rowEnter
    cell.onmouseleave = rowLeave
    if (cell.cellIndex === timestampIndex) {
      removeClass(cell, 'qg-timestamp')
    }
    if (cell.cellIndex === columnCount - 1) {
      removeClass(cell, 'qg-last-col')
    }

    cell.cellIndex = columnIndex
    if (columnIndex === timestampIndex) {
      addClass(cell, 'qg-timestamp')
    }
    if (cell.cellIndex === columnCount - 1) {
      addClass(cell, 'qg-last-col')
    }
  }

  function createRowElements(canvas, rows, columnCount, rowWidth) {
    for (let i = 0; i < dc; i++) {
      const rowDiv = document.createElement('div')
      rowDiv.className = 'qg-r'
      rowDiv.tabIndex = i + i
      for (let k = 0; k < columnCount; k++) {
        const cell = document.createElement('div')
        cell.className = 'qg-c'
        configureCell(cell, k)
        rowDiv.append(cell)
        if (i === 0 && k === 0) {
          setFocusedCell(cell)
        }
      }
      rowDiv.style.top = '-100'
      rowDiv.style.height = rh.toString() + 'px'
      rowDiv.style.width = rowWidth + 'px'
      rows.push(rowDiv)
      canvas.append(rowDiv)
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
      const storedLayout = layoutStoreCache[layoutStoreColumnSetSha256]
      const deviants = storedLayout !== undefined ? storedLayout.deviants : undefined
      const dataBatch = data[0]
      const dataBatchLen = dataBatch.length
      // a little inefficient, but lets traverse
      let offset = 0
      for (let i = 0; i < columnCount; i++) {
        // this assumes that initial width has been set to the width of the header
        let w

        if (deviants) {
          w = deviants[columns[i].name]
        }

        if (w === undefined) {
          w = getColumnWidth(i)
          for (let j = 0; j < dataBatchLen; j++) {
            columnOffsets[i] = offset
            const value = dataBatch[j][i]
            const str = value !== null ? value.toString() : "null"
            w = Math.min(maxWidth, Math.max(w, getCellWidth(str.length)))
          }
        } else {
          columnOffsets[i] = offset
        }
        offset += w
      }
      columnOffsets[columnCount] = offset
      totalWidth = offset
    }
  }

  function focusFirstCell() {
    activeRow = 0
    activeRowContainer = rows[activeRow]
    activeRowContainerLeft = rowsLeft[activeRow]
    focusedCellIndex = 0
    updateFocusedCellFromIndex()
    activeRowContainer.focus()
  }

  function updatePart1(m) {
    clear()
    query = m.query
    data.push(m.dataset)
    columns = m.columns
    columnCount = columns.length
    timestampIndex = m.timestamp
    rowCount = m.count
    computeHeaderWidths()
    computeVisibleColumnWindow()
    // visible position depends on correctness of visColumnCount value
    computeVisibleColumnsPosition()
  }

  function applyPanelLeftWidth() {
    panelLeft.style.width = panelLeftWidth + 'px'
    header.childNodes[0].style.marginLeft = panelLeftWidth + 'px'
  }

  function updatePart2() {
    computeColumnWidths()
    computePanelLeftWidth()
    headerStub = createHeaderElements(header, columnCount, freezeLeft)
    if (freezeLeft > 0) {
      createHeaderElements(headerLeft, Math.min(freezeLeft, columnCount), 0)
    }
    applyPanelLeftWidth()
    createRowElements(canvas[0], rows, visColumnCount, totalWidth)
    createRowElements(canvasLeft, rowsLeft, Math.min(freezeLeft, columnCount), panelLeftWidth)

    computeCanvasHeight()
    setViewportScrollTop(0)
    resize()
    // Resize uses scroll and causes grid viewport to render.
    // Rendering might set focused cell to arbitrary value. We have to position focus on the first cell explicitly
    // we can assume that viewport already rendered top left corner of the data set
    focusFirstCell()
  }

  function update(x, m) {
    setTimeout(() => {
        updatePart1(m)
        // This part of the update sequence requires layoutStore access.
        // For that we need to calculate layout key and hash, which is async
        layoutStoreComputeKeyAndHash(updatePart2)
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
    }
  }

  function bind() {
    header = document.createElement('div')
    addClass(header, 'qg-header-row')

    viewport = document.createElement('div')
    viewport.onscroll = scroll
    addClass(viewport, 'qg-viewport')

    canvas = $('<div>')
    canvas[0].className = 'qg-canvas'
    // we're using jQuery here to handle key bindings
    canvas.bind('keydown', onKeyDown)
    canvas.bind('keyup', onKeyUp)

    columnResizeGhost = document.createElement('div')
    columnResizeGhost.className = 'qg-col-resize-ghost'
    viewport.append(canvas[0], columnResizeGhost)

    panelLeft = document.createElement('div')
    addClass(panelLeft, 'qg-panel-left')

    headerLeft = document.createElement('div')
    addClass(headerLeft, 'qg-header-left-row')

    viewportLeft = document.createElement('div')
    viewportLeft.onscroll = syncViewportScroll
    // viewport left does not have scrollbar to make "stitch" cleaner
    // however, mouse wheel should still function as if scrollbar was
    // present.
    // viewportLeft.onwheel = viewportLeftWheel
    addClass(viewportLeft, 'qg-viewport-left')

    const cl = $('<div>')
    canvasLeft = cl[0]
    canvasLeft.className = 'qg-canvas'

    cl.bind('keydown', onKeyDown)
    cl.bind('keyup', onKeyUp)

    viewportLeft.append(canvasLeft)

    panelLeft.append(headerLeft, viewportLeft)

    bus.on(qdb.MSG_QUERY_DATASET, update)
    bus.on('grid.focus', focusCell)
    bus.on('grid.refresh', refreshQuery)
    bus.on('grid.publish.query', publishQuery)
    bus.on(qdb.MSG_ACTIVE_PANEL, resize)

    grid.append(header, viewport, panelLeft)
    // when grid is navigated via keyboard, mouse hover is disabled
    // to not confuse user. Hover is then re-enabled on mouse move
    grid.onmousemove = enableHover
    // ensure grid position is relative, we're using absolute positioning inside the grid and
    // taking no chances
    grid.style.position = 'relative'

    // load layoutStoreCache from local storage
    const json = window.localStorage.getItem(layoutStoreID)
    if (json) {
      layoutStoreCache = JSON.parse(json)
    }
    window.onresize = resize
  }

  bind()
  resize()
}
