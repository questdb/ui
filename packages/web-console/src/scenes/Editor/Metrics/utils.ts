import { isValidDate } from "../../../utils"
import { format, formatISO, subMinutes } from "date-fns"
import { utcToLocal } from "../../../utils"
import uPlot from "uplot"
import type { Duration } from "./types"

export const DATETIME_FORMAT = "yyyy-MM-dd HH:mm:ss"

export const MAX_DATE_RANGE = 7 * 24 * 60 * 60

export enum MetricType {
  WAL_TRANSACTION_THROUGHPUT = "TABLE_WAL_TRANSACTION_THROUGHPUT",
  WAL_ROW_THROUGHPUT = "TABLE_WAL_ROW_THROUGHPUT",
  WAL_TRANSACTION_LATENCY = "TABLE_WAL_TRANSACTION_LATENCY",
  TABLE_WRITE_AMPLIFICATION = "TABLE_WRITE_AMPLIFICATION",
  TABLE_AVERAGE_TRANSACTION_SIZE = "TABLE_AVERAGE_TRANSACTION_SIZE",
}

export const metricDurations: Duration[] = [
  {
    dateFrom: "now-5m",
    dateTo: "now",
    label: "Last 5m",
  },
  {
    dateFrom: "now-15m",
    dateTo: "now",
    label: "Last 15m",
  },
  {
    dateFrom: "now-1h",
    dateTo: "now",
    label: "Last 1h",
  },
  {
    dateFrom: "now-3h",
    dateTo: "now",
    label: "Last 3h",
  },
  {
    dateFrom: "now-6h",
    dateTo: "now",
    label: "Last 6h",
  },
  {
    dateFrom: "now-12h",
    dateTo: "now",
    label: "Last 12h",
  },
  {
    dateFrom: "now-24h",
    dateTo: "now",
    label: "Last 24h",
  },
  {
    dateFrom: "now-3d",
    dateTo: "now",
    label: "Last 3 days",
  },
  {
    dateFrom: "now-7d",
    dateTo: "now",
    label: "Last 7 days",
  },
]

export enum MetricViewMode {
  LIST = "List",
  GRID = "Grid",
}

export enum SampleBy {
  AUTO = "Auto",
  ONE_SECOND = "1s",
  ONE_MINUTE = "1m",
  FIVE_MINUTES = "5m",
  FIFTEEN_MINUTES = "15m",
  ONE_HOUR = "1h",
}

export enum RefreshRate {
  AUTO = "Auto",
  OFF = "Off",
  ONE_SECOND = "1s",
  FIVE_SECONDS = "5s",
  TEN_SECONDS = "10s",
  THIRTY_SECONDS = "30s",
  ONE_MINUTE = "1m",
}

export enum FetchMode {
  ROLLING_APPEND = "Rolling append",
  OVERWRITE = "Overwrite",
}

export const refreshRatesInSeconds: Record<RefreshRate, number> = {
  [RefreshRate.AUTO]: 0,
  [RefreshRate.OFF]: 0,
  [RefreshRate.ONE_SECOND]: 1,
  [RefreshRate.FIVE_SECONDS]: 5,
  [RefreshRate.TEN_SECONDS]: 10,
  [RefreshRate.THIRTY_SECONDS]: 30,
  [RefreshRate.ONE_MINUTE]: 60,
}

export const getAutoRefreshRate = (dateFrom: string, dateTo: string) => {
  const seconds =
    (new Date(durationTokenToDate(dateTo)).getTime() -
      new Date(durationTokenToDate(dateFrom)).getTime()) /
    1000
  if (seconds <= 60 * 5) return RefreshRate.FIVE_SECONDS
  if (seconds <= 60 * 15) return RefreshRate.FIVE_SECONDS
  if (seconds <= 60 * 60) return RefreshRate.TEN_SECONDS
  if (seconds <= 60 * 60 * 3) return RefreshRate.THIRTY_SECONDS
  if (seconds <= 60 * 60 * 6) return RefreshRate.THIRTY_SECONDS
  if (seconds <= 60 * 60 * 12) return RefreshRate.THIRTY_SECONDS
  if (seconds <= 60 * 60 * 24) return RefreshRate.THIRTY_SECONDS
  return RefreshRate.ONE_MINUTE
}

export const minutesToDays = (durationInMinutes: number) =>
  durationInMinutes / 60 / 24

export const minutesToHours = (durationInMinutes: number) =>
  durationInMinutes / 60

export const minutesToSeconds = (durationInMinutes: number) =>
  durationInMinutes * 60

export const getXAxisFormat = (
  rawValue: number,
  startTime: number,
  endTime: number,
) => {
  let format: string
  const seconds = (endTime - startTime) / 1000
  if (seconds < 60) {
    format = "HH:mm:ss"
  } else if (seconds < 60 * 60) {
    format = "HH:mm"
  } else if (seconds <= 60 * 60 * 24) {
    format = "HH:mm"
  } else if (seconds <= 60 * 60 * 24) {
    format = "HH:mm"
  } else {
    format = "dd/MM"
  }
  return utcToLocal(rawValue, format)
}

export const sqlValueToFixed = (value: string, decimals: number = 2) => {
  const parsed = parseFloat(value)
  return Number(parsed.toFixed(decimals)) as unknown as number
}

export const formatNumbers = (value: number) => {
  if (value >= 1e6) {
    return (value / 1e6).toFixed(1).replace(/\.0$/, "") + " M"
  } else if (value >= 1e3) {
    return (value / 1e3).toFixed(1).replace(/\.0$/, "") + " k"
  }
  return value.toString()
}

export const formatSamplingRate = (seconds: number) => {
  if (seconds >= 3600) {
    const hours = (seconds / 3600).toFixed(0)
    return `${hours}h`
  } else if (seconds >= 60) {
    const minutes = (seconds / 60).toFixed(0)
    return `${minutes}m`
  } else {
    return `${seconds}s`
  }
}

export const formatToISOIfNeeded = (date: Date | string) => {
  if (date instanceof Date) return formatISO(date)
  return date
}

export function compactSQL(sql: string) {
  if (!sql) return ""

  return (
    sql
      // Remove multi-line comments /* ... */
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // Remove single-line comments -- ...
      .replace(/--.*/g, "")
      // Replace newlines and excessive spaces (but preserve spaces inside string literals)
      .replace(/\s+(?=(?:[^'"]|'[^']*'|"[^"]*")*$)/g, " ")
      // Remove spaces around commas
      .replace(/\s*,\s*/g, ",")
      // Remove spaces around parentheses
      .replace(/\s*\(\s*/g, "(")
      .replace(/\s*\)\s*/g, ")")
      // Remove spaces around arithmetic operators (+, -, *, /, %)
      .replace(/\s*([+\-*\/%])\s*/g, "$1")
      // Remove spaces around comparison operators (=, >, <, >=, <=, <>, !=)
      .replace(/\s*(=|<>|!=|>=|<=|>|<)\s*/g, "$1")
      // Trim leading/trailing spaces
      .trim()
  )
}

export const getTimeFilter = (from: Date | string, to: Date | string) => {
  return `FROM '${formatToISOIfNeeded(from)}' TO '${formatToISOIfNeeded(to)}'`
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

export const hasData = (data?: uPlot.AlignedData) => {
  if (!data || data[1].length === 0) return false
  return data[1].length > 0 && data[1].some((value: any) => value !== null)
}

export const isDateToken = (token: string) => {
  return /^now(-\d+[hdm]$)?$/.test(token)
}

// Converts tokens like `now-1h` or `now-7d` to date string
export const durationTokenToDate = (token: string) => {
  if (!isDateToken(token)) return isValidDate(token) ? token : "Invalid date"
  const now = new Date()
  if (token === "now") return formatISO(now)
  const [_, _operator, value, unit] = token.match(/now(-)?(\d+)([a-z]+)$/)!
  let subtractedMinutes = 0
  switch (unit) {
    case "m":
      subtractedMinutes = parseInt(value)
      break
    case "h":
      subtractedMinutes = parseInt(value) * 60
      break
    case "d":
      subtractedMinutes = parseInt(value) * 60 * 24
      break
    default:
      return "Invalid date"
  }
  return formatISO(subMinutes(now, subtractedMinutes))
}

export const durationToHumanReadable = (from: string, to: string) => {
  const findDuration = metricDurations.find(
    (d) => d.dateFrom === from && d.dateTo === to,
  )
  if (findDuration) return findDuration.label
  return `${
    from.startsWith("now") ? from : format(new Date(from), DATETIME_FORMAT)
  } - ${to.startsWith("now") ? to : format(new Date(to), DATETIME_FORMAT)}
  `
}
