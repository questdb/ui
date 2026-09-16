export type QueryActivityThresholds = {
  memoryLimitWarningRatio: number
  memoryLimitCriticalRatio: number
}

export const QUERY_ACTIVITY_THRESHOLDS: QueryActivityThresholds = {
  memoryLimitWarningRatio: 0.5,
  memoryLimitCriticalRatio: 0.8,
}
