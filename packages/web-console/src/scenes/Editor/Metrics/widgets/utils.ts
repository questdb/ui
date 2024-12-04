export const sqlValueToFixed = (value: string, decimals: number = 2) => {
  const parsed = parseFloat(value)
  return Number(parsed.toFixed(decimals)) as unknown as number
}

export const formatNumbers = (value: number) => {
  if (value >= 1e6) {
    return (value / 1e6).toFixed(1).replace(/\.0$/, "") + " M"
  } else if (value >= 1e3) {
    return (value / 1e3).toFixed(1).replace(/\.0$/, "") + " k"
  }
  return value.toString()
}

export const minutesToDays = (durationInMinutes: number) =>
  durationInMinutes / 60 / 24

export const minutesToHours = (durationInMinutes: number) =>
  durationInMinutes / 60

export const minutesToSeconds = (durationInMinutes: number) =>
  durationInMinutes * 60

export const getTimeFilter = (
  minutes: number,
) => `created > date_trunc('minute', dateadd('${
  minutes >= 1440 ? "d" : "h"
}', -${
  minutes >= 1440 ? minutesToDays(minutes) : minutesToHours(minutes)
}, now()))
and created < date_trunc('minute', now())`
