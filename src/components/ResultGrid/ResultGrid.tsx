import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type ColumnPinningState,
} from "@tanstack/react-table"

import type { ColumnDefinition } from "../../utils/questdb/types"
import { unescapeHtml } from "../../utils/escapeHtml"
import type { ResultGridDataSource } from "./types"
import {
  clampColumnWidths,
  sampleColumnWidths,
  isLeftAligned,
  formatCellValue,
  formatColumnType,
} from "./inlineGridUtils"
import { useGridKeyboardNav } from "./useGridKeyboardNav"
import {
  Cell,
  CellText,
  ColResizer,
  DatasetRow,
  GridContainer,
  HeaderCell,
  HeaderName,
  HeaderNameRow,
  HeaderRow,
  HeaderType,
  HEADER_HEIGHT,
  FreezeHandle,
  FrozenShadow,
  ResizeGhost,
  ResizerOverlay,
  Row,
  ROW_HEIGHT,
  ScrollContainer,
  StyledCopyButton,
} from "./styles"
import {
  MAX_VIRTUAL_ROWS,
  toAbsoluteIndex,
  toVisibleAbsoluteRange,
} from "./virtualRowMapping"
import { useContainerWidth } from "./useContainerWidth"
import { useScrollShadows } from "./useScrollShadows"

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    col?: ColumnDefinition
  }
}

const WIDTH_SAMPLE_ROWS = 1000
const KEYBOARD_RESIZE_COMMIT_DEBOUNCE_MS = 200
const FREEZE_HANDLE_EDGE_INSET = 4
const COLUMN_ID_PREFIX = "col_"
const columnId = (dataIndex: number) => `${COLUMN_ID_PREFIX}${dataIndex}`

type GridCellProps = {
  rowIndex: number
  colIndex: number
  rawValue: boolean | string | number | null
  loaded: boolean
  col: ColumnDefinition | undefined
  colWidth: number
  left: number
  width: number
  isActive: boolean
  isPulsing: boolean
  isDesignatedTimestamp: boolean
  frozen?: boolean
  rowActive: boolean
  onCellClick: (row: number, col: number) => void
}

const GridCell = React.memo(function GridCell({
  rowIndex,
  colIndex,
  rawValue,
  loaded,
  col,
  colWidth,
  left,
  width,
  isActive,
  isPulsing,
  isDesignatedTimestamp,
  frozen,
  rowActive,
  onCellClick,
}: GridCellProps) {
  const colType = col?.type ?? ""
  const align = isLeftAligned(colType) ? "left" : "right"
  const displayValue = loaded
    ? unescapeHtml(formatCellValue(rawValue, col, colWidth))
    : ""
  return (
    <Cell
      id={`cell-${rowIndex}-${colIndex}`}
      data-hook="grid-cell"
      data-pulse={isPulsing ? "true" : undefined}
      data-frozen={frozen ? "true" : undefined}
      data-timestamp={isDesignatedTimestamp ? "true" : undefined}
      style={{
        position: frozen ? "sticky" : "absolute",
        left,
        width,
        ...(frozen && { zIndex: 2 }),
      }}
      $isNull={loaded && rawValue === null}
      $isTimestamp={isDesignatedTimestamp}
      $isActive={isActive}
      $isPulsing={isPulsing}
      $frozen={frozen}
      $rowActive={rowActive}
      onClick={() => onCellClick(rowIndex, colIndex)}
      role="gridcell"
      aria-colindex={colIndex + 1}
      aria-selected={isActive}
    >
      <CellText style={{ textAlign: align }}>{displayValue}</CellText>
    </Cell>
  )
})

type Props = {
  dataSource: ResultGridDataSource
  runToken?: number // changes per run to reset focus/selection on the grid
  isFocused?: boolean
  initialColumnSizing?: Record<string, number>
  onColumnSizingCommit: (sizing: Record<string, number>) => void
  initialColumnOrder?: string[]
  onColumnOrderCommit?: (order: string[]) => void
  initialPinnedColumns?: string[]
  onPinnedColumnsCommit?: (pinnedLeft: string[]) => void
  onYieldFocus?: () => void
  onResetLayout?: () => void
  onSelectionChange?: (hasSelection: boolean) => void
  onCellCopy?: () => void
  onColumnCopy?: () => void
}

export type ResultGridHandle = {
  resetLayout: () => void
  shuffleFocusedColumnToFront: () => void
  toggleFreezeLeft: () => void
}

const EMPTY_TABLE_DATA: DatasetRow[] = []

export const ResultGrid = forwardRef<ResultGridHandle, Props>(
  (
    {
      dataSource,
      runToken,
      isFocused = true,
      initialColumnSizing,
      onColumnSizingCommit,
      initialColumnOrder,
      onColumnOrderCommit,
      initialPinnedColumns,
      onPinnedColumnsCommit,
      onYieldFocus,
      onResetLayout,
      onSelectionChange,
      onCellCopy,
      onColumnCopy,
    },
    ref,
  ) => {
    const {
      columns,
      rowCount,
      designatedTimestamp,
      getRow,
      sampleRows,
      onVisibleRowsChange,
    } = dataSource

    const gridRef = useRef<HTMLDivElement>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    const [freezeDragX, setFreezeDragX] = useState<number | null>(null)
    const freezeTargetRef = useRef(0)

    const containerWidth = useContainerWidth(gridRef)
    const { scrolledDown, shadowLeft, handleScroll } =
      useScrollShadows(scrollRef)

    const virtualRowCount = Math.min(rowCount, MAX_VIRTUAL_ROWS)

    // Sampling text lengths over 1000 rows is the expensive part, so it runs
    // once per result; the per-resize work is only the container clamp.
    const sampledWidths = useMemo(
      () => sampleColumnWidths(columns, sampleRows.slice(0, WIDTH_SAMPLE_ROWS)),
      [columns, sampleRows],
    )

    const columnDefs = useMemo<ColumnDef<DatasetRow, unknown>[]>(() => {
      const widths = clampColumnWidths(sampledWidths, containerWidth)
      return columns.map((col, i) => ({
        id: columnId(i),
        accessorFn: (row: DatasetRow) => row[i],
        header: col.name,
        size: widths[i],
        minSize: 60,
        meta: { col },
      }))
    }, [columns, sampledWidths, containerWidth])

    const [columnOrder, setColumnOrder] = useState<string[]>([])
    const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({
      left: [],
      right: [],
    })

    const table = useReactTable({
      // Rows come from the windowed data source, not the table — an empty
      // dataset keeps the table from holding every row.
      data: EMPTY_TABLE_DATA,
      columns: columnDefs,
      columnResizeMode: "onEnd",
      state: { columnOrder, columnPinning },
      onColumnOrderChange: setColumnOrder,
      onColumnPinningChange: setColumnPinning,
      getCoreRowModel: getCoreRowModel(),
    })

    // Restore before paint; an empty value clears any prior overrides. A user
    // resize updates TanStack's own columnSizing, not these props, so it stays.
    useLayoutEffect(() => {
      table.setColumnSizing(initialColumnSizing ?? {})
    }, [initialColumnSizing])

    useLayoutEffect(() => {
      setColumnOrder(initialColumnOrder ?? [])
    }, [initialColumnOrder])

    useLayoutEffect(() => {
      setColumnPinning({ left: initialPinnedColumns ?? [], right: [] })
    }, [initialPinnedColumns])

    const leftHeaders = table.getLeftHeaderGroups()[0]?.headers ?? []
    const centerHeaders = table.getCenterHeaderGroups()[0]?.headers ?? []
    const headers = [...leftHeaders, ...centerHeaders]
    const frozenCount = leftHeaders.length
    const frozenWidth = table.getLeftTotalSize()

    // Must follow the visual layout (pinned columns first), the same order as
    // `headers`. getVisibleLeafColumns() ignores pinning, so deriving the data
    // index from it would mismatch a frozen column whose neighbour was moved.
    const visualLeafIds = useMemo(
      () => headers.map((header) => header.column.id),
      [columnOrder, columnPinning, columnDefs],
    )
    const dataIndexAt = useCallback(
      (visualCol: number): number => {
        const id = visualLeafIds[visualCol]
        return id ? parseInt(id.slice(COLUMN_ID_PREFIX.length), 10) : visualCol
      },
      [visualLeafIds],
    )

    // undefined means the row's page hasn't loaded yet, unlike a SQL null.
    const getData = useCallback(
      (row: number, col: number) =>
        getRow(toAbsoluteIndex(row, rowCount))?.[dataIndexAt(col)],
      [getRow, rowCount, dataIndexAt],
    )

    const getColumn = useCallback(
      (col: number) => columns[dataIndexAt(col)],
      [columns, dataIndexAt],
    )

    const moveColumnToFront = useCallback(
      (visualCol: number): number | null => {
        const id = visualLeafIds[visualCol]
        if (!id) return null
        const frontIndex = visualCol < frozenCount ? 0 : frozenCount
        if (visualCol === frontIndex) return frontIndex
        // A frozen column reorders within the frozen band — its columnOrder is
        // ignored while pinned, so reorder the pin list instead, landing it at
        // visual index 0. This matches the legacy grid.
        if (visualCol < frozenCount) {
          const left = columnPinning.left ?? []
          const nextLeft = [id, ...left.filter((other) => other !== id)]
          setColumnPinning({ left: nextLeft, right: [] })
          onPinnedColumnsCommit?.(nextLeft)
          return frontIndex
        }
        const ids = columnOrder.length
          ? columnOrder
          : columnDefs.map((d) => d.id as string)
        const next = [id, ...ids.filter((other) => other !== id)]
        setColumnOrder(next)
        onColumnOrderCommit?.(next)
        return frontIndex
      },
      [
        visualLeafIds,
        frozenCount,
        columnPinning,
        columnOrder,
        columnDefs,
        onColumnOrderCommit,
        onPinnedColumnsCommit,
      ],
    )

    const toggleFreeze = useCallback(() => {
      let next: ColumnPinningState
      if ((columnPinning.left ?? []).length > 0) {
        next = { left: [], right: [] }
      } else {
        const firstId = table.getCenterLeafColumns()[0]?.id
        next = firstId ? { left: [firstId], right: [] } : columnPinning
      }
      setColumnPinning(next)
      onPinnedColumnsCommit?.(next.left ?? [])
    }, [columnPinning, table, onPinnedColumnsCommit])

    const applyFreeze = useCallback(
      (count: number) => {
        const pinned = visualLeafIds.slice(0, count)
        setColumnPinning({ left: pinned, right: [] })
        onPinnedColumnsCommit?.(pinned)
      },
      [visualLeafIds, onPinnedColumnsCommit],
    )

    const onFreezeMouseDown = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault()
        const gridEl = gridRef.current
        const scrollEl = scrollRef.current
        if (!gridEl || !scrollEl) return
        const gridLeft = gridEl.getBoundingClientRect().left
        const viewportWidth = scrollEl.clientWidth
        const scrollLeft = scrollEl.scrollLeft

        // Hold the resize cursor for the whole drag — it inherits to the cells,
        // which would otherwise reset it to default as the pointer leaves the
        // handle.
        document.body.style.cursor = "col-resize"

        // Candidate k = "freeze k columns"; its boundary is fixed in the frozen
        // region but scrolls with content past it. Keep one column scrollable.
        let cumulativeWidth = 0
        const candidates: { k: number; x: number }[] = [{ k: 0, x: 0 }]
        for (let i = 0; i < headers.length - 1; i++) {
          cumulativeWidth += headers[i].getSize()
          const k = i + 1
          const x =
            k <= frozenCount ? cumulativeWidth : cumulativeWidth - scrollLeft
          if (x >= 0 && x <= viewportWidth) candidates.push({ k, x })
        }

        freezeTargetRef.current = frozenCount

        const onMove = (ev: MouseEvent) => {
          const cursorX = ev.clientX - gridLeft
          let best = candidates[0]
          for (const c of candidates) {
            if (Math.abs(c.x - cursorX) < Math.abs(best.x - cursorX)) best = c
          }
          setFreezeDragX(best.x)
          freezeTargetRef.current = best.k
        }
        const onUp = () => {
          window.removeEventListener("mousemove", onMove)
          window.removeEventListener("mouseup", onUp)
          document.body.style.cursor = ""
          setFreezeDragX(null)
          applyFreeze(freezeTargetRef.current)
        }
        window.addEventListener("mousemove", onMove)
        window.addEventListener("mouseup", onUp)
      },
      [headers, frozenCount, applyFreeze],
    )

    const resetLayout = useCallback(() => {
      table.setColumnSizing({})
      setColumnOrder([])
      setColumnPinning({ left: [], right: [] })
      onPinnedColumnsCommit?.([])
      if (scrollRef.current) scrollRef.current.scrollLeft = 0
      onResetLayout?.()
    }, [table, onResetLayout, onPinnedColumnsCommit])

    const scrollContextRef = useRef<{
      scrollElement: HTMLElement
      rowHeight: number
      headerHeight: number
      frozenWidth: number
      frozenColCount: number
      getColumnOffset: (col: number) => number
      getColumnWidth: (col: number) => number
    } | null>(null)

    useEffect(() => {
      if (scrollRef.current) {
        scrollContextRef.current = {
          scrollElement: scrollRef.current,
          rowHeight: ROW_HEIGHT,
          headerHeight: HEADER_HEIGHT,
          frozenWidth,
          frozenColCount: frozenCount,
          getColumnOffset: (col: number) => {
            let offset = 0
            for (let i = 0; i < col; i++) {
              offset += headers[i]?.getSize() ?? 0
            }
            return offset
          },
          getColumnWidth: (col: number) => headers[col]?.getSize() ?? 0,
        }
      }
    }, [headers, frozenWidth, frozenCount])

    const {
      focusedCell,
      setFocusedCell,
      copyPulse,
      onCellClick,
      onKeyDown,
      onBlur,
    } = useGridKeyboardNav(
      virtualRowCount,
      columns.length,
      getData,
      getColumn,
      scrollContextRef,
      onCellCopy,
    )

    const hasSelection = focusedCell != null
    useEffect(() => {
      onSelectionChange?.(hasSelection)
    }, [hasSelection, onSelectionChange])

    const shuffleFocusedColumnToFront = useCallback(() => {
      if (!focusedCell) return
      const targetCol = moveColumnToFront(focusedCell.col)
      if (targetCol === null) return
      setFocusedCell({ row: focusedCell.row, col: targetCol })
      // The column lands at the left edge of the scrollable area, so scroll
      // there to keep it in view. A frozen target is sticky and already shown.
      if (targetCol >= frozenCount && scrollRef.current) {
        scrollRef.current.scrollLeft = 0
      }
    }, [focusedCell, moveColumnToFront, setFocusedCell, frozenCount])

    const handleGridKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "F2") {
          e.preventDefault()
          setFocusedCell(null)
          gridRef.current?.blur()
          onYieldFocus?.()
          return
        }
        // stopPropagation so "/" doesn't reach DocSearch's global shortcut.
        if (e.key === "/" && !e.metaKey && !e.ctrlKey && focusedCell) {
          e.preventDefault()
          e.stopPropagation()
          shuffleFocusedColumnToFront()
          return
        }
        // preventDefault stops the browser's bookmark shortcut.
        if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
          e.preventDefault()
          e.stopPropagation()
          resetLayout()
          return
        }
        onKeyDown(e)
      },
      [
        onKeyDown,
        focusedCell,
        shuffleFocusedColumnToFront,
        onYieldFocus,
        setFocusedCell,
        resetLayout,
      ],
    )

    useImperativeHandle(
      ref,
      () => ({
        resetLayout,
        toggleFreezeLeft: toggleFreeze,
        shuffleFocusedColumnToFront,
      }),
      [resetLayout, toggleFreeze, shuffleFocusedColumnToFront],
    )

    const prevRunTokenRef = useRef(runToken)

    const isCellFocused = (row: number, col: number) =>
      focusedCell?.row === row && focusedCell?.col === col

    const isCellPulsing = (row: number, col: number) =>
      copyPulse?.row === row && copyPulse?.col === col

    const rowVirtualizer = useVirtualizer({
      count: virtualRowCount,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => ROW_HEIGHT,
      overscan: 3,
    })

    const columnSizing = table.getState().columnSizing
    const isResizingColumn =
      !!table.getState().columnSizingInfo.isResizingColumn

    const wasResizingRef = useRef(isResizingColumn)
    useEffect(() => {
      if (wasResizingRef.current && !isResizingColumn) {
        onColumnSizingCommit(columnSizing)
      }
      wasResizingRef.current = isResizingColumn
    }, [isResizingColumn, columnSizing, onColumnSizingCommit])

    const columnVirtualizer = useVirtualizer({
      horizontal: true,
      count: headers.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: (index) => headers[index]?.getSize() ?? 100,
      overscan: 2,
    })

    // Re-measure so a reorder/resize/new-data doesn't leave the virtualizer with
    // stale per-index widths until the next scroll.
    useEffect(() => {
      columnVirtualizer.measure()
    }, [
      columnSizing,
      columnDefs,
      columnOrder,
      columnPinning,
      columnVirtualizer,
    ])

    useEffect(() => {
      if (prevRunTokenRef.current === runToken) return
      prevRunTokenRef.current = runToken
      setFocusedCell(null)
      gridRef.current?.blur()
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0
        scrollRef.current.scrollLeft = 0
      }
    }, [runToken])

    const totalWidth = columnVirtualizer.getTotalSize()
    const totalHeight = rowVirtualizer.getTotalSize()
    const virtualRows = rowVirtualizer.getVirtualItems()
    const virtualColumns = columnVirtualizer.getVirtualItems()

    const firstVirtual = virtualRows[0]?.index ?? 0
    const lastVirtual = virtualRows[virtualRows.length - 1]?.index ?? 0
    const prevFirstAbsRef = useRef(0)
    useEffect(() => {
      if (!onVisibleRowsChange || virtualRowCount === 0) return
      const { firstIndex, lastIndex } = toVisibleAbsoluteRange(
        firstVirtual,
        lastVirtual,
        rowCount,
      )
      const direction = firstIndex >= prevFirstAbsRef.current ? 1 : -1
      prevFirstAbsRef.current = firstIndex
      onVisibleRowsChange({ firstIndex, lastIndex, direction })
    }, [
      firstVirtual,
      lastVirtual,
      rowCount,
      virtualRowCount,
      onVisibleRowsChange,
    ])

    const sizingCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    )
    const commitSizingDebounced = useCallback(
      (sizing: Record<string, number>) => {
        if (sizingCommitTimerRef.current) {
          clearTimeout(sizingCommitTimerRef.current)
        }
        sizingCommitTimerRef.current = setTimeout(() => {
          onColumnSizingCommit(sizing)
        }, KEYBOARD_RESIZE_COMMIT_DEBOUNCE_MS)
      },
      [onColumnSizingCommit],
    )
    useEffect(
      () => () => {
        if (sizingCommitTimerRef.current) {
          clearTimeout(sizingCommitTimerRef.current)
        }
      },
      [],
    )

    // Shared by the in-header (center columns) and overlay (frozen columns)
    // resizers. style positions the overlay ones; header ones use the default.
    const renderResizer = useCallback(
      (header: (typeof headers)[number], style?: React.CSSProperties) => (
        <ColResizer
          key={header.id}
          data-hook="grid-col-resizer"
          style={style}
          onMouseDown={header.getResizeHandler()}
          onTouchStart={header.getResizeHandler()}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
            e.preventDefault()
            const step = e.shiftKey ? 40 : 10
            const delta = e.key === "ArrowRight" ? step : -step
            const next = Math.max(60, header.getSize() + delta)
            const nextSizing = {
              ...table.getState().columnSizing,
              [header.column.id]: next,
            }
            table.setColumnSizing(nextSizing)
            commitSizingDebounced(nextSizing)
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize column ${header.column.columnDef.meta?.col?.name ?? ""}`}
          tabIndex={0}
        />
      ),
      [table, commitSizingDebounced],
    )

    const headerSignature = virtualColumns
      .map((c) => `${c.index}:${c.start}:${c.size}`)
      .join("|")

    const headerRow = useMemo(() => {
      const renderHeaderCell = (
        header: (typeof headers)[number],
        visualIndex: number,
        pos: { frozen: boolean; left: number; width: number },
      ) => {
        const col = header.column.columnDef.meta?.col
        const colType = col?.type ?? ""
        const align = isLeftAligned(colType) ? "left" : "right"
        return (
          <HeaderCell
            key={header.id}
            $align={align}
            $frozen={pos.frozen}
            style={{
              position: pos.frozen ? "sticky" : "absolute",
              left: pos.left,
              width: pos.width,
              // Above the scrolling center headers (which have no z-index).
              ...(pos.frozen && { zIndex: 2 }),
            }}
            role="columnheader"
            aria-colindex={visualIndex + 1}
          >
            <HeaderNameRow $align={align}>
              <HeaderName data-hook="grid-header-name">
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                )}
              </HeaderName>
              <StyledCopyButton
                className="header-copy-btn"
                text={
                  typeof header.column.columnDef.header === "string"
                    ? header.column.columnDef.header
                    : ""
                }
                onCopy={onColumnCopy}
                iconOnly
                size="sm"
                skin="transparent"
              />
            </HeaderNameRow>
            <HeaderType>{col ? formatColumnType(col) : colType}</HeaderType>
            {!pos.frozen && renderResizer(header)}
          </HeaderCell>
        )
      }
      return (
        <HeaderRow
          $shadowBottom={scrolledDown}
          // z-index 3 keeps the sticky header above the frozen body cells (2);
          // it stays below the freeze handle (5), which covers the columns.
          style={{ width: totalWidth, position: "sticky", top: 0, zIndex: 3 }}
          role="row"
          aria-rowindex={1}
        >
          {headers.slice(0, frozenCount).map((header, i) =>
            renderHeaderCell(header, i, {
              frozen: true,
              left: header.column.getStart("left"),
              width: header.getSize(),
            }),
          )}
          {virtualColumns.map((virtualCol) => {
            if (virtualCol.index < frozenCount) return null
            const header = headers[virtualCol.index]
            if (!header) return null
            return renderHeaderCell(header, virtualCol.index, {
              frozen: false,
              left: virtualCol.start,
              width: virtualCol.size,
            })
          })}
        </HeaderRow>
      )
    }, [
      headerSignature,
      scrolledDown,
      totalWidth,
      columnSizing,
      frozenCount,
      // headerSignature omits order, so a same-width reorder needs this to
      // avoid stale column names.
      columnOrder,
      columnPinning,
      onColumnCopy,
      renderResizer,
    ])

    const sizingInfo = table.getState().columnSizingInfo
    let resizeGhostLeft: number | null = null
    if (sizingInfo.isResizingColumn) {
      const idx = headers.findIndex(
        (h) => h.column.id === sizingInfo.isResizingColumn,
      )
      if (idx >= 0) {
        let left = 0
        for (let i = 0; i < idx; i++) left += headers[i].getSize()
        const futureWidth = Math.max(
          60,
          headers[idx].getSize() + (sizingInfo.deltaOffset ?? 0),
        )
        const scrollLeft =
          idx < frozenCount ? 0 : (scrollRef.current?.scrollLeft ?? 0)
        resizeGhostLeft = left + futureWidth - scrollLeft
      }
    }

    const viewportWidth = scrollRef.current?.clientWidth ?? containerWidth
    const freezeHandleLeft = Math.min(
      frozenWidth,
      Math.max(0, viewportWidth - FREEZE_HANDLE_EDGE_INSET),
    )

    return (
      <GridContainer
        ref={gridRef}
        tabIndex={0}
        onKeyDown={handleGridKeyDown}
        onBlur={onBlur}
        role="grid"
        aria-rowcount={rowCount + 1}
        aria-colcount={columns.length}
        aria-activedescendant={
          focusedCell ? `cell-${focusedCell.row}-${focusedCell.col}` : undefined
        }
      >
        <ScrollContainer
          ref={scrollRef}
          data-hook="grid-viewport"
          onScroll={handleScroll}
          $scrollable={isFocused}
          role="presentation"
        >
          {headerRow}

          <div
            data-hook="grid-canvas"
            role="rowgroup"
            style={{
              height: totalHeight,
              width: totalWidth,
              position: "relative",
            }}
          >
            {virtualRows.map((virtualRow) => {
              const virtualIndex = virtualRow.index
              const absoluteIndex = toAbsoluteIndex(virtualIndex, rowCount)
              const rowData = getRow(absoluteIndex)
              const renderBodyCell = (
                header: (typeof headers)[number],
                colIdx: number,
                pos: { frozen: boolean; left: number; width: number },
              ) => {
                const dataIndex = dataIndexAt(colIdx)
                return (
                  <GridCell
                    key={header.id}
                    rowIndex={virtualIndex}
                    colIndex={colIdx}
                    rawValue={rowData ? (rowData[dataIndex] ?? null) : null}
                    loaded={rowData != null}
                    col={header.column.columnDef.meta?.col}
                    colWidth={header.getSize()}
                    left={pos.left}
                    width={pos.width}
                    frozen={pos.frozen}
                    rowActive={pos.frozen && focusedCell?.row === virtualIndex}
                    isActive={isCellFocused(virtualIndex, colIdx)}
                    isPulsing={isCellPulsing(virtualIndex, colIdx)}
                    isDesignatedTimestamp={dataIndex === designatedTimestamp}
                    onCellClick={onCellClick}
                  />
                )
              }
              return (
                <Row
                  key={virtualIndex}
                  data-hook="grid-row"
                  $active={focusedCell?.row === virtualIndex}
                  style={{
                    position: "absolute",
                    top: virtualRow.start,
                    width: totalWidth,
                  }}
                  role="row"
                  aria-rowindex={absoluteIndex + 2}
                >
                  {headers.slice(0, frozenCount).map((header, i) =>
                    renderBodyCell(header, i, {
                      frozen: true,
                      left: header.column.getStart("left"),
                      width: header.getSize(),
                    }),
                  )}
                  {virtualColumns.map((virtualCol) => {
                    if (virtualCol.index < frozenCount) return null
                    const header = headers[virtualCol.index]
                    if (!header) return null
                    return renderBodyCell(header, virtualCol.index, {
                      frozen: false,
                      left: virtualCol.start,
                      width: virtualCol.size,
                    })
                  })}
                </Row>
              )
            })}
          </div>
        </ScrollContainer>
        {frozenCount > 0 && shadowLeft && (
          <FrozenShadow
            data-hook="grid-frozen-shadow"
            style={{ left: frozenWidth }}
          />
        )}
        {(frozenCount > 0 || headers.length > 1) && (
          <FreezeHandle
            data-hook="grid-freeze-handle"
            $dragging={freezeDragX !== null}
            $flush={frozenCount === 0}
            style={{ left: freezeHandleLeft }}
            onMouseDown={onFreezeMouseDown}
            aria-label={
              frozenCount > 0
                ? "Drag to freeze more or fewer columns"
                : "Drag to freeze columns"
            }
          />
        )}
        {frozenCount > 0 && (
          <ResizerOverlay>
            {headers.slice(0, frozenCount).map((header) =>
              renderResizer(header, {
                left: header.column.getStart("left") + header.getSize() - 10,
                right: "auto",
              }),
            )}
          </ResizerOverlay>
        )}
        {freezeDragX !== null && <ResizeGhost style={{ left: freezeDragX }} />}
        {resizeGhostLeft !== null && (
          <ResizeGhost style={{ left: resizeGhostLeft }} />
        )}
      </GridContainer>
    )
  },
)

ResultGrid.displayName = "ResultGrid"
