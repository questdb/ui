import { utcToLocal } from "../../../utils/dateTime"
import uPlot from "uplot"

export enum MetricType {
  ROWS_APPLIED = "Rows applied",
  LATENCY = "Latency",
  WRITE_AMPLIFICATION = "Write amplification",
}

export const metricTypeLabel: Record<MetricType, string> = {
  [MetricType.ROWS_APPLIED]: "Write throughput",
  [MetricType.LATENCY]: "WAL apply latency in ms",
  [MetricType.WRITE_AMPLIFICATION]: "Write amplification",
}

export enum MetricDuration {
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
  FIFTEEN_MINUTES = "15m",
  ONE_HOUR = "1h",
}

export const durationInMinutes: Record<MetricDuration, number> = {
  [MetricDuration.ONE_HOUR]: 60,
  [MetricDuration.THREE_HOURS]: 60 * 3,
  [MetricDuration.SIX_HOURS]: 60 * 6,
  [MetricDuration.TWELVE_HOURS]: 60 * 12,
  [MetricDuration.TWENTY_FOUR_HOURS]: 60 * 24,
  [MetricDuration.THREE_DAYS]: 60 * 72,
  [MetricDuration.SEVEN_DAYS]: 60 * 168,
}

export const mappedSampleBy: Record<MetricDuration, SampleBy> = {
  [MetricDuration.ONE_HOUR]: SampleBy.ONE_SECOND,
  [MetricDuration.THREE_HOURS]: SampleBy.ONE_SECOND,
  [MetricDuration.SIX_HOURS]: SampleBy.ONE_SECOND,
  [MetricDuration.TWELVE_HOURS]: SampleBy.ONE_SECOND,
  [MetricDuration.TWENTY_FOUR_HOURS]: SampleBy.ONE_MINUTE,
  [MetricDuration.THREE_DAYS]: SampleBy.ONE_MINUTE,
  [MetricDuration.SEVEN_DAYS]: SampleBy.ONE_MINUTE,
}

export type RowsApplied = {
  time: string
  numOfWalApplies: string
  numOfRowsApplied: string
  numOfRowsWritten: string
  avgWalAmplification: string
}

export type Latency = {
  time: string
  numOfWalApplies: string
  avg_latency: string
}

export type LastNotNull = {
  created: string
}

export const minutesToDays = (durationInMinutes: number) =>
  durationInMinutes / 60 / 24

export const minutesToHours = (durationInMinutes: number) =>
  durationInMinutes / 60

export const minutesToSeconds = (durationInMinutes: number) =>
  durationInMinutes * 60

export const xAxisFormat = {
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

const sqlValueToFixed = (value: string, decimals: number = 2) => {
  const parsed = parseFloat(value)
  return Number(parsed.toFixed(decimals)) as unknown as number
}

const formatNumbers = (value: number) => {
  if (value >= 1e6) {
    return (value / 1e6).toFixed(1).replace(/\.0$/, "") + " M"
  } else if (value >= 1e3) {
    return (value / 1e3).toFixed(1).replace(/\.0$/, "") + " k"
  }
  return value.toString()
}

export const graphDataConfigs = {
  [MetricType.LATENCY]: {
    alignData: (latency: Latency[]): uPlot.AlignedData => [
      latency.map((l) => new Date(l.time).getTime()),
      latency.map((l) => sqlValueToFixed(l.avg_latency)),
    ],
    mapYValue: (rawValue: number) => {
      if (rawValue >= 1000) {
        const seconds = rawValue / 1000
        return `${seconds.toFixed(2)} s`
      }
      return `${rawValue} ms`
    },
  },
  [MetricType.ROWS_APPLIED]: {
    alignData: (rowsApplied: RowsApplied[]): uPlot.AlignedData => [
      rowsApplied.map((l) => new Date(l.time).getTime()),
      rowsApplied.map((l) => sqlValueToFixed(l.numOfRowsApplied)),
    ],
    mapYValue: (rawValue: number) => formatNumbers(rawValue),
  },
  [MetricType.WRITE_AMPLIFICATION]: {
    alignData: (rowsApplied: RowsApplied[]): uPlot.AlignedData => [
      rowsApplied.map((l) => new Date(l.time).getTime()),
      rowsApplied.map((l) => sqlValueToFixed(l.avgWalAmplification)),
    ],
    mapYValue: (rawValue: number) => formatNumbers(rawValue),
  },
}
