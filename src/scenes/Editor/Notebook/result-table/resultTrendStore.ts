import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type { DqlQueryResult } from "../../../../store/notebook"
import {
  buildIdentityIndex,
  identityColumnIndexes,
  type IdentityIndex,
} from "../../../../components/ResultGrid/highlight"

export const FLASH_DURATION_MS = 1000

export type TrendEntry = {
  result: DqlQueryResult
  identityColumns: string[]
  previous: IdentityIndex | null
  revision: number
  capturedAt: number
}

// Keyed per statement. Fed every time a statement's result settles, from the
// cell, so a statement whose tab is not mounted still advances its baseline.
export type ResultTrendStore = {
  capture: (
    statementKey: string,
    result: DqlQueryResult,
    identityColumns: string[],
  ) => TrendEntry
  clear: () => void
}

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
    capture(statementKey, result, identityColumns) {
      const existing = entries.get(statementKey)
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
      entries.set(statementKey, entry)
      return entry
    },

    clear() {
      entries.clear()
    },
  }
}
