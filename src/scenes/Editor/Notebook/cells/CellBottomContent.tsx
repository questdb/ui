import React, { useCallback, useEffect, useMemo } from "react"
import type { NotebookCell } from "../../../../store/notebook"
import type { ChartConfig } from "../CellChart/chartTypes"
import type { CellContentMode } from "../cellVirtualization/cellVirtualizationEngine"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import {
  shallowEqual,
  useCellFetchSelector,
  useCellRefresh,
} from "../cellRefresh/CellRefreshContext"
import type { CellFetchState } from "../cellRefresh/cellRefreshEngine"
import { DrawCanvas } from "../DrawCanvas"
import { PaneEmptyState } from "../PaneEmptyState"
import { InlineResultTable } from "../result-table"
import {
  buildStatementSlotViews,
  type SlotRefreshChannel,
} from "../result-table/statementSlotView"
import { ChartPlaceholder } from "../cellVirtualization/ChartPlaceholder"
import { GridShimmer } from "../cellVirtualization/GridShimmer"
import { useCellResultStatus } from "../resultHydration/CellResultHydrationContext"
import { createResultGridViewportStore } from "../result-table/resultGridViewportStore"
import { cellColumnsOf } from "../result-table/highlightConfig"
import { getQueriesFromText } from "../../Monaco/utils"
import {
  derivePositionalFrame,
  deriveStatementFrame,
} from "../statementIdentity"

const selectSlotChannel = (
  state: CellFetchState | undefined,
): SlotRefreshChannel | undefined =>
  state && {
    slotFetching: state.slotFetching,
    slotErrors: state.slotErrors,
    slotVerifiedAt: state.slotVerifiedAt,
  }

// A chart draws its own frame, so a draw cell selects nothing here.
const selectNoSlotChannel = (): SlotRefreshChannel | undefined => undefined

type Props = {
  cell: NotebookCell
  contentMode: CellContentMode
  expectingResult: boolean
  isFocused: boolean
  isRunning: boolean
  refreshIntervalMs: number | undefined
  onConfigChange: (config: ChartConfig) => void
  onRetryUnmountWhileFocused: () => void
  onYieldFocus: () => void
}

export const CellBottomContent: React.FC<Props> = ({
  cell,
  contentMode,
  expectingResult,
  isFocused,
  isRunning,
  refreshIntervalMs,
  onConfigChange,
  onRetryUnmountWhileFocused,
  onYieldFocus,
}) => {
  const { setActiveStatement, cancelQuery, reRunResultAt } =
    useNotebookActions()
  const bufferId = useNotebookBufferId()
  const cellRefresh = useCellRefresh()
  const fetchState = useCellFetchSelector(
    cell.id,
    cell.mode === "draw" ? selectNoSlotChannel : selectSlotChannel,
    shallowEqual,
  )
  const resultStatus = useCellResultStatus(cell.id)
  const viewportStore = useMemo(() => createResultGridViewportStore(), [])

  // Tabs follow the editor's statements; results attach to them by content.
  // A statement with no result renders the neutral "Not run" slot. A frame no
  // statement claims (selection run) falls back to the results' own tabs.
  const frame = useMemo(
    () =>
      cell.mode === "draw"
        ? null
        : (deriveStatementFrame(getQueriesFromText(cell.value), cell.result) ??
          derivePositionalFrame(cell.result)),
    [cell.mode, cell.value, cell.result],
  )
  const slots = useMemo(
    () => (frame ? buildStatementSlotViews(frame, fetchState) : []),
    [frame, fetchState],
  )

  const resultIndexOf = useCallback(
    (statementKey: string): number => {
      const slotResult = frame?.slots.find(
        (slot) => slot.key === statementKey,
      )?.result
      return slotResult && cell.result
        ? cell.result.results.indexOf(slotResult)
        : -1
    },
    [frame, cell.result],
  )
  const reRunStatement = useCallback(
    (statementKey: string) => {
      const index = resultIndexOf(statementKey)
      if (index !== -1) void reRunResultAt(cell.id, index)
    },
    [resultIndexOf, reRunResultAt, cell.id],
  )

  const cellColumns = useMemo(
    () => cellColumnsOf(slots.map((slot) => slot.result)),
    [slots],
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
        refreshIntervalMs={refreshIntervalMs}
        onConfigChange={onConfigChange}
        onRetryUnmountWhileFocused={onRetryUnmountWhileFocused}
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
        runToken={cell.result.timestamp}
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
        highlightConfig={cell.highlightConfig}
        cellColumns={cellColumns}
        refreshIntervalMs={refreshIntervalMs}
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
      <PaneEmptyState role="alert" aria-live="assertive" aria-atomic="true">
        Result failed to load. Run the cell again to restore it.
      </PaneEmptyState>
    )
  }
  return <GridShimmer statementCount={0} bufferId={bufferId} cellId={cell.id} />
}
