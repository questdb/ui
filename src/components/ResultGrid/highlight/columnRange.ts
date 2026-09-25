import type { ColumnDefinition } from "../../../utils/questdb/types"
import type { ResultGridRow } from "../types"
import { columnKindOf } from "./columnKind"

export type ColumnRange = { from: number; to: number }

const asFinite = (value: ResultGridRow[number]): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string" || value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// Min and max of a numeric column in the current result, to prefill a
// between range so the scale starts at the data.
export const columnRangeOf =
  (columns: ColumnDefinition[], dataset: ResultGridRow[]) =>
  (name: string): ColumnRange | null => {
    const index = columns.findIndex((column) => column.name === name)
    if (index === -1 || columnKindOf(columns[index]) !== "numeric") return null
    let from = Infinity
    let to = -Infinity
    for (const row of dataset) {
      const value = asFinite(row[index])
      if (value === null) continue
      if (value < from) from = value
      if (value > to) to = value
    }
    return from <= to ? { from, to } : null
  }
