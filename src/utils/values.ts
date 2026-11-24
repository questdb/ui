// Small value helpers shared by the notebook's formats, visuals, custom
// charts and importers, so each reads a value the same way.

/** A plain object: not null and not an array. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** A finite number from a number, numeric text or a bigint; else null. */
export const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  if (typeof value === "bigint") return Number(value)
  return null
}

// `Math.max(...values)` copies every value onto the call stack and throws a
// RangeError past roughly 100k of them; these fold one value at a time.
// They match the spread exactly: nothing gives -Infinity (max) or Infinity
// (min), any NaN gives NaN, and +0 beats -0 for max (-0 beats +0 for min).

/** The largest of the values, as `Math.max(...values)` without the spread. */
export const maxOf = (values: Iterable<number>): number => {
  let max = -Infinity
  for (const value of values) max = Math.max(max, value)
  return max
}

/** The smallest of the values, as `Math.min(...values)` without the spread. */
export const minOf = (values: Iterable<number>): number => {
  let min = Infinity
  for (const value of values) min = Math.min(min, value)
  return min
}

/** A number typed in a form field; undefined while it is empty or not one. */
export const parseNumberInput = (text: string): number | undefined => {
  const n = Number(text)
  return text.trim() === "" || !Number.isFinite(n) ? undefined : n
}
