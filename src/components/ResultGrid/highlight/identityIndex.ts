import type { ColumnDefinition } from "../../../utils/questdb/types"
import type { ResultGridRow } from "../types"

export const MAX_INDEXED_ROWS = 10_000

const KEY_SEPARATOR = "\u0000"

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
  indexes.map((index) => String(row[index])).join(KEY_SEPARATOR)

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
