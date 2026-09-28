import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type { DqlQueryResult } from "../../../../store/notebook"
import {
  buildIdentityIndex,
  identityColumnIndexes,
  type IdentityIndex,
} from "../../../../components/ResultGrid/highlight"

export type TrendEntry = {
  result: DqlQueryResult
  identityColumns: string[]
  previous: IdentityIndex | null
  revision: number
  capturedAt: number
}

// One per notebook, keyed per cell and statement. Fed once, when the cells
// state changes, so every statement advances its baseline whether or not its
// tab is mounted, and a cell remount keeps it. The grid only reads.
export type ResultTrendStore = {
  get: (cellId: string, statementKey: string) => TrendEntry | undefined
  capture: (
    cellId: string,
    statementKey: string,
    result: DqlQueryResult,
    identityColumns: string[],
  ) => TrendEntry
  clearCell: (cellId: string) => void
}

const KEY_SEPARATOR = "\u0000"

const entryKey = (cellId: string, statementKey: string) =>
  `${cellId}${KEY_SEPARATOR}${statementKey}`

const sameStrings = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index])

const sameColumns = (a: ColumnDefinition[], b: ColumnDefinition[]) =>
  a.length === b.length &&
  a.every(
    (column, index) =>
      column.name === b[index].name && column.type === b[index].type,
  )

const indexOf = (
  result: DqlQueryResult,
  identityColumns: string[],
): IdentityIndex | null => {
  const indexes = identityColumnIndexes(result.columns, identityColumns)
  return indexes ? buildIdentityIndex(result.dataset, indexes) : null
}

export const createResultTrendStore = (
  now: () => number = Date.now,
): ResultTrendStore => {
  const entries = new Map<
    string,
    TrendEntry & { current: IdentityIndex | null }
  >()

  return {
    get(cellId, statementKey) {
      return entries.get(entryKey(cellId, statementKey))
    },

    capture(cellId, statementKey, result, identityColumns) {
      const key = entryKey(cellId, statementKey)
      const existing = entries.get(key)
      const sameIdentity =
        existing !== undefined &&
        sameStrings(existing.identityColumns, identityColumns)

      if (existing && existing.result === result && sameIdentity) {
        return existing
      }

      const isNewResult = existing === undefined || existing.result !== result
      const keepsBaseline =
        existing !== undefined &&
        sameIdentity &&
        sameColumns(existing.result.columns, result.columns)

      const entry = {
        result,
        identityColumns,
        previous: keepsBaseline ? existing.current : null,
        current: indexOf(result, identityColumns),
        revision: isNewResult
          ? (existing?.revision ?? 0) + 1
          : existing.revision,
        capturedAt: isNewResult ? now() : existing.capturedAt,
      }
      entries.set(key, entry)
      return entry
    },

    clearCell(cellId) {
      const prefix = entryKey(cellId, "")
      for (const key of [...entries.keys()]) {
        if (key.startsWith(prefix)) entries.delete(key)
      }
    },
  }
}
