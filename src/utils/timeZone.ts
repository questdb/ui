export type TimeUnit = "s" | "m" | "h" | "d" | "w" | "M" | "y"

export type RangeEdge = "from" | "to"

const UNIT_MS: Partial<Record<TimeUnit, number>> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
}

const formatters = new Map<string, Intl.DateTimeFormat>()

const formatterFor = (zone: string): Intl.DateTimeFormat => {
  let formatter = formatters.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    formatters.set(zone, formatter)
  }
  return formatter
}

export const browserTimeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone

export const shiftUtc = (date: Date, amount: number, unit: TimeUnit): Date => {
  const out = new Date(date.getTime())
  if (unit === "M") out.setUTCMonth(out.getUTCMonth() + amount)
  else if (unit === "y") out.setUTCFullYear(out.getUTCFullYear() + amount)
  else out.setTime(out.getTime() + amount * (UNIT_MS[unit] ?? 0))
  return out
}

const startOfUtcUnit = (date: Date, unit: TimeUnit): Date => {
  const out = new Date(date.getTime())
  switch (unit) {
    case "s":
      out.setUTCMilliseconds(0)
      break
    case "m":
      out.setUTCSeconds(0, 0)
      break
    case "h":
      out.setUTCMinutes(0, 0, 0)
      break
    case "d":
      out.setUTCHours(0, 0, 0, 0)
      break
    case "w":
      out.setUTCHours(0, 0, 0, 0)
      out.setUTCDate(out.getUTCDate() - ((out.getUTCDay() + 6) % 7))
      break
    case "M":
      out.setUTCHours(0, 0, 0, 0)
      out.setUTCDate(1)
      break
    case "y":
      out.setUTCHours(0, 0, 0, 0)
      out.setUTCMonth(0, 1)
      break
  }
  return out
}

// A "wall clock" is a Date whose UTC fields hold the zone's local reading of
// an instant. Truncating and stepping happen on it with plain UTC arithmetic,
// and the two conversions below move between it and the real instant.
const toWallClock = (instant: Date, zone: string): Date => {
  const parts: Record<string, number> = {}
  for (const part of formatterFor(zone).formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value)
  }
  return new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      instant.getUTCMilliseconds(),
    ),
  )
}

const zoneOffsetMs = (instant: Date, zone: string): number =>
  toWallClock(instant, zone).getTime() - instant.getTime()

const fromWallClock = (wall: Date, zone: string): Date => {
  const asUtc = wall.getTime()
  const firstGuess = asUtc - zoneOffsetMs(new Date(asUtc), zone)
  return new Date(asUtc - zoneOffsetMs(new Date(firstGuess), zone))
}

export const alignInZone = (
  instant: Date,
  unit: TimeUnit,
  edge: RangeEdge,
  zone: string,
): Date => {
  const start = startOfUtcUnit(toWallClock(instant, zone), unit)
  if (edge === "from") return fromWallClock(start, zone)
  return new Date(fromWallClock(shiftUtc(start, 1, unit), zone).getTime() - 1)
}
