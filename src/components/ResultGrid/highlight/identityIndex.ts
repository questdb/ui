import type { ColumnDefinition } from "../../../utils/questdb/types"
import type { ResultGridRow } from "../types"

export const MAX_INDEXED_ROWS = 10_000

export type IdentityIndex = {
  rows: Map<string, ResultGridRow>
  ambiguous: Set<string>
}

export const identityColumnIndexes = (
  columns: ColumnDefinition[],
  identityColumns: string[],
): number[] | null => {
  if (identityColumns.length === 0) return null
  const indexes = identityColumns.map((name) =>
    columns.findIndex((column) => column.name === name),
  )
  return indexes.some((index) => index === -1) ? null : indexes
}

export const identityKeyOf = (row: ResultGridRow, indexes: number[]): string =>
  JSON.stringify(indexes.map((index) => row[index]))

// Rows past the first of each key, the same count the match stats report as
// ambiguous, so the drawer can show it for an unsaved identity.
export const duplicateRowCount = (
  columns: ColumnDefinition[],
  dataset: ResultGridRow[],
  identityColumns: string[],
): number => {
  const indexes = identityColumnIndexes(columns, identityColumns)
  if (indexes === null) return 0
  const seen = new Set<string>()
  let duplicates = 0
  for (const row of dataset) {
    const key = identityKeyOf(row, indexes)
    if (seen.has(key)) duplicates++
    else seen.add(key)
  }
  return duplicates
}

export const buildIdentityIndex = (
  dataset: ResultGridRow[],
  indexes: number[],
): IdentityIndex => {
  const rows = new Map<string, ResultGridRow>()
  const ambiguous = new Set<string>()
  const limit = Math.min(dataset.length, MAX_INDEXED_ROWS)
  for (let i = 0; i < limit; i++) {
    const key = identityKeyOf(dataset[i], indexes)
    if (rows.has(key)) {
      ambiguous.add(key)
      continue
    }
    rows.set(key, dataset[i])
  }
  for (const key of ambiguous) rows.delete(key)
  return { rows, ambiguous }
}
