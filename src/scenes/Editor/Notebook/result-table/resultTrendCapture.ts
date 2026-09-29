import type { CellResult, NotebookCell } from "../../../../store/notebook"
import { hasPendingResult, statementKeysFor } from "../statementIdentity"
import { comparesWithPrevious } from "./highlightConfig"
import type { ResultLanding, ResultTrendStore } from "./resultTrendStore"

// Only a comparison rule needs the previous rows, so any other cell keeps no
// identity index and holds nothing beyond its live result.
const trackedIdentityColumns = (cell: NotebookCell): string[] =>
  cell.highlightConfig && comparesWithPrevious(cell.highlightConfig)
    ? cell.highlightConfig.identityColumns
    : []

const landingOf = (
  restoredResults: WeakSet<CellResult>,
  result: CellResult,
): ResultLanding =>
  restoredResults.has(result)
    ? { at: result.timestamp, restored: true }
    : { at: Date.now(), restored: false }

// The single writer of the trend store: runs on every cells change, before
// React renders it, so the grid reads a baseline that matches its result.
// A cell whose result or rules did not change is skipped. A released cell
// keeps only its baseline for the rehydrate; a removed cell, and a statement
// the cell no longer has, are forgotten.
export const captureResultTrends = (
  store: ResultTrendStore,
  restoredResults: WeakSet<CellResult>,
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
    if (unchanged) continue
    if (!cell.result) {
      store.releaseCell(cell.id)
      continue
    }
    const keys = statementKeysFor(cell.result.results.map((r) => r.query))
    const identityColumns = trackedIdentityColumns(cell)
    const landing = landingOf(restoredResults, cell.result)
    // A run with rewritten statements may still be discarded, which puts the
    // prior result back under its own keys, so they are kept until it settles.
    if (!hasPendingResult(cell.result)) store.retainStatements(cell.id, keys)
    cell.result.results.forEach((result, index) => {
      if (result.type !== "dql") return
      store.capture(cell.id, keys[index], result, identityColumns, landing)
    })
  }

  for (const cell of prev) {
    if (!nextIds.has(cell.id)) store.clearCell(cell.id)
  }
}
