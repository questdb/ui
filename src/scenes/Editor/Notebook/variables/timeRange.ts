import type { DeclareEntry, TimeRange } from "../../../../store/notebook"
import {
  durationTokenToDate,
  parseRelativeToken,
  type DurationPreset,
} from "../../TimeRangePicker/utils"

const isBound = (value: unknown): value is string =>
  typeof value === "string" && durationTokenToDate(value) !== "Invalid date"

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

export const NOTEBOOK_TIME_PRESETS: DurationPreset[] = [
  { dateFrom: "now-5m", dateTo: "now", label: "Last 5m" },
  { dateFrom: "now-15m", dateTo: "now", label: "Last 15m" },
  { dateFrom: "now-30m", dateTo: "now", label: "Last 30m" },
  { dateFrom: "now-1h", dateTo: "now", label: "Last 1h" },
  { dateFrom: "now-3h", dateTo: "now", label: "Last 3h" },
  { dateFrom: "now-6h", dateTo: "now", label: "Last 6h" },
  { dateFrom: "now-12h", dateTo: "now", label: "Last 12h" },
  { dateFrom: "now-24h", dateTo: "now", label: "Last 24h" },
  { dateFrom: "now-3d", dateTo: "now", label: "Last 3 days" },
  { dateFrom: "now-7d", dateTo: "now", label: "Last 7 days" },
  { dateFrom: "now-30d", dateTo: "now", label: "Last 30 days" },
]

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

const boundExpression = (
  bound: string,
  base: string,
  shift: TimeShift | undefined,
): string => {
  const relative = parseRelativeToken(bound)
  if (!relative) return shifted(utcLiteral(bound), shift)
  if (relative.amount === 0) return base
  return `dateadd('${relative.unit}', -${relative.amount}, ${base})`
}

export const timeRangeToDeclareEntries = (
  range: TimeRange,
  shift?: TimeShift,
): DeclareEntry[] => {
  const nowBase = shifted("now()", shift)
  const fromBase = range.to === "now" ? "@timeTo" : nowBase
  return [
    { name: "timeTo", value: boundExpression(range.to, nowBase, shift) },
    { name: "timeFrom", value: boundExpression(range.from, fromBase, shift) },
    { name: "timeFilter", value: "interval(@timeFrom, @timeTo)" },
  ]
}
