import React from "react"
import type { NotebookCell } from "../../../../store/notebook"
import type { ChartConfig } from "../CellChart/chartTypes"
import type { CellContentMode } from "../cellVirtualization/cellVirtualizationEngine"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import { DrawCanvas } from "../DrawCanvas"
import { InlineResultTable } from "../result-table"
import { ChartPlaceholder } from "../cellVirtualization/ChartPlaceholder"
import { GridShimmer } from "../cellVirtualization/GridShimmer"

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
  const { setActiveResultIndex, cancelQuery, reRunResultAt } =
    useNotebookActions()
  const bufferId = useNotebookBufferId()

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
  if (cell.result) {
    return contentMode === "full" ? (
      <InlineResultTable
        result={cell.result}
        isFocused={isFocused}
        onTabChange={(index) => setActiveResultIndex(cell.id, index)}
        onCancelQuery={(index) => {
          cancelQuery(cell.id, index)
        }}
        bufferId={bufferId}
        cellId={cell.id}
        isRunning={isRunning}
        onReRun={(index) => void reRunResultAt(cell.id, index)}
        onYieldFocus={onYieldFocus}
      />
    ) : (
      <GridShimmer result={cell.result} bufferId={bufferId} cellId={cell.id} />
    )
  }
  return expectingResult ? (
    <GridShimmer bufferId={bufferId} cellId={cell.id} />
  ) : null
}
