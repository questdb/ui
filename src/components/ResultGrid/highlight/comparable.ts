import type { CellValue } from "../types"
import type { ColumnKind } from "./columnKind"

// A numeric column compares as a number; a temporal column compares as a
// canonical instant string, so nanosecond timestamps keep their precision.
export type Comparable = number | string

// LONG columns reach the grid as decimal strings, so their 64-bit precision
// survives JSON; for highlighting, a double is close enough.
export const asNumber = (value: CellValue): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string" || value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/

const FRACTION_DIGITS = 9

const pad = (value: number, width: number) => String(value).padStart(width, "0")

const offsetMinutes = (zone: string): number => {
  if (zone === "Z") return 0
  const sign = zone.startsWith("-") ? -1 : 1
  const digits = zone.slice(1).replace(":", "")
  return sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || 0))
}

// QuestDB writes every timestamp as ISO UTC with a T, a fixed fraction and a
// Z; a literal may omit parts, use a space, or carry a zone. Both become the
// one layout `YYYY-MM-DDTHH:mm:ss.fffffffff`, which orders as text at full
// precision. Anything else is not an instant.
export const canonicalInstant = (text: string): string | null => {
  const match = ISO_INSTANT.exec(text.trim())
  if (!match) return null
  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match
  const fraction = (match[7] ?? "").padEnd(FRACTION_DIGITS, "0")
  const zone = match[8]
  const date = new Date(0)
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day))
  date.setUTCHours(Number(hour), Number(minute), Number(second), 0)
  const inRange =
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day) &&
    date.getUTCHours() === Number(hour) &&
    date.getUTCMinutes() === Number(minute) &&
    date.getUTCSeconds() === Number(second)
  if (!inRange) return null
  if (zone) date.setTime(date.getTime() - offsetMinutes(zone) * 60_000)
  return (
    `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}` +
    `T${pad(date.getUTCHours(), 2)}:${pad(date.getUTCMinutes(), 2)}:${pad(date.getUTCSeconds(), 2)}` +
    `.${fraction}`
  )
}

export const asComparable = (
  value: CellValue,
  kind: ColumnKind,
): Comparable | null => {
  if (kind === "temporal") {
    return typeof value === "string" ? canonicalInstant(value) : null
  }
  return asNumber(value)
}

export const compareValues = (a: Comparable, b: Comparable): number => {
  if (typeof a === "number" && typeof b === "number") {
    return a === b ? 0 : a < b ? -1 : 1
  }
  const left = String(a)
  const right = String(b)
  return left === right ? 0 : left < right ? -1 : 1
}
