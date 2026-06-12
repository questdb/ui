import React, {
  forwardRef,
  useCallback,
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
import type { IQuestDBGrid } from "../../js/console/grid"
import { usePagedDataSource, type PaginationFn } from "./usePagedDataSource"
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

// Narrows IQuestDBGrid.setData's `any` to the fields we read.
type DqlResultInput = {
  columns: ColumnDefinition[]
  dataset: ResultGridRow[]
  count: number
  query: string
  timestamp?: number
}

type ResultGridAdapterProps = {
  isFocused?: boolean
  paginationFn?: PaginationFn
}

// Backs the legacy IQuestDBGrid surface the console's Result scene drives with
// the neutral React ResultGrid and a server-paged data source.
export const ResultGridAdapter = forwardRef<
  IQuestDBGrid,
  ResultGridAdapterProps
>(({ isFocused = true, paginationFn }, ref) => {
  const { dataSource, setResult, getSQL, getCurrentPageRows, hasData } =
    usePagedDataSource(paginationFn)

  const [visible, setVisible] = useState(true)
  const [runToken, setRunToken] = useState(0)
  const [restoredSizing, setRestoredSizing] = useState<Record<string, number>>(
    {},
  )
  const [restoredOrder, setRestoredOrder] = useState<string[]>([])
  const [restoredPinned, setRestoredPinned] = useState<string[]>([])

  const rootRef = useRef<HTMLDivElement>(null)
  const gridImperativeRef = useRef<ResultGridHandle>(null)
  // Current result's columns, for keying the persisted layout on commit.
  const columnsRef = useRef<ColumnDefinition[]>([])
  const listenersRef = useRef<Map<string, Set<(event: CustomEvent) => void>>>(
    new Map(),
  )

  const emit = useCallback((name: string, detail?: unknown) => {
    const set = listenersRef.current.get(name)
    if (!set) return
    const event = new CustomEvent(name, { detail })
    set.forEach((fn) => fn(event))
  }, [])

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
      emit("freeze.state", { freezeLeft: pinnedLeft.length })
    },
    [emit],
  )

  useImperativeHandle(
    ref,
    (): IQuestDBGrid => ({
      setData: (incoming: DqlResultInput) => {
        setResult({
          columns: incoming.columns,
          dataset: incoming.dataset,
          count: incoming.count,
          query: incoming.query,
          timestamp: incoming.timestamp,
        })
        setRunToken((token) => token + 1)
        columnsRef.current = incoming.columns
        const layout = loadColumnLayout(incoming.columns)
        setRestoredSizing(layout?.columnSizing ?? {})
        setRestoredOrder(layout?.columnOrder ?? [])
        const pinnedLeft = layout?.pinnedColumns ?? []
        setRestoredPinned(pinnedLeft)
        // Sync the toolbar's freeze button to the restored layout.
        emit("freeze.state", { freezeLeft: pinnedLeft.length })
      },

      getSQL: () => getSQL(),

      focus: () => {
        rootRef.current?.querySelector<HTMLElement>('[role="grid"]')?.focus()
      },

      show: () => setVisible(true),

      hide: () => setVisible(false),

      // No-op: React + the grid's ResizeObserver handle layout.
      render: () => undefined,

      addEventListener: (
        eventName: string,
        fn: (event: CustomEvent) => void,
      ) => {
        const set = listenersRef.current.get(eventName) ?? new Set()
        set.add(fn)
        listenersRef.current.set(eventName, set)
      },

      clearCustomLayout: () => gridImperativeRef.current?.resetLayout(),
      shuffleFocusedColumnToFront: () =>
        gridImperativeRef.current?.shuffleFocusedColumnToFront(),
      toggleFreezeLeft: () => gridImperativeRef.current?.toggleFreezeLeft(),

      getResultAsMarkdown: () =>
        buildResultPageMarkdown(columnsRef.current, getCurrentPageRows()),
    }),
    [setResult, getSQL, getCurrentPageRows, emit],
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
          runToken={runToken}
          isFocused={isFocused}
          initialColumnSizing={restoredSizing}
          onColumnSizingCommit={handleSizingCommit}
          initialColumnOrder={restoredOrder}
          onColumnOrderCommit={handleOrderCommit}
          initialPinnedColumns={restoredPinned}
          onPinnedColumnsCommit={handlePinnedColumnsCommit}
          onYieldFocus={() => emit("yield.focus")}
          onResetLayout={handleResetLayout}
          onSelectionChange={(hasSelection) =>
            emit("selection.change", { hasSelection })
          }
          onCellCopy={() => void trackEvent(ConsoleEvent.GRID_CELL_COPY)}
          onColumnCopy={() => void trackEvent(ConsoleEvent.GRID_COLUMN_COPY)}
        />
      )}
    </AdapterRoot>
  )
})

ResultGridAdapter.displayName = "ResultGridAdapter"
