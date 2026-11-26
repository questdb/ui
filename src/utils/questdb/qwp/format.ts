import {
  QWP_COLUMN_TYPE,
  type QwpColumnType,
  type QwpDecimalValue,
  type QwpGeohashValue,
  type QwpLong256Value,
  type QwpResultArrayValue,
  type QwpResultColumnSchema,
  type QwpResultValue,
  type QwpUuidValue,
} from "@questdb/browser-client"
import type { ColumnDefinition, Value } from "../types"

// The console renders the cells `/exec` sends as JSON: LONGs as decimal
// strings, temporal values as ISO-8601 text and NaN as null. QWP delivers the
// typed values instead, so these formatters reproduce `/exec`'s output exactly,
// keeping every consumer of query results unchanged.

/** A cell of a result set, as JSON.parse() returns it from `/exec`. */
export type ExecCell = Value | null | ExecCell[]

export type CellFormatter = (value: QwpResultValue) => ExecCell

/** A result column type this console cannot render from QWP. */
export class QwpUnsupportedColumnError extends Error {
  constructor(readonly column: string) {
    super(`unsupported QWP result column: ${column}`)
    this.name = "QwpUnsupportedColumnError"
  }
}

const ZERO = BigInt(0)
const ONE = BigInt(1)
const SECONDS_PER_DAY = 86_400
const LONG_NULL = BigInt("-9223372036854775808")
const UNITS_PER_SECOND = {
  millis: 1_000,
  micros: 1_000_000,
  nanos: 1_000_000_000,
}
const FRACTION_DIGITS = { millis: 3, micros: 6, nanos: 9 }

export type EpochUnit = keyof typeof UNITS_PER_SECOND

// QuestDB stores DECIMAL8 to DECIMAL64 as DECIMAL64 on the wire, which carries
// the scale but not the precision; report the widest precision of each width.
const DECIMAL_PRECISION: Partial<Record<QwpColumnType, number>> = {
  [QWP_COLUMN_TYPE.DECIMAL64]: 18,
  [QWP_COLUMN_TYPE.DECIMAL128]: 38,
  [QWP_COLUMN_TYPE.DECIMAL256]: 76,
}

const TYPE_NAMES: Partial<Record<QwpColumnType, string>> = {
  [QWP_COLUMN_TYPE.BOOLEAN]: "BOOLEAN",
  [QWP_COLUMN_TYPE.BYTE]: "BYTE",
  [QWP_COLUMN_TYPE.SHORT]: "SHORT",
  [QWP_COLUMN_TYPE.CHAR]: "CHAR",
  [QWP_COLUMN_TYPE.INT]: "INT",
  [QWP_COLUMN_TYPE.LONG]: "LONG",
  [QWP_COLUMN_TYPE.FLOAT]: "FLOAT",
  [QWP_COLUMN_TYPE.DOUBLE]: "DOUBLE",
  [QWP_COLUMN_TYPE.SYMBOL]: "SYMBOL",
  [QWP_COLUMN_TYPE.VARCHAR]: "VARCHAR",
  [QWP_COLUMN_TYPE.TIMESTAMP]: "TIMESTAMP",
  [QWP_COLUMN_TYPE.TIMESTAMP_NANOS]: "TIMESTAMP_NS",
  [QWP_COLUMN_TYPE.DATE]: "DATE",
  [QWP_COLUMN_TYPE.UUID]: "UUID",
  [QWP_COLUMN_TYPE.LONG256]: "LONG256",
  [QWP_COLUMN_TYPE.BINARY]: "BINARY",
  [QWP_COLUMN_TYPE.IPV4]: "IPv4",
}

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"

const pad2 = (value: number) => (value < 10 ? `0${value}` : `${value}`)

// QuestDB's `yyyy`: padded to four digits by the absolute value, so a
// negative year reads `000-1`, and year 0 printed as 1.
const formatYear = (year: number) => {
  const abs = Math.abs(year)
  const padding = abs < 10 ? "000" : abs < 100 ? "00" : abs < 1000 ? "0" : ""
  return `${padding}${year === 0 ? 1 : year}`
}

// Days since 1970-01-01 to a proleptic Gregorian date, as QuestDB counts them
// (Howard Hinnant's civil_from_days). Exact for any day count a 64-bit
// timestamp can produce, which JavaScript's Date range does not cover.
const civilFromDays = (days: number): [number, number, number] => {
  const z = days + 719_468
  const era = Math.floor(z / 146_097)
  const dayOfEra = z - era * 146_097
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1_460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  )
  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153)
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9
  return [yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day]
}

const formatDate = (days: number) => {
  const [year, month, day] = civilFromDays(days)
  return `${formatYear(year)}-${pad2(month)}-${pad2(day)}`
}

/**
 * Formats epoch offsets in `unit` as `/exec` prints them:
 * `yyyy-MM-ddTHH:mm:ss.<fraction>Z`. Consecutive values tend to share a day,
 * so the last date is kept.
 */
export const epochFormatter = (unit: EpochUnit) => {
  const unitsPerSecond = UNITS_PER_SECOND[unit]
  const unitsPerDay = unitsPerSecond * SECONDS_PER_DAY
  const bigUnitsPerDay = BigInt(unitsPerDay)
  const fractionDigits = FRACTION_DIGITS[unit]
  let lastDays = Number.NaN
  let lastDate = ""
  return (value: bigint): string => {
    let days: number
    let ofDay: number
    const exact = Number(value)
    if (Number.isSafeInteger(exact)) {
      days = Math.floor(exact / unitsPerDay)
      ofDay = exact - days * unitsPerDay
      // The division may round to the next day.
      if (ofDay < 0) {
        days--
        ofDay += unitsPerDay
      }
    } else {
      let bigDays = value / bigUnitsPerDay
      let bigOfDay = value % bigUnitsPerDay
      if (bigOfDay < ZERO) {
        bigOfDay += bigUnitsPerDay
        bigDays -= ONE
      }
      days = Number(bigDays)
      ofDay = Number(bigOfDay)
    }
    if (days !== lastDays) {
      lastDays = days
      lastDate = formatDate(days)
    }
    const secondOfDay = Math.floor(ofDay / unitsPerSecond)
    const fraction = ofDay - secondOfDay * unitsPerSecond
    return (
      `${lastDate}T${pad2(Math.floor(secondOfDay / 3_600))}` +
      `:${pad2(Math.floor((secondOfDay % 3_600) / 60))}` +
      `:${pad2(secondOfDay % 60)}` +
      `.${fraction.toString().padStart(fractionDigits, "0")}Z`
    )
  }
}

/** `yyyy-MM-ddTHH:mm:ss.<fraction>Z` of an epoch offset, as `/exec` prints it. */
export const formatEpoch = (value: bigint, unit: EpochUnit): string =>
  epochFormatter(unit)(value)

// `/exec` prints a FLOAT as the shortest decimal that reads back as the same
// 32-bit value (Java's Float.toString), so 0.1f arrives as 0.1, not as the
// 0.10000000149011612 its widened double holds.
// A rounding that reads back as the value stays one with more digits, so the
// shortest is found by bisecting the nine digits a float may need.
export const shortestFloat32 = (value: number): number => {
  if (value === 0) return value
  let low = 1
  let high = 9
  while (low < high) {
    const middle = (low + high) >> 1
    if (Math.fround(Number(value.toPrecision(middle))) === value) high = middle
    else low = middle + 1
  }
  return Number(value.toPrecision(low))
}

const finiteOrNull = (value: number) => (Number.isFinite(value) ? value : null)

const hexWord = (word: bigint) => BigInt.asUintN(64, word).toString(16)

// Numbers.appendLong256(): the most significant non-zero word without leading
// zeros, padded to whole bytes, then every lower word as 16 digits.
export const formatLong256 = ({ words }: QwpLong256Value): string => {
  let top = words.length - 1
  while (top > 0 && words[top] === ZERO) top--
  let hex = hexWord(words[top])
  if (hex.length % 2 === 1) hex = `0${hex}`
  for (let index = top - 1; index >= 0; index--) {
    hex += hexWord(words[index]).padStart(16, "0")
  }
  return `0x${hex}`
}

export const formatUuid = ({ low, high }: QwpUuidValue): string => {
  const hi = hexWord(high).padStart(16, "0")
  const lo = hexWord(low).padStart(16, "0")
  return `${hi.slice(0, 8)}-${hi.slice(8, 12)}-${hi.slice(12)}-${lo.slice(0, 4)}-${lo.slice(4)}`
}

export const formatIPv4 = (value: number): string =>
  `${(value >>> 24) & 255}.${(value >>> 16) & 255}.${(value >>> 8) & 255}.${value & 255}`

// GeoHashes.append(): base32 characters for a precision of whole characters,
// the bits otherwise.
export const formatGeohash = ({ bits, precisionBits }: QwpGeohashValue) => {
  let text = ""
  if (precisionBits % 5 === 0) {
    for (let shift = precisionBits - 5; shift >= 0; shift -= 5) {
      text += BASE32[Number((bits >> BigInt(shift)) & BigInt(31))]
    }
  } else {
    for (let shift = precisionBits - 1; shift >= 0; shift--) {
      text += (bits >> BigInt(shift)) & ONE ? "1" : "0"
    }
  }
  return text
}

export const formatDecimal = ({ unscaled, scale }: QwpDecimalValue) => {
  const negative = unscaled < ZERO
  const digits = (negative ? -unscaled : unscaled).toString()
  const sign = negative ? "-" : ""
  if (scale <= 0) return `${sign}${digits}`
  const padded = digits.padStart(scale + 1, "0")
  return `${sign}${padded.slice(0, -scale)}.${padded.slice(-scale)}`
}

// ArrayTypeDriver.arrayToJson(): nested arrays, NaN and infinities as null,
// and any empty array as a single `[]`, whatever its dimensions.
const formatArray = (
  { dimensions, values }: QwpResultArrayValue,
  element: (value: number | bigint) => ExecCell,
): ExecCell[] => {
  if (values.length === 0) return []
  let offset = 0
  const level = (dimension: number): ExecCell[] => {
    const length = dimensions[dimension]
    const out = new Array<ExecCell>(length)
    const deepest = dimension === dimensions.length - 1
    for (let index = 0; index < length; index++) {
      out[index] = deepest ? element(values[offset++]) : level(dimension + 1)
    }
    return out
  }
  return level(0)
}

const doubleElement = (value: number | bigint) => finiteOrNull(value as number)

const longElement = (value: number | bigint) =>
  value === LONG_NULL ? null : Number(value)

const nullable =
  <T extends QwpResultValue>(format: (value: T) => ExecCell): CellFormatter =>
  (value) =>
    value === null ? null : format(value as T)

/** Columns whose QWP values are the `/exec` cells, as they are. */
export const sameAsExec: CellFormatter = (value) => value as ExecCell

/** Converts one column's QWP values into the cells `/exec` would send. */
export const cellFormatter = (column: QwpResultColumnSchema): CellFormatter => {
  switch (column.type) {
    case QWP_COLUMN_TYPE.BOOLEAN:
    case QWP_COLUMN_TYPE.BYTE:
    case QWP_COLUMN_TYPE.SHORT:
    case QWP_COLUMN_TYPE.INT:
    case QWP_COLUMN_TYPE.VARCHAR:
    case QWP_COLUMN_TYPE.SYMBOL:
      return sameAsExec
    case QWP_COLUMN_TYPE.CHAR:
      // The zero char is CHAR's null, and `/exec` sends it as "".
      return (value) =>
        value === null || value === "\u0000" ? "" : (value as string)
    case QWP_COLUMN_TYPE.LONG:
      return nullable<bigint>((value) => value.toString())
    case QWP_COLUMN_TYPE.FLOAT:
      return nullable<number>((value) =>
        Number.isFinite(value) ? shortestFloat32(value) : null,
      )
    case QWP_COLUMN_TYPE.DOUBLE:
      return nullable<number>(finiteOrNull)
    case QWP_COLUMN_TYPE.TIMESTAMP:
      return nullable<bigint>(epochFormatter("micros"))
    case QWP_COLUMN_TYPE.TIMESTAMP_NANOS:
      return nullable<bigint>(epochFormatter("nanos"))
    case QWP_COLUMN_TYPE.DATE:
      return nullable<bigint>(epochFormatter("millis"))
    case QWP_COLUMN_TYPE.UUID:
      return nullable<QwpUuidValue>(formatUuid)
    case QWP_COLUMN_TYPE.LONG256:
      // A null LONG256 prints as nothing between the quotes.
      return (value) =>
        value === null ? "" : formatLong256(value as QwpLong256Value)
    case QWP_COLUMN_TYPE.GEOHASH:
      return nullable<QwpGeohashValue>(formatGeohash)
    case QWP_COLUMN_TYPE.IPV4:
      return nullable<number>(formatIPv4)
    case QWP_COLUMN_TYPE.DECIMAL64:
    case QWP_COLUMN_TYPE.DECIMAL128:
    case QWP_COLUMN_TYPE.DECIMAL256:
      return nullable<QwpDecimalValue>(formatDecimal)
    case QWP_COLUMN_TYPE.BINARY:
      // `/exec` never sends binary content, only an empty array.
      return () => []
    case QWP_COLUMN_TYPE.DOUBLE_ARRAY:
      return nullable<QwpResultArrayValue>((value) =>
        formatArray(value, doubleElement),
      )
    case QWP_COLUMN_TYPE.LONG_ARRAY:
      return nullable<QwpResultArrayValue>((value) =>
        formatArray(value, longElement),
      )
    default:
      throw new QwpUnsupportedColumnError(column.name)
  }
}

export type QwpColumnShape = QwpResultColumnSchema & {
  scale?: number
  precisionBits?: number
}

/**
 * The `/exec` column definition. `arrayDimensions` is the dimension count seen
 * in the column's values; QWP's schema does not carry it.
 */
export const columnDefinition = (
  column: QwpColumnShape,
  arrayDimensions?: number,
): ColumnDefinition => {
  const { name, type } = column
  const fixed = TYPE_NAMES[type]
  if (fixed) return { name, type: fixed }
  switch (type) {
    case QWP_COLUMN_TYPE.GEOHASH: {
      const bits = column.precisionBits ?? 0
      return {
        name,
        type:
          bits > 0 && bits % 5 === 0
            ? `GEOHASH(${bits / 5}c)`
            : `GEOHASH(${bits}b)`,
      }
    }
    case QWP_COLUMN_TYPE.DECIMAL64:
    case QWP_COLUMN_TYPE.DECIMAL128:
    case QWP_COLUMN_TYPE.DECIMAL256:
      return {
        name,
        type: `DECIMAL(${DECIMAL_PRECISION[type]},${column.scale ?? 0})`,
      }
    case QWP_COLUMN_TYPE.DOUBLE_ARRAY:
    case QWP_COLUMN_TYPE.LONG_ARRAY:
      return {
        name,
        type: "ARRAY",
        dim: arrayDimensions ?? 1,
        elemType: type === QWP_COLUMN_TYPE.DOUBLE_ARRAY ? "DOUBLE" : "LONG",
      }
    default:
      throw new QwpUnsupportedColumnError(name)
  }
}

export const isArrayColumn = (type: QwpColumnType) =>
  type === QWP_COLUMN_TYPE.DOUBLE_ARRAY || type === QWP_COLUMN_TYPE.LONG_ARRAY
