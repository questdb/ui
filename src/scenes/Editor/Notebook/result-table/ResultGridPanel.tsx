import React, { useMemo, useRef, useState } from "react"
import {
  ResultGrid,
  inMemoryDataSource,
  type ResultGridHandle,
} from "../../../../components/ResultGrid"
import type { DqlQueryResult } from "../../../../store/notebook"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import { normalizeSql } from "../../../../utils/formatSql"
import { sqlHash } from "../notebookUtils"
import {
  loadNotebookColumnLayout,
  saveNotebookColumnLayout,
  removeNotebookColumnLayout,
} from "../notebookColumnLayoutStore"
import { ResultActionsBar } from "./ResultActionsBar"

type Props = {
  data: DqlQueryResult
  runToken?: number
  isFocused?: boolean
  bufferId?: number
  cellId: string
  isRunning?: boolean
  onReRun?: () => void
  onYieldFocus?: () => void
}

// Owns the grid ref and the per-result action state (selection enables
// move-to-front, pinned count drives the freeze toggle). Mounted keyed by query
// in InlineResultTable, so this state resets on result change without an effect.
export const ResultGridPanel: React.FC<Props> = ({
  data,
  runToken,
  isFocused,
  bufferId,
  cellId,
  isRunning,
  onReRun,
  onYieldFocus,
}) => {
  const gridRef = useRef<ResultGridHandle | null>(null)

  const dataSource = useMemo(
    () => inMemoryDataSource(data.columns, data.dataset, data.timestamp ?? -1),
    [data],
  )
  const queryKey = useMemo(() => {
    try {
      return "q" + sqlHash(normalizeSql(data.query, false))
    } catch {
      return "q" + sqlHash(data.query.trim())
    }
  }, [data.query])
  const initialLayout = useMemo(
    () => loadNotebookColumnLayout(bufferId, cellId, queryKey),
    [bufferId, cellId, queryKey],
  )

  const [hasSelection, setHasSelection] = useState(false)
  const [pinnedCount, setPinnedCount] = useState(
    initialLayout?.pinnedColumns?.length ?? 0,
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
        initialColumnSizing={initialLayout?.columnSizing}
        initialColumnOrder={initialLayout?.columnOrder}
        initialPinnedColumns={initialLayout?.pinnedColumns}
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
