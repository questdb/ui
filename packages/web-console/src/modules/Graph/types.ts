export enum MetricDuration {
  TEN_MINUTES = "10m",
  THIRTY_MINUTES = "30m",
  ONE_HOUR = "1h",
  THREE_HOURS = "3h",
  SIX_HOURS = "6h",
  TWELVE_HOURS = "12h",
  TWENTY_FOUR_HOURS = "24h",
}

export const durationInMinutes: Record<MetricDuration, number> = {
  [MetricDuration.TEN_MINUTES]: 10,
  [MetricDuration.THIRTY_MINUTES]: 30,
  [MetricDuration.ONE_HOUR]: 60,
  [MetricDuration.THREE_HOURS]: 60 * 3,
  [MetricDuration.SIX_HOURS]: 60 * 6,
  [MetricDuration.TWELVE_HOURS]: 60 * 12,
  [MetricDuration.TWENTY_FOUR_HOURS]: 60 * 24,
}