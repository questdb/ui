import { isValidDate } from "./../../../utils/dateTime"
import { format, formatISO, subMinutes } from "date-fns"
import { utcToLocal } from "../../../utils/dateTime"
import uPlot from "uplot"

export const DATETIME_FORMAT = "yyyy-MM-dd HH:mm:ss"

export enum MetricType {
  COMMIT_RATE = "Commit rate",
  WRITE_THROUGHPUT = "Write throughput",
  LATENCY = "Latency",
  WRITE_AMPLIFICATION = "Write amplification",
}

export type Widget = {
  label: string
  description: string
  iconUrl: string
  isTableMetric: boolean
  getQuery: ({
    tableId,
    sampleBy,
    limit,
    timeFilter,
  }: {
    tableId?: number
    sampleBy: string
    limit?: number
    timeFilter?: string
  }) => string
  getQueryLastNotNull: (id?: number) => string
  querySupportsRollingAppend: boolean
  alignData: (data: any) => uPlot.AlignedData
  mapYValue: (rawValue: number) => string
}

export type MetricsRefreshPayload = {
  dateFrom: string
  dateTo: string
  overwrite?: boolean
}

export type Duration = {
  dateFrom: string
  dateTo: string
  label: string
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
  ONE_SECOND = "1s",
  FIVE_SECONDS = "5s",
  TEN_SECONDS = "10s",
  THIRTY_SECONDS = "30s",
  ONE_MINUTE = "1m",
  OFF = "Off",
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

export type CommitRate = {
  created: string
  commit_rate: string
  commit_rate_smooth: string
}

export type WriteAmplification = {
  created: string
  writeAmplification: string
}

export type RowsApplied = {
  time: string
  numOfWalApplies: string
  numOfRowsApplied: string
  numOfRowsWritten: string
  avgWalAmplification: string
}

export type Latency = {
  created: string
  latency: string
}

export type LastNotNull = {
  created: string
}

export type ResultType = {
  [MetricType.COMMIT_RATE]: CommitRate
  [MetricType.LATENCY]: Latency
  [MetricType.WRITE_THROUGHPUT]: RowsApplied
  [MetricType.WRITE_AMPLIFICATION]: RowsApplied
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
  let format = "HH:mm:ss"
  const seconds = (endTime - startTime) / 1000
  if (seconds < 60) {
    format = "HH:mm:ss"
  } else if (seconds < 60 * 60) {
    format = "HH:mm"
  } else if (seconds < 60 * 60 * 24) {
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

const formatToISOIfNeeded = (date: Date | string) => {
  if (date instanceof Date) return formatISO(date)
  return date
}

export const getTimeFilter = (from: Date | string, to: Date | string) => {
  return `FROM '${formatToISOIfNeeded(from)}' TO '${formatToISOIfNeeded(to)}'`
}

export const getSamplingRateForPeriod = (
  from: string,
  to: string,
  pointsToPlot = 600,
) => {
  const seconds =
    (new Date(durationTokenToDate(to)).getTime() -
      new Date(durationTokenToDate(from)).getTime()) /
    1000
  return Math.ceil(seconds / pointsToPlot)
}

export const getRollingAppendRowLimit = (
  refreshRateInSeconds: number,
  dateFrom: string,
  dateTo: string,
) => {
  const sampleRate = getSamplingRateForPeriod(
    durationTokenToDate(dateFrom),
    durationTokenToDate(dateTo),
  )
  return Math.ceil(refreshRateInSeconds / sampleRate)
}

export const hasData = (data?: uPlot.AlignedData) => {
  if (!data || data[1].length === 0) return false
  return (
    data[1].length > 0 && data[1].some((value) => value !== null && value !== 0)
  )
}

export const mergeRollingData = (
  oldData: uPlot.AlignedData,
  newData: uPlot.AlignedData,
  dateFrom: string,
) => {
  const from = new Date(durationTokenToDate(dateFrom)).getTime()

  const mergedData = newData.map((d, i) => [
    ...oldData[i],
    ...d,
  ]) as uPlot.AlignedData

  return mergedData.map((arr, arrIndex) =>
    arrIndex === 0
      ? Array.from(arr).filter((time) => time && time >= from)
      : Array.from(arr).filter(
          (_, index) => mergedData[0] && mergedData[0][index] >= from,
        ),
  ) as uPlot.AlignedData
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
  return null
}
