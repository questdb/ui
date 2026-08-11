import React from "react"
import { ResultGridPanel } from "./ResultGridPanel"
import { StatusNotification } from "./StatusNotification"
import { TabBar } from "./TabBar"
import { ResultWrapper, SuccessMessage } from "./styles"
import type { StatementSlotView } from "./statementSlotView"
import type { ResultGridViewportStore } from "./resultGridViewportStore"

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
}) => {
  if (slots.length === 0) {
    return (
      <ResultWrapper>
        <SuccessMessage>OK</SuccessMessage>
      </ResultWrapper>
    )
  }

  const activeSlot = slots[activeSlotIndex] ?? slots[0]
  const activeResult = activeSlot.result
  const isMultiQuery = slots.length > 1

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

      {activeResult?.type === "dql" && activeResult.columns.length > 0 && (
        <ResultGridPanel
          key={activeSlot.key}
          data={activeResult}
          viewportKey={activeSlot.key}
          runToken={timestamp}
          isFocused={isFocused}
          bufferId={bufferId}
          cellId={cellId}
          isRunning={isRunning}
          onReRun={() => onReRun(activeSlot.key)}
          onYieldFocus={onYieldFocus}
          viewportStore={viewportStore}
        />
      )}
    </ResultWrapper>
  )
}
