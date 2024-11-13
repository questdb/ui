export enum MetricType {
  ROWS_APPLIED = "Rows applied",
  LATENCY = "Latency",
  WRITE_AMPLIFICATION = "Write amplification",
}

export const metricTypeLabel: Record<MetricType, string> = {
  [MetricType.ROWS_APPLIED]: "Write throughput",
  [MetricType.LATENCY]: "Read latency in ms",
  [MetricType.WRITE_AMPLIFICATION]: "Write amplification",
}

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

export const minutesToDays = (durationInMinutes: number) =>
  durationInMinutes / 60 / 24

export const minutesToHours = (durationInMinutes: number) =>
  durationInMinutes / 60

export const xAxisFormat = {
  [MetricDuration.TEN_MINUTES]: (rawValue: number) =>
    new Date(rawValue).toLocaleTimeString(navigator.language, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  [MetricDuration.THIRTY_MINUTES]: (rawValue: number) =>
    new Date(rawValue).toLocaleTimeString(navigator.language, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  [MetricDuration.ONE_HOUR]: (rawValue: number) =>
    new Date(rawValue).toLocaleTimeString(navigator.language, {
      hour: "2-digit",
      minute: "2-digit",
    }),
  [MetricDuration.THREE_HOURS]: (rawValue: number) =>
    new Date(rawValue).toLocaleTimeString(navigator.language, {
      hour: "2-digit",
      minute: "2-digit",
    }),
  [MetricDuration.SIX_HOURS]: (rawValue: number) =>
    new Date(rawValue).toLocaleTimeString(navigator.language, {
      hour: "2-digit",
    }),
  [MetricDuration.TWELVE_HOURS]: (rawValue: number) =>
    new Date(rawValue).toLocaleTimeString(navigator.language, {
      hour: "2-digit",
    }),
  [MetricDuration.TWENTY_FOUR_HOURS]: (rawValue: number) =>
    new Date(rawValue).toLocaleTimeString(navigator.language, {
      hour: "2-digit",
    }),
  [MetricDuration.THREE_DAYS]: (rawValue: number) =>
    new Date(rawValue).toLocaleDateString(navigator.language, {
      day: "2-digit",
      month: "2-digit",
    }),
  [MetricDuration.SEVEN_DAYS]: (rawValue: number) =>
    new Date(rawValue).toLocaleDateString(navigator.language, {
      day: "2-digit",
      month: "2-digit",
    }),
}
