import { format } from "date-fns"
import { TZDate } from "@date-fns/tz"

export const getLocalTimeZone = () => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export const getLocalGMTOffset = () => {
  const offsetMinutes = new Date().getTimezoneOffset()

  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60)
  const offsetMinutesRemaining = Math.abs(offsetMinutes) % 60

  return `GMT${offsetMinutes > 0 ? "-" : "+"}${String(offsetHours).padStart(
    2,
    "0",
  )}:${String(offsetMinutesRemaining).padStart(2, "0")}`
}

export const utcToLocal = (utcDate: number, dateFormat?: string): string =>
  dateFormat
    ? format(new TZDate(utcDate, getLocalTimeZone()), dateFormat)
    : new TZDate(utcDate, getLocalTimeZone()).toISOString()
