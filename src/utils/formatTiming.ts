const roundTiming = (time: number): number =>
  Math.round((time + Number.EPSILON) * 100) / 100

export const formatTiming = (nanos: number): string => {
  if (nanos === 0) return "0"
  if (nanos > 1e9) return `${roundTiming(nanos / 1e9)}s`
  if (nanos > 1e6) return `${roundTiming(nanos / 1e6)}ms`
  if (nanos > 1e3) return `${roundTiming(nanos / 1e3)}μs`
  return `${nanos}ns`
}
