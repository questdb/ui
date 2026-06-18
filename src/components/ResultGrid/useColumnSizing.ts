import { useCallback, useEffect, useRef } from "react"
import type { Table } from "@tanstack/react-table"
import type { DatasetRow } from "./styles"

const KEYBOARD_RESIZE_COMMIT_DEBOUNCE_MS = 200

export const useColumnSizing = (
  table: Table<DatasetRow>,
  onColumnSizingCommit?: (sizing: Record<string, number>) => void,
) => {
  const columnSizing = table.getState().columnSizing
  const isResizingColumn = !!table.getState().columnSizingInfo.isResizingColumn

  const wasResizingRef = useRef(isResizingColumn)
  useEffect(() => {
    if (wasResizingRef.current && !isResizingColumn) {
      onColumnSizingCommit?.(columnSizing)
    }
    wasResizingRef.current = isResizingColumn
  }, [isResizingColumn, columnSizing, onColumnSizingCommit])

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commitSizingDebounced = useCallback(
    (sizing: Record<string, number>) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        onColumnSizingCommit?.(sizing)
      }, KEYBOARD_RESIZE_COMMIT_DEBOUNCE_MS)
    },
    [onColumnSizingCommit],
  )
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    },
    [],
  )

  return { columnSizing, commitSizingDebounced }
}
