import React from "react"
import type { CellResult } from "../../../../store/notebook"
import { ResultGrid } from "./ResultGrid"
import { StatusNotification } from "./StatusNotification"
import { TabBar } from "./TabBar"
import { ResultWrapper, SuccessMessage } from "./styles"

type Props = {
  result: CellResult
  isFocused?: boolean
  isMaximized?: boolean
  customHeight?: number
  onTabChange?: (index: number) => void
  onCancelQuery?: (index: number) => void
}

export const InlineResultTable: React.FC<Props> = ({
  result,
  isFocused,
  isMaximized,
  customHeight,
  onTabChange,
  onCancelQuery,
}) => {
  if (result.results.length === 0) {
    return (
      <ResultWrapper $customHeight={customHeight} $maximized={isMaximized}>
        <SuccessMessage>OK</SuccessMessage>
      </ResultWrapper>
    )
  }

  const activeResult =
    result.results[result.activeResultIndex] ?? result.results[0]
  const isMultiQuery = result.results.length > 1
  const isActiveDql = activeResult?.type === "dql"

  return (
    <ResultWrapper $customHeight={customHeight} $maximized={isMaximized}>
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
          data={activeResult}
          isFocused={isFocused}
          customHeight={customHeight}
        />
      )}
    </ResultWrapper>
  )
}
