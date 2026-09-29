import type { DurationPreset } from "./utils"

const last = (token: string, label: string): DurationPreset => ({
  dateFrom: `now-${token}`,
  dateTo: "now",
  label,
})

const whole = (from: string, label: string): DurationPreset => ({
  dateFrom: from,
  dateTo: from,
  label,
})

const soFar = (from: string, label: string): DurationPreset => ({
  dateFrom: from,
  dateTo: "now",
  label,
})

export const TIME_PRESETS: DurationPreset[] = [
  last("5m", "Last 5 minutes"),
  last("15m", "Last 15 minutes"),
  last("30m", "Last 30 minutes"),
  last("1h", "Last 1 hour"),
  last("3h", "Last 3 hours"),
  last("6h", "Last 6 hours"),
  last("12h", "Last 12 hours"),
  last("24h", "Last 24 hours"),
  last("2d", "Last 2 days"),
  last("7d", "Last 7 days"),
  last("30d", "Last 30 days"),
  last("90d", "Last 90 days"),
  last("6M", "Last 6 months"),
  last("1y", "Last 1 year"),
  last("2y", "Last 2 years"),
  last("5y", "Last 5 years"),
  whole("now-1d/d", "Yesterday"),
  whole("now-2d/d", "Day before yesterday"),
  whole("now-7d/d", "This day last week"),
  whole("now-1w/w", "Previous week"),
  whole("now-1M/M", "Previous month"),
  whole("now-1y/y", "Previous year"),
  whole("now/d", "Today"),
  soFar("now/d", "Today so far"),
  whole("now/w", "This week"),
  soFar("now/w", "This week so far"),
  whole("now/M", "This month"),
  soFar("now/M", "This month so far"),
  whole("now/y", "This year"),
  soFar("now/y", "This year so far"),
]
