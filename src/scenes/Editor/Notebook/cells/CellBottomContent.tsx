import React, { useCallback, useEffect, useMemo } from "react"
import styled from "styled-components"
import type { NotebookCell } from "../../../../store/notebook"
import type { ChartConfig } from "../CellChart/chartTypes"
import type { CellContentMode } from "../cellVirtualization/cellVirtualizationEngine"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import {
  useCellFetchState,
  useCellRefresh,
} from "../cellRefresh/CellRefreshContext"
import { DrawCanvas } from "../DrawCanvas"
import { InlineResultTable } from "../result-table"
import { buildStatementSlotViews } from "../result-table/statementSlotView"
import { ChartPlaceholder } from "../cellVirtualization/ChartPlaceholder"
import { GridShimmer } from "../cellVirtualization/GridShimmer"
import { useCellResultStatus } from "../resultHydration/CellResultHydrationContext"
import { createResultGridViewportStore } from "../result-table/resultGridViewportStore"
import { getQueriesFromText } from "../../Monaco/utils"
import {
  derivePositionalFrame,
  deriveStatementFrame,
  statementKeysFor,
} from "../notebookUtils"

// Mirrors DrawCanvas's EmptyState: a failed snapshot read keeps the reserved
// pane and says so, instead of an endless shimmer or a silent collapse.
const LoadFailureState = styled.div`
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: ${({ theme }) => theme.fontSize.sm};
`

type Props = {
  cell: NotebookCell
  contentMode: CellContentMode
  expectingResult: boolean
  isFocused: boolean
  isRunning: boolean
  onConfigChange: (config: ChartConfig) => void
  onYieldFocus: () => void
}

export const CellBottomContent: React.FC<Props> = ({
  cell,
  contentMode,
  expectingResult,
  isFocused,
  isRunning,
  onConfigChange,
  onYieldFocus,
}) => {
  const { setActiveStatement, cancelQuery, reRunResultAt } =
    useNotebookActions()
  const bufferId = useNotebookBufferId()
  const cellRefresh = useCellRefresh()
  const fetchState = useCellFetchState(cell.id)
  const resultStatus = useCellResultStatus(cell.id)
  const viewportStore = useMemo(() => createResultGridViewportStore(), [])

  // Tabs follow the editor's statement list; results attach to it by content.
  // A statement with no result renders the neutral "Not run" slot. A frame no
  // statement claims (selection run) falls back to the results' own tabs.
  const statements = useMemo(
    () => (cell.mode === "draw" ? [] : getQueriesFromText(cell.value)),
    [cell.mode, cell.value],
  )
  const frame = useMemo(
    () =>
      deriveStatementFrame(statements, cell.result) ??
      derivePositionalFrame(cell.result),
    [statements, cell.result],
  )
  const slots = useMemo(
    () => (frame ? buildStatementSlotViews(frame, fetchState) : []),
    [frame, fetchState],
  )

  const resultIndexOf = useCallback(
    (statementKey: string): number =>
      statementKeysFor(
        (cell.result?.results ?? []).map((r) => r.query),
      ).indexOf(statementKey),
    [cell.result],
  )
  const reRunStatement = useCallback(
    (statementKey: string) => {
      const index = resultIndexOf(statementKey)
      if (index !== -1) void reRunResultAt(cell.id, index)
    },
    [resultIndexOf, reRunResultAt, cell.id],
  )

  useEffect(
    () => () => {
      viewportStore.clear()
    },
    [viewportStore],
  )

  if (cell.mode === "draw") {
    return contentMode === "full" ? (
      <DrawCanvas
        cell={cell}
        isFocused={isFocused}
        onConfigChange={onConfigChange}
      />
    ) : (
      <ChartPlaceholder />
    )
  }
  if (cell.result && frame) {
    return contentMode === "full" ? (
      <InlineResultTable
        slots={slots}
        activeSlotIndex={frame.activeSlotIndex}
        timestamp={cell.result.timestamp}
        isFocused={isFocused}
        onTabChange={(statementKey) =>
          setActiveStatement(cell.id, statementKey)
        }
        onCancelQuery={(statementKey) => {
          if (fetchState?.slotFetching.has(statementKey)) {
            cellRefresh?.cancelSlot(cell.id, statementKey)
            return
          }
          const index = resultIndexOf(statementKey)
          if (index !== -1) cancelQuery(cell.id, index)
        }}
        bufferId={bufferId}
        cellId={cell.id}
        isRunning={isRunning}
        onReRun={reRunStatement}
        onYieldFocus={onYieldFocus}
        viewportStore={viewportStore}
      />
    ) : (
      <GridShimmer
        statementCount={slots.length}
        activeResult={slots[frame.activeSlotIndex]?.result ?? undefined}
        bufferId={bufferId}
        cellId={cell.id}
      />
    )
  }
  if (!expectingResult) return null
  if (resultStatus === "failed") {
    return (
      <LoadFailureState>
        Result failed to load. Run the cell again to restore it.
      </LoadFailureState>
    )
  }
  return <GridShimmer statementCount={0} bufferId={bufferId} cellId={cell.id} />
}
