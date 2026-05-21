import { formatDistance } from "date-fns"
import { parseOne, type StoragePolicy } from "@questdb/sql-parser"
import { fetchUserLocale, getLocaleFromLanguage } from "../../../utils"

export function formatRelativeTimestamp(timestamp: string | null): string {
  if (!timestamp) return "Never"
  const date = new Date(timestamp)
  if (isNaN(date.getTime()) || date.getTime() === 0) return "Never"
  const userLocale = fetchUserLocale()
  const locale = getLocaleFromLanguage(userLocale)
  return formatDistance(date, new Date(), {
    locale,
    addSuffix: true,
  })
}

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

export function formatRowCount(count: number | string | null): string {
  if (count == null) return "0"
  return typeof count === "number"
    ? count.toLocaleString()
    : Number(count).toLocaleString()
}

export function formatTTL(value: number, unit: string): string {
  if (value === 0) return "None"
  return `${value} ${unit}`
}

export type StoragePolicyClause = { action: string; duration: string }

const STORAGE_POLICY_LABELS = [
  ["toParquet", "To Parquet"],
  ["dropNative", "Drop Native"],
  ["dropLocal", "Drop Local"],
  ["dropRemote", "Drop Remote"],
] as const

export function extractStoragePolicyClauses(
  ddl: string,
): StoragePolicyClause[] {
  let stmt: { storagePolicy?: StoragePolicy } | undefined
  try {
    stmt = parseOne(ddl) as { storagePolicy?: StoragePolicy }
  } catch {
    return []
  }
  const policy = stmt?.storagePolicy
  if (!policy) return []
  return STORAGE_POLICY_LABELS.flatMap(([key, label]) => {
    const v = policy[key]
    if (!v) return []
    const unit = v.unit.charAt(0).toUpperCase() + v.unit.slice(1).toLowerCase()
    const normalizedUnit =
      v.value === 1 ? (unit.endsWith("s") ? unit.slice(0, -1) : unit) : unit
    return [{ action: label, duration: `${v.value} ${normalizedUnit}` }]
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
