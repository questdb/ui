import { utcToLocal } from "../../../utils/dateTime"
import uPlot from "uplot"

export enum MetricType {
  COMMIT_RATE = "Commit rate",
  WRITE_THROUGHPUT = "Rows applied",
  LATENCY = "Latency",
  WRITE_AMPLIFICATION = "Write amplification",
}

export type Widget = {
  label: string
  iconUrl: string
  isTableMetric: boolean
  getQuery: ({
    tableId,
    metricDuration,
    sampleBy,
    limit,
  }: {
    tableId?: number
    metricDuration: MetricDuration
    sampleBy?: SampleBy
    limit?: number
  }) => string
  getQueryLastNotNull: (id?: number) => string
  alignData: (data: any) => uPlot.AlignedData
  mapYValue: (rawValue: number) => string
}

export enum MetricDuration {
  FIVE_MINUTES = "5m",
  FIFTEEN_MINUTES = "15m",
  ONE_HOUR = "1h",
  THREE_HOURS = "3h",
  SIX_HOURS = "6h",
  TWELVE_HOURS = "12h",
  TWENTY_FOUR_HOURS = "24h",
  THREE_DAYS = "3 days",
  SEVEN_DAYS = "7 days",
}

export enum SampleBy {
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

export const refreshRatesInSeconds: Record<RefreshRate, number> = {
  [RefreshRate.AUTO]: 0,
  [RefreshRate.OFF]: 0,
  [RefreshRate.ONE_SECOND]: 1,
  [RefreshRate.FIVE_SECONDS]: 5,
  [RefreshRate.TEN_SECONDS]: 10,
  [RefreshRate.THIRTY_SECONDS]: 30,
  [RefreshRate.ONE_MINUTE]: 60,
}

export const autoRefreshRates: Record<
  MetricDuration,
  Exclude<RefreshRate, RefreshRate.AUTO>
> = {
  [MetricDuration.FIVE_MINUTES]: RefreshRate.ONE_SECOND,
  [MetricDuration.FIFTEEN_MINUTES]: RefreshRate.FIVE_SECONDS,
  [MetricDuration.ONE_HOUR]: RefreshRate.TEN_SECONDS,
  [MetricDuration.THREE_HOURS]: RefreshRate.THIRTY_SECONDS,
  [MetricDuration.SIX_HOURS]: RefreshRate.THIRTY_SECONDS,
  [MetricDuration.TWELVE_HOURS]: RefreshRate.THIRTY_SECONDS,
  [MetricDuration.TWENTY_FOUR_HOURS]: RefreshRate.THIRTY_SECONDS,
  [MetricDuration.THREE_DAYS]: RefreshRate.ONE_MINUTE,
  [MetricDuration.SEVEN_DAYS]: RefreshRate.ONE_MINUTE,
}

export const durationInMinutes: Record<MetricDuration, number> = {
  [MetricDuration.FIVE_MINUTES]: 5,
  [MetricDuration.FIFTEEN_MINUTES]: 15,
  [MetricDuration.ONE_HOUR]: 60,
  [MetricDuration.THREE_HOURS]: 60 * 3,
  [MetricDuration.SIX_HOURS]: 60 * 6,
  [MetricDuration.TWELVE_HOURS]: 60 * 12,
  [MetricDuration.TWENTY_FOUR_HOURS]: 60 * 24,
  [MetricDuration.THREE_DAYS]: 60 * 72,
  [MetricDuration.SEVEN_DAYS]: 60 * 168,
}

export const defaultSampleByForDuration: Record<MetricDuration, SampleBy> = {
  [MetricDuration.FIVE_MINUTES]: SampleBy.ONE_SECOND,
  [MetricDuration.FIFTEEN_MINUTES]: SampleBy.ONE_SECOND,
  [MetricDuration.ONE_HOUR]: SampleBy.ONE_SECOND,
  [MetricDuration.THREE_HOURS]: SampleBy.ONE_MINUTE,
  [MetricDuration.SIX_HOURS]: SampleBy.ONE_MINUTE,
  [MetricDuration.TWELVE_HOURS]: SampleBy.ONE_MINUTE,
  [MetricDuration.TWENTY_FOUR_HOURS]: SampleBy.FIVE_MINUTES,
  [MetricDuration.THREE_DAYS]: SampleBy.FIFTEEN_MINUTES,
  [MetricDuration.SEVEN_DAYS]: SampleBy.FIFTEEN_MINUTES,
}

export const sampleByInSeconds: Record<SampleBy, number> = {
  [SampleBy.ONE_SECOND]: 1,
  [SampleBy.ONE_MINUTE]: 60,
  [SampleBy.FIVE_MINUTES]: 60 * 5,
  [SampleBy.FIFTEEN_MINUTES]: 60 * 15,
  [SampleBy.ONE_HOUR]: 60 * 60,
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

export const xAxisFormat = {
  [MetricDuration.FIVE_MINUTES]: (rawValue: number) =>
    utcToLocal(rawValue, "HH:mm:ss"),
  [MetricDuration.FIFTEEN_MINUTES]: (rawValue: number) =>
    utcToLocal(rawValue, "HH:mm"),
  [MetricDuration.ONE_HOUR]: (rawValue: number) =>
    utcToLocal(rawValue, "HH:mm"),
  [MetricDuration.THREE_HOURS]: (rawValue: number) =>
    utcToLocal(rawValue, "HH:mm"),
  [MetricDuration.SIX_HOURS]: (rawValue: number) =>
    utcToLocal(rawValue, "HH:mm"),
  [MetricDuration.TWELVE_HOURS]: (rawValue: number) =>
    utcToLocal(rawValue, "HH:mm"),
  [MetricDuration.TWENTY_FOUR_HOURS]: (rawValue: number) =>
    utcToLocal(rawValue, "HH:mm"),
  [MetricDuration.THREE_DAYS]: (rawValue: number) =>
    utcToLocal(rawValue, "dd/MM"),
  [MetricDuration.SEVEN_DAYS]: (rawValue: number) =>
    utcToLocal(rawValue, "dd/MM"),
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

export const getTimeFilter = (
  minutes: number,
) => `created > date_trunc('minute', dateadd('${
  minutes >= 1440 ? "d" : minutes >= 60 ? "h" : "s"
}', -${
  minutes >= 1440
    ? minutesToDays(minutes)
    : minutes >= 60
    ? minutesToHours(minutes)
    : minutesToSeconds(minutes)
}, now()))
and created < date_trunc('${minutes >= 60 ? "minute" : "second"}', now())`

export const getRollingAppendRowLimit = (
  refreshRateInSeconds: number,
  sampleBy: SampleBy,
) => Math.ceil(refreshRateInSeconds / sampleByInSeconds[sampleBy])
