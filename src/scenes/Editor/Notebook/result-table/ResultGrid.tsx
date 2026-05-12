import React, {
  useCallback,
  useEffect,
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
} from "@tanstack/react-table"

import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type { DqlQueryResult } from "../../../../store/notebook"
import {
  computeColumnWidths,
  isLeftAligned,
  isTimestampColumn,
  formatCellValue,
  formatColumnType,
} from "./inlineGridUtils"
import { useGridKeyboardNav } from "./useGridKeyboardNav"
import {
  Cell,
  ColResizer,
  DatasetRow,
  GridContainer,
  HeaderCell,
  HeaderName,
  HeaderNameRow,
  HeaderRow,
  HeaderType,
  HEADER_HEIGHT,
  Row,
  ROW_HEIGHT,
  ScrollContainer,
  StyledCopyButton,
} from "./styles"

// Typed ColumnMeta so `columnDef.meta.col` is narrowed instead of `any`.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    col?: ColumnDefinition
  }
}

type Props = {
  data: DqlQueryResult
  isFocused?: boolean
  customHeight?: number
}

export const ResultGrid: React.FC<Props> = ({
  data,
  isFocused = true,
  customHeight: _customHeight,
}) => {
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(800)
  const [hoverRow, setHoverRow] = useState<number | null>(null)
  const [scrolledDown, setScrolledDown] = useState(false)
  const [shadowLeft, setShadowLeft] = useState(false)

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrolledDown(scrollRef.current.scrollTop > 0)
      setShadowLeft(scrollRef.current.scrollLeft > 0)
    }
  }, [])

  useLayoutEffect(() => {
    if (gridRef.current) {
      setContainerWidth(gridRef.current.getBoundingClientRect().width)
    }
  }, [])

  useEffect(() => {
    if (!gridRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
    })
    observer.observe(gridRef.current)
    return () => observer.disconnect()
  }, [])

  const columnDefs = useMemo<ColumnDef<DatasetRow, unknown>[]>(() => {
    const widths = computeColumnWidths(
      data.columns,
      data.dataset,
      containerWidth,
    )
    return data.columns.map((col, i) => ({
      id: `col_${i}`,
      accessorFn: (row: DatasetRow) => row[i],
      header: col.name,
      size: widths[i],
      minSize: 60,
      meta: { col },
    }))
  }, [data.columns, data.dataset, containerWidth])

  const table = useReactTable({
    data: data.dataset,
    columns: columnDefs,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
  })

  const headerGroups = table.getHeaderGroups()
  const headers = headerGroups[0]?.headers ?? []
  const rows = table.getRowModel().rows

  const getData = useCallback(
    (row: number, col: number) => data.dataset[row]?.[col] ?? null,
    [data.dataset],
  )

  const scrollContextRef = useRef<{
    scrollElement: HTMLElement
    rowHeight: number
    headerHeight: number
    getColumnOffset: (col: number) => number
    getColumnWidth: (col: number) => number
  } | null>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollContextRef.current = {
        scrollElement: scrollRef.current,
        rowHeight: ROW_HEIGHT,
        headerHeight: HEADER_HEIGHT,
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
  }, [headers])

  const { focusedCell, copyPulse, onCellClick, onKeyDown, onBlur } =
    useGridKeyboardNav(
      rows.length,
      data.columns.length,
      getData,
      scrollContextRef,
    )

  const isCellFocused = (row: number, col: number) =>
    focusedCell?.row === row && focusedCell?.col === col

  const isCellPulsing = (row: number, col: number) =>
    copyPulse?.row === row && copyPulse?.col === col

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  })

  const columnSizing = table.getState().columnSizing

  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: headers.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => headers[index]?.getSize() ?? 100,
    overscan: 3,
  })

  useEffect(() => {
    columnVirtualizer.measure()
  }, [columnSizing, columnVirtualizer])

  const totalWidth = columnVirtualizer.getTotalSize()
  const totalHeight = rowVirtualizer.getTotalSize()
  const virtualRows = rowVirtualizer.getVirtualItems()
  const virtualColumns = columnVirtualizer.getVirtualItems()

  return (
    <GridContainer
      ref={gridRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      $shadowLeft={shadowLeft}
      role="grid"
      aria-rowcount={rows.length + 1}
      aria-colcount={data.columns.length}
      aria-activedescendant={
        focusedCell ? `cell-${focusedCell.row}-${focusedCell.col}` : undefined
      }
    >
      <ScrollContainer
        ref={scrollRef}
        onScroll={handleScroll}
        $scrollable={isFocused}
      >
        <HeaderRow
          $shadowBottom={scrolledDown}
          style={{ width: totalWidth, position: "sticky", top: 0, zIndex: 2 }}
          role="row"
          aria-rowindex={1}
        >
          {virtualColumns.map((virtualCol) => {
            const header = headers[virtualCol.index]
            if (!header) return null
            const col = header.column.columnDef.meta?.col
            const colType = col?.type ?? ""
            const align = isLeftAligned(colType) ? "left" : "right"
            return (
              <HeaderCell
                key={header.id}
                $align={align}
                style={{
                  position: "absolute",
                  left: virtualCol.start,
                  width: virtualCol.size,
                }}
                role="columnheader"
                aria-colindex={virtualCol.index + 1}
              >
                <HeaderNameRow $align={align}>
                  <HeaderName>
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
                    iconOnly
                    size="sm"
                    skin="transparent"
                  />
                </HeaderNameRow>
                <HeaderType>{col ? formatColumnType(col) : colType}</HeaderType>
                <ColResizer
                  onMouseDown={header.getResizeHandler()}
                  onTouchStart={header.getResizeHandler()}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
                    e.preventDefault()
                    const step = e.shiftKey ? 40 : 10
                    const delta = e.key === "ArrowRight" ? step : -step
                    const current = header.getSize()
                    const next = Math.max(60, current + delta)
                    table.setColumnSizing((prev) => ({
                      ...prev,
                      [header.column.id]: next,
                    }))
                  }}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize column ${col?.name ?? ""}`}
                  tabIndex={0}
                />
              </HeaderCell>
            )
          })}
        </HeaderRow>

        <div
          style={{
            height: totalHeight,
            width: totalWidth,
            position: "relative",
          }}
        >
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index]
            if (!row) return null
            const rowIndex = virtualRow.index
            return (
              <Row
                key={rowIndex}
                $hover={hoverRow === rowIndex}
                $active={focusedCell?.row === rowIndex}
                onMouseEnter={() => setHoverRow(rowIndex)}
                onMouseLeave={() => setHoverRow(null)}
                style={{
                  position: "absolute",
                  top: virtualRow.start,
                  width: totalWidth,
                }}
                role="row"
                aria-rowindex={rowIndex + 2}
              >
                {virtualColumns.map((virtualCol) => {
                  const colIdx = virtualCol.index
                  const cell = row.getVisibleCells()[colIdx]
                  if (!cell) return null
                  const col = cell.column.columnDef.meta?.col
                  const colType = col?.type ?? ""
                  const rawValue = data.dataset[rowIndex]?.[colIdx]
                  const colWidth = cell.column.getSize()
                  const displayValue = formatCellValue(
                    rawValue ?? null,
                    col,
                    colWidth,
                  )
                  const align = isLeftAligned(colType) ? "left" : "right"
                  const active = isCellFocused(rowIndex, colIdx)

                  return (
                    <Cell
                      key={cell.id}
                      id={`cell-${rowIndex}-${colIdx}`}
                      style={{
                        position: "absolute",
                        left: virtualCol.start,
                        width: virtualCol.size,
                        textAlign: align,
                      }}
                      $isNull={rawValue === null}
                      $isTimestamp={isTimestampColumn(colType)}
                      $isActive={active}
                      $isPulsing={isCellPulsing(rowIndex, colIdx)}
                      onClick={() => onCellClick(rowIndex, colIdx)}
                      role="gridcell"
                      aria-colindex={colIdx + 1}
                      aria-selected={active}
                    >
                      {displayValue}
                    </Cell>
                  )
                })}
              </Row>
            )
          })}
        </div>
      </ScrollContainer>
    </GridContainer>
  )
}
