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

type Props = {
  data: DqlQueryResult
  runToken: number
  isFocused: boolean
  bufferId: number
  cellId: string
  isRunning: boolean
  onReRun: () => void
  onYieldFocus: () => void
  viewportStore: ResultGridViewportStore
}

const useInitialGridState = ({
  bufferId,
  cellId,
  data,
  runToken,
  viewportStore,
}: Pick<
  Props,
  "bufferId" | "cellId" | "data" | "runToken" | "viewportStore"
>) =>
  useMemo(() => {
    const queryKey = columnLayoutQueryKey(data.query)
    return {
      queryKey,
      columnLayout: loadNotebookColumnLayout(bufferId, cellId, queryKey),
      viewport: viewportStore.load(queryKey, runToken),
    }
  }, [bufferId, cellId, data.query, runToken, viewportStore])

export const ResultGridPanel: React.FC<Props> = ({
  data,
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
    runToken,
    viewportStore,
  })
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
      viewportStore.save(queryKey, runToken, nextViewport),
    [viewportStore, queryKey, runToken],
  )

  return (
    <>
      <ResultActionsBar
        data={data}
        gridRef={gridRef}
        isFrozen={pinnedCount > 0}
        hasSelection={hasSelection}
        isRunning={isRunning}
        onReRun={onReRun}
      />
      <ResultGrid
        ref={gridRef}
        dataSource={dataSource}
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
