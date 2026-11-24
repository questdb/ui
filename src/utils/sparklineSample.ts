// Sparklines in grid cells and stat tiles are at most a few hundred pixels
// wide. Each bucket keeps its lowest and highest sample, in order, plus the
// endpoints, so peaks survive while the polyline stays small.
const SPARKLINE_BUCKETS = 100

export type SparklineSample = {
  // Indexes into the values to draw, in order.
  indexes: number[]
  // Values are divided by `scale` before projecting; `span` is the scaled
  // range. A range too wide for a double halves the values instead of
  // giving up on the line.
  scale: number
  min: number
  span: number
}

const sampledIndexes = (values: number[]): number[] => {
  const last = values.length - 1
  if (values.length <= SPARKLINE_BUCKETS * 2 + 2) return values.map((_, i) => i)
  const indexes = [0]
  const step = Math.ceil((values.length - 2) / SPARKLINE_BUCKETS)
  for (let start = 1; start < last; start += step) {
    let low = start
    let high = start
    for (let i = start + 1; i < Math.min(start + step, last); i++) {
      if (values[i] < values[low]) low = i
      if (values[i] > values[high]) high = i
    }
    indexes.push(Math.min(low, high))
    if (low !== high) indexes.push(Math.max(low, high))
  }
  indexes.push(last)
  return indexes
}

/** The samples a sparkline draws, or null with fewer than two values. */
export const sparklineSample = (values: number[]): SparklineSample | null => {
  if (values.length < 2) return null
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const scale = Number.isFinite(max - min) ? 1 : 2
  return {
    indexes: sampledIndexes(values),
    scale,
    min,
    span: max / scale - min / scale || 1,
  }
}
