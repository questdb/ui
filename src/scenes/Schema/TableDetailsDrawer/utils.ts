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

function formatDurationUnit(value: number, unit: string): string {
  const lower = unit.toLowerCase()
  const singular = lower.endsWith("s") ? lower.slice(0, -1) : lower
  const normalized = value === 1 ? singular : `${singular}s`
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function formatTTL(value?: number, unit?: string): string {
  if (!value || !unit) return "None"
  return `${value} ${formatDurationUnit(value, unit)}`
}

export type StoragePolicyClause = { action: string; duration: string }

const STORAGE_POLICY_LABELS = [
  ["toParquet", "To Parquet"],
  ["toRemote", "To Remote"],
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
    return [
      {
        action: label,
        duration: `${v.value} ${formatDurationUnit(v.value, v.unit)}`,
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
