import React, { useCallback, useMemo, useRef, useState } from "react"
import {
  ResultGrid,
  inMemoryDataSource,
  type ResultGridHandle,
  type ResultGridViewport,
} from "../../../../components/ResultGrid"
import type { DqlQueryResult } from "../../../../store/notebook"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import {
  columnLayoutQueryKey,
  loadNotebookColumnLayout,
  saveNotebookColumnLayout,
  removeNotebookColumnLayout,
} from "../notebookColumnLayoutStore"
import { ResultActionsBar } from "./ResultActionsBar"
import type { ResultGridViewportStore } from "./resultGridViewportStore"
import { useLocalStorage } from "../../../../providers/LocalStorageProvider"

type Props = {
  data: DqlQueryResult
  // Statement identity for the viewport store and the re-run action. The
  // column layout stays keyed by query text alone — duplicate statements
  // share identical columns.
  statementKey: string
  runToken: number
  isFocused: boolean
  bufferId: number
  cellId: string
  isRunning: boolean
  onReRun: (statementKey: string) => void
  onYieldFocus: () => void
  viewportStore: ResultGridViewportStore
}

const useInitialGridState = ({
  bufferId,
  cellId,
  data,
  statementKey,
  runToken,
  viewportStore,
}: Pick<
  Props,
  "bufferId" | "cellId" | "data" | "statementKey" | "runToken" | "viewportStore"
>) =>
  useMemo(() => {
    const queryKey = columnLayoutQueryKey(data.query)
    return {
      queryKey,
      columnLayout: loadNotebookColumnLayout(bufferId, cellId, queryKey),
      viewport: viewportStore.load(statementKey, runToken),
    }
  }, [bufferId, cellId, data.query, statementKey, runToken, viewportStore])

const ResultGridPanelInner: React.FC<Props> = ({
  data,
  statementKey,
  runToken,
  isFocused,
  bufferId,
  cellId,
  isRunning,
  onReRun,
  onYieldFocus,
  viewportStore,
}) => {
  const { queryKey, columnLayout, viewport } = useInitialGridState({
    bufferId,
    cellId,
    data,
    statementKey,
    runToken,
    viewportStore,
  })
  const { maxColumnWidth } = useLocalStorage()
  const [hasSelection, setHasSelection] = useState(false)
  const [pinnedCount, setPinnedCount] = useState(
    columnLayout?.pinnedColumns?.length ?? 0,
  )
  const gridRef = useRef<ResultGridHandle | null>(null)
  const dataSource = useMemo(
    () => inMemoryDataSource(data.columns, data.dataset, data.timestamp ?? -1),
    [data],
  )
  const saveViewport = useCallback(
    (nextViewport: ResultGridViewport) =>
      viewportStore.save(statementKey, runToken, nextViewport),
    [viewportStore, statementKey, runToken],
  )

  return (
    <>
      <ResultActionsBar
        data={data}
        gridRef={gridRef}
        isFrozen={pinnedCount > 0}
        hasSelection={hasSelection}
        isRunning={isRunning}
        onReRun={() => onReRun(statementKey)}
      />
      <ResultGrid
        ref={gridRef}
        dataSource={dataSource}
        maxColumnWidth={maxColumnWidth}
        runToken={runToken}
        isFocused={isFocused}
        initialColumnSizing={columnLayout?.columnSizing}
        initialColumnOrder={columnLayout?.columnOrder}
        initialPinnedColumns={columnLayout?.pinnedColumns}
        initialViewport={viewport ?? undefined}
        onViewportSave={saveViewport}
        onColumnSizingCommit={(sizing) =>
          saveNotebookColumnLayout(bufferId, cellId, queryKey, {
            columnSizing: sizing,
          })
        }
        onColumnOrderCommit={(order) =>
          saveNotebookColumnLayout(bufferId, cellId, queryKey, {
            columnOrder: order,
          })
        }
        onPinnedColumnsCommit={(pinned) => {
          saveNotebookColumnLayout(bufferId, cellId, queryKey, {
            pinnedColumns: pinned,
          })
          setPinnedCount(pinned.length)
        }}
        onResetLayout={() =>
          removeNotebookColumnLayout(bufferId, cellId, queryKey)
        }
        onSelectionChange={setHasSelection}
        onYieldFocus={onYieldFocus}
        onCellCopy={() =>
          void trackEvent(ConsoleEvent.GRID_CELL_COPY, { source: "notebook" })
        }
        onColumnCopy={() =>
          void trackEvent(ConsoleEvent.GRID_COLUMN_COPY, { source: "notebook" })
        }
      />
    </>
  )
}

export const ResultGridPanel = React.memo(ResultGridPanelInner)
