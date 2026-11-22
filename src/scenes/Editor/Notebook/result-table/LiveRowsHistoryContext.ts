import { createContext, useContext } from "react"
import type { NotebookCell } from "../../../../store/notebook"
import { createLiveRowsHistory } from "./resultGridViewportStore"

type History = ReturnType<typeof createLiveRowsHistory>

export const createNotebookRowHistories = () => {
  const histories = new Map<string, History>()
  return {
    forCell(cellId: string) {
      let history = histories.get(cellId)
      if (!history) {
        history = createLiveRowsHistory()
        histories.set(cellId, history)
      }
      return history
    },
    retainCells(cells: NotebookCell[]) {
      if (histories.size === 0) return
      const stableIds = new Set(
        cells
          .filter((cell) => cell.gridMode === "stable")
          .map((cell) => cell.id),
      )
      for (const cellId of histories.keys()) {
        if (!stableIds.has(cellId)) histories.delete(cellId)
      }
    },
  }
}

const RowHistoriesContext = createContext<ReturnType<
  typeof createNotebookRowHistories
> | null>(null)

export const RowHistoriesProvider = RowHistoriesContext.Provider
export const useRowHistories = () => useContext(RowHistoriesContext)
