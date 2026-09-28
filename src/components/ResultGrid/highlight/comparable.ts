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

const ZONELESS_INSTANT =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2})(?::(\d{2})(?::(\d{2})(\.\d+)?)?)?$/

// QuestDB reads a literal without a zone as UTC, while Date.parse reads it as
// local time; the literal is completed with Z so both sides agree.
export const parseInstant = (text: string): number | null => {
  const zoneless = ZONELESS_INSTANT.exec(text)
  const iso = zoneless
    ? `${zoneless[1]}T${zoneless[2]}:${zoneless[3] ?? "00"}:${zoneless[4] ?? "00"}${zoneless[5] ?? ""}Z`
    : text
  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? null : parsed
}

export const asComparable = (
  value: CellValue,
  kind: ColumnKind,
): number | null => {
  if (kind === "temporal") {
    return typeof value === "string" ? parseInstant(value) : null
  }
  return asNumber(value)
}
