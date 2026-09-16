import type { TimestampedSample, TrendData } from "./healthCheck"
import type { StoragePolicy } from "../../../utils/questdb/types"

const BIGINT_ZERO = BigInt(0)
const BIGINT_ONE = BigInt(1)

export function formatMemoryPressure(level: number | null): string {
  if (level == null) return "N/A"
  switch (level) {
    case 0:
      return "None"
    case 1:
      return "Reduced Parallelism"
    case 2:
      return "Backoff"
    default:
      return `Level ${level}`
  }
}

export function formatRowCount(count: bigint | null): string {
  if (count == null) return "0"
  return count.toLocaleString()
}

function formatDurationUnit(value: number | bigint, unit: string): string {
  const lower = unit.toLowerCase()
  const singular = lower.endsWith("s") ? lower.slice(0, -1) : lower
  const isOne = typeof value === "bigint" ? value === BIGINT_ONE : value === 1
  const normalized = isOne ? singular : `${singular}s`
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function formatTTL(value?: number, unit?: string): string {
  if (!value || !unit) return "None"
  return `${value} ${formatDurationUnit(value, unit)}`
}

export function formatInterval(
  value: bigint | null,
  unit: string | null,
): string {
  if (value == null) return "Unknown"
  if (value === BIGINT_ZERO || !unit) return "None"
  return `${value.toLocaleString()} ${formatDurationUnit(value, unit)}`
}

export function formatTxnCount(count: bigint | null): string {
  if (count == null) return "Unknown"
  return `${count.toLocaleString()} txn${count === BIGINT_ONE ? "" : "s"}`
}

export function getTrendSamplesForIssue(
  field: string,
  trendData: TrendData,
): TimestampedSample[] | undefined {
  switch (field) {
    case "transactionLag":
      return trendData.transactionLag
    case "pendingRows":
      return trendData.walPendingRowCount
    default:
      return undefined
  }
}

export type StoragePolicyClause = { action: string; duration: string }

const STORAGE_POLICY_LABELS = [
  ["to_parquet", "To Parquet"],
  ["to_remote", "To Remote"],
  ["drop_local", "Drop Local"],
  ["drop_remote", "Drop Remote"],
] as const

const formatStoragePolicyDuration = (duration: string): string => {
  const match = duration.match(/^(\d+)([a-z]+)$/)
  if (!match) return duration

  const value = Number(match[1])
  const unit = match[2]
  if (unit === "h" && value % (24 * 7) === 0) {
    const weeks = value / (24 * 7)
    return `${weeks} ${formatDurationUnit(weeks, "week")}`
  }
  if (unit === "h" && value % 24 === 0) {
    const days = value / 24
    return `${days} ${formatDurationUnit(days, "day")}`
  }
  if (unit === "m" && value % 12 === 0) {
    const years = value / 12
    return `${years} ${formatDurationUnit(years, "year")}`
  }

  const unitName = {
    h: "hour",
    d: "day",
    w: "week",
    m: "month",
    y: "year",
  }[unit]
  return unitName ? `${value} ${formatDurationUnit(value, unitName)}` : duration
}

export function formatStoragePolicyClauses(
  policy: StoragePolicy | null,
): StoragePolicyClause[] {
  if (!policy) return []
  return STORAGE_POLICY_LABELS.flatMap(([key, label]) => {
    const duration = policy[key]
    if (!duration || /^0[a-z]+$/.test(duration)) return []
    return [
      {
        action: label,
        duration: formatStoragePolicyDuration(duration),
      },
    ]
  })
}

export type MetricType = "count" | "p50" | "p90" | "p99" | "max"

export const METRIC_OPTIONS: { label: string; value: MetricType }[] = [
  { label: "Total", value: "count" },
  { label: "Median", value: "p50" },
  { label: "90th Percentile", value: "p90" },
  { label: "99th Percentile", value: "p99" },
  { label: "Maximum", value: "max" },
]

type MetricPrefix = "table_write_amp" | "table_merge_rate" | "wal_tx_size"

export function getMetricKey(
  prefix: MetricPrefix,
  metricType: MetricType,
): string {
  return `${prefix}_${metricType}`
}
