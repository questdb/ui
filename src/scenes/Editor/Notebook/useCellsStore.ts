import { useCallback, useRef, useState } from "react"
import type { ChartConfig } from "./CellChart/chartTypes"
import type { NotebookCell, SingleQueryResult } from "../../../store/notebook"
import {
  attachScriptSummary,
  cancelAllInCell,
  cancelOneInCell,
  setResultAt,
} from "./notebookUtils"
import type { AutoRefresh } from "../../../store/notebook"

type Options = {
  initialCells: NotebookCell[]
  persistCells: (cells: NotebookCell[]) => void
}

export const useCellsStore = ({ initialCells, persistCells }: Options) => {
  const [cells, setCells] = useState<NotebookCell[]>(initialCells)

  const cellsRef = useRef(cells)
  cellsRef.current = cells

  // Writes advance cellsRef synchronously (React refreshes it only on render),
  // so two mutations in one tick compose instead of the second reading pre-write
  // cells and clobbering the first.
  const updateCells = useCallback(
    (updater: (prev: NotebookCell[]) => NotebookCell[]) => {
      const next = updater(cellsRef.current)
      cellsRef.current = next
      persistCells(next)
      setCells(next)
    },
    [persistCells],
  )

  // Hydration-only setter: restoring persisted result snapshots must NOT
  // schedule a persist. Results are stripped from the persist payload, so the
  // write would be pure churn — and because persistCells' identity changes with
  // every EditorProvider render (via updateBuffer), a persisting hydrate effect
  // re-triggers itself off its own buffer write, looping forever. Stable
  // identity ([] deps) so the hydration effect runs once per mount.
  const hydrateCells = useCallback(
    (updater: (prev: NotebookCell[]) => NotebookCell[]) => {
      const next = updater(cellsRef.current)
      cellsRef.current = next
      setCells(next)
    },
    [],
  )

  const updateCell = useCallback(
    (cellId: string, updates: Partial<NotebookCell>) => {
      updateCells((prev) =>
        prev.map((c) => (c.id === cellId ? { ...c, ...updates } : c)),
      )
    },
    [updateCells],
  )

  const updateCellResult = useCallback(
    (
      cellId: string,
      index: number,
      result: SingleQueryResult,
      activeIndex?: number,
    ) => {
      updateCells((prev) =>
        setResultAt(prev, cellId, index, result, activeIndex),
      )
    },
    [updateCells],
  )

  const markCancelledAll = useCallback(
    (cellId: string) => updateCells((prev) => cancelAllInCell(prev, cellId)),
    [updateCells],
  )

  const markCancelledOne = useCallback(
    (cellId: string, index: number) =>
      updateCells((prev) => cancelOneInCell(prev, cellId, index)),
    [updateCells],
  )

  const setScriptSummary = useCallback(
    (
      cellId: string,
      summary: {
        successCount: number
        failedCount: number
        durationMs: number
      },
    ) => updateCells((prev) => attachScriptSummary(prev, cellId, summary)),
    [updateCells],
  )

  const setCellChartConfig = useCallback(
    (cellId: string, config: ChartConfig) =>
      updateCell(cellId, { chartConfig: config }),
    [updateCell],
  )

  const setCellRefresh = useCallback(
    (cellId: string, value: AutoRefresh) =>
      updateCell(cellId, { autoRefresh: value }),
    [updateCell],
  )

  return {
    cells,
    cellsRef,
    updateCells,
    hydrateCells,
    updateCell,
    updateCellResult,
    markCancelledAll,
    markCancelledOne,
    setScriptSummary,
    setCellChartConfig,
    setCellRefresh,
  }
}
