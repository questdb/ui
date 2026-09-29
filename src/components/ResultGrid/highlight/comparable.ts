import type { CellValue } from "../types"
import type { ColumnKind } from "./columnKind"

// A numeric column compares as a number; past what a double holds exactly,
// an integer compares as a bigint and a fraction as a scaled bigint. A
// temporal column compares as a canonical instant string, so nanosecond
// timestamps keep their precision.
export type Decimal = { unscaled: bigint; scale: number }
export type Numeric = number | bigint | Decimal
export type Comparable = Numeric | string

const INTEGER_LITERAL = /^[+-]?\d+$/
const DECIMAL_LITERAL = /^([+-]?)(\d*)\.(\d+)$/
const DOUBLE_DIGITS = 15

const significantDigits = (text: string): number =>
  text.replace(/^[+-]/, "").replace(".", "").replace(/^0+/, "").length

// LONG and DECIMAL columns reach the grid as decimal strings, so every digit
// survives JSON; a double keeps fifteen, and DECIMAL goes up to 76.
export const exceedsDoublePrecision = (text: string): boolean =>
  INTEGER_LITERAL.test(text)
    ? !Number.isSafeInteger(Number(text))
    : DECIMAL_LITERAL.test(text) && significantDigits(text) > DOUBLE_DIGITS

const exactOf = (text: string): Numeric => {
  const match = DECIMAL_LITERAL.exec(text)
  if (!match) return BigInt(text)
  const [, sign, whole, fraction] = match
  return {
    unscaled: BigInt(`${sign}${whole}${fraction}`),
    scale: fraction.length,
  }
}

export const asNumeric = (value: CellValue): Numeric | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string") return null
  const text = value.trim()
  if (text === "") return null
  if (exceedsDoublePrecision(text)) return exactOf(text)
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

const isDecimal = (value: Comparable): value is Decimal =>
  typeof value === "object"

const textOf = (value: Comparable): string => {
  if (!isDecimal(value)) return String(value)
  const negative = value.unscaled < BigInt(0)
  const digits = (negative ? -value.unscaled : value.unscaled)
    .toString()
    .padStart(value.scale + 1, "0")
  const point = digits.length - value.scale
  return `${negative ? "-" : ""}${digits.slice(0, point)}.${digits.slice(point)}`
}

// The shortest text that reads back as the double is the literal the user
// typed, so a literal of 1.5 equals a cell of 1.500000000000000000. A
// non-integer double prints plain or with a negative exponent, never a
// positive one.
const decimalOfNumber = (value: number): Decimal => {
  if (Number.isInteger(value)) return { unscaled: BigInt(value), scale: 0 }
  const [mantissa, exponent = "0"] = String(value).split("e")
  const point = mantissa.indexOf(".")
  const fractionDigits = point === -1 ? 0 : mantissa.length - point - 1
  return {
    unscaled: BigInt(mantissa.replace(".", "")),
    scale: fractionDigits - Number(exponent),
  }
}

export const toDecimal = (value: Numeric): Decimal => {
  if (isDecimal(value)) return value
  if (typeof value === "bigint") return { unscaled: value, scale: 0 }
  return decimalOfNumber(value)
}

const powerOfTen = (exponent: number): bigint =>
  BigInt(`1${"0".repeat(exponent)}`)

const alignedUnscaled = (a: Decimal, b: Decimal): [bigint, bigint, number] => {
  const scale = Math.max(a.scale, b.scale)
  const raise = (decimal: Decimal) =>
    decimal.unscaled * powerOfTen(scale - decimal.scale)
  return [raise(a), raise(b), scale]
}

export const isZero = (value: Decimal): boolean => value.unscaled === BigInt(0)

export const magnitudeOf = (value: Decimal): Decimal => ({
  unscaled: value.unscaled < BigInt(0) ? -value.unscaled : value.unscaled,
  scale: value.scale,
})

export const productOf = (a: Decimal, b: Decimal): Decimal => ({
  unscaled: a.unscaled * b.unscaled,
  scale: a.scale + b.scale,
})

// Exact for every numeric pair: a double becomes the decimal it prints as, so
// 1.1001 - 1.1 is 0.0001 and a change of exactly the threshold counts.
export const differenceOf = (a: Numeric, b: Numeric): Decimal => {
  const [left, right, scale] = alignedUnscaled(toDecimal(a), toDecimal(b))
  return { unscaled: left - right, scale }
}

export const ratioOf = (numerator: Decimal, denominator: Decimal): number => {
  const [left, right] = alignedUnscaled(numerator, denominator)
  return Number(left) / Number(right)
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
    const left = textOf(a)
    const right = textOf(b)
    return left === right ? 0 : left < right ? -1 : 1
  }
  if (isDecimal(a) || isDecimal(b)) {
    const [left, right] = alignedUnscaled(toDecimal(a), toDecimal(b))
    return left < right ? -1 : left > right ? 1 : 0
  }
  return a < b ? -1 : a > b ? 1 : 0
}
