import { formatDistance } from "date-fns"
import { fetchUserLocale, getLocaleFromLanguage } from "../../../utils"

export function formatRelativeTimestamp(timestamp: string | null): string {
  if (!timestamp) return "Never"
  const userLocale = fetchUserLocale()
  const locale = getLocaleFromLanguage(userLocale)
  return formatDistance(new Date(timestamp), new Date(), {
    locale,
    addSuffix: true,
  })
}

export function formatO3MaxLag(microseconds: number): string {
  // o3MaxLag is in microseconds (divide by 1,000,000 to get seconds)
  if (microseconds <= 0) return "0"

  const parts: string[] = []

  // Calculate each unit
  const totalSeconds = Math.floor(microseconds / 1_000_000)
  const remainingMicrosAfterSeconds = microseconds % 1_000_000
  const milliseconds = Math.floor(remainingMicrosAfterSeconds / 1000)
  const remainingMicros = remainingMicrosAfterSeconds % 1000

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  // Build the string with non-zero units
  if (hours > 0) {
    parts.push(`${hours} hour${hours === 1 ? "" : "s"}`)
  }
  if (minutes > 0) {
    parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`)
  }
  if (seconds > 0) {
    parts.push(`${seconds} second${seconds === 1 ? "" : "s"}`)
  }
  if (milliseconds > 0) {
    parts.push(`${milliseconds} millisecond${milliseconds === 1 ? "" : "s"}`)
  }
  if (remainingMicros > 0) {
    parts.push(
      `${remainingMicros} microsecond${remainingMicros === 1 ? "" : "s"}`,
    )
  }

  return parts.length > 0 ? parts.join(" ") : "0"
}

export function formatMemoryPressure(level: number | null): string {
  if (level === null) return "N/A"
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
  if (count === null) return "0"
  return typeof count === "number"
    ? count.toLocaleString()
    : Number(count).toLocaleString()
}

export function formatTTL(value: number, unit: string): string {
  if (value === 0) return "None"
  return `${value} ${unit}`
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
