import React from "react"
import type { CellResult } from "../../../../store/notebook"
import { ResultGrid } from "./ResultGrid"
import { StatusNotification } from "./StatusNotification"
import { TabBar } from "./TabBar"
import { ResultWrapper, SuccessMessage } from "./styles"

type Props = {
  result: CellResult
  isFocused?: boolean
  onTabChange?: (index: number) => void
  onCancelQuery?: (index: number) => void
  columnSizing: Record<string, Record<string, number>> | undefined
  onColumnSizingCommit: (sizing: Record<string, number>, query: string) => void
}

export const InlineResultTable: React.FC<Props> = ({
  result,
  isFocused,
  onTabChange,
  onCancelQuery,
  columnSizing,
  onColumnSizingCommit,
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
  const isActiveDql = activeResult?.type === "dql"

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

      {isActiveDql && activeResult && (
        <ResultGrid
          key={`${result.activeResultIndex}-${activeResult.query}`}
          data={activeResult}
          runToken={result.timestamp}
          isFocused={isFocused}
          initialColumnSizing={columnSizing?.[activeResult.query]}
          onColumnSizingCommit={(sizing) =>
            onColumnSizingCommit(sizing, activeResult.query)
          }
        />
      )}
    </ResultWrapper>
  )
}
