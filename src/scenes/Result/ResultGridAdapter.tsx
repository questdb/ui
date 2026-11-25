import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import styled from "styled-components"
import {
  ResultGrid,
  buildResultPageMarkdown,
  type ResultGridHandle,
  type ResultGridRow,
} from "../../components/ResultGrid"
import type { ColumnDefinition } from "../../utils/questdb/types"
import { usePagedDataSource, type PaginationFn } from "./usePagedDataSource"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import {
  loadColumnLayout,
  saveColumnLayout,
  removeColumnLayout,
} from "./columnLayoutStore"

const AdapterRoot = styled.div<{ $visible: boolean }>`
  display: ${({ $visible }) => ($visible ? "flex" : "none")};
  flex-direction: column;
  flex: 1;
  width: 100%;
  min-height: 0;
`

type DqlResultInput = {
  columns: ColumnDefinition[]
  dataset: ResultGridRow[]
  count: number
  query: string
  timestamp?: number
}

export type ResultGridAdapterHandle = {
  focus: () => void
  getSQL: () => string | undefined
  getResultAsMarkdown: () => string
  resetLayout: () => void
  shuffleFocusedColumnToFront: () => void
  toggleFreezeLeft: () => void
}

type ResultGridAdapterProps = {
  // Each new result object starts a new run, even when its query is the same.
  result: DqlResultInput | null
  visible: boolean
  isFocused?: boolean
  paginationFn?: PaginationFn
  onSelectionChange: (hasSelection: boolean) => void
  onYieldFocus: () => void
  onFrozenColumnsChange: (count: number) => void
}

// Connects the console's result pane to the neutral React ResultGrid: pages
// the result from the server and keeps a column layout per result shape.
export const ResultGridAdapter = forwardRef<
  ResultGridAdapterHandle,
  ResultGridAdapterProps
>(
  (
    {
      result,
      visible,
      isFocused = true,
      paginationFn,
      onSelectionChange,
      onYieldFocus,
      onFrozenColumnsChange,
    },
    ref,
  ) => {
    const { dataSource, setResult, getSQL, getCurrentPageRows, hasData } =
      usePagedDataSource(paginationFn)
    const { maxColumnWidth } = useLocalStorage()

    const [runToken, setRunToken] = useState(0)
    const [restoredSizing, setRestoredSizing] = useState<
      Record<string, number>
    >({})
    const [restoredOrder, setRestoredOrder] = useState<string[]>([])
    const [restoredPinned, setRestoredPinned] = useState<string[]>([])

    const rootRef = useRef<HTMLDivElement>(null)
    const gridImperativeRef = useRef<ResultGridHandle>(null)
    // Current result's columns, for keying the persisted layout on commit.
    const columnsRef = useRef<ColumnDefinition[]>([])
    const onFrozenColumnsChangeRef = useRef(onFrozenColumnsChange)
    onFrozenColumnsChangeRef.current = onFrozenColumnsChange

    const handleSizingCommit = useCallback((sizing: Record<string, number>) => {
      saveColumnLayout(columnsRef.current, { columnSizing: sizing })
    }, [])

    const handleOrderCommit = useCallback((order: string[]) => {
      saveColumnLayout(columnsRef.current, { columnOrder: order })
    }, [])

    const handleResetLayout = useCallback(() => {
      removeColumnLayout(columnsRef.current)
    }, [])

    const handlePinnedColumnsCommit = useCallback(
      (pinnedLeft: string[]) => {
        saveColumnLayout(columnsRef.current, { pinnedColumns: pinnedLeft })
        onFrozenColumnsChange(pinnedLeft.length)
      },
      [onFrozenColumnsChange],
    )

    useEffect(() => {
      if (!result) return
      setResult({
        columns: result.columns,
        dataset: result.dataset,
        count: result.count,
        query: result.query,
        timestamp: result.timestamp,
      })
      setRunToken((token) => token + 1)
      columnsRef.current = result.columns
      const layout = loadColumnLayout(result.columns)
      setRestoredSizing(layout?.columnSizing ?? {})
      setRestoredOrder(layout?.columnOrder ?? [])
      const pinnedLeft = layout?.pinnedColumns ?? []
      setRestoredPinned(pinnedLeft)
      // Sync the toolbar's freeze button to the restored layout.
      onFrozenColumnsChangeRef.current(pinnedLeft.length)
    }, [result, setResult])

    useImperativeHandle(
      ref,
      (): ResultGridAdapterHandle => ({
        focus: () => {
          rootRef.current?.querySelector<HTMLElement>('[role="grid"]')?.focus()
        },
        getSQL,
        getResultAsMarkdown: () =>
          buildResultPageMarkdown(columnsRef.current, getCurrentPageRows()),
        resetLayout: () => gridImperativeRef.current?.resetLayout(),
        shuffleFocusedColumnToFront: () =>
          gridImperativeRef.current?.shuffleFocusedColumnToFront(),
        toggleFreezeLeft: () => gridImperativeRef.current?.toggleFreezeLeft(),
      }),
      [getSQL, getCurrentPageRows],
    )

    return (
      <AdapterRoot
        ref={rootRef}
        $visible={visible}
        data-hook="result-grid-tanstack"
      >
        {hasData && (
          <ResultGrid
            ref={gridImperativeRef}
            dataSource={dataSource}
            maxColumnWidth={maxColumnWidth}
            runToken={runToken}
            isFocused={isFocused}
            initialColumnSizing={restoredSizing}
            onColumnSizingCommit={handleSizingCommit}
            initialColumnOrder={restoredOrder}
            onColumnOrderCommit={handleOrderCommit}
            initialPinnedColumns={restoredPinned}
            onPinnedColumnsCommit={handlePinnedColumnsCommit}
            onYieldFocus={onYieldFocus}
            onResetLayout={handleResetLayout}
            onSelectionChange={onSelectionChange}
            onCellCopy={() => void trackEvent(ConsoleEvent.GRID_CELL_COPY)}
            onColumnCopy={() => void trackEvent(ConsoleEvent.GRID_COLUMN_COPY)}
          />
        )}
      </AdapterRoot>
    )
  },
)

ResultGridAdapter.displayName = "ResultGridAdapter"
