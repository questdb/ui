import type { NotebookCell } from "../../../../store/notebook"
import { statementKeysFor } from "../notebookUtils"
import { resolveHighlightConfig } from "./highlightConfig"
import type { ResultTrendStore } from "./resultTrendStore"

// The single writer of the trend store: runs on every cells change, before
// React renders it, so the grid reads a baseline that matches its result.
// A cell whose result or rules did not change is skipped; a removed cell is
// forgotten.
export const captureResultTrends = (
  store: ResultTrendStore,
  prev: NotebookCell[],
  next: NotebookCell[],
) => {
  const previousById = new Map(prev.map((cell) => [cell.id, cell]))
  const nextIds = new Set(next.map((cell) => cell.id))

  for (const cell of next) {
    const before = previousById.get(cell.id)
    const unchanged =
      before !== undefined &&
      before.result === cell.result &&
      before.highlightConfig === cell.highlightConfig
    if (unchanged || !cell.result) continue
    const keys = statementKeysFor(cell.result.results.map((r) => r.query))
    cell.result.results.forEach((result, index) => {
      if (result.type !== "dql") return
      store.capture(
        cell.id,
        keys[index],
        result,
        resolveHighlightConfig(cell.highlightConfig, result).identityColumns,
      )
    })
  }

  for (const cell of prev) {
    if (!nextIds.has(cell.id)) store.clearCell(cell.id)
  }
}
