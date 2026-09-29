import type { DeclareEntry, TimeRange } from "../../../../store/notebook"
import {
  durationTokenToDate,
  parseRelativeToken,
  type RangeEdge,
  type TimeUnit,
} from "../../TimeRangePicker/utils"
import { browserTimeZone } from "../../../../utils/timeZone"

const isBound = (value: unknown): value is string =>
  typeof value === "string" &&
  durationTokenToDate(value, "from") !== "Invalid date"

export const isValidTimeRange = (raw: unknown): raw is TimeRange => {
  if (typeof raw !== "object" || raw === null) return false
  const { from, to } = raw as { from?: unknown; to?: unknown }
  return isBound(from) && isBound(to)
}

export const TIME_VARIABLE_NAMES = ["timeFrom", "timeTo", "timeFilter"] as const

export const sameTimeRange = (
  a: TimeRange | undefined,
  b: TimeRange | undefined,
): boolean => a?.from === b?.from && a?.to === b?.to

export const isTimeVariableName = (name: string): boolean =>
  TIME_VARIABLE_NAMES.some((n) => n.toLowerCase() === name.toLowerCase())

export type TimeShiftUnit = "s" | "m" | "h" | "d" | "w" | "M" | "y"

export type TimeShift = {
  amount: number
  unit: TimeShiftUnit
}

const utcLiteral = (iso: string): string => `'${new Date(iso).toISOString()}'`

const shifted = (expression: string, shift: TimeShift | undefined): string =>
  shift
    ? `dateadd('${shift.unit}', ${shift.amount}, ${expression})`
    : expression

const TRUNC_UNIT: Record<TimeUnit, string> = {
  s: "second",
  m: "minute",
  h: "hour",
  d: "day",
  w: "week",
  M: "month",
  y: "year",
}

const aligned = (expression: string, unit: TimeUnit, edge: RangeEdge) => {
  const zone = `'${browserTimeZone()}'`
  const start = `date_trunc('${TRUNC_UNIT[unit]}', to_timezone(${expression}, ${zone}))`
  return edge === "from"
    ? `to_utc(${start}, ${zone})`
    : `dateadd('u', -1, to_utc(dateadd('${unit}', 1, ${start}), ${zone}))`
}

const boundExpression = (
  bound: string,
  base: string,
  shift: TimeShift | undefined,
  edge: RangeEdge,
): string => {
  const relative = parseRelativeToken(bound)
  if (!relative) return shifted(utcLiteral(bound), shift)
  const offset =
    relative.amount === 0
      ? base
      : `dateadd('${relative.unit}', -${relative.amount}, ${base})`
  return relative.align ? aligned(offset, relative.align, edge) : offset
}

export const timeRangeToDeclareEntries = (
  range: TimeRange,
  shift?: TimeShift,
): DeclareEntry[] => {
  const nowBase = shifted("now()", shift)
  const fromBase = range.to === "now" ? "@timeTo" : nowBase
  return [
    { name: "timeTo", value: boundExpression(range.to, nowBase, shift, "to") },
    {
      name: "timeFrom",
      value: boundExpression(range.from, fromBase, shift, "from"),
    },
    { name: "timeFilter", value: "interval(@timeFrom, @timeTo)" },
  ]
}
