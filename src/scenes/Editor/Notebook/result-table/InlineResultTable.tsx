import React, { useEffect } from "react"
import { ResultGridPanel } from "./ResultGridPanel"
import { highlightSettingsSessions } from "../settingsDrawer/settingsDrawerSessions"
import { StatusNotification } from "./StatusNotification"
import { TabBar } from "./TabBar"
import { ResultWrapper, SuccessMessage } from "./styles"
import type { StatementSlotView } from "./statementSlotView"
import type { ResultGridViewportStore } from "./resultGridViewportStore"
import type { HighlightConfig } from "../../../../components/ResultGrid/highlight"
import type { ColumnDefinition } from "../../../../utils/questdb/types"

type Props = {
  slots: StatementSlotView[]
  activeSlotIndex: number
  timestamp: number
  isFocused: boolean
  onTabChange: (statementKey: string) => void
  onCancelQuery: (statementKey: string) => void
  bufferId: number
  cellId: string
  isRunning: boolean
  onReRun: (statementKey: string) => void
  onYieldFocus: () => void
  viewportStore: ResultGridViewportStore
  highlightConfig: HighlightConfig | undefined
  cellColumns: ColumnDefinition[]
}

export const InlineResultTable: React.FC<Props> = ({
  slots,
  activeSlotIndex,
  timestamp,
  isFocused,
  onTabChange,
  onCancelQuery,
  bufferId,
  cellId,
  isRunning,
  onReRun,
  onYieldFocus,
  viewportStore,
  highlightConfig,
  cellColumns,
}) => {
  const activeSlot = slots[activeSlotIndex] ?? slots[0]
  const activeResult = activeSlot?.result
  const isMultiQuery = slots.length > 1
  const hasGrid =
    activeResult?.type === "dql" && activeResult.columns.length > 0

  // A run or an error takes the grid away; the drawer session it carried must
  // not bring the drawer back when a later result mounts a grid again.
  useEffect(() => {
    if (!hasGrid) highlightSettingsSessions.clear(cellId)
  }, [hasGrid, cellId])

  if (slots.length === 0) {
    return (
      <ResultWrapper>
        <SuccessMessage>OK</SuccessMessage>
      </ResultWrapper>
    )
  }

  return (
    <ResultWrapper>
      {isMultiQuery && (
        <TabBar
          slots={slots}
          activeSlotIndex={activeSlotIndex}
          onTabChange={onTabChange}
        />
      )}

      <StatusNotification
        timestamp={timestamp}
        slot={activeSlot}
        onCancelQuery={onCancelQuery}
      />

      {hasGrid && (
        <ResultGridPanel
          key={activeSlot.key}
          data={activeResult}
          statementKey={activeSlot.key}
          runToken={timestamp}
          isFocused={isFocused}
          bufferId={bufferId}
          cellId={cellId}
          isRunning={isRunning}
          onReRun={onReRun}
          onYieldFocus={onYieldFocus}
          viewportStore={viewportStore}
          highlightConfig={highlightConfig}
          cellColumns={cellColumns}
        />
      )}
    </ResultWrapper>
  )
}
