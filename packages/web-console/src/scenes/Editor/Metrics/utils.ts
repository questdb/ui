import uPlot from "uplot"

export enum MetricDuration {
  TEN_MINUTES = "10min",
  THIRTY_MINUTES = "30min",
  ONE_HOUR = "1h",
  THREE_HOURS = "3h",
  SIX_HOURS = "6h",
  TWELVE_HOURS = "12h",
  TWENTY_FOUR_HOURS = "24h",
  THREE_DAYS = "3 days",
  SEVEN_DAYS = "7 days",
}

export enum SampleBy {
  ONE_MINUTE = "1m",
  FIFTEEN_MINUTES = "15m",
  ONE_HOUR = "1h",
}

export const durationInMinutes: Record<MetricDuration, number> = {
  [MetricDuration.TEN_MINUTES]: 10,
  [MetricDuration.THIRTY_MINUTES]: 30,
  [MetricDuration.ONE_HOUR]: 60,
  [MetricDuration.THREE_HOURS]: 60 * 3,
  [MetricDuration.SIX_HOURS]: 60 * 6,
  [MetricDuration.TWELVE_HOURS]: 60 * 12,
  [MetricDuration.TWENTY_FOUR_HOURS]: 60 * 24,
  [MetricDuration.THREE_DAYS]: 60 * 72,
  [MetricDuration.SEVEN_DAYS]: 60 * 168,
}

export const mappedSampleBy: Record<MetricDuration, SampleBy> = {
  [MetricDuration.TEN_MINUTES]: SampleBy.ONE_MINUTE,
  [MetricDuration.THIRTY_MINUTES]: SampleBy.ONE_MINUTE,
  [MetricDuration.ONE_HOUR]: SampleBy.ONE_MINUTE,
  [MetricDuration.THREE_HOURS]: SampleBy.ONE_MINUTE,
  [MetricDuration.SIX_HOURS]: SampleBy.ONE_MINUTE,
  [MetricDuration.TWELVE_HOURS]: SampleBy.FIFTEEN_MINUTES,
  [MetricDuration.TWENTY_FOUR_HOURS]: SampleBy.FIFTEEN_MINUTES,
  [MetricDuration.THREE_DAYS]: SampleBy.ONE_HOUR,
  [MetricDuration.SEVEN_DAYS]: SampleBy.ONE_HOUR,
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

export enum GraphType {
  RowsApplied = "Rows Applied",
  Latency = "Latency",
  WriteAmplification = "Write Amplification",
}

export type ChartTypeConfig = {
  key: GraphType
  label: string
  yValue: (rawValue: number) => string
}

export const minutesToDays = (durationInMinutes: number) =>
  durationInMinutes / 60 / 24

export const minutesToHours = (durationInMinutes: number) =>
  durationInMinutes / 60