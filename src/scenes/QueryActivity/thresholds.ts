export type QueryActivityThresholds = {
  memoryLimitWarningRatio: number
  memoryLimitCriticalRatio: number
  memoryWarningBytes: bigint
  memoryCriticalBytes: bigint
}

const MIB = BigInt(1024 * 1024)

export const QUERY_ACTIVITY_THRESHOLDS: QueryActivityThresholds = {
  memoryLimitWarningRatio: 0.5,
  memoryLimitCriticalRatio: 0.8,
  memoryWarningBytes: BigInt(512) * MIB,
  memoryCriticalBytes: BigInt(2048) * MIB,
}
