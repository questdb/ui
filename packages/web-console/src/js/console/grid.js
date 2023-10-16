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

const hashString = (str) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash &= hash
  }
  return new Uint32Array([hash])[0].toString(36)
}

export function grid(rootElement, _paginationFn, id) {
  const defaults = {
    gridID: 'qdb-grid',
    minColumnWidth: 60,
    rowHeight: 30,
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

  const gridID = id ? id : defaults.gridID
  const layoutStoreID = gridID + '.columnLayout'
  const grid = rootElement
  const paginationFn = _paginationFn
  let viewport
  let canvas
  let header
  let panelLeft
  let panelLeftWidth
  let viewportLeft
  let canvasLeft
  let headerLeft
  let focusedRowContainerLeft
  let freezeLeft = 0
  let nextFreezeLeft
  let panelLeftHysteresis
  let panelLeftGhost
  let panelLeftSnapGhost
  let panelLeftGhostHandle
  let panelLeftGhostHandleY
  let panelLeftGhostHandleX
  let panelLeftGhostHandleTop
  let panelLeftInitialHysteresis
  let rowsLeft = []
  let columnResizeGhost
  let columnOffsets
  let columns = []
  let columnPositions = []
  let columnCount = 0
  let rowCount
  let timestampIndex = -1
  let ogTimestampIndex = -1
  let data = []
  let totalWidth = -1
  let deferVisualsCompute = false
  // number of divs in "rows" cache, has to be power of two
  const dc = defaults.divCacheSize
  const dcn = dc - 1
  const pageSize = defaults.dataPageSize
  const oneThirdPage = Math.floor(pageSize / 3)
  const twoThirdsPage = oneThirdPage * 2
  let loPage
  let hiPage
  let sql
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
  let focusedRowIndex = -1
  // row div that is highlighted
  let focusedRowContainer
  // index of focused cell with range from 0 to columns.length - 1
  let focusedColumnIndex = -1
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
  let colResizeTargetWidth = 0
  let colResizeTimer

  let hoverEnabled = true
  let recomputeColumnWidthOnResize = false

  // Persisted state of column layout. By that I mean remembering columns that have been manually resized
  // and storing their widths. The width are keyed against "column set", which is SHA-256 of JSON list of {name, type} pairs.
  // Technically it is possible (though improbable) that two column sets will have the same SHA-256. In which case
  // width of columns by the same name will be reused.
  let layoutStoreCache = {}
  let layoutStoreColumnSetKey = undefined
  let layoutStoreColumnSetSha256 = undefined
  let layoutStoreTimer

  // Timer that restores style of pulsed cell.
  // Cell will pulse when its content is copied to clipboard
  let activeCellPulseClearTimer

  function getColumn(index) {
    return columns[columnPositions[index]]
  }

  function shuffleToFront() {
    const columnIndex = focusedColumnIndex
    let freezeLeftBefore = 0

    // handle frozen columns by resetting the panel
    if (freezeLeft > 0) {
      freezeLeftBefore = freezeLeft
      if (freezeLeft <= columnIndex) {
        // we will be increasing freeze left
        freezeLeft = 0
        headerLeft.innerHTML = ''
        hidePanelLeft()
      }
    }

    const w = getColumnWidth(columnIndex)
    // move offsets of columns that go before the column
    for (let i = columnIndex; i > 0; i--) {
      columnOffsets[i] = columnOffsets[i - 1] + w
    }
    // columnOffsets[0] is always zero
    columnOffsets[0] = 0

    // rotate column header indexes
    const leftColumnCount = columnIndex + 1
    for (let i = columnIndex; i >= 0; i--) {
      const hysteresis = header.childNodes[i].querySelector('.qg-col-resize-hysteresis')
      if (hysteresis) {
        hysteresis.columnIndex = (hysteresis.columnIndex + 1) % leftColumnCount
      }
    }

    // rotate timestamp
    if (timestampIndex !== -1 && timestampIndex < leftColumnCount) {
      timestampIndex = (timestampIndex + 1) % leftColumnCount
    }
    header.childNodes[0].before(header.childNodes[columnIndex])

    // shift column positions, the indirection system
    const p = columnPositions[columnIndex]
    for (let i = columnIndex; i > 0; i--) {
      columnPositions[i] = columnPositions[i - 1]
    }
    columnPositions[0] = p

    if (freezeLeftBefore > 0) {
      if (freezeLeftBefore <= columnIndex) {
        // we have added a new column to panelLeft
        // this is BAU for the setFreezeLeft function
        setFreezeLeft(freezeLeftBefore + 1)
      } else {
        // when we here, we moved column that was already on the panelLeft
        // we also need to move its header and re-render the cells for the moved data
        headerLeft.childNodes[0].before(headerLeft.childNodes[columnIndex])
        renderCells(rowsLeft, 0, Math.min(freezeLeft, columnCount), visColumnLo)
      }
    }

    visColumnX = 0
    renderCells(rows, 0, visColumnCount, 0)

    if (viewport.scrollLeft > 0) {
      viewport.scrollLeft = 0
    } else {
      scroll()
    }
    setFocusedColumn(columnIndex)
    layoutStoreSaveShuffledColumns(leftColumnCount)
  }

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
    canvas.style.height = canvasHeight
    canvasLeft.style.height = canvasHeight
  }

  function renderRow(row, rowIndex, colLo, colHi) {
    if (row.rowIndex !== rowIndex) {
      const dataPage = data[Math.floor(rowIndex / pageSize)]
      if (dataPage) {
        const rowData = dataPage[rowIndex % pageSize]
        if (rowData) {
          row.style.display = 'flex'
          for (let i = colLo; i < colHi; i++) {
            setCellData(row.childNodes[i % visColumnCount], rowData[columnPositions[i]])
          }
          row.rowIndex = rowIndex
        } else {
          row.style.display = 'none'
          row.rowIndex = -1
        }
      } else {
        // clear grid if there is no row data
        for (let i = colLo; i < colHi; i++) {
          row.childNodes[i % visColumnCount].innerHTML = ''
        }
        row.rowIndex = -1
      }
      row.style.top = rowIndex * rh - o + 'px'
    }
  }

  function setViewportScrollTop(scrollTop) {
    viewport.scrollTop = scrollTop
    viewportLeft.scrollTop = scrollTop
  }

  function renderViewportNoCompute() {
    const colLo = Math.max(visColumnLo, freezeLeft)
    const colHi = Math.min(colLo + visColumnCount, columnCount)
    renderCells(rows, colLo, colHi, visColumnLo)
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

    if (paginationFn) {
      paginationFn(sql, lo + 1, hi, renderFunc)
    }
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
    const col = getColumn(columnIndex)
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

  function triggerHeaderClick(e) {
    // avoid broadcasting fat finger clicks
    if (!colResizeColIndex) {
      triggerEvent('header.click', {
        columnName: e.currentTarget.getAttribute('data-column-name')
      })
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

  function columnResizeMouseEnter(e) {
    if (e.target.childNodes.length === 0) {
      e.preventDefault()
      const div = document.createElement('div')
      div.baguette = true
      addClass(div, 'qg-col-resize-hysteresis-enter')
      e.target.append(div)
    }
  }

  function columnResizeMouseLeave(e) {
    e.preventDefault()
    if (e.target.childNodes.length > 0) {
      e.target.childNodes[0].remove()
    }
  }

  function columnResizeMouseDown(e) {
    e.preventDefault()

    colResizeClearTimer()

    // Mouse down could have occurred on either the hysteresis element or
    // the drag handle.
    const target = e.target.baguette ? e.target.parentElement : e.target
    if (e.target.childNodes.length > 0) {
      e.target.childNodes[0].remove()
    }
    // column index is derived from stylesheet selector name
    colResizeColIndex = target.columnIndex
    colResizeColOrigOffset = getColumnOffset(colResizeColIndex)
    colResizeColOrigWidth = getColumnWidth(colResizeColIndex)
    const parent = target.parentElement
    // we place ghost on the right side of the column that is being resized
    colResizeDragHandleStartX = parent.offsetLeft + parent.getBoundingClientRect().width
    colResizeMouseDownX = e.clientX

    document.onmousemove = columnResizeDrag
    document.onmouseup = columnResizeMouseUp

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

  function layoutStoreComputeKeyAndHash(callback) {
    // SHA-256 is that of the "key" and "key" is
    // stringified JSON. This JSON is a list of column name + type pairs. The idea
    // is to remember column layout for column set but not row set.
    const columnSet = []
    for (let i = 0; i < columnCount; i++) {
      const col = getColumn(i)
      columnSet.push({name: col.name, type: col.type})
    }
    layoutStoreColumnSetKey = JSON.stringify(columnSet)
    layoutStoreColumnSetSha256 = hashString(layoutStoreColumnSetKey)
    callback()
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

  function getLayoutEntry() {
    let entry = layoutStoreCache[layoutStoreColumnSetSha256]
    if (entry === undefined) {
      const deviants = {}
      entry = {key: layoutStoreColumnSetKey, deviants: deviants}
      layoutStoreCache[layoutStoreColumnSetSha256] = entry
    }
    return entry
  }

  function layoutStoreSaveFreezeLeft() {
    getLayoutEntry().freezeLeft = freezeLeft
    layoutStoreSaveAll()
  }

  function layoutStoreSaveColumnChange(columnName, width) {
    getLayoutEntry().deviants[columnName] = width
    layoutStoreSaveAll()
  }

  function layoutStoreSaveShuffledColumns(leftColumnCount) {
    const entry = getLayoutEntry()
    entry.columnPositions = columnPositions
    // timestamp could change
    entry.timestampIndex = timestampIndex
    // store column widths that changed
    for (let i = 0; i < leftColumnCount; i++) {
      entry.deviants[getColumn(i).name] = getColumnWidth(i)
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
    }
    setHeaderCellWidth(header.childNodes[columnIndex], width)
    ensureCellsFillViewport()
    renderCells(rows, visColumnLo, visColumnLo + visColumnCount, visColumnLo)
    // we have to call scroll to ensure empty space created by contracting column
    // will be filled in with new data
    scroll()
  }

  function columnResizeMouseUp(e) {
    e.preventDefault()
    document.onmousemove = null
    document.onmouseup = null
    setColumnWidth(colResizeColIndex, colResizeTargetWidth)

    columnResizeGhost.style.visibility = 'hidden'
    columnResizeGhost.style.left = 0

    colResizeTimer = setTimeout(() => {
      // delay clearing drag end to prevent overlapping header click
      colResizeColIndex = undefined
    }, 500)
    layoutStoreSaveColumnChange(getColumn(colResizeColIndex).name, colResizeTargetWidth)
  }

  function getCellWidth(valueLen) {
    return Math.max(defaults.minColumnWidth, Math.ceil(valueLen * 8 * 1.2))
  }

  function colFreezeMouseEnter(e) {
    if (!panelLeftGhostHandleY) {
      e.preventDefault()
      panelLeftGhost.style.left = panelLeftWidth + 'px'
      panelLeftGhost.style.display = 'block'
      panelLeftGhost.style.height = (viewportHeight - (isHorizontalScroller() ? scrollerGirth : 0)) + 'px'
      panelLeftSnapGhost.style.height = panelLeftGhost.style.height
      panelLeftGhostHandleTop = (e.offsetY - panelLeftGhostHandle.getBoundingClientRect().height / 2)
      panelLeftGhostHandleY = e.pageY
      panelLeftGhostHandle.style.top = panelLeftGhostHandleTop + 'px'

    }
  }

  function colFreezeMouseLeave(e) {
    const target = e.relatedTarget
    if (target !== panelLeftGhostHandle && target !== panelLeftGhost && target !== panelLeftHysteresis && !panelLeftGhostHandleX) {
      e.preventDefault()
      panelLeftGhost.style.display = 'none'
      panelLeftGhostHandleY = undefined
    }
  }

  function colFreezeToggle() {
    if (freezeLeft > 0) {
      setFreezeLeft(0)
    } else {
      setFreezeLeft(1)
    }
    setFocusedColumn(focusedColumnIndex)
  }

  function colFreezeDrag(e) {
    const d = e.pageX - panelLeftGhostHandleX
    const t = panelLeftWidth + d
    panelLeftGhost.style.left = t + 'px'
    // make "snap" ghost visible to illustrate which columns are
    // going to be frozen

    // find column index to snap the next frozen column to
    nextFreezeLeft = freezeLeft
    let target = t
    for (let i = 0; i < columnCount; i++) {
      const w = getColumnWidth(i)
      target -= w
      if (target < 0) {
        const r = -target / w
        nextFreezeLeft = r < 0.5 ? i + 1 : i
        break
      }
    }

    // viewport must not be scrolled to update next freezeLeft up,
    // but we can reduce freezeLeft regardless of scroll
    if (nextFreezeLeft > freezeLeft && viewport.scrollLeft > 0) {
      nextFreezeLeft = freezeLeft
    }
    panelLeftSnapGhost.style.left = getColumnOffset(nextFreezeLeft) + 'px'
    panelLeftSnapGhost.style.display = 'block'

    colFreezeMouseMoveGhostHandle(e)
  }

  function colFreezeMouseUp() {
    document.onmousemove = undefined
    document.onmouseup = undefined
    panelLeftGhost.style.display = 'none'
    panelLeftSnapGhost.style.display = 'none'
    panelLeftGhostHandleY = undefined
    panelLeftGhostHandleX = undefined
    grid.style.cursor = null
    panelLeftGhostHandle.style.cursor = null
    panelLeftInitialHysteresis.style.cursor = null
    setFreezeLeft(nextFreezeLeft)
  }

  function colFreezeMouseDown(e) {
    e.preventDefault()
    panelLeftGhostHandleX = e.pageX
    document.onmousemove = colFreezeDrag
    document.onmouseup = colFreezeMouseUp
    grid.style.cursor = 'grabbing'
    panelLeftGhostHandle.style.cursor = 'grabbing'
    panelLeftInitialHysteresis.style.cursor = 'grabbing'
  }

  function colFreezeMouseMoveGhostHandle(e) {
    if (panelLeftGhostHandleY) {
      e.preventDefault()
      const d = e.pageY - panelLeftGhostHandleY
      // limit handle position to within the viewport from both top and bottom
      panelLeftGhostHandle.style.top = Math.min(viewportHeight - panelLeftGhostHandle.getBoundingClientRect().height - (isHorizontalScroller() ? scrollerGirth : 0), Math.max(0, panelLeftGhostHandleTop + d)) + 'px'
    }
  }

  function createHeaderElements(header, fromColumn, columnCount, createStub) {
    for (let i = fromColumn, n = fromColumn + columnCount; i < n; i++) {
      const c = getColumn(i)
      const h = document.createElement('div')
      addClass(h, 'qg-header')
      setHeaderCellWidth(h, getColumnWidth(i))
      h.setAttribute('data-column-name', c.name)

      if (isLeftAligned(i)) {
        addClass(h, 'qg-header-l')
      }

      const hType = document.createElement('span')
      addClass(hType, 'qg-header-type')
      hType.innerHTML = c.type.toLowerCase()

      const hName = document.createElement('span')
      addClass(hName, 'qg-header-name')
      hName.innerHTML = c.name

      const hysteresis = document.createElement('div')
      addClass(hysteresis, 'qg-col-resize-hysteresis')
      hysteresis.columnIndex = i
      hysteresis.onmousedown = columnResizeMouseDown
      hysteresis.onmouseenter = columnResizeMouseEnter
      hysteresis.onmouseleave = columnResizeMouseLeave

      const hBorderSpan = document.createElement('span')
      addClass(hBorderSpan, 'qg-header-border')
      h.append(hysteresis, hBorderSpan)
      h.append(hName, hType)
      h.onclick = triggerHeaderClick
      header.append(h)
    }

    if (createStub) {
      const stub = document.createElement('div')
      stub.className = 'qg-header qg-stub'
      stub.style.width = scrollerGirth + 'px'
      header.append(stub)
      return stub
    }
    return null
  }

  function computeHeaderWidths() {
    columnOffsets = []
    totalWidth = 0
    for (let i = 0; i < columnCount; i++) {
      const c = getColumn(i)
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
    canvas.innerHTML = ''
    canvasLeft.innerHTML = ''
    rows = []
    rowsLeft = []
    data = []
    sql = null
    loPage = 0
    hiPage = 0
    downKey = []
    columnCount = 0
    rowCount = 0
    focusedRowContainer = null
    focusedRowContainerLeft = null
    focusedCell = null
    focusedColumnIndex = -1
    visColumnLo = 0
    visColumnCount = 10
    lastKnownViewportWidth = 0
    timestampIndex = -1
    ogTimestampIndex = -1
    focusedRowIndex = -1
    recomputeColumnWidthOnResize = false
    // -1 means column is not being resized, anything else means user drags resize handle
    // this is to prevent overlapping events actioning anything accidentally
    colResizeColIndex = undefined
    colResizeClearTimer()
    layoutStoreColumnSetKey = undefined
    layoutStoreColumnSetSha256 = undefined
    panelLeftWidth = 0
    deferVisualsCompute = false
    setFreezeLeft0(0)
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

  function renderFocusedCell() {
    addClass(focusedCell, ACTIVE_CELL_CLASS)
  }

  function setFocusedCell(cell) {
    if (cell && (focusedCell !== cell || !cell.classList.contains(ACTIVE_CELL_CLASS))) {
      if (focusedCell) {
        removeFocus(focusedCell)
      }
      focusedCell = cell
      focusedColumnIndex = cell.columnIndex
      renderFocusedCell()
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

  function setCellDataAndAttributes(row, rowData, columnIndex) {
    const cell = row.childNodes[columnIndex % visColumnCount]
    configureCell(cell, columnIndex)
    setCellData(cell, rowData[columnPositions[columnIndex]])
  }

  function getNonFrozenColLo(colLo) {
    return Math.max(freezeLeft, colLo)
  }

  function renderCells(rows, colLo, colHi, nextVisColumnLo) {
    if (rows.length > 0 && columnCount > 0 && colLo < colHi) {
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
        let dataPage
        let rowData
        if (m < data.length && (dataPage = data[m]) && n < dataPage.length && (rowData = dataPage[n])) {
          // We need to put cells in the same order, which one would
          // get scrolling towards the end of row using right arrow, e.g. one cell at a time
          // This is to make sure scrolling one column left at a time works correctly
          for (let j = colLo; j < colHi; j++) {
            setCellDataAndAttributes(row, rowData, j)
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
      renderFocusedCell()
    }
  }

  function setFocusedColumn(columnIndex) {
    if (columnIndex !== -1) {
      focusedColumnIndex = columnIndex
      const cell = focusedColumnIndex < freezeLeft ? focusedRowContainerLeft.childNodes[focusedColumnIndex] : focusedRowContainer.childNodes[focusedColumnIndex % visColumnCount]
      cell.columnIndex = focusedColumnIndex
      setFocusedCell(cell)
    }
  }

  function updateCellViewport(navEvent) {
    if (navEvent === NAV_EVENT_HOME && visColumnLo > 0 && columnCount > visColumnCount) {
      renderCells(rows, freezeLeft, visColumnCount, 0)
    } else if (navEvent === NAV_EVENT_END && visColumnLo + visColumnCount < columnCount) {
      renderCells(rows, getNonFrozenColLo(columnCount - visColumnCount), columnCount, columnCount - visColumnCount)
    }

    const columnOffset = getColumnOffset(focusedColumnIndex)
    const columnWidth = getColumnWidth(focusedColumnIndex)

    if (navEvent !== NAV_EVENT_ANY_VERTICAL && (focusedColumnIndex >= freezeLeft || navEvent === NAV_EVENT_HOME)) {
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
    setFocusedColumn(focusedColumnIndex)
  }

  function activeRowUp(n) {
    if (focusedRowIndex > 0) {
      focusedRowIndex = Math.max(0, focusedRowIndex - n)
      setBothRowsInactive()
      disableHover()
      setBothRowsActive()
      updateCellViewport(NAV_EVENT_ANY_VERTICAL)
      const scrollTop = focusedRowIndex * rh - o - 5 // top margin
      if (scrollTop < viewport.scrollTop) {
        setViewportScrollTop(Math.max(0, scrollTop))
      }
    }
  }

  function isHorizontalScroller() {
    return viewport.scrollWidth > lastKnownViewportWidth
  }

  function setRowActive(rows) {
    const row = rows[focusedRowIndex & dcn]
    row.className = 'qg-r qg-r-active'
    return row
  }

  function setBothRowsActive() {
    focusedRowContainer = setRowActive(rows)
    focusedRowContainerLeft = setRowActive(rowsLeft)
  }

  function setBothRowsInactive() {
    if (focusedRowContainer) {
      focusedRowContainer.className = 'qg-r'
    }
    if (focusedRowContainerLeft) {
      focusedRowContainerLeft.className = 'qg-r'
    }
  }

  function activeRowDown(n) {
    if (focusedRowIndex > -1 && focusedRowIndex < r - 1) {
      focusedRowIndex = Math.min(r - 1, focusedRowIndex + n)
      setBothRowsInactive()
      disableHover()
      setBothRowsActive()
      updateCellViewport(NAV_EVENT_ANY_VERTICAL)
      const scrollTop = Math.min(focusedRowIndex * rh + rh - o, viewport.scrollHeight) - viewportHeight
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
      // if grid content fits in viewport we don't need to adjust focusedRowIndex
      if (scrollTop >= h - viewportHeight) {
        // final leap to bottom of grid
        // this happens when container div runs out of vertical height
        // and we artificially force leap to bottom
        y = Math.max(0, yMax - viewportHeight)
        top = scrollTop
        o = Math.max(0, y - top)
        activeRowDown(r - focusedRowIndex)
      } else {
        if (scrollTop === 0 && top > 0) {
          // this happens when grid is coming slowly back up after being scrolled down harshly
          // because 'y' is much greater than top, we have to jump to top artificially.
          y = 0
          o = 0
          activeRowUp(focusedRowIndex)
        } else {
          y += scrollTop - top
        }
        top = scrollTop
      }
      renderRows(y - oldY)
    }
    syncViewportLeftScroll()
    renderFocusedCell()
  }

  function computeVisibleColumnWindow() {
    const viewportWidth = viewport.getBoundingClientRect().width
    deferVisualsCompute = viewportWidth === 0

    if (deferVisualsCompute) {
      return
    }

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
    const h = viewport.clientHeight + header.clientHeight
    panelLeft.style.height = h + 'px'
    viewportLeft.style.height = viewport.clientHeight + 'px'
    viewportLeft.scrollTop = viewport.scrollTop
  }

  function syncViewportScroll() {
    viewport.scrollTop = viewportLeft.scrollTop
  }

  function noData() {
    if (data.length === 0) {
      return true
    }
    return data[loPage].length === 0;
  }

  function render() {
    if (noData()) {
      renderColumns()
      renderRows(0)
      return;
    }

    // If viewport is invisible when grid is updated it is not possible
    // to calculate column width correctly. When grid becomes visible again, resize()
    // is called where we continue calculating column widths. resize() can also be
    // called under many other circumstances, so width calculation is conditional
    if (recomputeColumnWidthOnResize) {
      recomputeColumnWidthOnResize = false
      computeColumnWidthAndConfigureHeader()
    }

    if (deferVisualsCompute) {
      computeVisibleAreaAfterDataIsSet()
      setDataPart2()
    }
    syncViewportLeftScroll()

    if (grid.style.display !== 'none') {
      viewportHeight = Math.max(viewport.getBoundingClientRect().height, defaults.minVpHeight)
      rowsInView = Math.floor(viewportHeight / rh)
      const viewportWidth = viewport.getBoundingClientRect().width
      if (lastKnownViewportWidth !== viewportWidth) {
        lastKnownViewportWidth = viewportWidth
        ensureCellsFillViewport()
      }
      scroll()
    }
  }

  function rowClick() {
    setBothRowsInactive()
    this.focus()
    focusedRowIndex = this.parentElement.rowIndex
    setBothRowsActive()
    setFocusedCell(this)
  }

  function rowEnter(e) {
    e.preventDefault()
    const target = e.target
    // do not show "hover" visuals when left panel is interacted with
    if (target && !panelLeftGhostHandleX) {
      const row = target.parentElement.rowIndex & dcn
      addClass(rows[row], 'qg-r-hover')
      addClass(rowsLeft[row], 'qg-r-hover')
    }
  }

  function rowLeave(e) {
    e.preventDefault()
    const target = e.target
    // do not show "hover" visuals when left panel is interacted with
    if (target && !panelLeftGhostHandleX) {
      const row = target.parentElement.rowIndex & dcn
      removeClass(rows[row], 'qg-r-hover')
      removeClass(rowsLeft[row], 'qg-r-hover')
    }
  }

  function activeCellRight() {
    if (focusedColumnIndex > -1 && focusedColumnIndex < columnCount - 1) {
      disableHover()
      focusedColumnIndex++
      updateCellViewport(NAV_EVENT_RIGHT)
    }
  }

  function activeCellLeft() {
    if (focusedColumnIndex > 0) {
      disableHover()
      focusedColumnIndex--
      updateCellViewport(NAV_EVENT_LEFT)
    }
  }

  function activeCellHome() {
    if (focusedColumnIndex > 0 || viewport.scrollLeft > 0) {
      disableHover()
      focusedColumnIndex = 0
      updateCellViewport(NAV_EVENT_HOME)
    }
  }

  function activeCellEnd() {
    if (focusedColumnIndex > -1 && focusedColumnIndex !== columnCount - 1) {
      disableHover()
      focusedColumnIndex = columnCount - 1
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

      activeCellPulseClearTimer = setTimeout(() => {
        removeClass(focusedCell, 'qg-c-active-pulse')
      }, 1000)
    }
  }

  function clearCustomLayout() {
    // remove stored layout
    layoutStoreCache[layoutStoreColumnSetSha256] = undefined
    layoutStoreSaveAll()

    // remove panelLeft
    setFreezeLeft0(0)
    headerLeft.innerHTML = ''
    hidePanelLeft()
    // reset column positions
    resetColumnPositions()
    timestampIndex = ogTimestampIndex

    // compute column width from scratch
    header.innerHTML = ''
    computeHeaderWidths()
    computeColumnWidths()
    panelLeftWidth = 0
    headerStub = createHeaderElements(header, 0, columnCount, true)
    ensureCellsFillViewport()
    computePanelLeftWidth()
    applyPanelLeftWidth()
    renderCells(rows, getNonFrozenColLo(visColumnLo), visColumnLo + visColumnCount, visColumnLo)
    renderCells(rowsLeft, 0, freezeLeft, visColumnLo)
    viewport.scrollLeft = 0
    focusFirstCell()
  }

  function isCtrlOrCmd() {
    return downKey[17] || downKey[91]
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
          activeRowUp(focusedRowIndex)
        } else {
          activeRowUp(1)
        }
        break
      case 40: // arrow down
        if (downKey[91]) {
          activeRowDown(r - focusedRowIndex)
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
          activeRowDown(r - focusedRowIndex)
        } else {
          activeCellEnd()
        }
        break
      case 36: // home ? Fn + arrow left on mac
        if (downKey[17]) {
          activeRowUp(focusedRowIndex)
        } else {
          activeCellHome()
        }
        break
      case 113:
        unfocusCell()
        triggerEvent('yield.focus')
        break
      case 67: // Ctrl+C (copy)
      case 45: // Ctrl+Insert (copy)
        if (isCtrlOrCmd()) {
          copyActiveCellToClipboard()
        }
        break
      case 66:
        // 17 = Ctrl, 91 = Cmd (mac)
        if (isCtrlOrCmd()) {
          clearCustomLayout()
        }
        break
      case 191:
        shuffleToFront()
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
    if (cell.classList.contains('qg-timestamp')) {
      removeClass(cell, 'qg-timestamp')
    }
    if (cell.columnIndex === columnCount - 1) {
      removeClass(cell, 'qg-last-col')
    }

    cell.columnIndex = columnIndex
    if (columnIndex === timestampIndex) {
      addClass(cell, 'qg-timestamp')
    }
    if (cell.columnIndex === columnCount - 1) {
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
    if (deferVisualsCompute) {
      return
    }
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

  function focus() {
    if (focusedCell && focusedRowContainer) {
      setFocusedCell(focusedCell)
      focusedRowContainer.focus()
    }
  }

  function computeColumnWidths() {
    const maxWidth = viewport.getBoundingClientRect().width * 0.8
    recomputeColumnWidthOnResize = maxWidth < 0.1

    if (!recomputeColumnWidthOnResize && data && data.length > 0) {
      const storedLayout = layoutStoreCache[layoutStoreColumnSetSha256]
      const deviants = storedLayout !== undefined ? storedLayout.deviants : undefined
      const dataPage = data[0]
      const dataPageLen = dataPage.length
      setFreezeLeft0(storedLayout !== undefined ? storedLayout.freezeLeft : 0)

      let offset = 0
      // a little inefficient, but lets traverse
      for (let i = 0; i < columnCount; i++) {
        // this assumes that initial width has been set to the width of the header
        let w

        if (deviants) {
          w = deviants[getColumn(i).name]
        }

        if (w === undefined) {
          w = getColumnWidth(i)
          for (let j = 0; j < dataPageLen; j++) {
            columnOffsets[i] = offset
            const value = dataPage[j][i]
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
    setFocusedColumn(0)
    focusedRowContainer.focus()
  }

  function focusTopLeftCell() {
    focusedRowIndex = 0
    focusedRowContainer = rows[focusedRowIndex]
    focusedRowContainerLeft = rowsLeft[focusedRowIndex]
    focusFirstCell()
  }

  function resetColumnPositions() {
    columnPositions = []
    for (let i = 0; i < columnCount; i++) {
      columnPositions.push(i)
    }
  }

  function setDataPart1(_data) {
    clear()
    sql = _data.query
    data.push(_data.dataset)
    columns = _data.columns
    columnCount = columns.length
    resetColumnPositions()
    ogTimestampIndex = _data.timestamp
    timestampIndex = ogTimestampIndex
    rowCount = _data.count
    computeHeaderWidths()
    computeVisibleAreaAfterDataIsSet()
  }

  function computeVisibleAreaAfterDataIsSet() {
    computeVisibleColumnWindow()
    // visible position depends on correctness of visColumnCount value
    computeVisibleColumnsPosition()
  }

  function applyPanelLeftWidth() {
    panelLeft.style.width = panelLeftWidth + 'px'
  }

  function setDataPart2() {
    if (deferVisualsCompute) {
      return
    }
    const storedLayout = layoutStoreCache[layoutStoreColumnSetSha256]
    if (storedLayout && storedLayout.columnPositions) {
      columnPositions = storedLayout.columnPositions
      timestampIndex = storedLayout.timestampIndex
    }
    computeColumnWidths()
    computePanelLeftWidth()
    headerStub = createHeaderElements(header, 0, columnCount, true)
    if (freezeLeft > 0) {
      createHeaderElements(headerLeft, 0, Math.min(freezeLeft, columnCount), false)
      showPanelLeft()
    } else {
      hidePanelLeft()
    }
    applyPanelLeftWidth()
    createRowElements(canvas, rows, visColumnCount, totalWidth)
    createRowElements(canvasLeft, rowsLeft, Math.min(freezeLeft, columnCount), panelLeftWidth)

    computeCanvasHeight()
    setViewportScrollTop(0)
    render()
    // Resize uses scroll and causes grid viewport to render.
    // Rendering might set focused cell to arbitrary value. We have to position focus on the first cell explicitly
    // we can assume that viewport already rendered top left corner of the data set
    focusTopLeftCell()
  }

  function showPanelLeft() {
    panelLeft.style.display = 'block'
    panelLeftInitialHysteresis.style.display = 'none'
    viewportLeft.scrollTop = viewport.scrollTop
  }

  function hidePanelLeft() {
    panelLeft.style.display = 'none'
    panelLeftInitialHysteresis.style.display = 'block'
    // clear panel left columns
    for (let i = 0, n = rowsLeft.length; i < n; i++) {
      rowsLeft[i].innerHTML = ''
    }
  }

  function setFreezeLeft0(_freezeLeft) {
    freezeLeft = _freezeLeft !== undefined ? _freezeLeft : 0
    triggerEvent('freeze.state', {freezeLeft: freezeLeft})
  }

  function setFreezeLeft(nextFreezeLeft) {
    if (nextFreezeLeft !== undefined && nextFreezeLeft !== freezeLeft) {
      if (nextFreezeLeft < freezeLeft) {
        // remove columns from all the rows
        for (let i = 0, n = rowsLeft.length; i < n; i++) {
          const row = rowsLeft[i]
          for (let j = nextFreezeLeft; j < freezeLeft; j++) {
            // as we remove, the children shift left
            row.childNodes[nextFreezeLeft].remove()
          }
        }
        // remove headers
        for (let j = nextFreezeLeft; j < freezeLeft; j++) {
          // as we remove, the children shift left
          headerLeft.childNodes[nextFreezeLeft].remove()
        }

        if (nextFreezeLeft === 0) {
          hidePanelLeft()
        }

      } else {
        // add columns to all the rows
        for (let i = 0, n = rowsLeft.length; i < n; i++) {
          const row = rowsLeft[i]
          for (let j = freezeLeft; j < nextFreezeLeft; j++) {
            const cell = document.createElement('div')
            cell.className = 'qg-c'
            configureCell(cell, j)
            row.append(cell)
          }
        }
        // add header
        createHeaderElements(headerLeft, freezeLeft, nextFreezeLeft - freezeLeft, false)
        showPanelLeft()
      }

      setFreezeLeft0(nextFreezeLeft)
      layoutStoreSaveFreezeLeft()

      renderCells(rowsLeft, 0, Math.min(freezeLeft, columnCount), visColumnLo)
      computePanelLeftWidth()
      applyPanelLeftWidth()
      renderCells(rows, getNonFrozenColLo(visColumnLo), visColumnLo + visColumnCount, visColumnLo)
    }
  }

  function setData(_data) {
    setTimeout(() => {
      setDataPart1(_data)
      // This part of the update sequence requires layoutStore access.
      // For that we need to calculate layout key and hash, which is async
      layoutStoreComputeKeyAndHash(setDataPart2)
    }, 0)
  }

  function addEventListener(eventName, eventHandler, selector) {
    if (selector) {
      const wrappedHandler = (e) => {
        if (!e.target) return
        const el = e.target.closest(selector)
        if (el) {
          const newEvent = Object.create(e, {
            target: {
              value: el
            }
          })
          eventHandler.call(el, newEvent)
        }
      }
      grid.addEventListener(eventName, wrappedHandler)
      return wrappedHandler
    } else {
      const wrappedHandler = (e) => {
        eventHandler.call(grid, e)
      }
      grid.addEventListener(eventName, wrappedHandler)
      return wrappedHandler
    }
  }

  function triggerEvent(eventName, data) {
    grid.dispatchEvent(new CustomEvent(eventName, {detail: data}))
  }

  function bind() {
    header = document.createElement('div')
    addClass(header, 'qg-header-row')

    viewport = document.createElement('div')
    viewport.onscroll = scroll
    addClass(viewport, 'qg-viewport')

    canvas = document.createElement('div')
    canvas.className = 'qg-canvas'
    // we're using jQuery here to handle key bindings
    canvas.onkeydown = onKeyDown
    canvas.onkeyup = onKeyUp

    columnResizeGhost = document.createElement('div')
    columnResizeGhost.className = 'qg-col-resize-ghost'
    viewport.append(canvas, columnResizeGhost)

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

    canvasLeft = document.createElement('div')
    canvasLeft.className = 'qg-canvas'
    canvasLeft.onkeydown = onKeyDown
    canvasLeft.onkeyup = onKeyUp
    viewportLeft.append(canvasLeft)

    panelLeftHysteresis = document.createElement('div')
    addClass(panelLeftHysteresis, 'qg-panel-left-hysteresis')
    panelLeftHysteresis.onmouseenter = colFreezeMouseEnter
    panelLeftHysteresis.onmouseleave = colFreezeMouseLeave
    panelLeftHysteresis.onmousemove = colFreezeMouseMoveGhostHandle
    panelLeftHysteresis.onmousedown = colFreezeMouseDown

    panelLeftGhost = document.createElement('div')
    addClass(panelLeftGhost, 'qg-panel-left-ghost')
    panelLeftGhost.onmousemove = colFreezeMouseMoveGhostHandle
    panelLeftGhost.onmouseleave = colFreezeMouseLeave

    panelLeftGhostHandle = document.createElement('div')
    addClass(panelLeftGhostHandle, 'qg-panel-left-ghost-handle')
    panelLeftGhostHandle.onmouseleave = colFreezeMouseLeave
    panelLeftGhostHandle.onmousedown = colFreezeMouseDown

    panelLeftGhost.append(panelLeftGhostHandle)
    panelLeft.append(headerLeft, viewportLeft, panelLeftHysteresis)

    panelLeftSnapGhost = document.createElement('div')
    addClass(panelLeftSnapGhost, 'qg-panel-left-snap-ghost')

    panelLeftInitialHysteresis = document.createElement('div')
    addClass(panelLeftInitialHysteresis, 'qg-panel-left-initial-hysteresis')
    panelLeftInitialHysteresis.onmouseenter = colFreezeMouseEnter
    panelLeftInitialHysteresis.onmouseleave = colFreezeMouseLeave
    panelLeftInitialHysteresis.onmousemove = colFreezeMouseMoveGhostHandle
    panelLeftInitialHysteresis.onmousedown = colFreezeMouseDown

    grid.append(header, viewport, panelLeft, panelLeftGhost, panelLeftSnapGhost, panelLeftInitialHysteresis)
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

    const resizeObserver = new ResizeObserver(render)
    resizeObserver.observe(grid);
  }

  bind()
  render()

  return {

    clearCustomLayout: function () {
      clearCustomLayout()
    },

    shuffleFocusedColumnToFront: function () {
      shuffleToFront()
    },

    toggleFreezeLeft: function () {
      colFreezeToggle()
    },

    show: function () {
      grid.style.display = 'flex'
      render()
    },

    hide: function () {
      grid.style.display = 'none'
    },

    focus: function () {
      focus()
    },

    setData: function (_data) {
      setData(_data)
    },

    getSQL: function () {
      return sql
    },

    render: function () {
      render()
    },

    addEventListener: function (eventName, eventHandler) {
      addEventListener(eventName, eventHandler)
    }
  }
}
