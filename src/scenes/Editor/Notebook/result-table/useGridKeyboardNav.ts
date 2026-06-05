import { useCallback, useState } from "react"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import { copyToClipboard } from "../../../../utils/copyToClipboard"
import { toast } from "../../../../components/Toast"
import { formatCellValueForCopy } from "./inlineGridUtils"

export type CellCoord = { row: number; col: number }

type ScrollContext = {
  scrollElement: HTMLElement
  rowHeight: number
  headerHeight: number
  getColumnOffset: (col: number) => number
  getColumnWidth: (col: number) => number
}

const scrollCellIntoView = (cell: CellCoord, ctx: ScrollContext) => {
  const {
    scrollElement,
    rowHeight,
    headerHeight,
    getColumnOffset,
    getColumnWidth,
  } = ctx

  // Vertical: cell positions are relative to body div which starts after header
  // In scroll coordinates, cell top = headerHeight + row * rowHeight
  const cellTop = headerHeight + cell.row * rowHeight
  const cellBottom = cellTop + rowHeight
  const viewTop = scrollElement.scrollTop + headerHeight
  const viewBottom = scrollElement.scrollTop + scrollElement.clientHeight

  if (cellTop < viewTop) {
    scrollElement.scrollTop = cellTop - headerHeight
  } else if (cellBottom > viewBottom) {
    scrollElement.scrollTop = cellBottom - scrollElement.clientHeight
  }

  const cellLeft = getColumnOffset(cell.col)
  const cellRight = cellLeft + getColumnWidth(cell.col)
  const viewLeft = scrollElement.scrollLeft
  const viewRight = scrollElement.scrollLeft + scrollElement.clientWidth

  if (cellLeft < viewLeft) {
    scrollElement.scrollLeft = cellLeft
  } else if (cellRight > viewRight) {
    scrollElement.scrollLeft = cellRight - scrollElement.clientWidth
  }
}

export const useGridKeyboardNav = (
  rowCount: number,
  colCount: number,
  getData: (row: number, col: number) => boolean | string | number | null,
  getColumn: (col: number) => ColumnDefinition | undefined,
  scrollContextRef: React.RefObject<ScrollContext | null>,
) => {
  const [focusedCell, setFocusedCell] = useState<CellCoord | null>(null)
  const [copyPulse, setCopyPulse] = useState<CellCoord | null>(null)

  const moveTo = useCallback(
    (row: number, col: number) => {
      const next = { row, col }
      setFocusedCell(next)
      if (scrollContextRef.current) {
        scrollCellIntoView(next, scrollContextRef.current)
      }
    },
    [scrollContextRef],
  )

  const onCellClick = useCallback((row: number, col: number) => {
    setFocusedCell({ row, col })
  }, [])

  const onBlur = useCallback(() => {
    setFocusedCell(null)
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!focusedCell) return

      const { row, col } = focusedCell

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault()
          if (e.metaKey || e.ctrlKey) {
            moveTo(0, col)
          } else if (row > 0) {
            moveTo(row - 1, col)
          }
          break
        case "ArrowDown":
          e.preventDefault()
          if (e.metaKey || e.ctrlKey) {
            moveTo(rowCount - 1, col)
          } else if (row < rowCount - 1) {
            moveTo(row + 1, col)
          }
          break
        case "ArrowLeft":
          e.preventDefault()
          if (col > 0) moveTo(row, col - 1)
          break
        case "ArrowRight":
          e.preventDefault()
          if (col < colCount - 1) moveTo(row, col + 1)
          break
        case "Home":
          e.preventDefault()
          if (e.metaKey || e.ctrlKey) {
            moveTo(0, 0)
          } else {
            moveTo(row, 0)
          }
          break
        case "End":
          e.preventDefault()
          if (e.metaKey || e.ctrlKey) {
            moveTo(rowCount - 1, colCount - 1)
          } else {
            moveTo(row, colCount - 1)
          }
          break
        case "PageUp": {
          e.preventDefault()
          const ctx = scrollContextRef.current
          if (ctx) {
            const pageRows = Math.floor(
              (ctx.scrollElement.clientHeight - ctx.headerHeight) /
                ctx.rowHeight,
            )
            moveTo(Math.max(0, row - pageRows), col)
          }
          break
        }
        case "PageDown": {
          e.preventDefault()
          const ctx = scrollContextRef.current
          if (ctx) {
            const pageRows = Math.floor(
              (ctx.scrollElement.clientHeight - ctx.headerHeight) /
                ctx.rowHeight,
            )
            moveTo(Math.min(rowCount - 1, row + pageRows), col)
          }
          break
        }
        case "c":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            const value = getData(row, col)
            const text = formatCellValueForCopy(value, getColumn(col))
            void copyToClipboard(text).then(() => {
              toast.success("Copied to clipboard")
              setCopyPulse({ row, col })
              setTimeout(() => setCopyPulse(null), 1000)
            })
          }
          break
      }
    },
    [
      focusedCell,
      rowCount,
      colCount,
      getData,
      getColumn,
      moveTo,
      scrollContextRef,
    ],
  )

  return {
    focusedCell,
    setFocusedCell,
    copyPulse,
    onCellClick,
    onKeyDown,
    onBlur,
  }
}
