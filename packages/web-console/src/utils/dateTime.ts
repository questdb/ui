import { format } from "date-fns"
import { TZDate } from "@date-fns/tz"

export const getLocalTimeZone = () => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export const utcToLocal = (utcDate: number, dateFormat: string) =>
  format(new TZDate(utcDate, getLocalTimeZone()), dateFormat)
