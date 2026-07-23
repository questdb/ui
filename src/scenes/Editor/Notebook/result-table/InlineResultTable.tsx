import React from "react"
import type { CellResult } from "../../../../store/notebook"
import { ResultGridPanel } from "./ResultGridPanel"
import { StatusNotification } from "./StatusNotification"
import { TabBar } from "./TabBar"
import { ResultWrapper, SuccessMessage } from "./styles"
import type { ResultGridViewportStore } from "./resultGridViewportStore"

type Props = {
  result: CellResult
  isFocused: boolean
  onTabChange: (index: number) => void
  onCancelQuery: (index: number) => void
  bufferId: number
  cellId: string
  isRunning: boolean
  onReRun: (index: number) => void
  onYieldFocus: () => void
  viewportStore: ResultGridViewportStore
}

export const InlineResultTable: React.FC<Props> = ({
  result,
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
  if (result.results.length === 0) {
    return (
      <ResultWrapper>
        <SuccessMessage>OK</SuccessMessage>
      </ResultWrapper>
    )
  }

  const activeResult =
    result.results[result.activeResultIndex] ?? result.results[0]
  const isMultiQuery = result.results.length > 1

  return (
    <ResultWrapper>
      {isMultiQuery && <TabBar result={result} onTabChange={onTabChange} />}

      {activeResult && (
        <StatusNotification
          timestamp={result.timestamp}
          activeResult={activeResult}
          activeIndex={result.activeResultIndex}
          onCancelQuery={onCancelQuery}
        />
      )}

      {activeResult?.type === "dql" && activeResult.columns.length > 0 && (
        <ResultGridPanel
          key={`${result.activeResultIndex}-${activeResult.query}`}
          data={activeResult}
          runToken={result.timestamp}
          isFocused={isFocused}
          bufferId={bufferId}
          cellId={cellId}
          isRunning={isRunning}
          onReRun={() => onReRun(result.activeResultIndex)}
          onYieldFocus={onYieldFocus}
          viewportStore={viewportStore}
        />
      )}
    </ResultWrapper>
  )
}
