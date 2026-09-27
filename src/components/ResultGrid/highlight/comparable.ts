import type { CellValue } from "../types"
import type { ColumnKind } from "./columnKind"

// LONG columns reach the grid as decimal strings, so their 64-bit precision
// survives JSON; for highlighting, a double is close enough.
export const asNumber = (value: CellValue): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string" || value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const asComparable = (
  value: CellValue,
  kind: ColumnKind,
): number | null => {
  if (kind === "temporal") {
    if (typeof value !== "string") return null
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return asNumber(value)
}
