import { formatDistance, formatDuration, intervalToDuration } from "date-fns"
import { fetchUserLocale } from "./fetchUserLocale"
import { getLocaleFromLanguage } from "./getLocaleFromLanguage"

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

export function formatElapsedDuration(elapsedMs: number): string {
  const locale = getLocaleFromLanguage(fetchUserLocale())
  const duration = intervalToDuration({ start: 0, end: Math.max(0, elapsedMs) })
  return (
    formatDuration(duration, {
      format: ["days", "hours", "minutes", "seconds"],
      locale,
    }) || "less than a second"
  )
}

export function formatCompactElapsedDuration(elapsedMs: number): string {
  const seconds = Math.floor(Math.max(0, elapsedMs) / 1000)
  if (seconds < 1) return "<1s"
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

// String-based so the server's microsecond precision survives: Date only
// keeps milliseconds, and a START FROM NOW boundary is a microsecond value.
export function formatUtcTimestamp(timestamp: string): string {
  const isoMatch = timestamp.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/,
  )
  if (isoMatch) {
    const [, date, time, fraction = ""] = isoMatch
    const subSeconds = fraction.replace(/0+$/, "")
    return `${date} ${time}${subSeconds ? `.${subSeconds}` : ""} UTC`
  }
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return timestamp
  return `${date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "")} UTC`
}

export function formatMicrosDuration(micros: bigint): string {
  const value = Number(micros)
  if (value < 1_000_000) return `${Math.round(value / 1_000)} ms`
  if (value < 60_000_000) return `${(value / 1_000_000).toFixed(1)} s`
  if (value < 3_600_000_000) return `${(value / 60_000_000).toFixed(1)} min`
  return `${(value / 3_600_000_000).toFixed(1)} h`
}

export function formatBytes(bytes: bigint | null): string {
  if (bytes == null) return "Unknown"
  const value = Number(bytes)
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MiB`
  return `${(value / 1024 ** 3).toFixed(1)} GiB`
}
