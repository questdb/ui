import type { ColumnDefinition } from "../../../utils/questdb/types"
import type { ResultGridRow } from "../types"
import { columnKindOf } from "./columnKind"
import { asComparable, compareValues, type Comparable } from "./comparable"

export type ColumnRange = { from: Comparable; to: Comparable }

// Min and max of a numeric or temporal column in the current result. An
// automatic between bound reads them at evaluation.
export const columnRangeAt = (
  columns: ColumnDefinition[],
  dataset: ResultGridRow[],
  index: number,
): ColumnRange | null => {
  const column = columns[index]
  if (!column) return null
  const kind = columnKindOf(column)
  if (kind !== "numeric" && kind !== "temporal") return null
  let from: Comparable | null = null
  let to: Comparable | null = null
  for (const row of dataset) {
    const value = asComparable(row[index], kind)
    if (value === null) continue
    if (from === null || compareValues(value, from) < 0) from = value
    if (to === null || compareValues(value, to) > 0) to = value
  }
  return from !== null && to !== null ? { from, to } : null
}

// The drawer asks for a range on every render, so each column scans once
// per result.
export const columnRangeOf = (
  columns: ColumnDefinition[],
  dataset: ResultGridRow[],
) => {
  const ranges = new Map<string, ColumnRange | null>()
  return (name: string): ColumnRange | null => {
    const cached = ranges.get(name)
    if (cached !== undefined) return cached
    const range = columnRangeAt(
      columns,
      dataset,
      columns.findIndex((column) => column.name === name),
    )
    ranges.set(name, range)
    return range
  }
}
