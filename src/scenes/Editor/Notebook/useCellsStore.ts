import { useCallback, useRef, useState } from "react"
import type { ChartConfig } from "./CellChart/chartTypes"
import type {
  CellMode,
  CellType,
  NotebookCell,
  SingleQueryResult,
} from "../../../store/notebook"
import {
  attachScriptSummary,
  cancelAllInCell,
  cancelOneInCell,
  duplicateCellAt,
  insertCell,
  removeCell,
  setResultAt,
  swapCellDown,
  swapCellUp,
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

  const updateCells = useCallback(
    (updater: (prev: NotebookCell[]) => NotebookCell[]) => {
      setCells((prev) => {
        const next = updater(prev)
        persistCells(next)
        return next
      })
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
    (updater: (prev: NotebookCell[]) => NotebookCell[]) => setCells(updater),
    [],
  )

  // Id generated up-front so the synchronous return matches the deferred state update.
  const addCell = useCallback(
    (afterCellId?: string, value?: string, type?: CellType): string => {
      const id = crypto.randomUUID()
      updateCells((prev) =>
        insertCell(prev, afterCellId, undefined, { id, value, type }),
      )
      return id
    },
    [updateCells],
  )

  const removeCellById = useCallback(
    (cellId: string) => {
      updateCells((prev) => removeCell(prev, cellId))
    },
    [updateCells],
  )

  const updateCell = useCallback(
    (cellId: string, updates: Partial<NotebookCell>) => {
      updateCells((prev) =>
        prev.map((c) => (c.id === cellId ? { ...c, ...updates } : c)),
      )
    },
    [updateCells],
  )

  const moveCellUp = useCallback(
    (cellId: string) => updateCells((prev) => swapCellUp(prev, cellId)),
    [updateCells],
  )

  const moveCellDown = useCallback(
    (cellId: string) => updateCells((prev) => swapCellDown(prev, cellId)),
    [updateCells],
  )

  const duplicateCell = useCallback(
    (cellId: string): string => {
      const newId = crypto.randomUUID()
      updateCells((prev) => duplicateCellAt(prev, cellId, newId))
      return newId
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

  const patchCell = useCallback(
    (cellId: string, patch: Partial<NotebookCell>) => {
      updateCells((prev) =>
        prev.map((c) => (c.id === cellId ? { ...c, ...patch } : c)),
      )
    },
    [updateCells],
  )

  const setCellMode = useCallback(
    (cellId: string, mode: CellMode) => patchCell(cellId, { mode }),
    [patchCell],
  )

  const setCellChartConfig = useCallback(
    (cellId: string, config: ChartConfig) =>
      patchCell(cellId, { chartConfig: config }),
    [patchCell],
  )

  const setCellRefresh = useCallback(
    (cellId: string, value: AutoRefresh) =>
      patchCell(cellId, { autoRefresh: value }),
    [patchCell],
  )

  const setCellChartMaximized = useCallback(
    (cellId: string, value: boolean) =>
      patchCell(cellId, { isChartMaximized: value }),
    [patchCell],
  )

  return {
    cells,
    cellsRef,
    updateCells,
    hydrateCells,
    updateCell,
    updateCellResult,
    addCell,
    removeCellById,
    moveCellUp,
    moveCellDown,
    duplicateCell,
    markCancelledAll,
    markCancelledOne,
    setScriptSummary,
    setCellMode,
    setCellChartConfig,
    setCellRefresh,
    setCellChartMaximized,
  }
}
