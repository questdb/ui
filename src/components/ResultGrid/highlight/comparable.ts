import type { CellValue } from "../types"
import type { ColumnKind } from "./columnKind"

// A numeric column compares as a number, or as a bigint past 2^53; a temporal
// column compares as a canonical instant string, so nanosecond timestamps
// keep their precision.
export type Numeric = number | bigint
export type Comparable = Numeric | string

const INTEGER_LITERAL = /^[+-]?\d+$/

// LONG and DECIMAL columns reach the grid as decimal strings, so their 64-bit
// precision survives JSON; a double would round such an integer past 2^53.
export const exceedsSafeInteger = (text: string): boolean =>
  INTEGER_LITERAL.test(text) && !Number.isSafeInteger(Number(text))

export const asNumeric = (value: CellValue): Numeric | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string") return null
  const text = value.trim()
  if (text === "") return null
  if (exceedsSafeInteger(text)) return BigInt(text)
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

const asBigInt = (value: Numeric): bigint | null =>
  typeof value === "bigint"
    ? value
    : Number.isInteger(value)
      ? BigInt(value)
      : null

// Exact for two integers, so a change of one unit past 2^53 still counts.
export const differenceOf = (a: Numeric, b: Numeric): number => {
  const left = asBigInt(a)
  const right = asBigInt(b)
  return left !== null && right !== null
    ? Number(left - right)
    : Number(a) - Number(b)
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
  return asNumeric(value)
}

export const compareValues = (a: Comparable, b: Comparable): number => {
  if (typeof a === "string" || typeof b === "string") {
    const left = String(a)
    const right = String(b)
    return left === right ? 0 : left < right ? -1 : 1
  }
  return a < b ? -1 : a > b ? 1 : 0
}
