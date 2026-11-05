import { format, formatISO } from "date-fns"
import { isValidDate } from "../../../utils"
import {
  alignInZone,
  browserTimeZone,
  shiftUtc,
  type RangeEdge,
  type TimeUnit,
} from "../../../utils/timeZone"

export type DateRange = {
  dateFrom: string
  dateTo: string
}

export type DurationPreset = DateRange & {
  label: string
}

export const DATETIME_FORMAT = "yyyy-MM-dd HH:mm:ss"

const TOKEN_RE = /^now(?:-(\d+)([smhdwMy]))?(?:\/([smhdwMy]))?$/

export type { RangeEdge, TimeUnit } from "../../../utils/timeZone"

export type RelativeToken = {
  amount: number
  unit: TimeUnit
  align?: TimeUnit
}

export const isDateToken = (token: string): boolean => TOKEN_RE.test(token)

export const parseRelativeToken = (token: string): RelativeToken | null => {
  const match = TOKEN_RE.exec(token)
  if (!match) return null
  const [, amount, unit, align] = match
  const offset: RelativeToken = amount
    ? { amount: Number(amount), unit: unit as TimeUnit }
    : { amount: 0, unit: "s" }
  return align ? { ...offset, align: align as TimeUnit } : offset
}

export const durationTokenToDate = (token: string, edge: RangeEdge): string => {
  const relative = parseRelativeToken(token)
  if (!relative) return isValidDate(token) ? token : "Invalid date"
  const shifted = shiftUtc(new Date(), -relative.amount, relative.unit)
  const resolved = relative.align
    ? alignInZone(shifted, relative.align, edge, browserTimeZone())
    : shifted
  return formatISO(resolved)
}

export const durationToHumanReadable = (
  from: string,
  to: string,
  presets: DurationPreset[],
): string => {
  const preset = presets.find((d) => d.dateFrom === from && d.dateTo === to)
  if (preset) return preset.label
  const render = (bound: string) =>
    bound.startsWith("now") ? bound : format(new Date(bound), DATETIME_FORMAT)
  return `${render(from)} - ${render(to)}`
}

const seconds = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 45, 75, 90]

const minutes = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 45, 75, 90]

const hours = [1, 2, 3, 4, 6, 8, 12, 18, 24]

export const getSamplingRateForPeriod = (
  from: string,
  to: string,
  pointsToPlot = 600,
) => {
  const durationInSeconds =
    (new Date(to).getTime() - new Date(from).getTime()) / 1000
  const all = [
    ...seconds,
    ...minutes.map((m) => m * 60),
    ...hours.map((h) => h * 3600),
  ]
  return all
    .sort((a, b) => Math.abs(a) - Math.abs(b))
    .find((s) => s > durationInSeconds / pointsToPlot) as number
}
