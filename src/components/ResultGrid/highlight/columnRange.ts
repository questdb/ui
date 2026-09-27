import type { ColumnDefinition } from "../../../utils/questdb/types"
import type { ResultGridRow } from "../types"
import { columnKindOf } from "./columnKind"
import { asComparable } from "./comparable"

export type ColumnRange = { from: number; to: number }

// Min and max of a numeric or temporal column in the current result, as
// comparable numbers. An automatic between bound reads them at evaluation.
export const columnRangeAt = (
  columns: ColumnDefinition[],
  dataset: ResultGridRow[],
  index: number,
): ColumnRange | null => {
  const column = columns[index]
  if (!column) return null
  const kind = columnKindOf(column)
  if (kind !== "numeric" && kind !== "temporal") return null
  let from = Infinity
  let to = -Infinity
  for (const row of dataset) {
    const value = asComparable(row[index], kind)
    if (value === null) continue
    if (value < from) from = value
    if (value > to) to = value
  }
  return from <= to ? { from, to } : null
}

export const columnRangeOf =
  (columns: ColumnDefinition[], dataset: ResultGridRow[]) =>
  (name: string): ColumnRange | null =>
    columnRangeAt(
      columns,
      dataset,
      columns.findIndex((column) => column.name === name),
    )
